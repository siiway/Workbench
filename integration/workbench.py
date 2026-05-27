# Workbench control-plane driver.
#
# Unlike chat platform drivers, this one maintains an outbound WebSocket to a
# Workbench instance and exposes an RPC surface (drivers, rules, recent
# messages, user bindings) plus bidirectional chat.
# NapCat-style reverse-WS: NextBridge dials Workbench, never the other way.
#
# Config keys (under workbench.<instance_id>):
#   url                       — Workbench base URL, e.g. https://dash.siiway.org
#   token                     — bearer token issued by Workbench at pairing
#   workbench_instance_id     — stable id assigned by Workbench at pairing time
#   instance_name             — optional human label shown in the Workbench UI
#   reconnect_min_seconds     — initial reconnect backoff (default 2)
#   reconnect_max_seconds     — max reconnect backoff (default 60)
#   heartbeat_seconds         — heartbeat interval (default 30)
#
# Pairing flow (see `python main.py workbench pair`):
#   1. User clicks "Pair NextBridge" in Workbench, gets a one-time code.
#   2. `python main.py workbench pair <url> <code>` exchanges the code for a
#      long-lived token and writes a `workbench.default` block into the
#      local config file.
#   3. Restart NextBridge; this driver loads, dials Workbench, and stays
#      online until cancelled.

from __future__ import annotations

import asyncio
import inspect
import json
import random
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse, urlunparse

import httpx
import websockets
from pydantic import field_validator
from websockets.asyncio.client import ClientConnection

import services.config_io as config_io
import services.logger as log
import services.util as u
from drivers import BaseDriver, DriverCapability, DriverHealth, DriverMeta
from drivers.registry import register, register_cli
from services.config_schema import _DriverConfig
from services.db import msg_db
from services.message import Attachment, NormalizedMessage

if TYPE_CHECKING:
    from services.driver_context import DriverContext

logger = log.get_logger("workbench")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


class WorkbenchConfig(_DriverConfig):
    """Per-instance config for the Workbench reverse-WS client."""

    url: str = ""
    token: str = ""
    workbench_instance_id: str = ""
    instance_name: str = ""
    reconnect_min_seconds: int = 2
    reconnect_max_seconds: int = 60
    heartbeat_seconds: int = 30

    @field_validator("url", mode="before")
    def normalize_url(cls, v):
        if v is None:
            return ""
        if not isinstance(v, str):
            raise ValueError(f"Invalid workbench.url: {v}")
        u_ = v.strip()
        if not u_:
            return ""
        if not u_.startswith(("http://", "https://")):
            u_ = f"https://{u_.lstrip('/')}"
        return u_.rstrip("/")


# ---------------------------------------------------------------------------
# RPC method registry — handlers exposed to Workbench
# ---------------------------------------------------------------------------

Handler = Callable[["WorkbenchDriver", dict[str, Any]], "Awaitable[Any] | Any"]

_RPC_METHODS: dict[str, Handler] = {}


def _rpc(name: str):
    def deco(fn: Handler) -> Handler:
        _RPC_METHODS[name] = fn
        return fn

    return deco


@_rpc("meta.info")
def _meta_info(driver: "WorkbenchDriver", _params: dict) -> dict:
    return {
        "command_prefix": driver.bridge.command_prefix,
        "strict_echo_match": driver.bridge.strict_echo_match,
        "sender_count": len(driver.bridge.senders_snapshot()),
        "rule_count": len(driver.bridge.rules_snapshot()),
    }


@_rpc("drivers.list")
def _drivers_list(driver: "WorkbenchDriver", _params: dict) -> dict:
    return {"drivers": driver.bridge.senders_snapshot()}


_REDACTED_RULE_KEYS = {"webhook_url", "token", "secret", "password", "access_token"}


def _redact_rule(rule: dict) -> dict:
    out: dict = {}
    for k, v in rule.items():
        if isinstance(v, dict):
            out[k] = _redact_rule(v)
        elif k.lower() in _REDACTED_RULE_KEYS and isinstance(v, str) and v:
            out[k] = "***"
        else:
            out[k] = v
    return out


@_rpc("rules.list")
def _rules_list(driver: "WorkbenchDriver", _params: dict) -> dict:
    return {"rules": [_redact_rule(r) for r in driver.bridge.rules_snapshot()]}


@_rpc("rules.reload")
def _rules_reload(driver: "WorkbenchDriver", _params: dict) -> dict:
    driver.check_rules_reload_cooldown()
    before = len(driver.bridge.rules_snapshot())
    driver.bridge.load_rules()
    driver.invalidate_rule_index()
    after = len(driver.bridge.rules_snapshot())
    return {"before": before, "after": after}


@_rpc("messages.recent")
def _messages_recent(_driver: "WorkbenchDriver", params: dict) -> dict:
    limit = int(params.get("limit", 50))
    return {"mappings": msg_db().recent_mappings(limit=limit)}


@_rpc("bindings.list")
def _bindings_list(_driver: "WorkbenchDriver", params: dict) -> dict:
    limit = int(params.get("limit", 200))
    return {"bindings": msg_db().list_user_bindings(limit=limit)}


@_rpc("db.stats")
def _db_stats(_driver: "WorkbenchDriver", _params: dict) -> dict:
    return msg_db().stats()


# ---------------------------------------------------------------------------
# Chat RPC — bidirectional messaging between Workbench and the bridge
# ---------------------------------------------------------------------------

_NON_ADDRESS_KEYS = {
    "msg",
    "msg_format",
    "webhook_msg_format",
    "bot_msg_format",
    "webhook_url",
}


def _normalize_channel_addr(ch: dict) -> dict:
    return {k: v for k, v in ch.items() if k not in _NON_ADDRESS_KEYS}


def _safe_int(value: object, default: int = -1) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _serialise_attachments(raw) -> list[dict]:  # type: ignore[no-untyped-def]
    if not raw:
        return []
    out: list[dict] = []
    for att in raw:
        if isinstance(att, Attachment):
            out.append(
                {
                    "type": att.type,
                    "url": att.url,
                    "name": att.name,
                    "size": att.size,
                }
            )
        elif isinstance(att, dict):
            out.append(
                {
                    "type": str(att.get("type", "")),
                    "url": str(att.get("url", "")),
                    "name": str(att.get("name", "")),
                    "size": _safe_int(att.get("size", -1), -1),
                }
            )
    return out


@_rpc("chat.channels")
def _chat_channels(driver: "WorkbenchDriver", _params: dict) -> dict:
    return driver._get_chat_channels()


@_rpc("chat.send")
async def _chat_send(driver: "WorkbenchDriver", params: dict) -> dict:
    channel = params.get("channel") or {}
    text = (params.get("text") or "").strip()
    raw_user = (params.get("user") or "").strip() or "workbench-user"
    raw_user_id = (params.get("user_id") or "").strip()
    raw_user_avatar = (params.get("user_avatar") or "").strip()

    if not text:
        raise ValueError("text is required")
    if not isinstance(channel, dict):
        raise ValueError("channel must be an object")
    if len(text.encode("utf-8")) > 4096:
        raise ValueError("text too long (max 4096 bytes)")

    user = (raw_user)[:120]
    user_id = ("wb:" + raw_user_id[:80]) if raw_user_id else ""
    user_avatar = (
        raw_user_avatar
        if raw_user_avatar.startswith("https://") and len(raw_user_avatar) <= 2048
        else ""
    )

    driver.check_chat_send_rate()

    addr = _normalize_channel_addr(channel)

    if not driver._is_valid_chat_channel(addr):
        raise ValueError("channel does not match any rule for this instance")
    message_id = f"wb-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    driver._buffer_event(
        "chat.inbound",
        {
            "channel": addr,
            "platform": "workbench",
            "instance_id": driver.instance_id,
            "user": user,
            "user_id": user_id,
            "user_avatar": user_avatar,
            "text": text,
            "message_id": message_id,
            "time": now,
            "self": True,
        },
    )

    msg = NormalizedMessage(
        platform="workbench",
        instance_id=driver.instance_id,
        channel=addr,
        nickname=user,
        username=user,
        user_id=user_id,
        user_avatar=user_avatar,
        text=text,
        message_id=message_id,
        time=now,
    )

    try:
        await driver.bridge.on_message(msg)
    except Exception as exc:
        driver.logger.opt(exception=exc).warning("chat.send dispatch failed")
        raise

    return {"ok": True, "message_id": message_id, "time": now}


# ---------------------------------------------------------------------------
# Driver implementation
# ---------------------------------------------------------------------------


def _to_wss_url(base: str) -> str:
    parsed = urlparse(base)
    scheme = parsed.scheme.lower()
    if scheme == "https":
        ws_scheme = "wss"
    elif scheme == "http":
        ws_scheme = "ws"
    else:
        ws_scheme = scheme or "wss"
    path = parsed.path.rstrip("/") + "/api/nextbridge/relay"
    return urlunparse((ws_scheme, parsed.netloc, path, "", "", ""))


class WorkbenchDriver(BaseDriver[WorkbenchConfig]):
    """Maintains an outbound WSS link to a Workbench instance.

    Acts as both a control plane (RPC for status/rules/etc) and a chat
    endpoint — when a rule routes a message to this Workbench instance,
    ``send`` fires a ``chat.inbound`` event so the Workbench UI can render
    it. Messages typed in the Workbench UI come back as ``chat.send`` RPCs
    that go through ``bridge.on_message`` for normal fan-out.
    """

    meta = DriverMeta(
        platform="workbench",
        display_name="Workbench",
        capabilities={DriverCapability.SEND, DriverCapability.RECEIVE},
    )

    _CHAT_SEND_BUCKET_CAPACITY = 10
    _CHAT_SEND_BUCKET_WINDOW = 10.0
    _RULES_RELOAD_COOLDOWN = 5.0

    def __init__(
        self,
        instance_id: str,
        config: WorkbenchConfig,
        ctx_or_bridge: DriverContext | Any,
    ):
        super().__init__(instance_id, config, ctx_or_bridge)
        self._ws: ClientConnection | None = None
        self._send_lock = asyncio.Lock()
        self._stop = asyncio.Event()
        self._event_buffer: asyncio.Queue[dict] = asyncio.Queue(maxsize=512)
        self._chat_send_timestamps: list[float] = []
        self._last_rules_reload: float = 0.0
        self._handshake_ok: bool = False
        self._rule_index: dict[str, list[tuple[str, dict]]] | None = None
        self._chat_channels_cache: dict | None = None
        self._chat_channel_keys: set[str] | None = None
        self._drop_count: int = 0
        self._last_drop_log: float = 0.0

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    def check_chat_send_rate(self) -> None:
        now = time.monotonic()
        window = self._CHAT_SEND_BUCKET_WINDOW
        self._chat_send_timestamps = [
            ts for ts in self._chat_send_timestamps if now - ts < window
        ]
        if len(self._chat_send_timestamps) >= self._CHAT_SEND_BUCKET_CAPACITY:
            raise RuntimeError(
                f"chat.send rate limit: max "
                f"{self._CHAT_SEND_BUCKET_CAPACITY} per "
                f"{int(self._CHAT_SEND_BUCKET_WINDOW)}s"
            )
        self._chat_send_timestamps.append(now)

    def check_rules_reload_cooldown(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_rules_reload
        if elapsed < self._RULES_RELOAD_COOLDOWN:
            wait = self._RULES_RELOAD_COOLDOWN - elapsed
            raise RuntimeError(
                f"rules.reload cooldown: retry in {wait:.1f}s"
            )
        self._last_rules_reload = now

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        if not self.config.url or not self.config.token:
            self.logger.warning(
                "url/token missing; not starting. "
                "Run `python main.py workbench pair <url> <code>` to configure."
            )
            self.health = DriverHealth.STOPPED
            return

        self._ctx.event_bus.on("bridge.message", self._on_bridge_message)
        self._ctx.event_bus.on("driver.status", self._on_driver_status)

        self.bridge.register_sender(self.instance_id, self.send)

        self.health = DriverHealth.STARTING

        backoff = max(1, int(self.config.reconnect_min_seconds))
        max_backoff = max(backoff, int(self.config.reconnect_max_seconds))

        url = _to_wss_url(self.config.url)
        self.logger.info(f"target: {url}")

        try:
            while not self._stop.is_set():
                try:
                    await self._session(url)
                    backoff = max(1, int(self.config.reconnect_min_seconds))
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self.health = DriverHealth.UNHEALTHY
                    self.logger.warning(
                        f"disconnected ({type(exc).__name__}): {exc}; retrying in {backoff}s"
                    )
                jitter = random.uniform(0, 0.3 * backoff)
                try:
                    await asyncio.wait_for(
                        self._stop.wait(), timeout=backoff + jitter
                    )
                    break
                except asyncio.TimeoutError:
                    pass
                backoff = min(max_backoff, backoff * 2)
        finally:
            self.health = DriverHealth.STOPPED
            self.logger.info("stopped")

    async def send(self, channel: dict, text: str, **kwargs) -> str | None:
        message_id = f"wb-{uuid.uuid4().hex[:12]}"

        platform = str(kwargs.get("platform", "") or "")
        user_id = str(kwargs.get("user_id", "") or "")
        user_avatar = str(kwargs.get("user_avatar", "") or "")

        if not user_avatar and platform == "qq" and user_id.isdigit():
            user_avatar = (
                f"https://q1.qlogo.cn/g?b=qq&nk={user_id}&s=640"
            )

        ctx = {
            "platform": platform,
            "instance_id": kwargs.get("instance_id", ""),
            "user": kwargs.get("user", ""),
            "user_id": user_id,
            "user_avatar": user_avatar,
            "username": kwargs.get("username", ""),
            "time": kwargs.get("time"),
        }
        rich_header = kwargs.get("rich_header")
        attachments = _serialise_attachments(kwargs.get("attachments"))

        self._buffer_event(
            "chat.inbound",
            {
                "channel": _normalize_channel_addr(channel),
                "text": text,
                "message_id": message_id,
                "rich_header": rich_header,
                "attachments": attachments,
                **ctx,
            },
        )
        return message_id

    async def stop(self) -> None:
        self._stop.set()
        self._ctx.event_bus.off("bridge.message", self._on_bridge_message)
        self._ctx.event_bus.off("driver.status", self._on_driver_status)

    # ------------------------------------------------------------------
    # WS session
    # ------------------------------------------------------------------

    async def _session(self, url: str) -> None:
        headers = {
            "Authorization": f"Bearer {self.config.token}",
            "X-NextBridge-Instance": self.config.workbench_instance_id or "",
            "X-NextBridge-Version": self._ctx.version,
        }
        self.logger.info("connecting...")
        async with websockets.connect(
            url,
            additional_headers=headers,
            open_timeout=15,
            ping_interval=None,
            max_size=2**20,
        ) as ws:
            self._ws = ws
            self._handshake_ok = False
            self.logger.info("connected")
            await self._send_json(
                {
                    "kind": "hello",
                    "instance_id": self.config.workbench_instance_id,
                    "instance_name": self.config.instance_name,
                    "version": self._ctx.version,
                    "command_prefix": self.bridge.command_prefix,
                }
            )

            try:
                raw_ack = await asyncio.wait_for(ws.recv(), timeout=10)
            except asyncio.TimeoutError:
                self.logger.error("hello.ack timeout; closing and retrying")
                return
            try:
                ack = json.loads(
                    raw_ack.decode("utf-8") if isinstance(raw_ack, bytes) else raw_ack
                )
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.logger.error("malformed hello.ack frame")
                return
            if not isinstance(ack, dict):
                self.logger.error(f"hello.ack not an object: {type(ack).__name__}")
                return
            if (
                ack.get("kind") != "hello.ack"
                or not ack.get("ok")
                or ack.get("instance_id") != self.config.workbench_instance_id
            ):
                self.logger.error(f"hello.ack rejected: {ack!r}")
                return
            self._handshake_ok = True
            self.health = DriverHealth.HEALTHY
            self.logger.info(f"handshake complete (team={ack.get('team_id', '?')})")

            await self._flush_buffer()

            heartbeat = asyncio.create_task(self._heartbeat_loop())
            pump = asyncio.create_task(self._pump_buffer())
            try:
                async for raw in ws:
                    await self._handle_incoming(raw)
            finally:
                heartbeat.cancel()
                pump.cancel()
                self._ws = None
                self.health = DriverHealth.DEGRADED
                for task in (heartbeat, pump):
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass

    async def _heartbeat_loop(self) -> None:
        interval = max(5, int(self.config.heartbeat_seconds))
        try:
            while True:
                await asyncio.sleep(interval)
                await self._send_json({"kind": "ping", "t": int(time.time())})
        except asyncio.CancelledError:
            return

    async def _pump_buffer(self) -> None:
        try:
            while True:
                event = await self._event_buffer.get()
                if not await self._send_json(event):
                    try:
                        self._event_buffer.put_nowait(event)
                    except asyncio.QueueFull:
                        pass
                    break
        except asyncio.CancelledError:
            return

    async def _flush_buffer(self) -> None:
        sent = 0
        while True:
            try:
                event = self._event_buffer.get_nowait()
            except asyncio.QueueEmpty:
                break
            if not await self._send_json(event):
                try:
                    self._event_buffer.put_nowait(event)
                except asyncio.QueueFull:
                    pass
                break
            sent += 1
        if sent:
            self.logger.debug(f"flushed {sent} buffered event(s)")

    # ------------------------------------------------------------------
    # Incoming frames
    # ------------------------------------------------------------------

    async def _handle_incoming(self, raw: str | bytes) -> None:
        if not self._handshake_ok:
            self.logger.warning("pre-handshake frame dropped")
            return

        try:
            text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            frame = json.loads(text)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.logger.warning(f"bad frame ({exc})")
            return
        if not isinstance(frame, dict):
            self.logger.warning(f"frame not an object: {type(frame).__name__}")
            return

        kind = frame.get("kind")
        if kind == "ping":
            await self._send_json({"kind": "pong", "t": frame.get("t")})
            return
        if kind == "pong":
            return
        if kind != "req":
            self.logger.debug(f"ignoring frame kind={kind}")
            return

        rpc_id = frame.get("id")
        method = frame.get("method", "")
        params = frame.get("params") or {}
        if not isinstance(params, dict):
            await self._send_response(rpc_id, ok=False, error="params must be an object")
            return

        handler = _RPC_METHODS.get(method)
        if handler is None:
            await self._send_response(
                rpc_id, ok=False, error=f"unknown method: {method}"
            )
            return

        try:
            result = handler(self, params)
            if inspect.isawaitable(result):
                result = await result
        except Exception as exc:
            self.logger.opt(exception=exc).warning(f"RPC {method} failed")
            await self._send_response(rpc_id, ok=False, error=str(exc))
            return

        await self._send_response(rpc_id, ok=True, data=result)

    # ------------------------------------------------------------------
    # Outgoing
    # ------------------------------------------------------------------

    async def _send_response(
        self,
        rpc_id: str | None,
        ok: bool,
        data: Any = None,
        error: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {"kind": "res", "id": rpc_id, "ok": ok}
        if ok:
            payload["data"] = data
        else:
            payload["error"] = error or "unknown error"
        await self._send_json(payload)

    async def _send_json(self, payload: dict[str, Any]) -> bool:
        if self._ws is None:
            return False
        async with self._send_lock:
            try:
                await self._ws.send(
                    json.dumps(payload, ensure_ascii=False, default=str)
                )
                return True
            except Exception as exc:
                self.logger.debug(f"send failed ({type(exc).__name__}): {exc}")
                try:
                    await self._ws.close()
                except Exception:
                    pass
                return False

    # ------------------------------------------------------------------
    # Event buffering
    # ------------------------------------------------------------------

    def _build_rule_index(self) -> dict[str, list[tuple[str, dict]]]:
        index: dict[str, list[tuple[str, dict]]] = {}
        for rule in self.bridge.rules_snapshot():
            slot = "channels" if rule.get("type") == "connect" else "from"
            block = rule.get(slot)
            if not isinstance(block, dict):
                continue
            rid = str(rule.get("id", ""))
            if not rid:
                continue
            for inst_id, spec in block.items():
                if not isinstance(spec, dict):
                    continue
                index.setdefault(inst_id, []).append((rid, spec))
        return index

    def invalidate_rule_index(self) -> None:
        self._rule_index = None
        self._chat_channels_cache = None
        self._chat_channel_keys = None

    def _compute_chat_channels(self) -> tuple[dict, set[str]]:
        inst = self.instance_id
        senders = {
            s["instance_id"]: s.get("platform") or ""
            for s in self.bridge.senders_snapshot()
        }
        seen_keys: set[str] = set()
        out: list[dict] = []
        for rule in self.bridge.rules_snapshot():
            for slot in ("to", "channels"):
                block = rule.get(slot)
                if not isinstance(block, dict):
                    continue
                ch = block.get(inst)
                if not isinstance(ch, dict):
                    continue

                addr = _normalize_channel_addr(ch)
                rule_id = str(rule.get("id", ""))
                dedupe_key = rule_id + "|" + json.dumps(
                    addr, sort_keys=True, ensure_ascii=True, default=str
                )
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)

                peers: list[dict] = []
                for peer_inst, peer_ch in block.items():
                    if peer_inst == inst:
                        continue
                    if not isinstance(peer_ch, dict):
                        continue
                    peers.append(
                        {
                            "instance_id": peer_inst,
                            "platform": senders.get(peer_inst, ""),
                            "address": _normalize_channel_addr(peer_ch),
                        }
                    )

                out.append(
                    {
                        "rule_id": rule_id,
                        "rule_type": str(rule.get("type", "forward")),
                        "address": addr,
                        "peers": peers,
                    }
                )
        keys = {
            json.dumps(
                entry["address"], sort_keys=True, ensure_ascii=True, default=str
            )
            for entry in out
        }
        return {"channels": out}, keys

    def _get_chat_channels(self) -> dict:
        if self._chat_channels_cache is None:
            payload, keys = self._compute_chat_channels()
            self._chat_channels_cache = payload
            self._chat_channel_keys = keys
        return self._chat_channels_cache

    def _is_valid_chat_channel(self, addr: dict) -> bool:
        if self._chat_channel_keys is None:
            self._get_chat_channels()
        assert self._chat_channel_keys is not None
        key = json.dumps(
            addr, sort_keys=True, ensure_ascii=True, default=str
        )
        return key in self._chat_channel_keys

    def _matching_rule_ids(
        self, source_inst: str, source_channel: dict
    ) -> list[str]:
        if self._rule_index is None:
            self._rule_index = self._build_rule_index()
        candidates = self._rule_index.get(source_inst, ())
        out: list[str] = []
        for rid, spec in candidates:
            ok = True
            for k, v in spec.items():
                if k in _NON_ADDRESS_KEYS:
                    continue
                if k not in source_channel:
                    ok = False
                    break
                if str(source_channel[k]) != str(v):
                    ok = False
                    break
            if ok:
                out.append(rid)
        return out

    _DROP_LOG_INTERVAL = 30.0

    def _buffer_event(self, topic: str, data: dict) -> None:
        event = {
            "kind": "event",
            "topic": topic,
            "data": data,
            "t": int(time.time()),
        }
        try:
            self._event_buffer.put_nowait(event)
            return
        except asyncio.QueueFull:
            pass

        try:
            _ = self._event_buffer.get_nowait()
        except asyncio.QueueEmpty:
            return
        try:
            self._event_buffer.put_nowait(event)
        except asyncio.QueueFull:
            pass

        self._drop_count += 1
        now = time.monotonic()
        if now - self._last_drop_log >= self._DROP_LOG_INTERVAL:
            self.logger.warning(
                f"event buffer full; dropped {self._drop_count} oldest event(s) "
                f"since last log (buffer maxsize={self._event_buffer.maxsize}, "
                f"current={self._event_buffer.qsize()})"
            )
            self._drop_count = 0
            self._last_drop_log = now

    async def _on_bridge_message(self, **kwargs: Any) -> None:
        data = dict(kwargs)
        src_inst = data.get("instance_id")
        src_channel = data.get("channel")
        if isinstance(src_inst, str) and isinstance(src_channel, dict):
            matched = self._matching_rule_ids(src_inst, src_channel)
            if matched:
                data["rule_ids"] = matched
        self._buffer_event("bridge.message", data)

    async def _on_driver_status(self, **kwargs: Any) -> None:
        self._buffer_event("driver.status", dict(kwargs))


# ---------------------------------------------------------------------------
# CLI helpers — used by `python main.py workbench pair`
# ---------------------------------------------------------------------------


def _http_base(url: str) -> str:
    raw = url.strip()
    if not raw:
        raise SystemExit(f"Invalid workbench URL: {url}")
    if "://" not in raw:
        raw = "https://" + raw

    parsed = urlparse(raw)
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        netloc_or_path = parsed.netloc or parsed.path
        parsed = urlparse("https://" + netloc_or_path)
        scheme = "https"

    netloc = parsed.netloc
    if not netloc:
        raise SystemExit(f"Invalid workbench URL: {url}")
    path = parsed.path.rstrip("/")
    return f"{scheme}://{netloc}{path}"


def cmd_pair(
    workbench_url: str,
    code: str,
    instance_name: str | None,
    inst_id: str = "default",
) -> None:
    base = _http_base(workbench_url)
    endpoint = f"{base}/api/nextbridge/pair"

    payload: dict[str, object] = {"code": code.strip()}
    if instance_name:
        payload["instance_name"] = instance_name.strip()

    logger.info(f"Pairing with Workbench at {endpoint}...")
    try:
        resp = httpx.post(endpoint, json=payload, timeout=20.0)
    except httpx.HTTPError as exc:
        logger.error(f"Failed to reach Workbench: {exc}")
        sys.exit(2)

    if resp.status_code >= 400:
        logger.error(f"Pairing failed ({resp.status_code}): {resp.text}")
        sys.exit(3)

    try:
        body = resp.json()
    except json.JSONDecodeError:
        logger.error(f"Workbench returned non-JSON: {resp.text[:200]}")
        sys.exit(3)

    token = body.get("token")
    wb_instance_id = body.get("instance_id")
    if not token or not wb_instance_id:
        logger.error(f"Workbench response missing token/instance_id: {body}")
        sys.exit(3)

    data_dir = Path(u.get_data_path())
    config_path = config_io.find_config(data_dir)
    if config_path is None:
        config_path = data_dir / "config.json"
        config: dict = {}
    else:
        config = config_io.load_config(config_path)

    wb_section = config.setdefault("workbench", {})
    if not isinstance(wb_section, dict):
        logger.error(
            "Existing `workbench` block in config is not a mapping; refusing to overwrite"
        )
        sys.exit(4)

    inst_block = wb_section.setdefault(inst_id, {})
    inst_block.update(
        {
            "url": base,
            "token": token,
            "workbench_instance_id": wb_instance_id,
            "instance_name": instance_name or inst_block.get("instance_name", ""),
        }
    )

    config_io.save_config(config, config_path)
    logger.info(
        f"Paired successfully. Instance id: {wb_instance_id}. "
        f"Config updated: {config_path}"
    )
    print(
        f"\nPaired with Workbench.\n"
        f"  url:                   {base}\n"
        f"  workbench instance_id: {wb_instance_id}\n"
        f"  local config key:      workbench.{inst_id}\n"
        f"  config file:           {config_path}\n\n"
        f"Restart NextBridge to bring the link up."
    )


def _setup_cli(subparsers) -> None:
    wb_parser = subparsers.add_parser("workbench", help="Workbench integration")
    wb_sub = wb_parser.add_subparsers(dest="workbench_command")

    pair_parser = wb_sub.add_parser("pair", help="Pair with a Workbench instance")
    pair_parser.add_argument("url", help="Workbench base URL")
    pair_parser.add_argument("code", help="One-time pairing code")
    pair_parser.add_argument("--name", dest="instance_name", default=None, help="Instance label")
    pair_parser.add_argument("--id", dest="inst_id", default="default", help="Local config key")

    def _handle_cli(args):
        if getattr(args, "workbench_command", None) == "pair":
            cmd_pair(args.url, args.code, args.instance_name, args.inst_id)
        else:
            wb_parser.print_help()

    wb_parser.set_defaults(cli_handler=_handle_cli)


register_cli(_setup_cli)
register("workbench", WorkbenchConfig, WorkbenchDriver)

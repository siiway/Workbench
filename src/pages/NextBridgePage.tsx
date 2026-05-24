/**
 * /bridge — the chat page that every team member can use.
 *
 * Layout: channel list (left), message log (center), composer (bottom).
 * The list of channels is derived from the NextBridge rules file (any rule
 * mentioning the paired Workbench instance contributes a channel). Messages
 * are persisted server-side in the NbHub Durable Object (1000-entry ring
 * per instance); on open we fetch the persisted tail and poll for updates.
 *
 * The configuration surface (status, drivers, rules table, pair/revoke)
 * lives at /bridge/config and is gated to admin / co-owner / owner via the
 * Worker route's canManage check.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Body1,
  Body2,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle1,
  Textarea,
  Title2,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  DocumentRegular,
  EditRegular,
  ImageOffRegular,
  MicRegular,
  PlugDisconnectedRegular,
  SendRegular,
  SettingsRegular,
  VideoRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";

type Instance = {
  id: string;
  teamId: string;
  name: string;
  createdAt: string;
  createdBy: string;
};

type InstanceListResponse = {
  instances: Instance[];
  can_manage: boolean;
};

type StatusResponse = {
  connected: boolean;
  meta: {
    instance_id?: string;
    instance_name?: string;
    version?: string;
    command_prefix?: string;
    connected_at?: number;
  };
  pending_rpcs: number;
  event_buffer: number;
  chat_buffer: number;
};

type ChannelAddress = Record<string, unknown>;

type ChannelPeer = {
  instance_id: string;
  platform: string;
  address: ChannelAddress;
};

type BridgeChannel = {
  rule_id: string;
  rule_type: string;
  address: ChannelAddress;
  peers: ChannelPeer[];
};

type ChatAttachment = {
  type: string;   // "image" | "video" | "voice" | "file"
  url: string;
  name: string;
  size: number;   // bytes; -1 when unknown
};

type ChatMessage = {
  channel_key: string;
  channel: ChannelAddress;
  text: string;
  user: string;
  user_id: string;
  user_avatar: string;
  platform: string;
  instance_id: string;
  message_id: string;
  time: string | number | null;
  self: boolean;
  attachments: ChatAttachment[];
  recorded_at: number;
};

const useStyles = makeStyles({
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "16px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerLeft: { display: "flex", flexDirection: "column", gap: "2px" },
  headerActions: { display: "flex", gap: "8px", alignItems: "center" },
  layout: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    overflow: "hidden",
  },
  channelRail: {
    width: "280px",
    flexShrink: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    display: "flex",
    flexDirection: "column",
  },
  channelRailHeader: {
    padding: "12px 16px",
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: tokens.fontWeightSemibold,
  },
  channelRailBody: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 8px 8px",
  },
  channelItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px 10px 8px 14px",
    borderRadius: tokens.borderRadiusMedium,
    background: "transparent",
    cursor: "pointer",
    border: "none",
    width: "100%",
    textAlign: "left",
    color: tokens.colorNeutralForeground1,
    position: "relative",
    "&:hover": { background: tokens.colorNeutralBackground1Hover },
  },
  channelItemActive: {
    background: tokens.colorNeutralBackground1Selected,
    "&:hover": { background: tokens.colorNeutralBackground1Selected },
  },
  /**
   * Left-edge accent bar coloured by hash(rule_id). Renders as a 3px wide
   * vertical strip so the user can scan the rail and recognise groups by
   * colour at a glance. CSS variable `--group-color` is set per-item below.
   */
  channelAccent: {
    position: "absolute",
    left: 0,
    top: "6px",
    bottom: "6px",
    width: "3px",
    borderRadius: "2px",
    background: "var(--group-color, transparent)",
  },
  channelTitleRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    minWidth: 0,
  },
  channelTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "13px",
    color: "var(--group-color, currentColor)",
  },
  channelRuleId: {
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "10.5px",
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  channelPeers: {
    display: "flex",
    flexWrap: "wrap",
    gap: "3px",
  },
  channelPeerChip: {
    fontSize: "10.5px",
    padding: "1px 6px",
    borderRadius: "8px",
    background: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  channelMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  channelEmpty: {
    padding: "16px",
    fontStyle: "italic",
    color: tokens.colorNeutralForeground3,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  },
  mainHeader: {
    padding: "12px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  log: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  logEmpty: {
    margin: "auto",
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
  },
  message: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
  },
  messageBody: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 },
  messageMeta: {
    display: "flex",
    gap: "8px",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  messageAuthor: { fontWeight: tokens.fontWeightSemibold, fontSize: "13px" },
  messagePlatform: {
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "11px",
    color: tokens.colorNeutralForeground3,
  },
  messageTime: {
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    whiteSpace: "nowrap",
  },
  messageText: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: "14px",
  },
  messageSelf: {
    background: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: "6px 10px",
  },
  attachments: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginTop: "4px",
  },
  attachmentImage: {
    maxWidth: "320px",
    maxHeight: "240px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: "zoom-in",
    background: tokens.colorNeutralBackground3,
  },
  attachmentBrokenImage: {
    fontSize: "12px",
    fontStyle: "italic",
    color: tokens.colorNeutralForeground3,
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground3,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  attachmentFile: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground3,
    color: tokens.colorBrandForeground1,
    textDecoration: "none",
    fontSize: "13px",
    maxWidth: "320px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  composer: {
    padding: "12px 24px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    background: tokens.colorNeutralBackground1,
  },
  composerInput: { flex: 1 },
  noInstance: {
    margin: "auto",
    padding: "32px",
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
});

type Props = { teamId: string };

// ── helpers ────────────────────────────────────────────────────────────────

function channelKey(addr: ChannelAddress): string {
  const sorted = Object.keys(addr).sort();
  const obj: Record<string, unknown> = {};
  for (const k of sorted) obj[k] = addr[k];
  return JSON.stringify(obj);
}

function channelLabel(
  ch: BridgeChannel,
  customNames: Record<string, string> = {},
): string {
  if (ch.rule_id && customNames[ch.rule_id]) return customNames[ch.rule_id];
  if (ch.rule_id) return ch.rule_id;
  const a = ch.address;
  if ("channel" in a && typeof a.channel === "string") return a.channel;
  return channelKey(a);
}

/**
 * Deterministic colour per group so the user can recognise interconnection
 * groups at a glance. Hash rule_id (or, if missing, the channel key) to one
 * of N high-contrast palette entries. Same input → same colour every load.
 */
const GROUP_PALETTE = [
  "#0078d4", // blue
  "#107c10", // green
  "#d83b01", // orange
  "#5c2d91", // purple
  "#008272", // teal
  "#b146c2", // magenta
  "#a4262c", // red
  "#bf8700", // gold
];

function colorForGroup(ch: BridgeChannel): string {
  const seed = ch.rule_id || channelKey(ch.address);
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return GROUP_PALETTE[h % GROUP_PALETTE.length];
}

function peerLabel(p: ChannelPeer): string {
  const id =
    (p.address as { group_id?: unknown; channel_id?: unknown; chat_id?: unknown; channel?: unknown })
      .group_id ??
    (p.address as { channel_id?: unknown }).channel_id ??
    (p.address as { chat_id?: unknown }).chat_id ??
    (p.address as { channel?: unknown }).channel;
  const platform = p.platform || p.instance_id;
  if (id === undefined || id === null || id === "") return platform;
  // Truncate very long IDs from the middle so the platform name stays visible.
  const s = String(id);
  const trimmed = s.length > 12 ? s.slice(0, 4) + "…" + s.slice(-4) : s;
  return `${platform}:${trimmed}`;
}

function describeAddress(addr: ChannelAddress): string {
  return Object.entries(addr)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
}

function formatTime(t: string | number | null | undefined, fallback: number): string {
  const ms =
    typeof t === "number"
      ? t > 1e12
        ? t
        : t * 1000
      : t
      ? Date.parse(t)
      : fallback * 1000;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString();
}

// ── component ─────────────────────────────────────────────────────────────

export function NextBridgePage({ teamId }: Props) {
  const styles = useStyles();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [list, setList] = useState<InstanceListResponse | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [channels, setChannels] = useState<BridgeChannel[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // rule_id → user-assigned display label. Loaded alongside channels;
  // edited via the rename dialog. Empty entry = use default rule_id.
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [renameTarget, setRenameTarget] = useState<BridgeChannel | null>(null);

  // Initial fetch: which instances are paired in this team?
  const fetchList = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(
        `/api/nextbridge/instances?teamId=${encodeURIComponent(teamId)}`,
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as InstanceListResponse;
      setList(data);
      setInstanceId((prev) => prev ?? data.instances[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [teamId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Once we have an instance, pull status + channels + custom group names.
  const fetchStatusAndChannels = useCallback(async () => {
    if (!instanceId) return;
    try {
      const statusR = await fetch(
        `/api/nextbridge/instances/${encodeURIComponent(instanceId)}/status?teamId=${encodeURIComponent(teamId)}`,
      );
      if (statusR.ok) setStatus((await statusR.json()) as StatusResponse);

      const channelsR = await fetch(
        `/api/nextbridge/instances/${encodeURIComponent(instanceId)}/channels?teamId=${encodeURIComponent(teamId)}`,
      );
      if (channelsR.ok) {
        const body = (await channelsR.json()) as
          | { ok: true; data: { channels: BridgeChannel[] } }
          | { ok: false; error: string };
        if (body.ok) {
          setChannels(body.data.channels);
          // First channel becomes active unless user already picked one.
          setActiveKey((prev) =>
            prev ?? (body.data.channels[0] ? channelKey(body.data.channels[0].address) : null),
          );
        }
      }

      const namesR = await fetch(
        `/api/nextbridge/instances/${encodeURIComponent(instanceId)}/group-names?teamId=${encodeURIComponent(teamId)}`,
      );
      if (namesR.ok) {
        const body = (await namesR.json()) as { names?: Record<string, string> };
        setGroupNames(body.names ?? {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [instanceId, teamId]);

  /** Persist a single rule's custom name. Empty string clears it. */
  const saveGroupName = useCallback(
    async (ruleId: string, name: string) => {
      if (!instanceId) return;
      const next = { ...groupNames };
      const trimmed = name.trim();
      if (trimmed) next[ruleId] = trimmed;
      else delete next[ruleId];
      setGroupNames(next); // optimistic
      try {
        await fetch(
          `/api/nextbridge/instances/${encodeURIComponent(instanceId)}/group-names?teamId=${encodeURIComponent(teamId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: next }),
          },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [instanceId, teamId, groupNames],
  );

  useEffect(() => {
    void fetchStatusAndChannels();
  }, [fetchStatusAndChannels]);

  // Fetch messages for the active channel; poll every 3 seconds.
  const fetchMessages = useCallback(async () => {
    if (!instanceId || !activeKey) return;
    try {
      const qs = new URLSearchParams({
        teamId,
        channel_key: activeKey,
        limit: "200",
      });
      const r = await fetch(
        `/api/nextbridge/instances/${encodeURIComponent(instanceId)}/messages?${qs.toString()}`,
      );
      if (!r.ok) return;
      const body = (await r.json()) as { messages: ChatMessage[] };
      setMessages(body.messages);
    } catch {
      // transient — keep last good state
    }
  }, [instanceId, teamId, activeKey]);

  useEffect(() => {
    setMessages(null);
    void fetchMessages();
  }, [fetchMessages]);

  // Live update channel. Open a WS to the DO; on each chat.inbound frame,
  // dedupe by message_id and append. Replaces the previous 3-second poll —
  // see DO `broadcastChat` for the server side. Reconnects with backoff if
  // the socket drops (DO eviction / Cloudflare maintenance).
  useEffect(() => {
    if (!instanceId || !activeKey) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${scheme}://${window.location.host}/api/nextbridge/instances/${encodeURIComponent(
        instanceId,
      )}/stream?teamId=${encodeURIComponent(teamId)}`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = (ev) => {
        let frame: { kind?: string; message?: ChatMessage } | null = null;
        try {
          frame = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (!frame || frame.kind !== "chat.inbound" || !frame.message) return;
        const incoming = frame.message;
        // Only append if it matches the channel the user is currently viewing.
        if (incoming.channel_key !== activeKey) return;
        setMessages((prev) => {
          if (!prev) return [incoming];
          // Dedupe by message_id in case the initial fetch and a live event
          // both reference the same row (happens on quick re-mounts).
          if (incoming.message_id && prev.some((m) => m.message_id === incoming.message_id)) {
            return prev;
          }
          return [...prev, incoming];
        });
      };
      ws.onclose = () => {
        if (closed) return;
        // Exponential backoff capped at 30s. First retry after ~1s, then
        // 2s, 4s, 8s, 16s, 30s.
        attempt += 1;
        const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        // onclose will fire right after, let it handle the reconnect.
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [instanceId, activeKey, teamId]);

  // Auto-scroll the log when new messages arrive.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const activeChannel = useMemo(
    () => channels?.find((c) => channelKey(c.address) === activeKey) ?? null,
    [channels, activeKey],
  );

  const send = async () => {
    if (!instanceId || !activeChannel || !composer.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/nextbridge/instances/${encodeURIComponent(instanceId)}/chat/send?teamId=${encodeURIComponent(teamId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: activeChannel.address,
            text: composer,
          }),
        },
      );
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || body.ok === false) {
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setComposer("");
      // No manual refetch needed — chat.send echoes a chat.inbound event
      // back through the DO broadcast, which the live WS subscriber appends.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const canManage = list?.can_manage ?? false;
  const connected = status?.connected ?? false;
  const instances = list?.instances ?? [];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Title2>{t.bridgeTitle}</Title2>
          <Body1 style={{ color: tokens.colorNeutralForeground3 }}>
            {connected ? t.bridgeConnected : t.bridgeDisconnected}
            {status?.meta.instance_name ? ` · ${status.meta.instance_name}` : ""}
          </Body1>
        </div>
        <div className={styles.headerActions}>
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            onClick={() => {
              void fetchList();
              void fetchStatusAndChannels();
              void fetchMessages();
            }}
          >
            {t.refresh}
          </Button>
          {canManage && (
            <Button
              appearance="subtle"
              icon={<SettingsRegular />}
              onClick={() => navigate("/bridge/config")}
            >
              {t.bridgeConfigure}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {!list ? (
        <div className={styles.noInstance}>
          <Spinner label={t.loading} />
        </div>
      ) : instances.length === 0 ? (
        <div className={styles.noInstance}>
          <Body2 block style={{ marginBottom: 12 }}>
            {t.bridgeNoInstancesHint}
          </Body2>
          {canManage && (
            <Button
              appearance="primary"
              icon={<SettingsRegular />}
              onClick={() => navigate("/bridge/config")}
            >
              {t.bridgePairButton}
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.channelRail}>
            <div className={styles.channelRailHeader}>{t.bridgeChannels}</div>
            <div className={styles.channelRailBody}>
              {channels === null ? (
                <Spinner size="tiny" label={t.loading} />
              ) : channels.length === 0 ? (
                <div className={styles.channelEmpty}>
                  <Body2>{t.bridgeChannelsEmpty}</Body2>
                </div>
              ) : (
                channels.map((ch) => {
                  const key = channelKey(ch.address);
                  const color = colorForGroup(ch);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={mergeClasses(
                        styles.channelItem,
                        key === activeKey && styles.channelItemActive,
                      )}
                      style={
                        { "--group-color": color } as React.CSSProperties
                      }
                      onClick={() => setActiveKey(key)}
                      title={`${ch.rule_type} · ${describeAddress(ch.address)}`}
                    >
                      <span
                        className={styles.channelAccent}
                        aria-hidden="true"
                      />
                      <span className={styles.channelTitleRow}>
                        <span className={styles.channelTitle}>
                          {channelLabel(ch, groupNames)}
                        </span>
                        {ch.rule_id && groupNames[ch.rule_id] && (
                          // Only show the raw rule_id alongside the title when
                          // a custom name has been set — otherwise the title
                          // IS the rule_id and showing it twice is noise.
                          <span className={styles.channelRuleId}>
                            {ch.rule_id}
                          </span>
                        )}
                      </span>
                      {ch.peers && ch.peers.length > 0 ? (
                        <span className={styles.channelPeers}>
                          {ch.peers.map((p) => (
                            <span
                              key={`${p.instance_id}-${channelKey(p.address)}`}
                              className={styles.channelPeerChip}
                              title={describeAddress(p.address)}
                            >
                              {peerLabel(p)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={styles.channelMeta}>
                          {t.bridgeGroupSolo}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className={styles.main}>
            {activeChannel ? (
              <>
                <div
                  className={styles.mainHeader}
                  style={{
                    boxShadow: `inset 4px 0 0 0 ${colorForGroup(activeChannel)}`,
                  }}
                >
                  <Subtitle1 style={{ color: colorForGroup(activeChannel) }}>
                    {channelLabel(activeChannel, groupNames)}
                  </Subtitle1>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<EditRegular />}
                    title={t.bridgeRenameGroup}
                    onClick={() => setRenameTarget(activeChannel)}
                  />
                  <Caption1
                    style={{
                      color: tokens.colorNeutralForeground3,
                      fontFamily:
                        "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
                    }}
                  >
                    {activeChannel.rule_type}
                    {activeChannel.rule_id ? ` · ${activeChannel.rule_id}` : ""}
                  </Caption1>
                  {activeChannel.peers && activeChannel.peers.length > 0 && (
                    <span className={styles.channelPeers} style={{ marginLeft: 4 }}>
                      {activeChannel.peers.map((p) => (
                        <span
                          key={`${p.instance_id}-${channelKey(p.address)}`}
                          className={styles.channelPeerChip}
                          title={describeAddress(p.address)}
                        >
                          {peerLabel(p)}
                        </span>
                      ))}
                    </span>
                  )}
                  {!connected && (
                    <Caption1
                      style={{
                        color: tokens.colorPaletteRedForeground1,
                        marginLeft: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <PlugDisconnectedRegular /> {t.bridgeDisconnected}
                    </Caption1>
                  )}
                </div>

                <div className={styles.log} ref={logRef}>
                  {messages === null ? (
                    <Spinner size="tiny" label={t.loading} />
                  ) : messages.length === 0 ? (
                    <div className={styles.logEmpty}>{t.bridgeChannelEmpty}</div>
                  ) : (
                    messages.map((m, idx) => (
                      <div
                        key={m.message_id || `${m.recorded_at}-${idx}`}
                        className={styles.message}
                      >
                        <Avatar
                          name={m.user || m.user_id}
                          image={m.user_avatar ? { src: m.user_avatar } : undefined}
                          size={28}
                          aria-label={m.user}
                        />
                        <div className={styles.messageBody}>
                          <div className={styles.messageMeta}>
                            <span className={styles.messageAuthor}>
                              {m.user || m.user_id || "(unknown)"}
                            </span>
                            <span
                              className={styles.messagePlatform}
                              title={
                                // Show full platform/instance pair on hover
                                // for debugging without cluttering the row.
                                m.platform && m.instance_id
                                  ? `${m.platform} / ${m.instance_id}`
                                  : undefined
                              }
                            >
                              {m.instance_id || m.platform || "—"}
                            </span>
                            <span className={styles.messageTime}>
                              {formatTime(m.time, m.recorded_at)}
                            </span>
                          </div>
                          {m.text && (
                            <span
                              className={mergeClasses(
                                styles.messageText,
                                m.self && styles.messageSelf,
                              )}
                            >
                              {m.text}
                            </span>
                          )}
                          {m.attachments && m.attachments.length > 0 && (
                            <div className={styles.attachments}>
                              {m.attachments.map((att, ai) => (
                                <AttachmentView
                                  key={`${m.message_id}-att-${ai}`}
                                  attachment={att}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.composer}>
                  <Textarea
                    className={styles.composerInput}
                    rows={1}
                    resize="vertical"
                    placeholder={
                      connected
                        ? t.bridgeComposerPlaceholder
                        : t.bridgeComposerDisconnected
                    }
                    value={composer}
                    onChange={(_, d) => setComposer(d.value)}
                    disabled={!connected || sending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <Button
                    appearance="primary"
                    icon={<SendRegular />}
                    disabled={!connected || sending || !composer.trim()}
                    onClick={() => void send()}
                  >
                    {sending ? <Spinner size="tiny" /> : t.bridgeSend}
                  </Button>
                </div>
              </>
            ) : (
              <div className={styles.noInstance}>
                <Body2>{t.bridgeNoChannelSelected}</Body2>
              </div>
            )}
          </section>
        </div>
      )}

      <RenameGroupDialog
        target={renameTarget}
        currentName={
          renameTarget && renameTarget.rule_id
            ? groupNames[renameTarget.rule_id] ?? ""
            : ""
        }
        onCancel={() => setRenameTarget(null)}
        onSave={async (name) => {
          if (renameTarget?.rule_id) {
            await saveGroupName(renameTarget.rule_id, name);
          }
          setRenameTarget(null);
        }}
      />
    </div>
  );
}

/**
 * Render one attachment row. Images inline (with a "load failed" fallback so
 * the user still sees the URL when the source platform's CDN blocks browser
 * referrers); audio/video/file rendered as a link chip the user can click.
 */
function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  const styles = useStyles();
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const { type, url, name } = attachment;

  if (!url) {
    return (
      <span className={styles.attachmentBrokenImage}>
        <ImageOffRegular /> {t.bridgeAttachmentNoUrl(type || "file")}
      </span>
    );
  }

  if (type === "image" && !broken) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt={name || "image"}
          className={styles.attachmentImage}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </a>
    );
  }

  if (type === "image" && broken) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={styles.attachmentFile}
        title={url}
      >
        <ImageOffRegular /> {t.bridgeAttachmentImageBroken}
      </a>
    );
  }

  const icon =
    type === "video" ? (
      <VideoRegular />
    ) : type === "voice" ? (
      <MicRegular />
    ) : (
      <DocumentRegular />
    );

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={styles.attachmentFile}
      title={url}
    >
      {icon} {name || type || "file"}
    </a>
  );
}

function RenameGroupDialog({
  target,
  currentName,
  onCancel,
  onSave,
}: {
  target: BridgeChannel | null;
  currentName: string;
  onCancel: () => void;
  onSave: (name: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(currentName);
  useEffect(() => {
    setValue(currentName);
  }, [currentName, target?.rule_id]);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(_, d) => {
        if (!d.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t.bridgeRenameGroupTitle}</DialogTitle>
          <DialogContent>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Body2>
                {t.bridgeRenameGroupHint}{" "}
                <code>{target?.rule_id ?? ""}</code>
              </Body2>
              <Field label={t.bridgeRenameGroupField}>
                <Input
                  value={value}
                  onChange={(_, d) => setValue(d.value)}
                  placeholder={target?.rule_id ?? ""}
                  autoFocus
                />
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>
              {t.cancel}
            </Button>
            <Button
              appearance="primary"
              onClick={() => void onSave(value)}
            >
              {t.save}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

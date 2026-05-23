import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
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
  DialogTrigger,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle1,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
  CopyRegular,
  DeleteRegular,
  DismissCircleRegular,
  PlugDisconnectedRegular,
} from "@fluentui/react-icons";
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
};

type EventEntry = {
  topic: string;
  data: unknown;
  t: number;
};

type RpcResult<T> = { ok: boolean; data?: T; error?: string };

const useStyles = makeStyles({
  pageScroll: { height: "100%", overflowY: "auto", boxSizing: "border-box" },
  page: {
    padding: "24px 32px",
    boxSizing: "border-box",
    maxWidth: "1080px",
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "16px",
    paddingBottom: "12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerActions: { display: "flex", gap: "8px" },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "14px 18px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  cardBody: {
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "12px",
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "10px 12px",
    borderRadius: "6px",
    background: tokens.colorNeutralBackground2,
  },
  mono: {
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "12px",
    color: tokens.colorNeutralForeground2,
  },
  pairCodeBlock: {
    padding: "12px",
    borderRadius: "6px",
    background: tokens.colorNeutralBackground2,
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "16px",
    letterSpacing: "2px",
    textAlign: "center",
    userSelect: "all",
  },
  pairCmd: {
    padding: "10px 12px",
    borderRadius: "6px",
    background: tokens.colorNeutralBackground2,
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "12px",
    color: tokens.colorNeutralForeground2,
    wordBreak: "break-all",
    userSelect: "all",
  },
  emptyHint: {
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
  },
});

type Props = { teamId: string };

export function NextBridgePage({ teamId }: Props) {
  const styles = useStyles();
  const { t } = useI18n();
  const [list, setList] = useState<InstanceListResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [events, setEvents] = useState<EventEntry[] | null>(null);
  const [drivers, setDrivers] = useState<Array<{ instance_id: string; platform: string | null }> | null>(null);
  const [rules, setRules] = useState<Array<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
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
      if (data.instances.length > 0) {
        setSelected((prev) => prev ?? data.instances[0].id);
      } else {
        setSelected(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Fetch status + drivers + rules + events whenever the selected instance changes.
  const refreshSelected = useCallback(async () => {
    if (!selected) {
      setStatus(null);
      setEvents(null);
      setDrivers(null);
      setRules(null);
      return;
    }
    const base = `/api/nextbridge/instances/${encodeURIComponent(
      selected,
    )}?teamId=${encodeURIComponent(teamId)}`;
    try {
      const [statusR, eventsR, driversR, rulesR] = await Promise.all([
        fetch(`${base.replace("?", "/status?")}`),
        fetch(`${base.replace("?", "/events?")}`),
        rpc<{ drivers: Array<{ instance_id: string; platform: string | null }> }>(
          teamId,
          selected,
          "drivers.list",
        ),
        rpc<{ rules: Array<Record<string, unknown>> }>(
          teamId,
          selected,
          "rules.list",
        ),
      ]);
      if (statusR.ok) setStatus((await statusR.json()) as StatusResponse);
      if (eventsR.ok) {
        const body = (await eventsR.json()) as { events: EventEntry[] };
        setEvents(body.events.slice().reverse());
      }
      setDrivers(driversR.ok ? driversR.data?.drivers ?? [] : []);
      setRules(rulesR.ok ? rulesR.data?.rules ?? [] : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [selected, teamId]);

  useEffect(() => {
    void refreshSelected();
  }, [refreshSelected]);

  // Poll the live tail every 5 seconds while a connected instance is selected.
  useEffect(() => {
    if (!selected || !status?.connected) return;
    const id = setInterval(() => void refreshSelected(), 5000);
    return () => clearInterval(id);
  }, [selected, status?.connected, refreshSelected]);

  const canManage = list?.can_manage ?? false;

  return (
    <div className={styles.pageScroll}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <Title2 block>{t.bridgeTitle}</Title2>
            <Body1 block style={{ color: tokens.colorNeutralForeground3 }}>
              {t.bridgeSubtitle}
            </Body1>
          </div>
          <div className={styles.headerActions}>
            <Button
              appearance="subtle"
              icon={<ArrowClockwiseRegular />}
              onClick={() => {
                void fetchList();
                void refreshSelected();
              }}
            >
              {t.refresh}
            </Button>
            {canManage && (
              <PairButton teamId={teamId} onPaired={() => void fetchList()} />
            )}
          </div>
        </div>

        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {loading ? (
          <Spinner label={t.loading} />
        ) : list && list.instances.length === 0 ? (
          <Card title={t.bridgeNoInstances} className={styles.card}>
            <div className={styles.cardBody}>
              <Body2 className={styles.emptyHint}>
                {t.bridgeNoInstancesHint}
              </Body2>
            </div>
          </Card>
        ) : (
          <>
            {list && list.instances.length > 1 && (
              <InstancePicker
                instances={list.instances}
                selected={selected}
                onSelect={setSelected}
              />
            )}

            <StatusCard
              status={status}
              instance={list?.instances.find((i) => i.id === selected) ?? null}
              canManage={canManage}
              onRevoke={async () => {
                if (!selected) return;
                if (!confirm(t.bridgeConfirmRevoke)) return;
                const r = await fetch(
                  `/api/nextbridge/instances/${encodeURIComponent(
                    selected,
                  )}?teamId=${encodeURIComponent(teamId)}`,
                  { method: "DELETE" },
                );
                if (!r.ok) {
                  const body = (await r.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  setError(body.error ?? `HTTP ${r.status}`);
                  return;
                }
                setSelected(null);
                void fetchList();
              }}
            />

            <DriversCard drivers={drivers} />
            <RulesCard rules={rules} />
            <EventsCard events={events} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className: string;
}) {
  const styles = useStyles();
  return (
    <div className={className}>
      <div className={styles.cardHeader}>
        <Subtitle1>{title}</Subtitle1>
      </div>
      {children}
    </div>
  );
}

function InstancePicker({
  instances,
  selected,
  onSelect,
}: {
  instances: Instance[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const styles = useStyles();
  return (
    <div className={styles.card}>
      <div className={styles.cardBody}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {instances.map((i) => (
            <Button
              key={i.id}
              appearance={selected === i.id ? "primary" : "subtle"}
              onClick={() => onSelect(i.id)}
            >
              {i.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  status,
  instance,
  canManage,
  onRevoke,
}: {
  status: StatusResponse | null;
  instance: Instance | null;
  canManage: boolean;
  onRevoke: () => void;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  if (!instance) return null;
  const connected = status?.connected ?? false;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Subtitle1>{instance.name}</Subtitle1>
          {connected ? (
            <Badge appearance="filled" color="success" icon={<CheckmarkCircleRegular />}>
              {t.bridgeConnected}
            </Badge>
          ) : (
            <Badge
              appearance="filled"
              color="severe"
              icon={<PlugDisconnectedRegular />}
            >
              {t.bridgeDisconnected}
            </Badge>
          )}
        </div>
        {canManage && (
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            onClick={onRevoke}
          >
            {t.bridgeRevoke}
          </Button>
        )}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.statRow}>
          <Stat label={t.bridgeInstanceId} value={instance.id} mono />
          <Stat
            label={t.bridgeVersion}
            value={status?.meta.version ?? "—"}
          />
          <Stat
            label={t.bridgeCommandPrefix}
            value={status?.meta.command_prefix ? `/${status.meta.command_prefix}` : "—"}
          />
          <Stat
            label={t.bridgeEventsBuffered}
            value={String(status?.event_buffer ?? 0)}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const styles = useStyles();
  return (
    <div className={styles.stat}>
      <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{label}</Caption1>
      <Body2 className={mono ? styles.mono : undefined}>{value}</Body2>
    </div>
  );
}

function DriversCard({
  drivers,
}: {
  drivers: Array<{ instance_id: string; platform: string | null }> | null;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Subtitle1>{t.bridgeDriversTitle}</Subtitle1>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          {t.bridgeDriversHint}
        </Caption1>
      </div>
      <div className={styles.cardBody}>
        {drivers === null ? (
          <Spinner size="tiny" label={t.loading} />
        ) : drivers.length === 0 ? (
          <Body2 className={styles.emptyHint}>{t.bridgeDriversEmpty}</Body2>
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t.bridgeColInstance}</TableHeaderCell>
                <TableHeaderCell>{t.bridgeColPlatform}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.instance_id}>
                  <TableCell>
                    <span className={styles.mono}>{d.instance_id}</span>
                  </TableCell>
                  <TableCell>{d.platform ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function RulesCard({
  rules,
}: {
  rules: Array<Record<string, unknown>> | null;
}) {
  const styles = useStyles();
  const { t } = useI18n();
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Subtitle1>{t.bridgeRulesTitle}</Subtitle1>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          {t.bridgeRulesHint}
        </Caption1>
      </div>
      <div className={styles.cardBody}>
        {rules === null ? (
          <Spinner size="tiny" label={t.loading} />
        ) : rules.length === 0 ? (
          <Body2 className={styles.emptyHint}>{t.bridgeRulesEmpty}</Body2>
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t.bridgeColRuleId}</TableHeaderCell>
                <TableHeaderCell>{t.bridgeColRuleType}</TableHeaderCell>
                <TableHeaderCell>{t.bridgeColRuleSummary}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r, idx) => (
                <TableRow key={String(r.id ?? idx)}>
                  <TableCell>
                    <span className={styles.mono}>{String(r.id ?? "")}</span>
                  </TableCell>
                  <TableCell>{String(r.type ?? "forward")}</TableCell>
                  <TableCell>
                    <span className={styles.mono}>{summarizeRule(r)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function summarizeRule(rule: Record<string, unknown>): string {
  if (rule.type === "connect") {
    const channels = (rule.channels ?? {}) as Record<string, unknown>;
    return `connect: ${Object.keys(channels).join(", ")}`;
  }
  const from = (rule.from ?? {}) as Record<string, unknown>;
  const to = (rule.to ?? {}) as Record<string, unknown>;
  return `${Object.keys(from).join(",") || "?"} → ${Object.keys(to).join(",") || "?"}`;
}

function EventsCard({ events }: { events: EventEntry[] | null }) {
  const styles = useStyles();
  const { t } = useI18n();
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Subtitle1>{t.bridgeEventsTitle}</Subtitle1>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          {t.bridgeEventsHint}
        </Caption1>
      </div>
      <div className={styles.cardBody}>
        {events === null ? (
          <Spinner size="tiny" label={t.loading} />
        ) : events.length === 0 ? (
          <Body2 className={styles.emptyHint}>{t.bridgeEventsEmpty}</Body2>
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t.bridgeColEventTime}</TableHeaderCell>
                <TableHeaderCell>{t.bridgeColEventTopic}</TableHeaderCell>
                <TableHeaderCell>{t.bridgeColEventDetail}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.slice(0, 50).map((ev, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <span className={styles.mono}>
                      {new Date(ev.t * 1000).toLocaleTimeString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={styles.mono}>{ev.topic}</span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={styles.mono}
                      style={{
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        maxWidth: 480,
                        display: "inline-block",
                      }}
                    >
                      {summarizeEvent(ev)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function summarizeEvent(ev: EventEntry): string {
  if (!ev.data || typeof ev.data !== "object") return String(ev.data ?? "");
  const d = ev.data as Record<string, unknown>;
  if (ev.topic === "bridge.message") {
    return `${d.instance_id ?? "?"} ${d.user ?? d.user_id ?? "?"}: ${truncate(
      String(d.text ?? ""),
      80,
    )}`;
  }
  if (ev.topic === "driver.status") {
    return `${d.instance_id ?? "?"} (${d.platform ?? "?"}) connected=${d.connected}`;
  }
  return JSON.stringify(d);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ── Pair modal ────────────────────────────────────────────────────────────

function PairButton({
  teamId,
  onPaired,
}: {
  teamId: string;
  onPaired: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setCode(null);
    setExpiresAt(null);
    setErr(null);
  };

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/nextbridge/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, name: name.trim() }),
      });
      const body = (await r.json()) as
        | { code: string; expires_in: number }
        | { error: string };
      if (!r.ok || !("code" in body)) {
        setErr(("error" in body && body.error) || `HTTP ${r.status}`);
        return;
      }
      setCode(body.code);
      setExpiresAt(Date.now() + body.expires_in * 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const minutesLeft = useMemo(() => {
    if (!expiresAt) return null;
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / 60_000);
  }, [expiresAt]);

  const cmd = code
    ? `python main.py workbench pair ${window.location.origin} ${code}`
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        setOpen(data.open);
        if (!data.open) reset();
      }}
    >
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="primary" icon={<AddRegular />}>
          {t.bridgePairButton}
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t.bridgePairTitle}</DialogTitle>
          <DialogContent>
            {!code ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Body2>{t.bridgePairIntro}</Body2>
                <Field label={t.bridgeInstanceName}>
                  <Input
                    value={name}
                    onChange={(_, d) => setName(d.value)}
                    placeholder="NextBridge"
                  />
                </Field>
                {err && (
                  <MessageBar intent="error">
                    <MessageBarBody>{err}</MessageBarBody>
                  </MessageBar>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Body2>{t.bridgePairCodeIntro}</Body2>
                <div className={styles.pairCodeBlock}>{code}</div>
                {minutesLeft !== null && (
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                    {t.bridgePairExpiresIn(minutesLeft)}
                  </Caption1>
                )}
                <Body2>{t.bridgePairRunCmd}</Body2>
                <div className={styles.pairCmd}>{cmd}</div>
                <Button
                  appearance="subtle"
                  icon={<CopyRegular />}
                  onClick={() => void navigator.clipboard.writeText(cmd)}
                >
                  {t.bridgeCopyCmd}
                </Button>
                <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.bridgePairAfterRun}
                </Body2>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            {!code ? (
              <>
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="secondary">{t.cancel}</Button>
                </DialogTrigger>
                <Button
                  appearance="primary"
                  disabled={busy}
                  onClick={() => void generate()}
                >
                  {busy ? <Spinner size="tiny" /> : t.bridgePairGenerate}
                </Button>
              </>
            ) : (
              <Button
                appearance="primary"
                onClick={() => {
                  setOpen(false);
                  onPaired();
                }}
                icon={<DismissCircleRegular />}
              >
                {t.close}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// ── RPC helper ────────────────────────────────────────────────────────────

async function rpc<T>(
  teamId: string,
  instanceId: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  try {
    const r = await fetch(
      `/api/nextbridge/instances/${encodeURIComponent(
        instanceId,
      )}/rpc?teamId=${encodeURIComponent(teamId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params }),
      },
    );
    const body = (await r.json().catch(() => ({}))) as RpcResult<T>;
    if (!r.ok) {
      return { ok: false, error: body.error ?? `HTTP ${r.status}` };
    }
    return body;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

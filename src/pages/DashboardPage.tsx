import { useState, useEffect, useCallback } from "react";
import {
  Title2,
  Subtitle2,
  Body2,
  Caption1,
  Card,
  CardHeader,
  Spinner,
  Badge,
  Button,
  Divider,
  Link,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircle20Regular,
  Circle20Regular,
  ArrowClockwise20Regular,
  ArrowRight20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import type { TeamOverview, MyTodo, FeedItem } from "../types";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    overflowY: "auto",
    height: "100%",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: tokens.spacingVerticalM,
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: tokens.spacingVerticalM,
  },
  statValue: {
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "1",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingVerticalL,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalS,
    padding: `6px 0`,
  },
  rowText: { flex: 1 },
  empty: {
    color: tokens.colorNeutralForeground3,
    padding: `${tokens.spacingVerticalM} 0`,
    textAlign: "center",
  },
  configBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

type Props = { teamId: string };

export function DashboardPage({ teamId }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [myTodos, setMyTodos] = useState<MyTodo[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [glintError, setGlintError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setGlintError(null);
    try {
      const [ovRes, mtRes, fdRes] = await Promise.all([
        fetch(`/api/glint/workbench/teams/${teamId}/overview`),
        fetch(`/api/glint/workbench/teams/${teamId}/my-todos`),
        fetch(`/api/glint/workbench/teams/${teamId}/feed`),
      ]);

      const [ovText, mtText, fdText] = await Promise.all([
        ovRes.text(), mtRes.text(), fdRes.text(),
      ]);

      function safeParse<T>(text: string, status: number): T {
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`Unexpected response (${status}): ${text.slice(0, 120)}`);
        }
      }

      const ov = safeParse<TeamOverview & { error?: string }>(ovText, ovRes.status);
      if (ovRes.status === 503 || !ovRes.ok) {
        setGlintError(ov.error ?? "Glint is not configured for this team.");
        return;
      }

      const mt = safeParse<{ todos: MyTodo[]; error?: string }>(mtText, mtRes.status);
      const fd = safeParse<{ items: FeedItem[]; error?: string }>(fdText, fdRes.status);

      setOverview(ov as TeamOverview);
      setMyTodos((mt.todos ?? []).slice(0, 5));
      setFeed((fd.items ?? []).slice(0, 8));
    } catch (e) {
      setGlintError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className={styles.root} style={{ alignItems: "center", justifyContent: "center" }}>
        <Spinner size="large" label="Loading…" />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Title2>Overview</Title2>

      {/* Glint not configured banner */}
      {glintError && (
        <div className={styles.configBanner}>
          <Body2 style={{ flex: 1, color: tokens.colorNeutralForeground2 }}>
            {glintError}
          </Body2>
          <Button
            icon={<Settings20Regular />}
            appearance="subtle"
            onClick={() => navigate("/settings")}
          >
            Configure
          </Button>
          <Button
            icon={<ArrowClockwise20Regular />}
            appearance="subtle"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Stats */}
      {overview && (
        <div className={styles.statsRow}>
          <StatCard label="Total tasks" value={overview.total} />
          <StatCard label="Completed" value={overview.completed} color={tokens.colorPaletteGreenForeground1} />
          <StatCard label="Pending" value={overview.pending} />
          <StatCard label="My claims" value={overview.claimedByMe} color={tokens.colorBrandForeground1} />
          <StatCard label="Sets" value={overview.sets} />
        </div>
      )}

      {!glintError && (
        <div className={styles.grid}>
          {/* My Tasks */}
          <Card>
            <CardHeader
              header={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <Subtitle2>My Tasks</Subtitle2>
                  <Badge appearance="tint" color="brand">{myTodos.length}</Badge>
                </div>
              }
            />
            <div className={styles.section}>
              {myTodos.length === 0 ? (
                <Caption1 className={styles.empty}>No tasks assigned to you.</Caption1>
              ) : (
                myTodos.map((todo) => (
                  <div key={todo.id}>
                    <div className={styles.row}>
                      {todo.completed
                        ? <CheckmarkCircle20Regular color={tokens.colorPaletteGreenForeground1} />
                        : <Circle20Regular color={tokens.colorNeutralForeground3} />}
                      <div className={styles.rowText}>
                        <Body2>{todo.title}</Body2>
                        {todo.setName && (
                          <Caption1 style={{ color: tokens.colorNeutralForeground3, display: "block" }}>
                            {todo.setName}
                          </Caption1>
                        )}
                      </div>
                      {todo.isClaimedByMe && (
                        <Badge appearance="tint" color="informative" size="small">Claimed</Badge>
                      )}
                    </div>
                    <Divider />
                  </div>
                ))
              )}
            </div>
            <Link onClick={() => navigate("/tasks")} style={{ display: "flex", alignItems: "center", gap: "4px", paddingTop: tokens.spacingVerticalS }}>
              View all tasks <ArrowRight20Regular />
            </Link>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader header={<Subtitle2>Recent Activity</Subtitle2>} />
            <div className={styles.section}>
              {feed.length === 0 ? (
                <Caption1 className={styles.empty}>No recent activity.</Caption1>
              ) : (
                feed.map((item) => (
                  <div key={item.id}>
                    <div className={styles.row}>
                      {item.completed
                        ? <CheckmarkCircle20Regular color={tokens.colorPaletteGreenForeground1} />
                        : <Circle20Regular color={tokens.colorNeutralForeground3} />}
                      <div className={styles.rowText}>
                        <Body2>{item.title}</Body2>
                        {item.setName && (
                          <Caption1 style={{ color: tokens.colorNeutralForeground3, display: "block" }}>
                            {item.setName}
                          </Caption1>
                        )}
                      </div>
                    </div>
                    <Divider />
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const styles = useStyles();
  return (
    <Card>
      <div className={styles.statCard}>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{label}</Caption1>
        <div className={styles.statValue} style={{ color: color ?? tokens.colorNeutralForeground1 }}>
          {value}
        </div>
      </div>
    </Card>
  );
}

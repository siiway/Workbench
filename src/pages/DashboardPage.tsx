import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Body2,
  Button,
  Caption1,
  Spinner,
  Text,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AppsRegular,
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
  CircleRegular,
  ClipboardTaskListLtrRegular,
  PersonCircleRegular,
  HistoryRegular,
  SettingsRegular,
  ArrowRightRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import type { TeamOverview, MyTodo, FeedItem } from "../types";
import { useI18n } from "../i18n";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";

const useStyles = makeStyles({
  root: {
    padding: "20px 24px",
    boxSizing: "border-box",
    height: "100%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  configBanner: {
    padding: "16px",
    borderRadius: "10px",
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "12px",
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    background: tokens.colorNeutralBackground1,
    overflow: "hidden",
    transition: "border-color 0.15s",
    ":hover": {
      borderTopColor: tokens.colorNeutralForeground1,
      borderRightColor: tokens.colorNeutralForeground1,
      borderBottomColor: tokens.colorNeutralForeground1,
      borderLeftColor: tokens.colorNeutralForeground1,
    },
  },
  statCardHead: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 16px 0",
  },
  statCardBody: {
    padding: "8px 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    "@media (max-width: 900px)": {
      gridTemplateColumns: "1fr",
    },
  },
  listCard: {
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    background: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  listCardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    gap: "10px",
  },
  listBody: {
    padding: "0 16px",
    display: "flex",
    flexDirection: "column",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "10px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ":last-child": { borderBottom: "none" },
  },
  rowText: { flex: 1, minWidth: 0 },
  rowMeta: {
    display: "block",
    color: tokens.colorNeutralForeground3,
    marginTop: "2px",
  },
  cardFooter: {
    padding: "8px 16px 12px",
    display: "flex",
    justifyContent: "flex-end",
  },
  loadingShell: {
    display: "flex",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

type Props = { teamId: string };

export function DashboardPage({ teamId }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { t } = useI18n();

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
        fetch(`/api/glint/teams/${teamId}/overview`),
        fetch(`/api/glint/teams/${teamId}/my-todos`),
        fetch(`/api/glint/teams/${teamId}/feed`),
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
        setGlintError(ov.error ?? t.glintNotConfigured);
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
      <div className={styles.loadingShell}>
        <Spinner size="large" label={t.loading} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <PageHeader
        title={t.overviewTitle}
        subtitle={t.overviewSubtitle}
        actions={
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            onClick={() => void load()}
          >
            {t.refresh}
          </Button>
        }
      />

      {glintError && (
        <div className={styles.configBanner}>
          <div>
            <Text weight="semibold" block>
              {t.glintNotConfiguredTitle}
            </Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {glintError}
            </Text>
          </div>
          <Button
            appearance="primary"
            size="small"
            icon={<SettingsRegular />}
            onClick={() => navigate("/settings")}
          >
            {t.configure}
          </Button>
        </div>
      )}

      {overview && !glintError && (
        <>
          <div className={styles.grid}>
            <div className={styles.statCard}>
              <div className={styles.statCardHead}>
                <ClipboardTaskListLtrRegular
                  fontSize={24}
                  color={tokens.colorBrandForeground1}
                />
                <Text weight="semibold">{t.statPending}</Text>
              </div>
              <div className={styles.statCardBody}>
                <Title3>{overview.pending}</Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statPendingDesc}
                </Text>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statCardHead}>
                <CheckmarkCircleRegular
                  fontSize={24}
                  color={tokens.colorBrandForeground1}
                />
                <Text weight="semibold">{t.statCompleted}</Text>
              </div>
              <div className={styles.statCardBody}>
                <Title3>
                  {overview.completed}
                  <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                    /{overview.total}
                  </Text>
                </Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statCompletedDesc}
                </Text>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statCardHead}>
                <PersonCircleRegular
                  fontSize={24}
                  color={tokens.colorBrandForeground1}
                />
                <Text weight="semibold">{t.statMyClaims}</Text>
              </div>
              <div className={styles.statCardBody}>
                <Title3>{overview.assignedToMe}</Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statMyClaimsDesc}
                </Text>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statCardHead}>
                <AppsRegular
                  fontSize={24}
                  color={tokens.colorBrandForeground1}
                />
                <Text weight="semibold">{t.statSets}</Text>
              </div>
              <div className={styles.statCardBody}>
                <Title3>{overview.sets}</Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statSetsDesc}
                </Text>
              </div>
            </div>
          </div>

          <div className={styles.twoCol}>
            <div className={styles.listCard}>
              <div className={styles.listCardHead}>
                <ClipboardTaskListLtrRegular
                  fontSize={20}
                  color={tokens.colorBrandForeground1}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
                  <Text weight="semibold">{t.myTasks}</Text>
                  <Badge appearance="tint" color="brand" size="small">
                    {myTodos.length}
                  </Badge>
                </div>
              </div>
              <div className={styles.listBody}>
                {myTodos.length === 0 ? (
                  <EmptyState
                    icon={<ClipboardTaskListLtrRegular />}
                    title={t.emptyMyTasks}
                  />
                ) : (
                  myTodos.map((todo) => (
                    <div key={todo.id} className={styles.row}>
                      {todo.completed
                        ? <CheckmarkCircleRegular fontSize={20} color={tokens.colorPaletteGreenForeground1} />
                        : <CircleRegular fontSize={20} color={tokens.colorNeutralForeground3} />}
                      <div className={styles.rowText}>
                        <Body2>{todo.title}</Body2>
                        {todo.setName && (
                          <Caption1 className={styles.rowMeta}>{todo.setName}</Caption1>
                        )}
                      </div>
                      {todo.isAssignedToMe && (
                        <Badge appearance="tint" color="informative" size="small">
                          {t.claimedShort}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className={styles.cardFooter}>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowRightRegular />}
                  iconPosition="after"
                  onClick={() => navigate("/tasks")}
                >
                  {t.viewAllTasks}
                </Button>
              </div>
            </div>

            <div className={styles.listCard}>
              <div className={styles.listCardHead}>
                <HistoryRegular
                  fontSize={20}
                  color={tokens.colorBrandForeground1}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
                  <Text weight="semibold">{t.recentActivity}</Text>
                  <Badge appearance="tint" color="brand" size="small">
                    {feed.length}
                  </Badge>
                </div>
              </div>
              <div className={styles.listBody}>
                {feed.length === 0 ? (
                  <EmptyState
                    icon={<HistoryRegular />}
                    title={t.emptyActivity}
                  />
                ) : (
                  feed.map((item) => (
                    <div key={item.id} className={styles.row}>
                      {item.completed
                        ? <CheckmarkCircleRegular fontSize={20} color={tokens.colorPaletteGreenForeground1} />
                        : <CircleRegular fontSize={20} color={tokens.colorNeutralForeground3} />}
                      <div className={styles.rowText}>
                        <Body2>{item.title}</Body2>
                        {item.setName && (
                          <Caption1 className={styles.rowMeta}>{item.setName}</Caption1>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className={styles.cardFooter}>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowRightRegular />}
                  iconPosition="after"
                  onClick={() => navigate("/tasks")}
                >
                  {t.viewAllTasks}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

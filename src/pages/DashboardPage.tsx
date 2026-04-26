import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Body2,
  Button,
  Card,
  CardHeader,
  Caption1,
  Spinner,
  Text,
  Title2,
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

const useStyles = makeStyles({
  root: {
    padding: "32px",
    maxWidth: "1080px",
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
    height: "100%",
    overflowY: "auto",
  },
  welcome: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "8px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  configBanner: {
    padding: "16px",
    borderRadius: "8px",
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginTop: "24px",
    flexWrap: "wrap",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px",
    marginTop: "24px",
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    transition: "box-shadow 0.15s",
    ":hover": { boxShadow: tokens.shadow8 },
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginTop: "24px",
    "@media (max-width: 900px)": {
      gridTemplateColumns: "1fr",
    },
  },
  listCard: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
  },
  listBody: {
    padding: "0 16px 16px",
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
  empty: {
    color: tokens.colorNeutralForeground3,
    padding: "16px 0",
    textAlign: "center",
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
      <div className={styles.headerRow}>
        <div className={styles.welcome}>
          <Title2>{t.overviewTitle}</Title2>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            {t.overviewSubtitle}
          </Text>
        </div>
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={() => void load()}
        >
          {t.refresh}
        </Button>
      </div>

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
            <Card className={styles.statCard}>
              <CardHeader
                image={
                  <ClipboardTaskListLtrRegular
                    fontSize={24}
                    color={tokens.colorBrandForeground1}
                  />
                }
                header={<Text weight="semibold">{t.statPending}</Text>}
              />
              <div style={{ padding: "0 16px 16px" }}>
                <Title3>{overview.pending}</Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statPendingDesc}
                </Text>
              </div>
            </Card>

            <Card className={styles.statCard}>
              <CardHeader
                image={
                  <CheckmarkCircleRegular
                    fontSize={24}
                    color={tokens.colorBrandForeground1}
                  />
                }
                header={<Text weight="semibold">{t.statCompleted}</Text>}
              />
              <div style={{ padding: "0 16px 16px" }}>
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
            </Card>

            <Card className={styles.statCard}>
              <CardHeader
                image={
                  <PersonCircleRegular
                    fontSize={24}
                    color={tokens.colorBrandForeground1}
                  />
                }
                header={<Text weight="semibold">{t.statMyClaims}</Text>}
              />
              <div style={{ padding: "0 16px 16px" }}>
                <Title3>{overview.claimedByMe}</Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statMyClaimsDesc}
                </Text>
              </div>
            </Card>

            <Card className={styles.statCard}>
              <CardHeader
                image={
                  <AppsRegular
                    fontSize={24}
                    color={tokens.colorBrandForeground1}
                  />
                }
                header={<Text weight="semibold">{t.statSets}</Text>}
              />
              <div style={{ padding: "0 16px 16px" }}>
                <Title3>{overview.sets}</Title3>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {t.statSetsDesc}
                </Text>
              </div>
            </Card>
          </div>

          <div className={styles.twoCol}>
            <Card className={styles.listCard}>
              <CardHeader
                image={
                  <ClipboardTaskListLtrRegular
                    fontSize={20}
                    color={tokens.colorBrandForeground1}
                  />
                }
                header={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Text weight="semibold">{t.myTasks}</Text>
                    <Badge appearance="tint" color="brand" size="small">
                      {myTodos.length}
                    </Badge>
                  </div>
                }
              />
              <div className={styles.listBody}>
                {myTodos.length === 0 ? (
                  <Caption1 className={styles.empty}>
                    {t.emptyMyTasks}
                  </Caption1>
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
                      {todo.isClaimedByMe && (
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
            </Card>

            <Card className={styles.listCard}>
              <CardHeader
                image={
                  <HistoryRegular
                    fontSize={20}
                    color={tokens.colorBrandForeground1}
                  />
                }
                header={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Text weight="semibold">{t.recentActivity}</Text>
                    <Badge appearance="tint" color="brand" size="small">
                      {feed.length}
                    </Badge>
                  </div>
                }
              />
              <div className={styles.listBody}>
                {feed.length === 0 ? (
                  <Caption1 className={styles.empty}>{t.emptyActivity}</Caption1>
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
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth";
import {
  Title2,
  Subtitle2,
  Body2,
  Caption1,
  Button,
  Spinner,
  Badge,
  Divider,
  ProgressBar,
  Checkbox,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  Settings20Regular,
  ChevronRight20Regular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import type { TodoSet } from "../types";

const useStyles = makeStyles({
  root: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
  },
  setList: {
    width: "240px",
    flexShrink: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  setListHeader: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  setListBody: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: `0 ${tokens.spacingHorizontalXS}`,
  },
  setItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    textAlign: "left",
    width: "100%",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  setItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  setItemRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalXS,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  mainHeader: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  todoList: {
    flex: 1,
    overflowY: "auto",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  todoItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalS,
    padding: `6px 0`,
  },
  todoText: {
    flex: 1,
    paddingTop: "2px",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
  configBanner: {
    margin: tokens.spacingVerticalM,
  },
});

type Todo = {
  id: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  claimedBy: string | null;
  isClaimedByMe: boolean;
};

type Props = { teamId: string };

export function TasksPage({ teamId }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sets, setSets] = useState<TodoSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [todosLoading, setTodosLoading] = useState(false);
  const [glintError, setGlintError] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    setSetsLoading(true);
    setGlintError(null);
    try {
      const res = await fetch(`/api/glint/workbench/teams/${teamId}/sets`);
      const text = await res.text();
      let parsed: { sets?: TodoSet[]; error?: string } = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        setGlintError(`Unexpected response (${res.status}): ${text.slice(0, 500)}`);
        return;
      }
      if (res.status === 503) {
        setGlintError(parsed.error ?? "Glint is not configured for this team.");
        return;
      }
      if (!res.ok) {
        setGlintError(parsed.error ?? `Error ${res.status}: ${text.slice(0, 500)}`);
        return;
      }
      setSets(parsed.sets ?? []);
      if (parsed.sets?.length && !activeSetId) {
        setActiveSetId(parsed.sets[0].id);
      }
    } catch (e) {
      setGlintError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSetsLoading(false);
    }
  }, [teamId, activeSetId]);

  useEffect(() => { void loadSets(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [todosError, setTodosError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSetId) return;
    setTodosLoading(true);
    setTodosError(null);
    type ApiTodo = {
      id: string;
      parentId: string | null;
      title: string;
      completed: boolean;
      claimedBy: string | null;
    };
    fetch(`/api/glint/workbench/teams/${teamId}/sets/${activeSetId}/todos`)
      .then(async (r) => {
        const text = await r.text();
        let parsed: { todos?: ApiTodo[]; error?: string };
        try {
          parsed = JSON.parse(text);
        } catch {
          setTodosError(`Unexpected response (${r.status}): ${text.slice(0, 500)}`);
          return;
        }
        if (!r.ok) {
          setTodosError(parsed.error ?? `Error ${r.status}: ${text.slice(0, 500)}`);
          return;
        }
        const myId = user?.id ?? null;
        setTodos(
          (parsed.todos ?? []).map((t) => ({
            id: t.id,
            parentId: t.parentId,
            title: t.title,
            completed: t.completed,
            claimedBy: t.claimedBy,
            isClaimedByMe: !!myId && t.claimedBy === myId,
          })),
        );
      })
      .catch((e: unknown) => setTodosError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setTodosLoading(false));
  }, [teamId, activeSetId, user?.id]);

  async function toggleTodo(todo: Todo) {
    const optimistic = todos.map((t) =>
      t.id === todo.id ? { ...t, completed: !t.completed } : t,
    );
    setTodos(optimistic);
    await fetch(`/api/glint/workbench/teams/${teamId}/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    }).catch(() => setTodos(todos)); // revert on error
  }

  const activeSet = sets.find((s) => s.id === activeSetId);
  const rootTodos = todos.filter((t) => !t.parentId);

  return (
    <div className={styles.root}>
      {/* Set list */}
      <div className={styles.setList}>
        <div className={styles.setListHeader}>
          <Subtitle2>Sets</Subtitle2>
          <Button
            appearance="subtle"
            icon={<ArrowClockwise20Regular />}
            size="small"
            onClick={() => void loadSets()}
          />
        </div>
        <Divider />
        <div className={styles.setListBody}>
          {setsLoading ? (
            <div style={{ padding: tokens.spacingVerticalM, display: "flex", justifyContent: "center" }}>
              <Spinner size="small" />
            </div>
          ) : (
            sets.map((set) => (
              <button
                key={set.id}
                className={`${styles.setItem} ${set.id === activeSetId ? styles.setItemActive : ""}`}
                onClick={() => setActiveSetId(set.id)}
              >
                <div className={styles.setItemRow}>
                  <Body2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {set.name}
                  </Body2>
                  <ChevronRight20Regular style={{ flexShrink: 0, opacity: 0.5 }} />
                </div>
                <ProgressBar
                  value={set.total > 0 ? set.completed / set.total : 0}
                  color={set.pending === 0 ? "success" : "brand"}
                  thickness="medium"
                />
                <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                  {set.completed}/{set.total} done
                </Caption1>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Todo list */}
      <div className={styles.main}>
        {glintError ? (
          <div className={styles.configBanner}>
            <MessageBar intent="warning">
              <MessageBarBody>
                {glintError}{" "}
                <Button appearance="subtle" icon={<Settings20Regular />} size="small" onClick={() => navigate("/settings")}>
                  Configure
                </Button>
              </MessageBarBody>
            </MessageBar>
          </div>
        ) : !activeSetId ? (
          <div className={styles.empty}>
            <Caption1>Select a set to view tasks</Caption1>
          </div>
        ) : (
          <>
            <div className={styles.mainHeader}>
              <Title2>{activeSet?.name}</Title2>
              {activeSet && (
                <Badge appearance="tint" color="brand">
                  {activeSet.pending} pending
                </Badge>
              )}
            </div>
            <div className={styles.todoList}>
              {todosLoading ? (
                <div className={styles.empty}><Spinner /></div>
              ) : todosError ? (
                <MessageBar intent="error" style={{ margin: `${tokens.spacingVerticalM} 0` }}>
                  <MessageBarBody>{todosError}</MessageBarBody>
                </MessageBar>
              ) : rootTodos.length === 0 ? (
                <div className={styles.empty}>
                  <Caption1>No tasks in this set.</Caption1>
                </div>
              ) : (
                rootTodos.map((todo) => (
                  <div key={todo.id}>
                    <div className={styles.todoItem}>
                      <Checkbox
                        checked={todo.completed}
                        onChange={() => void toggleTodo(todo)}
                      />
                      <div className={styles.todoText}>
                        <Body2 style={todo.completed ? { textDecoration: "line-through", color: tokens.colorNeutralForeground3 } : {}}>
                          {todo.title}
                        </Body2>
                        {todo.isClaimedByMe && (
                          <Caption1 style={{ color: tokens.colorBrandForeground1 }}>Claimed by you</Caption1>
                        )}
                      </div>
                    </div>
                    <Divider />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

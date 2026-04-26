import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type React from "react";
import { useAuth } from "../auth";
import {
  Body2,
  Button,
  Caption1,
  Checkbox,
  Spinner,
  Subtitle1,
  Text,
  Title2,
  Badge,
  Input,
  Tooltip,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  makeStyles,
  tokens,
  mergeClasses,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  SettingsRegular,
  AddRegular,
  AddCircleRegular,
  DeleteRegular,
  EditRegular,
  CommentRegular,
  PersonAvailableRegular,
  PersonDeleteRegular,
  CheckmarkRegular,
  DismissRegular,
  MoreHorizontalRegular,
  ChevronDownRegular,
  ChevronRightRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import type { TodoSet, Todo, Comment } from "../types";
import { usePermissions } from "../hooks/usePermissions";
import { useRealtimeSync, type WsEvent } from "../hooks/useRealtimeSync";
import { CommentsDialog } from "../components/CommentsDialog";
import { CreateSetDialog } from "../components/CreateSetDialog";
import { EditSetDialog } from "../components/EditSetDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useI18n } from "../i18n";

const useStyles = makeStyles({
  layout: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
    background: tokens.colorNeutralBackground1,
  },

  rail: {
    width: "260px",
    minWidth: "260px",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: tokens.colorNeutralBackground2,
  },
  railHeader: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  railBody: {
    flex: 1,
    overflowY: "auto",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  setItem: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    textAlign: "left",
    width: "100%",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  setItemWithMenu: {
    paddingRight: "36px",
  },
  setItemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
  },
  setItemDragging: {
    opacity: 0.4,
  },
  setItemDragOver: {
    boxShadow: `inset 0 2px 0 0 ${tokens.colorBrandStroke1}`,
  },
  setItemMenuBtn: {
    position: "absolute",
    right: "4px",
    top: "6px",
    opacity: 0,
    transition: "opacity 120ms",
  },
  setItemMenuBtnVisible: {
    opacity: 1,
  },
  setRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "8px",
  },
  setName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: tokens.fontWeightSemibold,
  },
  setRatio: {
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    textAlign: "center",
    padding: "32px 16px",
    color: tokens.colorNeutralForeground3,
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  mainHeader: {
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  mainHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
    minWidth: 0,
  },
  composer: {
    display: "flex",
    gap: "8px",
    padding: "12px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  mainContent: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 24px 24px",
  },
  todoItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px",
    borderRadius: tokens.borderRadiusMedium,
    userSelect: "none",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  todoItemDragging: {
    opacity: 0.4,
  },
  todoItemDragOver: {
    boxShadow: `inset 0 2px 0 0 ${tokens.colorBrandStroke1}`,
  },
  todoItemSub: {
    paddingLeft: "32px",
  },
  todoTitle: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  todoCompleted: {
    textDecoration: "line-through",
    color: tokens.colorNeutralForeground4,
  },
  actions: {
    display: "flex",
    gap: "2px",
    flexShrink: 0,
    opacity: 0,
    transition: "opacity 120ms",
  },
  actionsVisible: {
    opacity: 1,
  },
  subComposer: {
    display: "flex",
    gap: "6px",
    padding: "6px 8px 6px 40px",
  },
  editRow: {
    display: "flex",
    gap: "6px",
    flex: 1,
    alignItems: "center",
  },
  configBanner: {
    margin: "16px 24px",
  },
  footerCount: {
    padding: "16px 8px 0",
    color: tokens.colorNeutralForeground3,
  },
});

type Props = { teamId: string };

type ApiTodoListResp = {
  todos?: Todo[];
  role?: string;
  permissions?: Record<string, boolean>;
  error?: string;
};

export function TasksPage({ teamId }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const myId = user?.id ?? null;

  const [sets, setSets] = useState<TodoSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [todosLoading, setTodosLoading] = useState(false);
  const [glintError, setGlintError] = useState<string | null>(null);
  const [todosError, setTodosError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [subComposerFor, setSubComposerFor] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredSetId, setHoveredSetId] = useState<string | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleCollapsed = (id: string) =>
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [commentTodoId, setCommentTodoId] = useState<string | null>(null);

  // Set management dialogs
  const [createSetOpen, setCreateSetOpen] = useState(false);
  const [editSetId, setEditSetId] = useState<string | null>(null);
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null);

  // Drag state — sets in the rail
  const [dragSetIdx, setDragSetIdx] = useState<number | null>(null);
  const [dragOverSetIdx, setDragOverSetIdx] = useState<number | null>(null);
  const dragSetCounter = useRef(0);

  // Drag state — todos in the main pane
  const [dragTodoIdx, setDragTodoIdx] = useState<number | null>(null);
  const [dragOverTodoIdx, setDragOverTodoIdx] = useState<number | null>(null);
  const dragTodoCounter = useRef(0);

  const permsState = usePermissions(teamId, activeSetId);
  const perms = permsState.data;
  const can = (key: string) => perms?.permissions?.[key as never] ?? false;

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
        setGlintError(parsed.error ?? t.glintNotConfigured);
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

  const loadTodos = useCallback(async () => {
    if (!activeSetId) return;
    setTodosLoading(true);
    setTodosError(null);
    try {
      const r = await fetch(
        `/api/glint/workbench/teams/${teamId}/sets/${activeSetId}/todos`,
      );
      const text = await r.text();
      let parsed: ApiTodoListResp;
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
      setTodos(parsed.todos ?? []);
    } catch (e) {
      setTodosError(e instanceof Error ? e.message : "Network error");
    } finally {
      setTodosLoading(false);
    }
  }, [teamId, activeSetId]);

  useEffect(() => { void loadTodos(); }, [loadTodos]);

  // ── realtime ─────────────────────────────────────────────────────────────

  const onRealtimeEvent = useCallback(
    (event: WsEvent) => {
      if (!activeSetId || event.setId !== activeSetId) return;
      if (event.type === "todo:created") {
        setTodos((prev) =>
          prev.some((t) => t.id === event.todo.id)
            ? prev
            : [...prev, event.todo as Todo],
        );
      } else if (event.type === "todo:updated") {
        setTodos((prev) =>
          prev.map((t) =>
            t.id === event.todo.id ? { ...t, ...event.todo } : t,
          ),
        );
      } else if (event.type === "todo:deleted") {
        setTodos((prev) =>
          prev.filter((t) => t.id !== event.id && t.parentId !== event.id),
        );
      } else if (event.type === "todo:reordered") {
        const order = new Map(event.items.map((i) => [i.id, i.sortOrder]));
        setTodos((prev) =>
          prev.map((t) =>
            order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t,
          ),
        );
      } else if (event.type === "todo:claimed") {
        setTodos((prev) =>
          prev.map((t) =>
            t.id === event.id
              ? {
                  ...t,
                  claimedBy: event.claimedBy,
                  claimedByName: event.claimedByName,
                  claimedByAvatar: event.claimedByAvatar,
                }
              : t,
          ),
        );
      }
    },
    [activeSetId],
  );

  useRealtimeSync({
    teamId,
    setId: activeSetId ?? "",
    onEvent: onRealtimeEvent,
    enabled: !!activeSetId,
  });

  const refreshSetCount = useCallback(
    (setId: string, deltaTotal: number, deltaCompleted: number) => {
      setSets((prev) =>
        prev.map((s) => {
          if (s.id !== setId) return s;
          const total = Math.max(0, s.total + deltaTotal);
          const completed = Math.max(0, Math.min(total, s.completed + deltaCompleted));
          return { ...s, total, completed, pending: total - completed };
        }),
      );
    },
    [],
  );

  // ── mutations ────────────────────────────────────────────────────────────

  async function toggleTodo(todo: Todo) {
    const next = !todo.completed;
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, completed: next } : t)),
    );
    if (!todo.parentId && activeSetId) {
      refreshSetCount(activeSetId, 0, next ? 1 : -1);
    }
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/todos/${todo.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      },
    );
    if (!res.ok) {
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todo.id ? { ...t, completed: todo.completed } : t,
        ),
      );
      if (!todo.parentId && activeSetId) {
        refreshSetCount(activeSetId, 0, next ? -1 : 1);
      }
    }
  }

  async function createTodo(title: string, parentId: string | null) {
    if (!activeSetId || !title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/glint/workbench/teams/${teamId}/sets/${activeSetId}/todos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, parentId: parentId ?? undefined }),
        },
      );
      if (!res.ok) return;
      const data: { todo: Todo } = await res.json();
      setTodos((prev) => [...prev, data.todo]);
      if (!parentId) refreshSetCount(activeSetId, 1, 0);
    } finally {
      setCreating(false);
    }
  }

  async function deleteTodo(todo: Todo) {
    const prev = todos;
    setTodos((cur) =>
      cur.filter((t) => t.id !== todo.id && t.parentId !== todo.id),
    );
    if (!todo.parentId && activeSetId) {
      refreshSetCount(activeSetId, -1, todo.completed ? -1 : 0);
    }
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/todos/${todo.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) setTodos(prev);
  }

  async function commitEdit(todo: Todo) {
    const next = editingTitle.trim();
    setEditingId(null);
    if (!next || next === todo.title) return;
    const prev = todos;
    setTodos((cur) =>
      cur.map((t) => (t.id === todo.id ? { ...t, title: next } : t)),
    );
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/todos/${todo.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      },
    );
    if (!res.ok) setTodos(prev);
  }

  async function toggleClaim(todo: Todo) {
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/todos/${todo.id}/claim`,
      { method: "POST" },
    );
    if (!res.ok) return;
    const data: {
      claimedBy: string | null;
      claimedByName: string | null;
      claimedByAvatar: string | null;
    } = await res.json();
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id
          ? {
              ...t,
              claimedBy: data.claimedBy,
              claimedByName: data.claimedByName,
              claimedByAvatar: data.claimedByAvatar,
            }
          : t,
      ),
    );
  }

  function adjustCommentCount(todoId: string, delta: number) {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todoId
          ? { ...t, commentCount: Math.max(0, t.commentCount + delta) }
          : t,
      ),
    );
  }

  // ── set mutations ────────────────────────────────────────────────────────

  async function createSet(name: string) {
    const res = await fetch(`/api/glint/workbench/teams/${teamId}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const data: { set: TodoSet } = await res.json();
    const created: TodoSet = { ...data.set, total: 0, completed: 0, pending: 0 };
    setSets((prev) => [...prev, created]);
    setActiveSetId(created.id);
  }

  async function deleteSet(setId: string) {
    const prev = sets;
    setSets((cur) => cur.filter((s) => s.id !== setId));
    if (activeSetId === setId) {
      const next = prev.find((s) => s.id !== setId);
      setActiveSetId(next ? next.id : null);
    }
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/sets/${setId}`,
      { method: "DELETE" },
    );
    if (!res.ok) setSets(prev);
  }

  async function patchSet(setId: string, patch: Partial<TodoSet>) {
    const prev = sets;
    setSets((cur) => cur.map((s) => (s.id === setId ? { ...s, ...patch } : s)));
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/sets/${setId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) setSets(prev);
  }

  async function reorderSets(items: { id: string; sortOrder: number }[]) {
    const order = new Map(items.map((i) => [i.id, i.sortOrder]));
    setSets((prev) =>
      [...prev]
        .map((s) => ({ ...s, sortOrder: order.get(s.id) ?? s.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
    await fetch(`/api/glint/workbench/teams/${teamId}/sets/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
  }

  async function reorderTodos(items: { id: string; sortOrder: number }[]) {
    const order = new Map(items.map((i) => [i.id, i.sortOrder]));
    setTodos((prev) =>
      prev.map((t) =>
        order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t,
      ),
    );
    await fetch(`/api/glint/workbench/teams/${teamId}/todos/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, setId: activeSetId }),
    });
  }

  // ── set drag-and-drop (sidebar) ──────────────────────────────────────────

  const handleSetDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setDragSetIdx(Number(e.currentTarget.dataset.dragIndex));
  };
  const handleSetDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    dragSetCounter.current++;
    setDragOverSetIdx(Number(e.currentTarget.dataset.dragIndex));
  };
  const handleSetDragLeave = () => {
    dragSetCounter.current--;
    if (dragSetCounter.current === 0) setDragOverSetIdx(null);
  };
  const handleSetDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleSetDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const dropIdx = Number(e.currentTarget.dataset.dragIndex);
    dragSetCounter.current = 0;
    setDragOverSetIdx(null);
    if (dragSetIdx === null || dragSetIdx === dropIdx) {
      setDragSetIdx(null);
      return;
    }
    const reordered = [...sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const [moved] = reordered.splice(dragSetIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    void reorderSets(reordered.map((s, i) => ({ id: s.id, sortOrder: i + 1 })));
    setDragSetIdx(null);
  };
  const handleSetDragEnd = () => {
    setDragSetIdx(null);
    setDragOverSetIdx(null);
    dragSetCounter.current = 0;
  };

  // ── todo drag-and-drop (main pane, root level only) ──────────────────────

  const handleTodoDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setDragTodoIdx(Number(e.currentTarget.dataset.dragIndex));
  };
  const handleTodoDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    dragTodoCounter.current++;
    setDragOverTodoIdx(Number(e.currentTarget.dataset.dragIndex));
  };
  const handleTodoDragLeave = () => {
    dragTodoCounter.current--;
    if (dragTodoCounter.current === 0) setDragOverTodoIdx(null);
  };
  const handleTodoDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleTodoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const dropIdx = Number(e.currentTarget.dataset.dragIndex);
    dragTodoCounter.current = 0;
    setDragOverTodoIdx(null);
    if (dragTodoIdx === null || dragTodoIdx === dropIdx) {
      setDragTodoIdx(null);
      return;
    }
    const reordered = [...rootTodos];
    const [moved] = reordered.splice(dragTodoIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    void reorderTodos(reordered.map((t, i) => ({ id: t.id, sortOrder: i + 1 })));
    setDragTodoIdx(null);
  };
  const handleTodoDragEnd = () => {
    setDragTodoIdx(null);
    setDragOverTodoIdx(null);
    dragTodoCounter.current = 0;
  };

  // ── derived ──────────────────────────────────────────────────────────────

  const activeSet = sets.find((s) => s.id === activeSetId);
  const rootTodos = useMemo(
    () => todos.filter((t) => !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [todos],
  );
  const subTodosOf = useCallback(
    (id: string) =>
      todos
        .filter((t) => t.parentId === id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [todos],
  );
  const completedRoot = rootTodos.filter((t) => t.completed).length;
  const commentTodo = todos.find((t) => t.id === commentTodoId) ?? null;

  const canDeleteCmt = useCallback(
    (c: Comment) =>
      c.userId === myId ? can("delete_own_comments") : can("delete_any_comment"),
    [myId, perms], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── row render ───────────────────────────────────────────────────────────

  function renderTodoRow(
    todo: Todo,
    isSub: boolean,
    rootIdx?: number,
    hasChildren?: boolean,
  ) {
    const isOwn = todo.userId === myId;
    const isClaimedByMe = !!myId && todo.claimedBy === myId;
    const canEdit = isOwn ? can("edit_own_todos") : can("edit_any_todo");
    const canDel = isOwn ? can("delete_own_todos") : can("delete_any_todo");
    const canToggle = isOwn || can("complete_any_todo");
    const canSub = !isSub && can("add_subtodos");
    const canDrag = !isSub && can("reorder_todos") && rootIdx !== undefined;
    const isEditing = editingId === todo.id;
    const showActions = hoveredId === todo.id || isEditing;
    const collapsed = !isSub && collapsedParents.has(todo.id);

    return (
      <div
        key={todo.id}
        className={mergeClasses(
          styles.todoItem,
          isSub && styles.todoItemSub,
          canDrag && dragTodoIdx === rootIdx && styles.todoItemDragging,
          canDrag &&
            dragOverTodoIdx === rootIdx &&
            dragTodoIdx !== rootIdx &&
            styles.todoItemDragOver,
        )}
        draggable={canDrag}
        data-drag-index={rootIdx}
        onDragStart={canDrag ? handleTodoDragStart : undefined}
        onDragEnter={canDrag ? handleTodoDragEnter : undefined}
        onDragLeave={canDrag ? handleTodoDragLeave : undefined}
        onDragOver={canDrag ? handleTodoDragOver : undefined}
        onDrop={canDrag ? handleTodoDrop : undefined}
        onDragEnd={canDrag ? handleTodoDragEnd : undefined}
        onMouseEnter={() => setHoveredId(todo.id)}
        onMouseLeave={() => setHoveredId((id) => (id === todo.id ? null : id))}
      >
        {!isSub && (
          <Button
            appearance="subtle"
            size="small"
            icon={
              collapsed ? <ChevronRightRegular /> : <ChevronDownRegular />
            }
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleCollapsed(todo.id);
            }}
            style={{
              visibility: hasChildren ? "visible" : "hidden",
              minWidth: 24,
            }}
          />
        )}
        <Checkbox
          checked={todo.completed}
          disabled={!canToggle}
          onChange={() => void toggleTodo(todo)}
        />
        {isEditing ? (
          <div className={styles.editRow}>
            <Input
              value={editingTitle}
              onChange={(_, d) => setEditingTitle(d.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit(todo);
                else if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
              style={{ flex: 1 }}
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<CheckmarkRegular />}
              onClick={() => void commitEdit(todo)}
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              onClick={() => setEditingId(null)}
            />
          </div>
        ) : (
          <>
            <Text
              className={mergeClasses(
                styles.todoTitle,
                todo.completed && styles.todoCompleted,
              )}
            >
              {todo.title}
            </Text>
            {todo.claimedBy && (
              <Badge
                appearance="tint"
                color={isClaimedByMe ? "informative" : "subtle"}
                size="small"
              >
                {isClaimedByMe
                  ? t.claimedByYou
                  : todo.claimedByName
                    ? t.claimedBy(todo.claimedByName)
                    : t.claimedFallback}
              </Badge>
            )}
            {todo.commentCount > 0 && (
              <Badge appearance="ghost" size="small">
                {todo.commentCount}
              </Badge>
            )}
          </>
        )}
        {!isEditing && (
          <div
            className={mergeClasses(
              styles.actions,
              showActions && styles.actionsVisible,
            )}
          >
            {can("claim_todos") && (
              <Tooltip content={isClaimedByMe ? t.release : t.claim} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={
                    isClaimedByMe ? <PersonDeleteRegular /> : <PersonAvailableRegular />
                  }
                  disabled={!!todo.claimedBy && !isClaimedByMe}
                  onClick={() => void toggleClaim(todo)}
                />
              </Tooltip>
            )}
            {canSub && (
              <Tooltip content={t.addSubtask} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<AddCircleRegular />}
                  onClick={() => {
                    setSubComposerFor(todo.id);
                    setSubTitle("");
                  }}
                />
              </Tooltip>
            )}
            {(can("comment") || todo.commentCount > 0) && (
              <Tooltip content={t.comments} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<CommentRegular />}
                  onClick={() => setCommentTodoId(todo.id)}
                />
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip content={t.edit} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<EditRegular />}
                  onClick={() => {
                    setEditingId(todo.id);
                    setEditingTitle(todo.title);
                  }}
                />
              </Tooltip>
            )}
            {canDel && (
              <Tooltip content={t.deleteAction} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<DeleteRegular />}
                  onClick={() => void deleteTodo(todo)}
                />
              </Tooltip>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      <aside className={styles.rail}>
        <div className={styles.railHeader}>
          <Subtitle1>{t.setsTitle}</Subtitle1>
          <div style={{ display: "flex", gap: 4 }}>
            {can("manage_sets") && (
              <Tooltip content={t.newSet} relationship="label">
                <Button
                  appearance="subtle"
                  icon={<AddRegular />}
                  size="small"
                  onClick={() => setCreateSetOpen(true)}
                />
              </Tooltip>
            )}
            <Tooltip content={t.refresh} relationship="label">
              <Button
                appearance="subtle"
                icon={<ArrowClockwiseRegular />}
                size="small"
                onClick={() => void loadSets()}
              />
            </Tooltip>
          </div>
        </div>
        <div className={styles.railBody}>
          {setsLoading ? (
            <div className={styles.empty}>
              <Spinner size="small" />
            </div>
          ) : sets.length === 0 ? (
            <Caption1 className={styles.empty}>{t.noSets}</Caption1>
          ) : (
            sets.map((set, i) => {
              const canDrag = can("manage_sets");
              const canManage = can("manage_sets") || set.userId === myId;
              const isHovered = hoveredSetId === set.id;
              return (
                <div
                  key={set.id}
                  className={mergeClasses(
                    styles.setItem,
                    canManage && styles.setItemWithMenu,
                    set.id === activeSetId && styles.setItemActive,
                    canDrag && dragSetIdx === i && styles.setItemDragging,
                    canDrag &&
                      dragOverSetIdx === i &&
                      dragSetIdx !== i &&
                      styles.setItemDragOver,
                  )}
                  onClick={() => setActiveSetId(set.id)}
                  onMouseEnter={() => setHoveredSetId(set.id)}
                  onMouseLeave={() =>
                    setHoveredSetId((id) => (id === set.id ? null : id))
                  }
                  draggable={canDrag}
                  data-drag-index={i}
                  onDragStart={canDrag ? handleSetDragStart : undefined}
                  onDragEnter={canDrag ? handleSetDragEnter : undefined}
                  onDragLeave={canDrag ? handleSetDragLeave : undefined}
                  onDragOver={canDrag ? handleSetDragOver : undefined}
                  onDrop={canDrag ? handleSetDrop : undefined}
                  onDragEnd={canDrag ? handleSetDragEnd : undefined}
                >
                  <div className={styles.setRow}>
                    <Body2 className={styles.setName}>{set.name}</Body2>
                    <Caption1 className={styles.setRatio}>
                      {set.completed}/{set.total}
                    </Caption1>
                  </div>
                  <ProgressBar
                    value={set.total > 0 ? set.completed / set.total : 0}
                    thickness="medium"
                    color={
                      set.pending === 0 && set.total > 0 ? "success" : "brand"
                    }
                  />
                  {canManage && (
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<MoreHorizontalRegular />}
                          className={mergeClasses(
                            styles.setItemMenuBtn,
                            (isHovered || set.id === activeSetId) &&
                              styles.setItemMenuBtnVisible,
                          )}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            icon={<EditRegular />}
                            onClick={() => setEditSetId(set.id)}
                          >
                            {t.setSettings}
                          </MenuItem>
                          <MenuItem
                            icon={<DeleteRegular />}
                            onClick={() => setDeleteSetId(set.id)}
                          >
                            {t.deleteAction}
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <section className={styles.main}>
        {glintError ? (
          <div className={styles.configBanner}>
            <MessageBar intent="warning">
              <MessageBarBody>
                {glintError}{" "}
                <Button
                  appearance="subtle"
                  icon={<SettingsRegular />}
                  size="small"
                  onClick={() => navigate("/settings")}
                >
                  {t.configure}
                </Button>
              </MessageBarBody>
            </MessageBar>
          </div>
        ) : !activeSetId ? (
          <Caption1 className={styles.empty}>{t.pickSet}</Caption1>
        ) : (
          <>
            <div className={styles.mainHeader}>
              <div className={styles.mainHeaderLeft}>
                <Title2>{activeSet?.name}</Title2>
                {activeSet && activeSet.pending > 0 && (
                  <Badge appearance="tint" color="brand">
                    {t.pendingBadge(activeSet.pending)}
                  </Badge>
                )}
              </div>
            </div>

            {permsState.error && (
              <MessageBar intent="warning" style={{ margin: "8px 24px 0" }}>
                <MessageBarBody>
                  Permissions request failed: {permsState.error}. Action buttons
                  may be hidden until this resolves.
                </MessageBarBody>
              </MessageBar>
            )}

            {can("create_todos") && (
              <div className={styles.composer}>
                <Input
                  placeholder={t.addTaskPlaceholder}
                  value={newTitle}
                  onChange={(_, d) => setNewTitle(d.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTitle.trim() && !creating) {
                      const title = newTitle;
                      setNewTitle("");
                      void createTodo(title, null);
                    }
                  }}
                  disabled={creating}
                  style={{ flex: 1 }}
                />
                <Button
                  appearance="primary"
                  icon={<AddRegular />}
                  disabled={!newTitle.trim() || creating}
                  onClick={() => {
                    const title = newTitle;
                    setNewTitle("");
                    void createTodo(title, null);
                  }}
                >
                  {t.add}
                </Button>
              </div>
            )}

            <div className={styles.mainContent}>
              {todosLoading ? (
                <div className={styles.empty}>
                  <Spinner />
                </div>
              ) : todosError ? (
                <MessageBar intent="error">
                  <MessageBarBody>{todosError}</MessageBarBody>
                </MessageBar>
              ) : rootTodos.length === 0 ? (
                <Caption1 className={styles.empty}>{t.noTasks}</Caption1>
              ) : (
                <>
                  {rootTodos.map((todo, idx) => {
                    const subs = subTodosOf(todo.id);
                    const hasChildren = subs.length > 0;
                    const isCollapsed = collapsedParents.has(todo.id);
                    const showSubs =
                      !isCollapsed || subComposerFor === todo.id;
                    return (
                    <div key={todo.id}>
                      {renderTodoRow(todo, false, idx, hasChildren)}
                      {subComposerFor === todo.id && (
                        <div className={styles.subComposer}>
                          <Input
                            placeholder={t.subtaskPlaceholder}
                            value={subTitle}
                            onChange={(_, d) => setSubTitle(d.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && subTitle.trim()) {
                                const title = subTitle;
                                setSubComposerFor(null);
                                setSubTitle("");
                                void createTodo(title, todo.id);
                              } else if (e.key === "Escape") {
                                setSubComposerFor(null);
                                setSubTitle("");
                              }
                            }}
                            autoFocus
                            style={{ flex: 1 }}
                          />
                          <Button
                            appearance="primary"
                            size="small"
                            disabled={!subTitle.trim()}
                            onClick={() => {
                              const title = subTitle;
                              setSubComposerFor(null);
                              setSubTitle("");
                              void createTodo(title, todo.id);
                            }}
                          >
                            {t.add}
                          </Button>
                          <Button
                            appearance="subtle"
                            size="small"
                            onClick={() => {
                              setSubComposerFor(null);
                              setSubTitle("");
                            }}
                          >
                            {t.cancel}
                          </Button>
                        </div>
                      )}
                      {showSubs &&
                        subs.map((sub) => renderTodoRow(sub, true))}
                    </div>
                    );
                  })}
                  <Caption1 className={styles.footerCount}>
                    {t.completeRatio(completedRoot, rootTodos.length)}
                  </Caption1>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <CommentsDialog
        open={commentTodoId !== null}
        onClose={() => setCommentTodoId(null)}
        todoTitle={commentTodo?.title}
        teamId={teamId}
        todoId={commentTodoId}
        canComment={can("comment")}
        canDeleteComment={canDeleteCmt}
        onCommentCountChange={adjustCommentCount}
      />

      <CreateSetDialog
        open={createSetOpen}
        onClose={() => setCreateSetOpen(false)}
        onCreate={createSet}
      />

      <EditSetDialog
        open={editSetId !== null}
        onClose={() => setEditSetId(null)}
        set={sets.find((s) => s.id === editSetId) ?? null}
        onSave={async (patch) => {
          if (editSetId) await patchSet(editSetId, patch);
        }}
      />

      <ConfirmDialog
        open={deleteSetId !== null}
        title={t.deleteSetTitle}
        message={t.deleteSetMessage(
          sets.find((s) => s.id === deleteSetId)?.name ?? "",
        )}
        confirmLabel={t.deleteAction}
        destructive
        onCancel={() => setDeleteSetId(null)}
        onConfirm={() => {
          if (deleteSetId) void deleteSet(deleteSetId);
          setDeleteSetId(null);
        }}
      />
    </div>
  );
}

export type TeamRole = "owner" | "co-owner" | "admin" | "member";

export type TeamInfo = {
  id: string;
  name: string;
  role: TeamRole;
  avatarUrl?: string;
};

export type User = {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  teams: TeamInfo[];
};

export type TeamOverview = {
  sets: number;
  total: number;
  completed: number;
  pending: number;
  assignedToMe: number;
};

export type TodoSet = {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  autoRenew: boolean;
  renewTime: string;
  timezone: string;
  lastRenewedAt: string | null;
  splitCompleted: boolean;
  createdAt: string;
  total: number;
  completed: number;
  pending: number;
};

export type MyTodo = {
  id: string;
  setId: string;
  setName: string | null;
  userId: string;
  title: string;
  completed: boolean;
  isMyTodo: boolean;
  isAssignedToMe: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FeedItem = {
  id: string;
  title: string;
  completed: boolean;
  userId: string;
  setId: string | null;
  setName: string | null;
  updatedAt: string;
};

export const PERMISSION_KEYS = [
  "manage_settings",
  "manage_permissions",
  "manage_sets",
  "manage_set_links",
  "create_todos",
  "edit_own_todos",
  "edit_any_todo",
  "delete_own_todos",
  "delete_any_todo",
  "complete_any_todo",
  "add_subtodos",
  "assign_todos",
  "reorder_todos",
  "comment",
  "delete_own_comments",
  "delete_any_comment",
  "view_todos",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type Permissions = Record<PermissionKey, boolean>;

export type PermissionsMe = {
  permissions: Permissions;
  role: TeamRole;
};

export type Todo = {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  sortOrder: number;
  commentCount: number;
  assignees: Assignee[];
  createdAt: string;
  updatedAt: string;
};

export type Assignee = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type Comment = {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  body: string;
  createdAt: string;
};

// ── Apps Launcher ──────────────────────────────────────────────────────────

export type AppCard = {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  description?: string;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // TODO(short-link): add `slug?: string` — stable per-team identifier for
  // /a/<slug> redirects. Empty → fall back to a generated short ID. KV needs a
  // reverse index `app-link:<slug>` → {teamId, appId} for O(1) lookup.
};

export type AppGroup = {
  id: string;
  name: string;
  appIds: string[];
  sortOrder: number;
};

export type UserAppPrefs = {
  favorites: string[];
  groups: AppGroup[];
};

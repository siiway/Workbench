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
  claimedByMe: number;
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
  claimedBy: string | null;
  isMyTodo: boolean;
  isClaimedByMe: boolean;
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
  "claim_todos",
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
  claimedBy: string | null;
  claimedByName: string | null;
  claimedByAvatar: string | null;
  createdAt: string;
  updatedAt: string;
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

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
  name: string;
  description: string | null;
  sortOrder: number;
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

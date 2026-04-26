const en = {
  // App-level
  loading: "Loading…",
  sessionExpiredTitle: "Session expired",
  sessionExpiredBody: "Your session has expired. Please sign in again.",
  sessionExpiredSignIn: "Sign in",

  // Sidebar
  appName: "Siiway Workbench",
  navOverview: "Overview",
  navTasks: "Tasks",
  navPermissions: "Permissions",
  activeTeam: "Active team",
  switchTeam: "Switch team",
  settings: "Settings",
  signOut: "Sign out",

  // Dashboard
  overviewTitle: "Overview",
  refresh: "Refresh",
  statPending: "Pending",
  statCompleted: "Completed",
  statTotal: "Total",
  statMyClaims: "My claims",
  statSets: "Sets",
  myTasks: "My tasks",
  recentActivity: "Recent activity",
  emptyMyTasks: "Nothing assigned to you.",
  emptyActivity: "No recent activity.",
  viewAllTasks: "View all tasks",
  glintNotConfigured: "Glint is not configured for this team.",
  glintNotConfiguredTitle: "Glint not configured",
  configure: "Configure",
  overviewSubtitle: "Tasks, claims, and recent activity across this team.",
  statPendingDesc: "Tasks awaiting action",
  statCompletedDesc: "Of total tasks",
  statMyClaimsDesc: "Tasks you've taken on",
  statSetsDesc: "Todo sets in this team",
  claimedShort: "Claimed",

  // Tasks page
  setsTitle: "Sets",
  newSet: "New set",
  noSets: "No sets yet.",
  pickSet: "Pick a set to view its tasks.",
  noTasks: "No tasks in this set.",
  addTaskPlaceholder: "Add a task and press Enter",
  add: "Add",
  cancel: "Cancel",
  subtaskPlaceholder: "Subtask title…",
  pendingBadge: (n: number) => `${n} pending`,
  setSummary: (pending: number, done: number, total: number) =>
    `${pending} pending · ${done} done · ${total} total`,
  completeRatio: (done: number, total: number) =>
    `${done} of ${total} complete`,
  claim: "Claim",
  release: "Release",
  claimedByYou: "Claimed by you",
  claimedBy: (name: string) => `Claimed by ${name}`,
  claimedFallback: "Claimed",
  commentCount: (n: number) => `${n} ${n === 1 ? "comment" : "comments"}`,
  addSubtask: "Add subtask",
  comments: "Comments",
  edit: "Edit",
  deleteAction: "Delete",
  setSettings: "Settings…",
  deleteSetTitle: "Delete set",
  deleteSetMessage: (name: string) =>
    `Delete set "${name}"? All todos in it will be removed.`,

  // Comments dialog
  commentsTitle: "Comments",
  commentsEmpty: "No comments yet.",
  commentInputPlaceholder: "Write a comment...",
  commentInputDisabled: "You don't have permission to comment.",
  close: "Close",

  // Create / edit set
  createSetTitle: "New set",
  fieldName: "Name",
  create: "Create",
  editSetTitle: "Set settings",
  fieldAutoRenew: "Auto-renew (uncheck root tasks daily)",
  fieldRenewTime: "Renew time",
  fieldTimezone: "Timezone",
  fieldSplitCompleted: "Split completed tasks below open tasks",
  save: "Save",

  // Confirm dialog
  confirm: "Confirm",

  // Permissions page
  permissionsTitle: "Permissions",
  permissionsSubtitle:
    "Global team permissions. Owners and co-owners always have everything.",
  permReset: "Reset",
  permSave: "Save",
  permLoading: "Loading permissions…",
  permReadOnly: "You don't have permission to edit. Showing read-only view.",
  permSaved: "Saved.",
  permGlobal: "Global",
  permColPermission: "Permission",
  permColAdmin: "Admin",
  permColMember: "Member",
  permCustom: "(custom)",

  // Locale switcher
  language: "Language",
  langEnglish: "English",
  langChinese: "中文",
};

export default en;
export type Translations = typeof en;

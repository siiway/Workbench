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
  navApps: "Apps",
  navConsole: "Console",
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
  permissionsReadOnlyHint:
    "Read-only view of permissions across connected apps. Use the linked app to make changes.",
  permLoading: "Loading permissions…",
  permYourPermissions: "Your permissions",
  permYourPermissionsHint:
    "What you can do in this team. Owners and co-owners have everything by default.",
  permYourPermissionsEmpty: "You currently have no permissions in this team.",
  permShowDenied: (n: number) => `Show ${n} denied permission${n === 1 ? "" : "s"}`,
  permTeamConfig: "Team configuration",
  permTeamConfigHint:
    "Permission matrix for admin and member roles. Visible to owners and co-owners only.",
  permColPermission: "Permission",
  permColAdmin: "Admin",
  permColMember: "Member",
  permCustom: "(custom)",

  // Apps launcher
  appsTitle: "Apps",
  appsSubtitle: "Quick access to apps your team uses.",
  appsNewApp: "Add app",
  appsNewGroup: "New group",
  appsAddCard: "Add app",
  appsCreateTitle: "New app",
  appsEditTitle: "Edit app",
  appsFieldName: "Name",
  appsFieldUrl: "URL",
  appsFieldIconUrl: "Icon URL",
  appsFieldDescription: "Description",
  appsFieldTags: "Tags",
  appsFieldTagsPlaceholder: "Add a tag and press Enter",
  appsAddTag: "Add",
  appsDeleteCardTitle: "Delete app",
  appsDeleteCardMessage: (name: string) => `Delete "${name}"?`,
  appsSearchPlaceholder: "Search apps…",
  appsTagFilter: "Filter:",
  appsClearTags: "Clear",
  appsFavorites: "Favorites",
  appsFavorite: "Favorite",
  appsUnfavorite: "Unfavorite",
  appsOpen: "Open",
  appsMoveTo: "Move to group",
  appsUngrouped: "Ungrouped",
  appsAllApps: "All apps",
  appsGroupEmpty: "Drop apps here, or use the menu on a card.",
  appsEmpty: "No apps yet.",
  appsRenameGroup: "Rename",
  appsDeleteGroup: "Delete group",
  appsNewGroupTitle: "New group",
  appsRenameGroupTitle: "Rename group",
  appsGroupName: "Group name",
  appsDeleteGroupTitle: "Delete group",
  appsDeleteGroupMessage: (name: string) =>
    `Delete group "${name}"? Apps in it will move to Ungrouped.`,

  // Locale switcher
  language: "Language",
  langEnglish: "English",
  langChinese: "中文",
};

export default en;
export type Translations = typeof en;

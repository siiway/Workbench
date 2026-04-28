import type { Translations } from "./en";

const zh: Translations = {
  // App-level
  loading: "加载中…",
  sessionExpiredTitle: "会话已过期",
  sessionExpiredBody: "您的会话已过期，请重新登录。",
  sessionExpiredSignIn: "登录",

  // Sidebar
  appName: "Siiway Workbench",
  navOverview: "概览",
  navTasks: "任务",
  navApps: "应用",
  navConsole: "控制台",
  navPermissions: "权限",
  activeTeam: "当前团队",
  switchTeam: "切换团队",
  settings: "设置",
  signOut: "退出登录",

  // Dashboard
  overviewTitle: "概览",
  refresh: "刷新",
  statPending: "待办",
  statCompleted: "已完成",
  statTotal: "总数",
  statMyClaims: "我领取的",
  statSets: "清单数",
  myTasks: "我的任务",
  recentActivity: "最近动态",
  emptyMyTasks: "暂无分配给您的任务。",
  emptyActivity: "暂无动态。",
  viewAllTasks: "查看全部任务",
  glintNotConfigured: "当前团队尚未配置 Glint。",
  glintNotConfiguredTitle: "Glint 未配置",
  configure: "去配置",
  overviewSubtitle: "团队的任务、领取与最近动态。",
  statPendingDesc: "等待处理的任务",
  statCompletedDesc: "已完成 / 总任务",
  statMyClaimsDesc: "您领取的任务",
  statSetsDesc: "团队的清单数",
  claimedShort: "已领取",

  // Tasks page
  setsTitle: "清单",
  newSet: "新建清单",
  noSets: "还没有清单。",
  pickSet: "选择一个清单查看其中的任务。",
  noTasks: "此清单还没有任务。",
  addTaskPlaceholder: "输入任务后按 Enter 添加",
  add: "添加",
  cancel: "取消",
  subtaskPlaceholder: "子任务标题…",
  pendingBadge: (n: number) => `${n} 项待办`,
  setSummary: (pending: number, done: number, total: number) =>
    `${pending} 待办 · ${done} 已完成 · ${total} 总计`,
  completeRatio: (done: number, total: number) =>
    `已完成 ${done} / ${total}`,
  claim: "领取",
  release: "释放",
  claimedByYou: "已被您领取",
  claimedBy: (name: string) => `${name} 已领取`,
  claimedFallback: "已领取",
  commentCount: (n: number) => `${n} 条评论`,
  addSubtask: "新增子任务",
  comments: "评论",
  edit: "编辑",
  deleteAction: "删除",
  setSettings: "设置…",
  deleteSetTitle: "删除清单",
  deleteSetMessage: (name: string) =>
    `确定删除清单 "${name}"？其中的所有任务将一并删除。`,

  // Comments dialog
  commentsTitle: "评论",
  commentsEmpty: "暂无评论。",
  commentInputPlaceholder: "写下评论…",
  commentInputDisabled: "您没有评论权限。",
  close: "关闭",

  // Create / edit set
  createSetTitle: "新建清单",
  fieldName: "名称",
  create: "创建",
  editSetTitle: "清单设置",
  fieldAutoRenew: "自动续期（每天取消根任务的完成状态）",
  fieldRenewTime: "续期时间",
  fieldTimezone: "时区",
  fieldSplitCompleted: "在未完成任务下方单独显示已完成任务",
  save: "保存",

  // Confirm dialog
  confirm: "确认",

  // Permissions page
  permissionsTitle: "权限",
  permissionsReadOnlyHint:
    "已连接应用的权限只读视图。如需修改，请在对应应用中操作。",
  permLoading: "正在加载权限…",
  permYourPermissions: "您的权限",
  permYourPermissionsHint:
    "您在该团队可以执行的操作。所有者与共同所有者默认拥有全部权限。",
  permYourPermissionsEmpty: "您在该团队当前没有任何权限。",
  permShowDenied: (n: number) => `显示 ${n} 项被拒绝的权限`,
  permTeamConfig: "团队权限策略",
  permTeamConfigHint: "管理员与成员角色的权限矩阵。仅所有者与共同所有者可见。",
  permColPermission: "权限",
  permColAdmin: "管理员",
  permColMember: "成员",
  permCustom: "（自定义）",

  // Apps launcher
  appsTitle: "应用",
  appsSubtitle: "快速访问团队使用的各类应用。",
  appsNewApp: "添加应用",
  appsNewGroup: "新建分组",
  appsAddCard: "添加应用",
  appsCreateTitle: "新建应用",
  appsEditTitle: "编辑应用",
  appsFieldName: "名称",
  appsFieldUrl: "URL",
  appsFieldIconUrl: "图标 URL",
  appsFieldDescription: "描述",
  appsFieldTags: "标签",
  appsFieldTagsPlaceholder: "输入标签后按 Enter 添加",
  appsAddTag: "添加",
  appsDeleteCardTitle: "删除应用",
  appsDeleteCardMessage: (name: string) => `确定删除 "${name}" 吗？`,
  appsSearchPlaceholder: "搜索应用…",
  appsTagFilter: "筛选：",
  appsClearTags: "清空",
  appsFavorites: "收藏",
  appsFavorite: "收藏",
  appsUnfavorite: "取消收藏",
  appsOpen: "打开",
  appsMoveTo: "移动到分组",
  appsUngrouped: "未分组",
  appsAllApps: "全部应用",
  appsGroupEmpty: "拖动应用到这里，或在卡片菜单里选择移动。",
  appsEmpty: "还没有应用。",
  appsRenameGroup: "重命名",
  appsDeleteGroup: "删除分组",
  appsNewGroupTitle: "新建分组",
  appsRenameGroupTitle: "重命名分组",
  appsGroupName: "分组名称",
  appsDeleteGroupTitle: "删除分组",
  appsDeleteGroupMessage: (name: string) =>
    `确定删除分组 "${name}" 吗？组内的应用会移到"未分组"。`,

  // Locale switcher
  language: "语言",
  langEnglish: "English",
  langChinese: "中文",
};

export default zh;

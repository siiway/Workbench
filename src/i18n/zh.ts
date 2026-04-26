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
  permissionsSubtitle: "团队全局权限。所有者与共同所有者始终拥有全部权限。",
  permReset: "重置",
  permSave: "保存",
  permLoading: "正在加载权限…",
  permReadOnly: "您没有编辑权限，仅可查看。",
  permSaved: "已保存。",
  permGlobal: "全局",
  permColPermission: "权限",
  permColAdmin: "管理员",
  permColMember: "成员",
  permCustom: "（自定义）",

  // Locale switcher
  language: "语言",
  langEnglish: "English",
  langChinese: "中文",
};

export default zh;

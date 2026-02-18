// App-wide configuration and RBAC rules
export const STORAGE_KEYS = {
  lang: "hrms_lang",
  theme: "hrms_theme",
  session: "hrms_session",
  role: "hrms_role",
  user: "hrms_user",
  roleVisibility: "hrms_role_visibility",
  userPermissions: "hrms_user_permissions",
  tablePrefs: "hrms_table_prefs",
  usersDraft: "hrms_users_draft",
  securityAudit: "hrms_security_audit",
  uxAnalytics: "hrms_ux_analytics",
  uiErrors: "hrms_ui_errors",
  aiDefenseBlocks: "hrms_ai_defense_blocks",
  aiDefenseReports: "hrms_ai_defense_reports"
};

export const ROLES = ["super_admin", "hr_admin", "manager", "employee"];

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  hr_admin: "HR Admin",
  manager: "Manager",
  employee: "Employee"
};

const PROFESSIONAL_MENU_ITEMS = [
  { key: "my_requests", labelKey: "nav.my_requests", href: "professional-page.html?view=my_requests", icon: "inbox" },
  { key: "manager_inbox", labelKey: "nav.manager_inbox", href: "professional-page.html?view=manager_inbox", icon: "inbox" },
  { key: "approval_timeline", labelKey: "nav.approval_timeline", href: "professional-page.html?view=approval_timeline", icon: "history" },
  { key: "team_calendar", labelKey: "nav.team_calendar", href: "professional-page.html?view=team_calendar", icon: "calendar-days" },
  { key: "employee_360", labelKey: "nav.employee_360", href: "professional-page.html?view=employee_360", icon: "scan-face" },
  { key: "document_center", labelKey: "nav.document_center", href: "professional-page.html?view=document_center", icon: "folder-open" },
  { key: "recruitment_pipeline", labelKey: "nav.recruitment_pipeline", href: "professional-page.html?view=recruitment_pipeline", icon: "git-merge" },
  { key: "onboarding_tracker", labelKey: "nav.onboarding_tracker", href: "professional-page.html?view=onboarding_tracker", icon: "rocket" },
  { key: "offboarding_checklist", labelKey: "nav.offboarding_checklist", href: "professional-page.html?view=offboarding_checklist", icon: "user-minus" },
  { key: "performance_reviews", labelKey: "nav.performance_reviews", href: "professional-page.html?view=performance_reviews", icon: "gauge" },
  { key: "compensation_history", labelKey: "nav.compensation_history", href: "professional-page.html?view=compensation_history", icon: "coins" },
  { key: "attendance_anomalies", labelKey: "nav.attendance_anomalies", href: "professional-page.html?view=attendance_anomalies", icon: "siren" },
  { key: "policy_center", labelKey: "nav.policy_center", href: "professional-page.html?view=policy_center", icon: "shield-check" },
  { key: "announcements", labelKey: "nav.announcements", href: "professional-page.html?view=announcements", icon: "megaphone" },
  { key: "hr_tickets", labelKey: "nav.hr_tickets", href: "professional-page.html?view=hr_tickets", icon: "life-buoy" },
  { key: "org_insights", labelKey: "nav.org_insights", href: "professional-page.html?view=org_insights", icon: "network" },
  { key: "asset_lifecycle", labelKey: "nav.asset_lifecycle", href: "professional-page.html?view=asset_lifecycle", icon: "package-check" },
  { key: "training_certifications", labelKey: "nav.training_certifications", href: "professional-page.html?view=training_certifications", icon: "graduation-cap" },
  { key: "role_permission_matrix", labelKey: "nav.role_permission_matrix", href: "professional-page.html?view=role_permission_matrix", icon: "key-round" },
  { key: "executive_dashboard", labelKey: "nav.executive_dashboard", href: "professional-page.html?view=executive_dashboard", icon: "line-chart" }
];

export const MENU_ITEMS = [
  { key: "dashboard", labelKey: "nav.dashboard", href: "dashboard.html", icon: "layout-dashboard" },
  { key: "employees", labelKey: "nav.employees", href: "employees.html", icon: "users" },
  { key: "leaves", labelKey: "nav.leaves", href: "leaves.html", icon: "calendar-check" },
  { key: "my_leaves", labelKey: "nav.my_leaves", href: "employee-leaves.html", icon: "calendar-plus" },
  { key: "payroll", labelKey: "nav.payroll", href: "payroll.html", icon: "wallet" },
  { key: "attendance", labelKey: "nav.attendance", href: "attendance.html", icon: "timer" },
  { key: "assets", labelKey: "nav.assets", href: "assets.html", icon: "laptop" },
  { key: "timeoff", labelKey: "nav.timeoff", href: "timeoff.html", icon: "calendar" },
  { key: "orgchart", labelKey: "nav.orgchart", href: "org-chart.html", icon: "git-branch" },
  { key: "departments", labelKey: "nav.departments", href: "departments.html", icon: "building" },
  { key: "positions", labelKey: "nav.positions", href: "positions.html", icon: "briefcase" },
  { key: "reports", labelKey: "nav.reports", href: "reports.html", icon: "bar-chart" },
  { key: "notifications_center", labelKey: "nav.notifications_center", href: "notifications-center.html", icon: "bell-ring" },
  { key: "security_center", labelKey: "nav.security_center", href: "security-center.html", icon: "shield-alert" },
  { key: "security_map", labelKey: "nav.security_map", href: "security-map.html", icon: "map-pinned" },
  { key: "settings", labelKey: "nav.settings", href: "settings.html", icon: "settings" },
  { key: "workspace", labelKey: "nav.workspace", href: "workspace.html", icon: "layers-3" },
  ...PROFESSIONAL_MENU_ITEMS,
  { key: "profile", labelKey: "nav.profile", href: "profile.html", icon: "user" }
];

export const ROLE_PERMISSIONS = {
  super_admin: MENU_ITEMS.map((item) => item.key),
  hr_admin: [
    "dashboard",
    "employees",
    "leaves",
    "payroll",
    "attendance",
    "assets",
    "timeoff",
    "orgchart",
    "departments",
    "positions",
    "reports",
    "notifications_center",
    "security_center",
    "security_map",
    "settings",
    "workspace",
    "my_requests",
    "manager_inbox",
    "approval_timeline",
    "team_calendar",
    "employee_360",
    "document_center",
    "recruitment_pipeline",
    "onboarding_tracker",
    "offboarding_checklist",
    "performance_reviews",
    "compensation_history",
    "attendance_anomalies",
    "policy_center",
    "announcements",
    "hr_tickets",
    "org_insights",
    "asset_lifecycle",
    "training_certifications",
    "role_permission_matrix",
    "executive_dashboard",
    "profile"
  ],
  manager: [
    "dashboard",
    "employees",
    "leaves",
    "attendance",
    "assets",
    "timeoff",
    "orgchart",
    "reports",
    "notifications_center",
    "security_center",
    "security_map",
    "settings",
    "workspace",
    "my_requests",
    "manager_inbox",
    "approval_timeline",
    "team_calendar",
    "employee_360",
    "document_center",
    "recruitment_pipeline",
    "onboarding_tracker",
    "offboarding_checklist",
    "performance_reviews",
    "compensation_history",
    "attendance_anomalies",
    "policy_center",
    "announcements",
    "hr_tickets",
    "org_insights",
    "asset_lifecycle",
    "training_certifications",
    "role_permission_matrix",
    "executive_dashboard",
    "profile"
  ],
  employee: [
    "dashboard",
    "my_leaves",
    "attendance",
    "payroll",
    "assets",
    "timeoff",
    "orgchart",
    "workspace",
    "my_requests",
    "team_calendar",
    "notifications_center",
    "policy_center",
    "announcements",
    "hr_tickets",
    "profile"
  ]
};

export const ACTION_PERMISSIONS = {
  employee: {
    employees: ["view"],
    leaves: ["create", "view", "edit_own", "delete_own"],
    payroll: ["view_own"],
    attendance: ["view_own"],
    notifications: ["view", "mark_read", "archive"],
    reports: ["view_own"]
  },
  manager: {
    employees: ["view", "edit"],
    leaves: ["create", "view", "edit", "delete", "review_manager", "approve", "reject"],
    payroll: ["view"],
    attendance: ["view", "edit"],
    notifications: ["view", "mark_read", "archive", "mark_all"],
    reports: ["view", "export"]
  },
  hr_admin: {
    employees: ["create", "view", "edit", "delete", "export"],
    leaves: ["create", "view", "edit", "delete", "review_manager", "review_hr", "approve", "reject", "export"],
    payroll: ["create", "view", "edit", "delete", "publish", "export"],
    attendance: ["create", "view", "edit", "delete", "export"],
    notifications: ["view", "mark_read", "archive", "mark_all"],
    reports: ["view", "export"]
  },
  super_admin: {
    employees: ["*"],
    leaves: ["*"],
    payroll: ["*"],
    attendance: ["*"],
    notifications: ["*"],
    reports: ["*"],
    security: ["*"],
    settings: ["*"]
  }
};

export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_THEME = "light";

export const APP_NAME = "HRMS";

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
  aiDefenseReports: "hrms_ai_defense_reports",
  pageAvailability: "hrms_page_availability"
};

export const ROLES = ["super_admin", "hr_admin", "manager", "employee"];

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  hr_admin: "HR Admin",
  manager: "Manager",
  employee: "Employee"
};

export const MENU_ITEMS = [
  { key: "dashboard", labelKey: "nav.dashboard", href: "dashboard.html", icon: "layout-dashboard" },
  { key: "employees", labelKey: "nav.employees", href: "employees.html", icon: "users" },
  { key: "leaves", labelKey: "nav.leaves", href: "leaves.html", icon: "calendar-check" },
  { key: "my_leaves", labelKey: "nav.my_leaves", href: "employee-leaves.html", icon: "calendar-plus" },
  { key: "payroll", labelKey: "nav.payroll", href: "payroll.html", icon: "wallet" },
  { key: "accounting", labelKey: "nav.accounting", href: "accounting.html", icon: "landmark" },
  { key: "accounting_flow", labelKey: "nav.accounting_flow", href: "accounting-flow.html", icon: "arrow-left-right" },
  { key: "cashbox", labelKey: "nav.cashbox", href: "cashbox.html", icon: "receipt-text" },
  { key: "accounting_admin", labelKey: "nav.accounting_admin", href: "accounting-admin.html", icon: "book-open-check" },
  { key: "advances_report", labelKey: "nav.advances_report", href: "advances-report.html", icon: "file-clock" },
  { key: "attendance", labelKey: "nav.attendance", href: "attendance.html", icon: "timer" },
  { key: "assets", labelKey: "nav.assets", href: "assets.html", icon: "laptop" },
  { key: "timeoff", labelKey: "nav.timeoff", href: "timeoff.html", icon: "calendar" },
  { key: "orgchart", labelKey: "nav.orgchart", href: "org-chart.html", icon: "git-branch" },
  { key: "departments", labelKey: "nav.departments", href: "departments.html", icon: "building" },
  { key: "positions", labelKey: "nav.positions", href: "positions.html", icon: "briefcase" },
  { key: "reports", labelKey: "nav.reports", href: "reports.html", icon: "bar-chart" },
  { key: "excel_sheet", labelKey: "nav.excel_sheet", href: "excel-sheet.html", icon: "sheet" },
  { key: "employee_360", labelKey: "nav.employee_360", href: "employee-360.html", icon: "contact-round" },
  { key: "tickets", labelKey: "nav.tickets", href: "tickets.html", icon: "ticket" },
  { key: "help_desk", labelKey: "nav.hr_tickets", href: "help-desk.html", icon: "life-buoy" },
  { key: "announcements", labelKey: "nav.announcements", href: "announcements.html", icon: "megaphone" },
  { key: "notifications_center", labelKey: "nav.notifications_center", href: "notifications-center.html", icon: "bell-ring" },
  { key: "security_center", labelKey: "nav.security_center", href: "security-center.html", icon: "shield-alert" },
  { key: "security_map", labelKey: "nav.security_map", href: "security-map.html", icon: "map-pinned" },
  { key: "system_health", labelKey: "nav.system_health", href: "system-health.html", icon: "activity" },
  { key: "page_admin", labelKey: "nav.page_admin", href: "page-admin.html", icon: "power" },
  { key: "secure_vault", labelKey: "nav.secure_vault", href: "secure-vault.html", icon: "key-round" },
  { key: "settings", labelKey: "nav.settings", href: "settings.html", icon: "settings" },
  { key: "profile", labelKey: "nav.profile", href: "profile.html", icon: "user" }
];

export const ROLE_PERMISSIONS = {
  super_admin: MENU_ITEMS.map((item) => item.key),
  hr_admin: [
    "dashboard",
    "employees",
    "leaves",
    "payroll",
    "accounting",
    "accounting_flow",
    "cashbox",
    "accounting_admin",
    "advances_report",
    "attendance",
    "assets",
    "timeoff",
    "orgchart",
    "departments",
    "positions",
    "reports",
    "excel_sheet",
    "employee_360",
    "tickets",
    "help_desk",
    "announcements",
    "notifications_center",
    "security_center",
    "security_map",
    "system_health",
    "page_admin",
    "secure_vault",
    "settings",
    "profile"
  ],
  manager: [
    "dashboard",
    "employees",
    "leaves",
    "attendance",
    "assets",
    "timeoff",
    "accounting",
    "accounting_flow",
    "cashbox",
    "accounting_admin",
    "advances_report",
    "orgchart",
    "reports",
    "excel_sheet",
    "employee_360",
    "tickets",
    "help_desk",
    "announcements",
    "notifications_center",
    "security_center",
    "security_map",
    "settings",
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
    "employee_360",
    "tickets",
    "help_desk",
    "announcements",
    "notifications_center",
    "profile"
  ]
};

export const ACTION_PERMISSIONS = {
  employee: {
    employees: ["view"],
    leaves: ["create", "view", "edit_own", "delete_own"],
    payroll: ["view_own"],
    accounting: ["view_own"],
    attendance: ["view_own"],
    notifications: ["view", "mark_read", "archive"],
    reports: ["view_own"],
    tickets: ["create", "view_own", "edit_own"],
    announcements: ["view"]
  },
  manager: {
    employees: ["view", "edit"],
    leaves: ["create", "view", "edit", "delete", "review_manager", "approve", "reject"],
    payroll: ["view"],
    accounting: ["view", "create", "edit", "advance_request", "advance_approve", "advance_disburse", "advance_close"],
    attendance: ["view", "edit"],
    notifications: ["view", "mark_read", "archive", "mark_all"],
    reports: ["view", "export"],
    tickets: ["create", "view", "edit", "assign", "close"],
    announcements: ["create", "view", "edit", "publish"]
  },
  hr_admin: {
    employees: ["create", "view", "edit", "delete", "export"],
    leaves: ["create", "view", "edit", "delete", "review_manager", "review_hr", "approve", "reject", "export"],
    payroll: ["create", "view", "edit", "delete", "publish", "export"],
    accounting: ["create", "view", "edit", "delete", "export", "advance_request", "advance_approve", "advance_disburse", "advance_close"],
    attendance: ["create", "view", "edit", "delete", "export"],
    notifications: ["view", "mark_read", "archive", "mark_all"],
    reports: ["view", "export"],
    tickets: ["create", "view", "edit", "assign", "close", "delete", "export"],
    announcements: ["create", "view", "edit", "publish", "delete"],
    secure_vault: ["create", "view", "edit", "delete"]
  },
  super_admin: {
    employees: ["*"],
    leaves: ["*"],
    payroll: ["*"],
    accounting: ["*"],
    attendance: ["*"],
    notifications: ["*"],
    reports: ["*"],
    tickets: ["*"],
    announcements: ["*"],
    secure_vault: ["*"],
    security: ["*"],
    settings: ["*"]
  }
};

export const DEFAULT_LANGUAGE = "ar";
export const DEFAULT_THEME = "light";

export const APP_NAME = "Wadi Al-Rafidain";

export const DIRECT_SYSTEM_ADMIN = {
  uid: "direct-super-admin",
  name: "System Admin",
  email: "admin@hrms.local",
  role: "super_admin",
  status: "active"
};

// App-wide configuration and RBAC rules
export const STORAGE_KEYS = {
  lang: "hrms_lang",
  theme: "hrms_theme",
  session: "hrms_session",
  role: "hrms_role",
  user: "hrms_user",
  roleVisibility: "hrms_role_visibility",
  userPermissions: "hrms_user_permissions",
  usersDraft: "hrms_users_draft"
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
  { key: "payroll", labelKey: "nav.payroll", href: "payroll.html", icon: "wallet" },
  { key: "attendance", labelKey: "nav.attendance", href: "attendance.html", icon: "timer" },
  { key: "assets", labelKey: "nav.assets", href: "assets.html", icon: "laptop" },
  { key: "timeoff", labelKey: "nav.timeoff", href: "timeoff.html", icon: "calendar" },
  { key: "orgchart", labelKey: "nav.orgchart", href: "org-chart.html", icon: "git-branch" },
  { key: "departments", labelKey: "nav.departments", href: "departments.html", icon: "building" },
  { key: "positions", labelKey: "nav.positions", href: "positions.html", icon: "briefcase" },
  { key: "reports", labelKey: "nav.reports", href: "reports.html", icon: "bar-chart" },
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
    "attendance",
    "assets",
    "timeoff",
    "orgchart",
    "departments",
    "positions",
    "reports",
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
    "orgchart",
    "reports",
    "profile"
  ],
  employee: [
    "dashboard",
    "leaves",
    "attendance",
    "payroll",
    "assets",
    "timeoff",
    "orgchart",
    "profile"
  ]
};

export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_THEME = "light";

export const APP_NAME = "HRMS";

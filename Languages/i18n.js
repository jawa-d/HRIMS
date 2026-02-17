import { STORAGE_KEYS, DEFAULT_LANGUAGE, DEFAULT_THEME } from "../app.config.js";
import { initErrorRouter } from "../Collaboration interface/ui-error-router.js";

const dictionaries = {
  en: {
    "app.name": "HRMS",
    "nav.dashboard": "Dashboard",
    "nav.employees": "Employees",
    "nav.leaves": "Leaves",
    "nav.my_leaves": "My Leave Requests",
    "nav.payroll": "Payroll",
    "nav.attendance": "Attendance",
    "nav.assets": "Assets",
    "nav.timeoff": "Time Off",
    "nav.orgchart": "Org Chart",
    "nav.departments": "Departments",
    "nav.positions": "Positions",
    "nav.reports": "Reports",
    "nav.notifications_center": "Notification Center",
    "nav.security_center": "Security Center",
    "nav.security_map": "Security Map",
    "nav.settings": "Settings",
    "nav.workspace": "Workspace",
    "nav.my_requests": "My Requests",
    "nav.manager_inbox": "Manager Inbox",
    "nav.approval_timeline": "Approval Timeline",
    "nav.team_calendar": "Team Calendar",
    "nav.employee_360": "Employee 360",
    "nav.document_center": "Document Center",
    "nav.recruitment_pipeline": "Recruitment Pipeline",
    "nav.onboarding_tracker": "Onboarding Tracker",
    "nav.offboarding_checklist": "Offboarding Checklist",
    "nav.performance_reviews": "Performance Reviews",
    "nav.compensation_history": "Compensation History",
    "nav.attendance_anomalies": "Attendance Anomalies",
    "nav.policy_center": "Policy Center",
    "nav.announcements": "Announcements",
    "nav.hr_tickets": "HR Help Desk",
    "nav.org_insights": "Org Insights",
    "nav.asset_lifecycle": "Asset Lifecycle",
    "nav.training_certifications": "Training & Certifications",
    "nav.role_permission_matrix": "Role Permission Matrix",
    "nav.executive_dashboard": "Executive Dashboard",
    "nav.profile": "Profile",
    "nav.logout": "Logout",
    "nav.search": "Search...",
    "nav.notifications": "Notifications",
    "notifications.empty": "No notifications",
    "notifications.mark_read": "Mark read",
    "dashboard.subtitle": "Overview of your HR operations",
    "dashboard.welcome_title": "Welcome,",
    "dashboard.welcome_subtitle": "Here is a quick snapshot of your people operations today.",
    "dashboard.systems_ready": "All systems ready",
    "dashboard.view_reports": "View Reports",
    "dashboard.total_employees": "Total Employees",
    "dashboard.total_departments": "Departments",
    "dashboard.kpi.employees_meta": "Active growth",
    "dashboard.kpi.departments_meta": "Org structure",
    "dashboard.kpi.positions_meta": "Open roles",
    "dashboard.kpi.leaves_meta": "Pending reviews",
    "dashboard.kpi.payroll_meta": "Ready to publish",
    "dashboard.kpi.attendance_meta": "Daily check-ins",
    "dashboard.headcount_trend": "Headcount Trend",
    "dashboard.leave_status": "Leave Status",
    "dashboard.department_headcount": "Department Headcount",
    "dashboard.attendance_status": "Attendance Status",
    "dashboard.payroll_trend": "Payroll Trend",
    "dashboard.recent_activity": "Recent Activity",
    "nav.language": "AR",
    "nav.theme": "Theme",
    "login.title": "Welcome back",
    "login.subtitle": "Sign in to your HR workspace",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign In",
    "login.direct": "Direct Login",
    "login.direct_note": "Update demo credentials if needed",
    "login.helper": "Use your company account",
    "dashboard.kpi.employees": "Employees",
    "dashboard.kpi.leaves": "Leave Requests",
    "dashboard.kpi.payroll": "Payrolls",
    "dashboard.kpi.attendance": "Attendance",
    "dashboard.kpi.departments": "Departments",
    "dashboard.kpi.positions": "Positions",
    "common.add": "Add",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.edit": "Edit",
    "common.delete": "Delete",
    "common.status": "Status",
    "common.actions": "Actions",
    "common.details": "Details",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.submit": "Submit",
    "common.close": "Close",
    "common.view": "View",
    "employees.title": "Employees",
    "employees.add": "Add Employee",
    "employees.details": "Employee Details",
    "leaves.title": "Leave Requests",
    "my_leaves.title": "My Leave Requests",
    "payroll.title": "Payroll",
    "attendance.title": "Attendance",
    "assets.title": "Assets",
    "timeoff.title": "Time Off Balance",
    "orgchart.title": "Org Chart",
    "departments.title": "Departments",
    "positions.title": "Positions",
    "reports.title": "Reports",
    "notifications_center.title": "Notification Center",
    "security_center.title": "Security Center",
    "security_map.title": "Security Threat Map",
    "settings.title": "Settings",
    "profile.title": "Profile"
  },
  ar: {
    "app.name": "نظام إدارة الموارد البشرية",
    "nav.dashboard": "لوحة التحكم",
    "nav.employees": "الموظفون",
    "nav.leaves": "الإجازات",
    "nav.my_leaves": "طلباتي للإجازة",
    "nav.payroll": "الرواتب",
    "nav.attendance": "الحضور",
    "nav.assets": "الأصول",
    "nav.timeoff": "رصيد الإجازات",
    "nav.orgchart": "الهيكل التنظيمي",
    "nav.departments": "الأقسام",
    "nav.positions": "الوظائف",
    "nav.reports": "التقارير",
    "nav.notifications_center": "مركز التنبيهات",
    "nav.security_center": "مركز الأمان",
    "nav.security_map": "خريطة التهديدات",
    "nav.settings": "الإعدادات",
    "nav.workspace": "مساحة العمل",
    "nav.my_requests": "طلباتي",
    "nav.manager_inbox": "صندوق المدير",
    "nav.approval_timeline": "تسلسل الموافقات",
    "nav.team_calendar": "تقويم الفريق",
    "nav.employee_360": "ملف الموظف 360",
    "nav.document_center": "مركز المستندات",
    "nav.recruitment_pipeline": "مسار التوظيف",
    "nav.onboarding_tracker": "متابعة التهيئة",
    "nav.offboarding_checklist": "قائمة إنهاء الخدمة",
    "nav.performance_reviews": "تقييم الأداء",
    "nav.compensation_history": "سجل التعويضات",
    "nav.attendance_anomalies": "شذوذ الحضور",
    "nav.policy_center": "مركز السياسات",
    "nav.announcements": "الإعلانات",
    "nav.hr_tickets": "تذاكر الموارد البشرية",
    "nav.org_insights": "تحليلات الهيكل",
    "nav.asset_lifecycle": "دورة حياة الأصول",
    "nav.training_certifications": "التدريب والشهادات",
    "nav.role_permission_matrix": "مصفوفة الصلاحيات",
    "nav.executive_dashboard": "لوحة الإدارة العليا",
    "nav.profile": "الملف الشخصي",
    "nav.logout": "تسجيل الخروج",
    "nav.search": "بحث...",
    "nav.notifications": "الإشعارات",
    "notifications.empty": "لا توجد إشعارات",
    "notifications.mark_read": "تمييز كمقروء",
    "dashboard.subtitle": "نظرة عامة على عمليات الموارد البشرية",
    "dashboard.welcome_title": "مرحبًا،",
    "dashboard.welcome_subtitle": "هذه لمحة سريعة عن عمليات الموارد البشرية اليوم.",
    "dashboard.systems_ready": "كل الأنظمة جاهزة",
    "dashboard.view_reports": "عرض التقارير",
    "dashboard.total_employees": "إجمالي الموظفين",
    "dashboard.total_departments": "الأقسام",
    "dashboard.kpi.employees_meta": "نمو نشط",
    "dashboard.kpi.departments_meta": "هيكل المؤسسة",
    "dashboard.kpi.positions_meta": "وظائف مفتوحة",
    "dashboard.kpi.leaves_meta": "قيد المراجعة",
    "dashboard.kpi.payroll_meta": "جاهز للنشر",
    "dashboard.kpi.attendance_meta": "تسجيلات اليوم",
    "dashboard.headcount_trend": "اتجاه عدد الموظفين",
    "dashboard.leave_status": "حالة الإجازات",
    "dashboard.department_headcount": "عدد الموظفين حسب القسم",
    "dashboard.attendance_status": "حالة الحضور",
    "dashboard.payroll_trend": "اتجاه الرواتب",
    "dashboard.recent_activity": "النشاط الأخير",
    "nav.language": "EN",
    "nav.theme": "المظهر",
    "login.title": "مرحبًا بعودتك",
    "login.subtitle": "سجّل الدخول إلى مساحة عمل الموارد البشرية",
    "login.email": "البريد الإلكتروني",
    "login.password": "كلمة المرور",
    "login.submit": "تسجيل الدخول",
    "login.direct": "دخول مباشر",
    "login.direct_note": "حدّث بيانات الدخول التجريبية عند الحاجة",
    "login.helper": "استخدم حساب شركتك",
    "dashboard.kpi.employees": "الموظفون",
    "dashboard.kpi.leaves": "طلبات الإجازة",
    "dashboard.kpi.payroll": "الرواتب",
    "dashboard.kpi.attendance": "الحضور",
    "dashboard.kpi.departments": "الأقسام",
    "dashboard.kpi.positions": "الوظائف",
    "common.add": "إضافة",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.edit": "تعديل",
    "common.delete": "حذف",
    "common.status": "الحالة",
    "common.actions": "الإجراءات",
    "common.details": "التفاصيل",
    "common.search": "بحث",
    "common.filter": "تصفية",
    "common.submit": "إرسال",
    "common.close": "إغلاق",
    "common.view": "عرض",
    "employees.title": "الموظفون",
    "employees.add": "إضافة موظف",
    "employees.details": "تفاصيل الموظف",
    "leaves.title": "طلبات الإجازة",
    "my_leaves.title": "طلباتي للإجازة",
    "payroll.title": "الرواتب",
    "attendance.title": "الحضور",
    "assets.title": "الأصول",
    "timeoff.title": "رصيد الإجازات",
    "orgchart.title": "الهيكل التنظيمي",
    "departments.title": "الأقسام",
    "positions.title": "الوظائف",
    "reports.title": "التقارير",
    "notifications_center.title": "مركز التنبيهات",
    "security_center.title": "مركز الأمان",
    "security_map.title": "خريطة التهديدات الأمنية",
    "settings.title": "الإعدادات",
    "profile.title": "الملف الشخصي"
  }
};

let currentLang = localStorage.getItem(STORAGE_KEYS.lang) || DEFAULT_LANGUAGE;
let currentTheme = localStorage.getItem(STORAGE_KEYS.theme) || DEFAULT_THEME;

export function t(key) {
  return dictionaries[currentLang][key] || key;
}

export function getLanguage() {
  return currentLang;
}

export function setLanguage(lang) {
  currentLang = dictionaries[lang] ? lang : DEFAULT_LANGUAGE;
  localStorage.setItem(STORAGE_KEYS.lang, currentLang);
  applyLanguage();
}

export function toggleLanguage() {
  setLanguage(currentLang === "ar" ? "en" : "ar");
}

export function applyLanguage() {
  document.documentElement.setAttribute("lang", currentLang);
  document.documentElement.setAttribute("dir", currentLang === "ar" ? "rtl" : "ltr");
  translateDom();
}

export function translateDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
}

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  currentTheme = theme === "dark" ? "dark" : "light";
  localStorage.setItem(STORAGE_KEYS.theme, currentTheme);
  applyTheme();
}

export function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

export function applyTheme() {
  document.documentElement.dataset.theme = currentTheme;
}

export function initI18n() {
  initErrorRouter();
  applyLanguage();
  applyTheme();
}






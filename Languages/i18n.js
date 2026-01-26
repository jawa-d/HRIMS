import { STORAGE_KEYS, DEFAULT_LANGUAGE, DEFAULT_THEME } from "../app.config.js";

const dictionaries = {
  en: {
    "app.name": "HRMS",
    "nav.dashboard": "Dashboard",
    "nav.employees": "Employees",
    "nav.leaves": "Leaves",
    "nav.payroll": "Payroll",
    "nav.attendance": "Attendance",
    "nav.departments": "Departments",
    "nav.positions": "Positions",
    "nav.reports": "Reports",
    "nav.settings": "Settings",
    "nav.profile": "Profile",
    "nav.logout": "Logout",
    "nav.search": "Search...",
    "nav.notifications": "Notifications",
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
    "payroll.title": "Payroll",
    "attendance.title": "Attendance",
    "departments.title": "Departments",
    "positions.title": "Positions",
    "reports.title": "Reports",
    "settings.title": "Settings",
    "profile.title": "Profile"
  },
  ar: {
    "app.name": "???? ??????? ???????",
    "nav.dashboard": "???? ??????",
    "nav.employees": "????????",
    "nav.leaves": "????????",
    "nav.payroll": "???????",
    "nav.attendance": "??????",
    "nav.departments": "???????",
    "nav.positions": "???????",
    "nav.reports": "????????",
    "nav.settings": "?????????",
    "nav.profile": "????? ??????",
    "nav.logout": "????? ??????",
    "nav.search": "???...",
    "nav.notifications": "?????????",
    "nav.language": "EN",
    "nav.theme": "??????",
    "login.title": "?????? ??????",
    "login.subtitle": "??? ?????? ??? ???? ??????? ???????",
    "login.email": "?????? ??????????",
    "login.password": "???? ??????",
    "login.submit": "????? ??????",
    "login.direct": "دخول مباشر",
    "login.direct_note": "حدّث بيانات الدخول التجريبية عند الحاجة",
    "login.helper": "?????? ???? ??????",
    "dashboard.kpi.employees": "????????",
    "dashboard.kpi.leaves": "????? ???????",
    "dashboard.kpi.payroll": "???????",
    "dashboard.kpi.attendance": "??????",
    "common.add": "?????",
    "common.save": "???",
    "common.cancel": "?????",
    "common.edit": "?????",
    "common.delete": "???",
    "common.status": "??????",
    "common.actions": "?????????",
    "common.details": "????????",
    "common.search": "???",
    "common.filter": "?????",
    "common.submit": "?????",
    "common.close": "?????",
    "common.view": "???",
    "employees.title": "????????",
    "employees.add": "????? ????",
    "employees.details": "?????? ??????",
    "leaves.title": "????? ???????",
    "payroll.title": "???????",
    "attendance.title": "??????",
    "departments.title": "???????",
    "positions.title": "???????",
    "reports.title": "????????",
    "settings.title": "?????????",
    "profile.title": "????? ??????"
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
  applyLanguage();
  applyTheme();
}

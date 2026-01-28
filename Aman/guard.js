import { STORAGE_KEYS, ROLE_PERMISSIONS, DEFAULT_LANGUAGE } from "../app.config.js";
import { getStoredProfile } from "./auth.js";

export function getRole() {
  return localStorage.getItem(STORAGE_KEYS.role);
}

export function getUserProfile() {
  const localUser = localStorage.getItem(STORAGE_KEYS.user);
  if (localUser) return JSON.parse(localUser);

  return getStoredProfile(); // Firebase later
}


export function isAuthenticated() {
  const session = localStorage.getItem(STORAGE_KEYS.session) === "1";
  const role = localStorage.getItem(STORAGE_KEYS.role);
  const user = localStorage.getItem(STORAGE_KEYS.user);

  return session && !!role && !!user;
}

export function canAccess(pageKey, role = getRole()) {
  const allowed = ROLE_PERMISSIONS[role] || [];
  return allowed.includes(pageKey);
}

export function enforceAuth(pageKey) {
  if (!isAuthenticated()) {
    const demoProfile = {
      uid: "demo-user",
      name: "Demo User",
      email: "demo@local",
      role: "super_admin",
      departmentId: "",
      managerId: ""
    };
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(demoProfile));
    localStorage.setItem(STORAGE_KEYS.role, demoProfile.role);
    localStorage.setItem(STORAGE_KEYS.session, "1");
  }
  if (pageKey && !canAccess(pageKey)) {
    window.location.href = "dashboard.html";
    return false;
  }
  return true;
}

export function enforceLanguage() {
  const lang = localStorage.getItem(STORAGE_KEYS.lang) || DEFAULT_LANGUAGE;
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
}

export function requireRoles(roles = []) {
  const role = getRole();
  return roles.includes(role);
}

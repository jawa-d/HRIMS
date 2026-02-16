import { STORAGE_KEYS, ROLE_PERMISSIONS, MENU_ITEMS, DEFAULT_LANGUAGE } from "../app.config.js";
import { getStoredProfile } from "./auth.js";

function parseStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function getRole() {
  return localStorage.getItem(STORAGE_KEYS.role);
}

export function getUserProfile() {
  const localUser = localStorage.getItem(STORAGE_KEYS.user);
  if (localUser) return JSON.parse(localUser);

  return getStoredProfile(); // Firebase later
}

export function getAllowedPages(role = getRole(), profile = getUserProfile()) {
  const roleVisibility = parseStorage(STORAGE_KEYS.roleVisibility, {});
  const userPermissions = parseStorage(STORAGE_KEYS.userPermissions, {});

  const roleBase = roleVisibility?.[role] || ROLE_PERMISSIONS[role] || [];
  const uid = profile?.uid || "";
  const userCustom = uid ? userPermissions?.[uid] : null;

  if (uid && Object.prototype.hasOwnProperty.call(userPermissions, uid) && Array.isArray(userCustom)) {
    return Array.from(new Set(userCustom));
  }
  return Array.from(new Set(roleBase));
}


export function isAuthenticated() {
  const session = localStorage.getItem(STORAGE_KEYS.session) === "1";
  const role = localStorage.getItem(STORAGE_KEYS.role);
  const user = localStorage.getItem(STORAGE_KEYS.user);

  return session && !!role && !!user;
}

export function canAccess(pageKey, role = getRole(), profile = getUserProfile()) {
  const allowed = getAllowedPages(role, profile);
  return allowed.includes(pageKey);
}

export function getDefaultPage(role = getRole(), profile = getUserProfile()) {
  const allowed = getAllowedPages(role, profile);
  const firstMenu = MENU_ITEMS.find((item) => allowed.includes(item.key));
  return firstMenu?.href || "dashboard.html";
}

export function enforceAuth(pageKey) {
  if (!isAuthenticated()) {
    const returnTo = window.location.pathname.split("/").pop() || "dashboard.html";
    window.location.href = `login.html?next=${encodeURIComponent(returnTo)}`;
    return false;
  }
  if (pageKey && !canAccess(pageKey)) {
    window.location.href = getDefaultPage();
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

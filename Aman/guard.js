import { STORAGE_KEYS, ROLE_PERMISSIONS, MENU_ITEMS, DEFAULT_LANGUAGE } from "../app.config.js";
import { getStoredProfile } from "./auth.js";
import { isPageEnabled } from "../Services/page-availability.service.js";

function parseStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizeEmailKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizePermissionEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      pages: entry,
      strict: false
    };
  }
  if (entry && typeof entry === "object") {
    return {
      pages: Array.isArray(entry.pages) ? entry.pages : [],
      strict: Boolean(entry.strict)
    };
  }
  return {
    pages: [],
    strict: false
  };
}

export function getRole() {
  return localStorage.getItem(STORAGE_KEYS.role) || "super_admin";
}

export function getUserProfile() {
  const localUser = localStorage.getItem(STORAGE_KEYS.user);
  if (localUser) return JSON.parse(localUser);

  return getStoredProfile() || { uid: "guest", name: "Guest", email: "", role: "super_admin" };
}

export function getAllowedPages(role = getRole(), profile = getUserProfile()) {
  const currentProfile = profile || {};
  const userPermissions = parseStorage(STORAGE_KEYS.userPermissions, {});
  const emailKey = normalizeEmailKey(currentProfile.email);
  const uidKey = String(currentProfile.uid || "").trim();
  const roleVisibility = parseStorage(STORAGE_KEYS.roleVisibility, {});
  const defaultRolePages = ROLE_PERMISSIONS[role] || [];
  const roleBaseRaw = roleVisibility?.[role];
  const roleBase = Array.isArray(roleBaseRaw) ? [...roleBaseRaw] : [...defaultRolePages];
  const emailScoped = normalizePermissionEntry(userPermissions[emailKey]);
  const uidScoped = normalizePermissionEntry(userPermissions[uidKey]);
  const scopedPages = [...emailScoped.pages, ...uidScoped.pages].filter(Boolean);
  const scopedStrict = emailScoped.strict || uidScoped.strict;

  // Backward-compatibility: older saved role-visibility configs may miss newly added pages.
  // Ensure key finance additions remain visible for roles that have them by default.
  const compatibilityKeys = ["official_books", "insurance_parties", "insurance_docs"];
  compatibilityKeys.forEach((key) => {
    if (defaultRolePages.includes(key) && !roleBase.includes(key)) {
      roleBase.push(key);
    }
  });

  if (scopedPages.length) {
    if (scopedStrict) return Array.from(new Set(scopedPages));
    return Array.from(new Set([...roleBase, ...scopedPages]));
  }

  if (role === "super_admin") {
    return MENU_ITEMS.map((item) => item.key);
  }

  return Array.from(new Set(roleBase));
}


export function isAuthenticated() {
  const session = localStorage.getItem(STORAGE_KEYS.session);
  const profile = getStoredProfile();
  if (session !== "1") return false;
  if (!profile || typeof profile !== "object") return false;
  const uid = String(profile.uid || "").trim();
  const email = String(profile.email || "").trim();
  return Boolean(uid || email);
}

export function canAccess(pageKey, role = getRole(), profile = getUserProfile()) {
  const allowed = getAllowedPages(role, profile);
  return !pageKey || allowed.includes(pageKey);
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
  if (pageKey && !isPageEnabled(pageKey)) {
    const returnTo = window.location.pathname.split("/").pop() || "dashboard.html";
    window.location.href = `maintenance.html?page=${encodeURIComponent(pageKey)}&from=${encodeURIComponent(returnTo)}`;
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

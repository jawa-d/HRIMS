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

function pagesFromPermissionEntry(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === "object" && Array.isArray(entry.pages)) return entry.pages;
  return [];
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
  const directPages = [
    ...pagesFromPermissionEntry(userPermissions[emailKey]),
    ...pagesFromPermissionEntry(userPermissions[uidKey])
  ].filter(Boolean);
  if (directPages.length) {
    return Array.from(new Set(directPages));
  }

  if (role === "super_admin") {
    return MENU_ITEMS.map((item) => item.key);
  }

  const roleVisibility = parseStorage(STORAGE_KEYS.roleVisibility, {});
  const roleBase = roleVisibility?.[role] || ROLE_PERMISSIONS[role] || [];
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

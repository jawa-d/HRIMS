import { ACTION_PERMISSIONS } from "../app.config.js";
import { getUserProfile } from "../Aman/guard.js";

const USER_PERMISSIONS_KEY = "hrms_user_permissions";

function allowedFor(role, entity) {
  const roleConfig = ACTION_PERMISSIONS[role] || {};
  const direct = roleConfig[entity];
  return Array.isArray(direct) ? direct : [];
}

function readUserPermissions() {
  try {
    const raw = localStorage.getItem(USER_PERMISSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function normalizeEmailKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function actionsFromPermissionEntry(entry, entity) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const actionsMap = entry.actions;
  if (!actionsMap || typeof actionsMap !== "object") return [];
  const actions = actionsMap[entity];
  return Array.isArray(actions) ? actions : [];
}

function resolveUserActionPermissions(entity) {
  const profile = getUserProfile() || {};
  const store = readUserPermissions();
  const emailKey = normalizeEmailKey(profile.email);
  const uidKey = String(profile.uid || "").trim();
  const merged = [
    ...actionsFromPermissionEntry(store[emailKey], entity),
    ...actionsFromPermissionEntry(store[uidKey], entity)
  ].filter(Boolean);
  return Array.from(new Set(merged));
}

export function canDo({ role, entity, action }) {
  if (!role || !entity || !action) return false;
  const userAllowed = resolveUserActionPermissions(entity);
  if (userAllowed.includes("*") || userAllowed.includes(action)) return true;
  const allowed = allowedFor(role, entity);
  return allowed.includes("*") || allowed.includes(action);
}

export function listAllowedActions({ role, entity }) {
  if (!role || !entity) return [];
  const userAllowed = resolveUserActionPermissions(entity);
  if (userAllowed.includes("*")) return ["*"];
  if (userAllowed.length) return userAllowed;
  const allowed = allowedFor(role, entity);
  if (allowed.includes("*")) return ["*"];
  return Array.from(new Set(allowed));
}

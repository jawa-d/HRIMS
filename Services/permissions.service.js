import { ACTION_PERMISSIONS } from "../app.config.js";

function allowedFor(role, entity) {
  const roleConfig = ACTION_PERMISSIONS[role] || {};
  const direct = roleConfig[entity];
  return Array.isArray(direct) ? direct : [];
}

export function canDo({ role, entity, action }) {
  if (!role || !entity || !action) return false;
  const allowed = allowedFor(role, entity);
  return allowed.includes("*") || allowed.includes(action);
}

export function listAllowedActions({ role, entity }) {
  if (!role || !entity) return [];
  const allowed = allowedFor(role, entity);
  if (allowed.includes("*")) return ["*"];
  return Array.from(new Set(allowed));
}

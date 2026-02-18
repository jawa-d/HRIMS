import { STORAGE_KEYS } from "../app.config.js";

const MAX_EVENTS = 200;
let initialized = false;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value.slice(0, MAX_EVENTS)));
}

export function trackUxEvent(event) {
  if (!event || typeof event !== "object") return;
  const current = read(STORAGE_KEYS.uxAnalytics);
  const payload = {
    at: Date.now(),
    page: document.body?.dataset?.page || "unknown",
    ...event
  };
  write(STORAGE_KEYS.uxAnalytics, [payload, ...current]);
}

export function listUxEvents(limit = 50) {
  return read(STORAGE_KEYS.uxAnalytics).slice(0, Math.max(1, limit));
}

export function listUiErrors(limit = 50) {
  return read(STORAGE_KEYS.uiErrors).slice(0, Math.max(1, limit));
}

function pushUiError(payload) {
  const current = read(STORAGE_KEYS.uiErrors);
  write(STORAGE_KEYS.uiErrors, [{ at: Date.now(), ...payload }, ...current]);
}

export function initTelemetry() {
  if (initialized) return;
  initialized = true;

  window.addEventListener("error", (event) => {
    pushUiError({
      type: "error",
      message: event?.message || "Unknown script error",
      source: event?.filename || "",
      line: event?.lineno || 0,
      column: event?.colno || 0,
      page: document.body?.dataset?.page || "unknown"
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    pushUiError({
      type: "unhandledrejection",
      message: reason?.message || String(reason || "Unhandled rejection"),
      page: document.body?.dataset?.page || "unknown"
    });
  });
}

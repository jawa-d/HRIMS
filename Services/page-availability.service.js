import { STORAGE_KEYS, MENU_ITEMS } from "../app.config.js";

const IMMUTABLE_PAGES = new Set(["dashboard", "settings", "page_admin"]);
const SENSITIVE_PAGES = new Set(["security_center", "security_map", "notifications_center", "settings"]);
const MANAGED_PAGE_KEYS = new Set(MENU_ITEMS.map((item) => item.key));
const SYSTEM_ACTOR = {
  uid: "system",
  name: "System Scheduler",
  role: "system",
  email: ""
};

function normalizeDateInput(value) {
  if (!value) return "";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return "";
  return new Date(ts).toISOString();
}

function normalizeActor(actor = {}) {
  return {
    uid: actor.uid || "",
    name: actor.name || "",
    role: actor.role || "",
    email: actor.email || ""
  };
}

function normalizeRecord(raw, fallbackEnabled = true) {
  if (typeof raw === "boolean") {
    return {
      enabled: raw,
      reason: "",
      pauseAt: "",
      resumeAt: "",
      updatedAt: 0,
      updatedBy: null
    };
  }
  const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : fallbackEnabled;
  return {
    enabled,
    reason: typeof raw?.reason === "string" ? raw.reason.trim() : "",
    pauseAt: normalizeDateInput(raw?.pauseAt),
    resumeAt: normalizeDateInput(raw?.resumeAt),
    updatedAt: Number(raw?.updatedAt || 0),
    updatedBy: raw?.updatedBy && typeof raw.updatedBy === "object" ? normalizeActor(raw.updatedBy) : null
  };
}

function readAvailabilityMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pageAvailability);
    const parsed = raw ? JSON.parse(raw) : {};
    const source = parsed && typeof parsed === "object" ? parsed : {};
    const normalized = {};
    Object.keys(source).forEach((key) => {
      normalized[key] = normalizeRecord(source[key], true);
    });
    return normalized;
  } catch (_) {
    return {};
  }
}

function writeAvailabilityMap(map) {
  localStorage.setItem(STORAGE_KEYS.pageAvailability, JSON.stringify(map));
}

export function isImmutablePage(pageKey) {
  return IMMUTABLE_PAGES.has(pageKey);
}

export function isSensitivePage(pageKey) {
  return SENSITIVE_PAGES.has(pageKey);
}

function applySchedules(map) {
  let changed = false;
  const now = Date.now();
  const transitions = [];

  Object.keys(map).forEach((key) => {
    const record = normalizeRecord(map[key], true);
    if (isImmutablePage(key)) {
      map[key] = normalizeRecord({ ...record, enabled: true, reason: "", pauseAt: "", resumeAt: "" }, true);
      return;
    }

    const pauseTs = record.pauseAt ? Date.parse(record.pauseAt) : NaN;
    const resumeTs = record.resumeAt ? Date.parse(record.resumeAt) : NaN;

    if (record.enabled && Number.isFinite(pauseTs) && pauseTs <= now) {
      record.enabled = false;
      record.pauseAt = "";
      if (!record.reason) record.reason = "Scheduled maintenance";
      record.updatedAt = now;
      record.updatedBy = SYSTEM_ACTOR;
      transitions.push({ pageKey: key, type: "auto_paused" });
      changed = true;
    }

    if (!record.enabled && Number.isFinite(resumeTs) && resumeTs <= now) {
      record.enabled = true;
      record.reason = "";
      record.pauseAt = "";
      record.resumeAt = "";
      record.updatedAt = now;
      record.updatedBy = SYSTEM_ACTOR;
      transitions.push({ pageKey: key, type: "auto_resumed" });
      changed = true;
    }

    map[key] = record;
  });

  if (changed) {
    writeAvailabilityMap(map);
  }

  return { map, transitions, changed };
}

function getMapWithSchedules() {
  const map = readAvailabilityMap();
  return applySchedules(map).map;
}

export function isPageEnabled(pageKey) {
  if (!pageKey || !MANAGED_PAGE_KEYS.has(pageKey) || isImmutablePage(pageKey)) return true;
  const map = getMapWithSchedules();
  const record = normalizeRecord(map[pageKey], true);
  return record.enabled;
}

export function canManagePage(pageKey, role) {
  if (!role || isImmutablePage(pageKey)) return false;
  if (role === "super_admin") return true;
  if (role === "hr_admin") return !isSensitivePage(pageKey);
  return false;
}

export function getPageControl(pageKey) {
  if (!pageKey || !MANAGED_PAGE_KEYS.has(pageKey)) return null;
  const map = getMapWithSchedules();
  const record = normalizeRecord(map[pageKey], true);
  return {
    pageKey,
    immutable: isImmutablePage(pageKey),
    sensitive: isSensitivePage(pageKey),
    ...record
  };
}

export function setPageEnabled(pageKey, enabled, options = {}) {
  if (!pageKey || !MANAGED_PAGE_KEYS.has(pageKey) || isImmutablePage(pageKey)) return false;
  const map = getMapWithSchedules();
  const current = normalizeRecord(map[pageKey], true);
  const now = Date.now();
  const actor = normalizeActor(options.actor || {});
  const normalizedReason = (options.reason || "").trim();
  const normalizedPauseAt = normalizeDateInput(options.pauseAt);
  const normalizedResumeAt = normalizeDateInput(options.resumeAt);

  const next = {
    ...current,
    enabled: Boolean(enabled),
    updatedAt: now,
    updatedBy: actor
  };

  if (next.enabled) {
    next.pauseAt = normalizedPauseAt || "";
    if (next.pauseAt) {
      next.reason = normalizedReason;
      next.resumeAt = normalizedResumeAt || "";
    } else {
      next.reason = "";
      next.resumeAt = "";
    }
  } else {
    next.reason = normalizedReason;
    next.pauseAt = "";
    next.resumeAt = normalizedResumeAt || "";
  }

  if (next.pauseAt && next.resumeAt) {
    const pauseTs = Date.parse(next.pauseAt);
    const resumeTs = Date.parse(next.resumeAt);
    if (Number.isFinite(pauseTs) && Number.isFinite(resumeTs) && resumeTs <= pauseTs) {
      return false;
    }
  }

  map[pageKey] = next;
  writeAvailabilityMap(map);
  return true;
}

export function listPageAvailability() {
  const map = getMapWithSchedules();
  return MENU_ITEMS.map((item) => ({
    ...item,
    immutable: isImmutablePage(item.key),
    sensitive: isSensitivePage(item.key),
    ...normalizeRecord(map[item.key], true),
    enabled: isImmutablePage(item.key) ? true : normalizeRecord(map[item.key], true).enabled
  }));
}

export function collectScheduleTransitions() {
  const map = readAvailabilityMap();
  return applySchedules(map).transitions;
}

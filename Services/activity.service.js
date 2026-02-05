import { STORAGE_KEYS } from "../app.config.js";

const ACTIVITY_STORAGE_KEY = "hrms_recent_activity";
const MAX_ACTIVITIES = 40;

function getCurrentUserId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) return "guest";
    const profile = JSON.parse(raw);
    return profile?.uid || profile?.email || "guest";
  } catch {
    return "guest";
  }
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(store));
}

export function listRecentActivities(limit = 8) {
  const userId = getCurrentUserId();
  const store = readStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  return list.slice(0, Math.max(1, limit));
}

export function trackActivity({ title, subtitle = "", href = "", pageKey = "", kind = "event" }) {
  if (!title) return;
  const userId = getCurrentUserId();
  const store = readStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const now = Date.now();

  const candidate = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(title).slice(0, 80),
    subtitle: String(subtitle).slice(0, 140),
    href,
    pageKey,
    kind,
    at: now
  };

  const recent = list[0];
  const isDuplicate =
    recent &&
    recent.title === candidate.title &&
    recent.subtitle === candidate.subtitle &&
    recent.pageKey === candidate.pageKey &&
    now - Number(recent.at || 0) < 5000;

  if (isDuplicate) return;

  store[userId] = [candidate, ...list].slice(0, MAX_ACTIVITIES);
  writeStore(store);
}

export function formatActivityTime(timestamp) {
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - Number(timestamp || now)) / 1000));
  if (diffSec < 60) return "Now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

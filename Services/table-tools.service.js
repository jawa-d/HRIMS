import { STORAGE_KEYS } from "../app.config.js";

function readPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tablePrefs);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writePrefs(all) {
  localStorage.setItem(STORAGE_KEYS.tablePrefs, JSON.stringify(all));
}

export function saveTablePrefs(key, value) {
  if (!key) return;
  const all = readPrefs();
  all[key] = value;
  writePrefs(all);
}

export function getTablePrefs(key, fallback = {}) {
  if (!key) return fallback;
  const all = readPrefs();
  const value = all[key];
  if (!value || typeof value !== "object") return fallback;
  return { ...fallback, ...value };
}

export function paginate(items = [], page = 1, pageSize = 10) {
  const safeSize = Math.max(1, Number(pageSize) || 10);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (safePage - 1) * safeSize;
  const end = start + safeSize;
  return {
    page: safePage,
    pages,
    pageSize: safeSize,
    total,
    items: items.slice(start, end)
  };
}

function escapeCsvCell(value) {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, "\"\"")}"`;
  return raw;
}

export function exportRowsToCsv({ rows = [], columns = [], filename = "export.csv" }) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(columns) || !columns.length) return false;
  const header = columns.map((col) => escapeCsvCell(col.label || col.key || "")).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCsvCell(row[col.key])).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

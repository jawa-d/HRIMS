import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listSecurityEvents } from "../Services/security-audit.service.js";
import { listUiErrors, listUxEvents } from "../Services/telemetry.service.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { enforceAdminPagesCode } from "../Services/admin-lock.service.js";

if (!enforceAuth("security_center")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();

if (!enforceAdminPagesCode({ role, user, pageLabel: "Security Center" })) {
  throw new Error("Admin pages code required");
}

renderNavbar({ user, role });
renderSidebar("security_center");

const searchInput = document.getElementById("sec-search");
const severityFilter = document.getElementById("sec-severity");
const statusFilter = document.getElementById("sec-status");
const totalEl = document.getElementById("sec-total");
const failuresEl = document.getElementById("sec-failures");
const highEl = document.getElementById("sec-high");
const actorsEl = document.getElementById("sec-actors");
const countEl = document.getElementById("sec-count");
const bodyEl = document.getElementById("sec-body");
const emptyEl = document.getElementById("sec-empty");

let events = [];

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value = "") {
  return normalizeText(value).replaceAll("-", "_").replaceAll(" ", "_");
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function eventAccent(item = {}) {
  const source = item.action || item.actorEmail || item.actorUid || item.entity || "";
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function formatTime(ms) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function within24h(ms) {
  if (!ms) return false;
  return Date.now() - ms <= 24 * 60 * 60 * 1000;
}

function updateKpis(items) {
  totalEl.textContent = String(items.length);
  failuresEl.textContent = String(items.filter((item) => normalizeStatus(item.action) === "login_failed" && within24h(item.createdAt)).length);
  highEl.textContent = String(items.filter((item) => ["critical", "warning"].includes(normalizeStatus(item.severity))).length);
  const actorSet = new Set(items.map((item) => item.actorUid || item.actorEmail).filter(Boolean));
  actorsEl.textContent = String(actorSet.size);
}

function applyFilters() {
  const q = normalizeText(searchInput.value);
  const severity = normalizeStatus(severityFilter.value);
  const status = normalizeStatus(statusFilter.value);

  const filtered = events.filter((item) => {
    const itemSeverity = normalizeStatus(item.severity);
    const itemStatus = normalizeStatus(item.status);
    const hitSearch =
      !q ||
      `${item.action || ""} ${item.actorEmail || ""} ${item.message || ""} ${item.entity || ""}`.toLowerCase().includes(q);
    const hitSeverity = !severity || itemSeverity === severity;
    const hitStatus = !status || itemStatus === status;
    return hitSearch && hitSeverity && hitStatus;
  });

  countEl.textContent = String(filtered.length);
  bodyEl.innerHTML = filtered
    .map((item, index) => `
      <tr class="sec-row" style="--sec-accent:${eventAccent(item)};--row-index:${index}">
        <td>${formatTime(item.createdAt)}</td>
        <td>${item.action || "-"}</td>
        <td>${item.actorEmail || item.actorUid || "-"}</td>
        <td><span class="badge sev-${normalizeStatus(item.severity || "info")}">${normalizeStatus(item.severity || "info")}</span></td>
        <td><span class="badge st-${normalizeStatus(item.status || "success")}">${normalizeStatus(item.status || "success")}</span></td>
        <td>${item.message || "-"}</td>
      </tr>
    `)
    .join("");

  emptyEl.classList.toggle("hidden", filtered.length > 0);
}

async function loadEvents() {
  try {
    const [securityEvents, uiErrors, uxEvents] = await Promise.all([
      listSecurityEvents(),
      Promise.resolve(listUiErrors(120)),
      Promise.resolve(listUxEvents(120))
    ]);
    const mappedUiErrors = uiErrors.map((item) => ({
      action: "ui_error",
      actorEmail: "-",
      severity: "warning",
      status: "failed",
      message: item.message || "UI error",
      entity: item.page || "ui",
      createdAt: item.at || 0
    }));
    const mappedUxEvents = uxEvents.map((item) => ({
      action: item.event || "ux_event",
      actorEmail: "-",
      severity: "info",
      status: "success",
      message: `${item.module || "app"} :: ${item.page || "unknown"}`,
      entity: "ux",
      createdAt: item.at || 0
    }));
    events = [...securityEvents, ...mappedUiErrors, ...mappedUxEvents].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    updateKpis(events);
    applyFilters();
  } catch (error) {
    console.error("Load security events failed:", error);
    events = [];
    updateKpis(events);
    applyFilters();
    showToast("error", "Could not load security events");
  }
}

searchInput.addEventListener("input", applyFilters);
severityFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);

trackUxEvent({ event: "page_open", module: "security_center" });
loadEvents();

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { listSecurityEvents } from "../Services/security-audit.service.js";
import { listUiErrors, listUxEvents } from "../Services/telemetry.service.js";

if (!enforceAuth("security_center")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
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
  failuresEl.textContent = String(items.filter((item) => item.action === "login_failed" && within24h(item.createdAt)).length);
  highEl.textContent = String(items.filter((item) => item.severity === "critical" || item.severity === "warning").length);
  const actorSet = new Set(items.map((item) => item.actorUid || item.actorEmail).filter(Boolean));
  actorsEl.textContent = String(actorSet.size);
}

function applyFilters() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const severity = severityFilter.value || "";
  const status = statusFilter.value || "";

  const filtered = events.filter((item) => {
    const hitSearch =
      !q ||
      `${item.action || ""} ${item.actorEmail || ""} ${item.message || ""} ${item.entity || ""}`.toLowerCase().includes(q);
    const hitSeverity = !severity || item.severity === severity;
    const hitStatus = !status || item.status === status;
    return hitSearch && hitSeverity && hitStatus;
  });

  countEl.textContent = String(filtered.length);
  bodyEl.innerHTML = filtered
    .map((item) => `
      <tr>
        <td>${formatTime(item.createdAt)}</td>
        <td>${item.action || "-"}</td>
        <td>${item.actorEmail || item.actorUid || "-"}</td>
        <td><span class="badge sev-${item.severity || "info"}">${item.severity || "info"}</span></td>
        <td><span class="badge st-${item.status || "success"}">${item.status || "success"}</span></td>
        <td>${item.message || "-"}</td>
      </tr>
    `)
    .join("");

  emptyEl.classList.toggle("hidden", filtered.length > 0);
}

async function loadEvents() {
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
}

searchInput.addEventListener("input", applyFilters);
severityFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);

loadEvents();

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

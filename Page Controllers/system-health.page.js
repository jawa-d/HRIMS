import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { loadSystemHealthData } from "../Services/system-health.service.js";
import { enforceAdminPagesCode } from "../Services/admin-lock.service.js";

if (!enforceAuth("system_health")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();

if (!enforceAdminPagesCode({ role, user, pageLabel: "System Health" })) {
  throw new Error("Admin pages code required");
}

renderNavbar({ user, role });
renderSidebar("system_health");

const stateEl = document.getElementById("health-firebase-state");
const stateDetailEl = document.getElementById("health-firebase-detail");
const latencyEl = document.getElementById("health-latency");
const uiErrorsCountEl = document.getElementById("health-ui-errors-count");
const pausedPagesEl = document.getElementById("health-paused-pages");
const refreshedEl = document.getElementById("health-refresh-time");
const errorsTableEl = document.getElementById("health-errors-table");
const pageOpsTableEl = document.getElementById("health-page-ops-table");
const refreshBtn = document.getElementById("health-refresh-btn");

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function normalizePageAction(action = "") {
  const map = {
    page_availability_paused: "Paused",
    page_availability_resumed: "Resumed",
    page_availability_schedule_updated: "Schedule Updated",
    page_availability_auto_paused: "Auto Paused",
    page_availability_auto_resumed: "Auto Resumed"
  };
  return map[action] || action || "-";
}

function renderUiErrors(items = []) {
  errorsTableEl.innerHTML = `
    <thead>
      <tr>
        <th>${t("system_health.time")}</th>
        <th>${t("system_health.type")}</th>
        <th>${t("system_health.page")}</th>
        <th>${t("system_health.message")}</th>
      </tr>
    </thead>
    <tbody>
      ${
        items.length
          ? items
              .slice(0, 10)
              .map(
                (item) => `
                <tr>
                  <td>${formatTime(item.at)}</td>
                  <td>${item.type || "-"}</td>
                  <td>${item.page || "-"}</td>
                  <td>${item.message || "-"}</td>
                </tr>
              `
              )
              .join("")
          : `<tr><td colspan="4" class="text-muted">${t("system_health.empty")}</td></tr>`
      }
    </tbody>
  `;
}

function renderPageOps(items = []) {
  pageOpsTableEl.innerHTML = `
    <thead>
      <tr>
        <th>${t("system_health.time")}</th>
        <th>${t("system_health.page")}</th>
        <th>${t("system_health.action")}</th>
        <th>${t("system_health.actor")}</th>
      </tr>
    </thead>
    <tbody>
      ${
        items.length
          ? items
              .map(
                (item) => `
                <tr>
                  <td>${formatTime(item.createdAt)}</td>
                  <td>${item.entityId || "-"}</td>
                  <td>${normalizePageAction(item.action)}</td>
                  <td>${item.actorEmail || item.actorUid || "-"}</td>
                </tr>
              `
              )
              .join("")
          : `<tr><td colspan="4" class="text-muted">${t("system_health.empty")}</td></tr>`
      }
    </tbody>
  `;
}

function renderFirebaseState(firebase) {
  const statusClass = firebase?.state || "offline";
  const label = firebase?.label || "-";
  stateEl.innerHTML = `<span class="badge health-state ${statusClass}">${label}</span>`;
  stateDetailEl.textContent = firebase?.detail || "";
  latencyEl.textContent = `${firebase?.latencyMs ?? "-"} ms`;
}

async function refreshHealth(showSuccess = false) {
  refreshBtn.disabled = true;
  try {
    const data = await loadSystemHealthData();
    renderFirebaseState(data.firebase);
    uiErrorsCountEl.textContent = String(data.uiErrors.length);
    pausedPagesEl.textContent = String(data.pageStates.filter((item) => !item.enabled).length);
    refreshedEl.textContent = `${t("system_health.last_refresh")}: ${formatTime(data.refreshedAt)}`;
    renderUiErrors(data.uiErrors);
    renderPageOps(data.pageOps);
    if (showSuccess) showToast("success", t("system_health.refreshed"));
  } catch (error) {
    showToast("error", error?.message || t("system_health.load_failed"));
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn?.addEventListener("click", () => refreshHealth(true));
refreshHealth();
setInterval(() => {
  refreshHealth(false);
}, 30000);

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

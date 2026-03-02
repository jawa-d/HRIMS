import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { canDo } from "../Services/permissions.service.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  unarchiveNotification,
  watchNotifications
} from "../Services/notifications.service.js";
import { logSecurityEvent } from "../Services/security-audit.service.js";

if (!enforceAuth("notifications_center")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();

renderNavbar({ user, role });
renderSidebar("notifications_center");

const canMarkAll = canDo({ role, entity: "notifications", action: "mark_all" });

const searchInput = document.getElementById("notif-search");
const statusFilter = document.getElementById("notif-status-filter");
const typeFilter = document.getElementById("notif-type-filter");
const priorityFilter = document.getElementById("notif-priority-filter");
const archivedToggle = document.getElementById("notif-archived-toggle");
const markAllBtn = document.getElementById("mark-all-read-btn");
const countEl = document.getElementById("notif-count");
const listEl = document.getElementById("notif-items");
const emptyEl = document.getElementById("notif-empty");

if (!canMarkAll) markAllBtn.classList.add("hidden");

let notifications = [];
let unsubscribeNotifications = null;

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

function notificationAccent(item = {}) {
  const source = item.id || item.type || item.priority || item.title || "";
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function formatDate(item) {
  const seconds = item?.createdAt?.seconds || 0;
  if (!seconds) return "Unknown date";
  return new Date(seconds * 1000).toLocaleString();
}

function priorityLabel(priority = "medium") {
  return t(`notifications.priority.${priority}`) || priority;
}

function applyFilters() {
  const q = normalizeText(searchInput.value);
  const status = normalizeText(statusFilter.value);
  const type = normalizeStatus(typeFilter.value);
  const priority = normalizeStatus(priorityFilter.value);

  const filtered = notifications.filter((item) => {
    const itemType = normalizeStatus(item.type || "system");
    const itemPriority = normalizeStatus(item.priority || "medium");
    const hitSearch =
      !q ||
      `${item.title || ""} ${item.body || ""} ${item.type || ""}`.toLowerCase().includes(q);
    const hitStatus =
      !status ||
      (status === "unread" && item.isRead !== true) ||
      (status === "read" && item.isRead === true);
    const hitType = !type || itemType === type;
    const hitPriority = !priority || itemPriority === priority;
    return hitSearch && hitStatus && hitType && hitPriority;
  });

  countEl.textContent = String(filtered.length);
  listEl.innerHTML = filtered
    .map((item, index) => {
      const isArchived = item.isArchived === true;
      const typeLabel = normalizeStatus(item.type || "system");
      const priority = normalizeStatus(item.priority || "medium");
      const href = item.actionHref || "";
      const openButton = href ? `<a class="btn btn-ghost" href="${href}">${t("notifications.open_entity")}</a>` : "";
      return `
        <article class="notif-item ${item.isRead ? "" : "is-unread"}" style="--notif-accent:${notificationAccent(item)};--row-index:${index}">
          <div class="notif-head">
            <strong>${item.title || "Notification"}</strong>
            <div class="notif-meta">
              <span class="badge notif-type-${typeLabel}">${typeLabel}</span>
              <span class="badge notif-priority-${priority}">P:${priorityLabel(priority)}</span>
              <span class="text-muted">${formatDate(item)}</span>
            </div>
          </div>
          <div class="text-muted">${item.body || ""}</div>
          <div class="notif-actions">
            ${openButton}
            ${item.isRead ? "" : `<button class="btn btn-ghost" data-action="read" data-id="${item.id}">${t("notifications.mark_read")}</button>`}
            ${
              isArchived
                ? `<button class="btn btn-ghost" data-action="unarchive" data-id="${item.id}">Unarchive</button>`
                : `<button class="btn btn-ghost" data-action="archive" data-id="${item.id}">Archive</button>`
            }
          </div>
        </article>
      `;
    })
    .join("");

  emptyEl.classList.toggle("hidden", filtered.length > 0);

  listEl.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const action = button.dataset.action;
        const id = button.dataset.id;
        if (action === "read") await markNotificationRead(id);
        if (action === "archive") await archiveNotification(id);
        if (action === "unarchive") await unarchiveNotification(id);
        await loadNotifications();
      } catch (error) {
        console.error("Notification action failed:", error);
        showToast("error", "Notification action failed");
      }
    });
  });
}

async function loadNotifications() {
  try {
    const includeArchived = archivedToggle.checked;
    notifications = await listNotifications({ includeArchived });
    applyFilters();
  } catch (error) {
    console.error("Load notifications failed:", error);
    notifications = [];
    applyFilters();
    showToast("error", "Could not load notifications");
  }
}

function stopRealtimeNotifications() {
  if (typeof unsubscribeNotifications === "function") {
    unsubscribeNotifications();
    unsubscribeNotifications = null;
  }
}

function startRealtimeNotifications() {
  const includeArchived = archivedToggle.checked;
  stopRealtimeNotifications();
  unsubscribeNotifications = watchNotifications(
    (items) => {
      notifications = items;
      applyFilters();
    },
    { includeArchived }
  );
}

markAllBtn.addEventListener("click", async () => {
  try {
    await markAllNotificationsRead();
    await logSecurityEvent({
      action: "notifications_mark_all_read",
      severity: "info",
      status: "success",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      entity: "notifications",
      message: "Marked all notifications as read."
    });
    showToast("success", "All notifications marked as read");
    await loadNotifications();
  } catch (error) {
    console.error("Mark all notifications failed:", error);
    showToast("error", "Failed to mark all notifications");
  }
});

searchInput.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);
typeFilter.addEventListener("change", applyFilters);
priorityFilter.addEventListener("change", applyFilters);
archivedToggle.addEventListener("change", loadNotifications);
archivedToggle.addEventListener("change", startRealtimeNotifications);

window.addEventListener("beforeunload", () => {
  stopRealtimeNotifications();
});

trackUxEvent({ event: "page_open", module: "notifications_center" });
loadNotifications();
startRealtimeNotifications();

if (window.lucide?.createIcons) window.lucide.createIcons();

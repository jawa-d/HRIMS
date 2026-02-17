import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  unarchiveNotification
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

const searchInput = document.getElementById("notif-search");
const statusFilter = document.getElementById("notif-status-filter");
const typeFilter = document.getElementById("notif-type-filter");
const archivedToggle = document.getElementById("notif-archived-toggle");
const markAllBtn = document.getElementById("mark-all-read-btn");
const countEl = document.getElementById("notif-count");
const listEl = document.getElementById("notif-items");
const emptyEl = document.getElementById("notif-empty");

let notifications = [];

function formatDate(item) {
  const seconds = item?.createdAt?.seconds || 0;
  if (!seconds) return "Unknown date";
  return new Date(seconds * 1000).toLocaleString();
}

function applyFilters() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const status = statusFilter.value || "";
  const type = typeFilter.value || "";
  const filtered = notifications.filter((item) => {
    const hitSearch =
      !q ||
      `${item.title || ""} ${item.body || ""} ${item.type || ""}`.toLowerCase().includes(q);
    const hitStatus =
      !status ||
      (status === "unread" && item.isRead !== true) ||
      (status === "read" && item.isRead === true);
    const hitType = !type || (item.type || "system") === type;
    return hitSearch && hitStatus && hitType;
  });

  countEl.textContent = String(filtered.length);
  listEl.innerHTML = filtered
    .map((item) => {
      const isArchived = item.isArchived === true;
      return `
        <article class="notif-item ${item.isRead ? "" : "is-unread"}">
          <div class="notif-head">
            <strong>${item.title || "Notification"}</strong>
            <div class="notif-meta">
              <span class="badge">${item.type || "system"}</span>
              <span class="text-muted">${formatDate(item)}</span>
            </div>
          </div>
          <div class="text-muted">${item.body || ""}</div>
          <div class="notif-actions">
            ${item.isRead ? "" : `<button class="btn btn-ghost" data-action="read" data-id="${item.id}">Mark read</button>`}
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
      const action = button.dataset.action;
      const id = button.dataset.id;
      if (action === "read") await markNotificationRead(id);
      if (action === "archive") await archiveNotification(id);
      if (action === "unarchive") await unarchiveNotification(id);
      await loadNotifications();
    });
  });
}

async function loadNotifications() {
  const includeArchived = archivedToggle.checked;
  notifications = await listNotifications({ includeArchived });
  applyFilters();
}

markAllBtn.addEventListener("click", async () => {
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
});

searchInput.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);
typeFilter.addEventListener("change", applyFilters);
archivedToggle.addEventListener("change", loadNotifications);

loadNotifications();

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

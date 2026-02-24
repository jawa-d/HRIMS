import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { canDo } from "../Services/permissions.service.js";
import { createNotification } from "../Services/notifications.service.js";
import { listUsers } from "../Services/users.service.js";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  watchAnnouncements
} from "../Services/announcements.service.js";

if (!enforceAuth("announcements")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("announcements");
if (window.lucide?.createIcons) window.lucide.createIcons();

const canCreate = canDo({ role, entity: "announcements", action: "create" }) || ["super_admin", "hr_admin", "manager"].includes(role);
const canManage = canDo({ role, entity: "announcements", action: "edit" }) || ["super_admin", "hr_admin", "manager"].includes(role);
const canDelete = canDo({ role, entity: "announcements", action: "delete" }) || ["super_admin", "hr_admin"].includes(role);

const addBtn = document.getElementById("announcements-add-btn");
const searchInput = document.getElementById("ann-search");
const statusFilter = document.getElementById("ann-status");
const audienceFilter = document.getElementById("ann-audience");
const listEl = document.getElementById("ann-list");
const emptyEl = document.getElementById("ann-empty");
const kpiTotalEl = document.getElementById("ann-kpi-total");
const kpiPublishedEl = document.getElementById("ann-kpi-published");
const kpiDraftEl = document.getElementById("ann-kpi-draft");
const kpiPinnedEl = document.getElementById("ann-kpi-pinned");

if (!canCreate) addBtn.classList.add("hidden");
if (!canManage && statusFilter) statusFilter.value = "published";

let announcements = [];
let users = [];
let unsubscribeAnnouncements = null;
const COMPANY_NAME_AR = "\u0634\u0631\u0643\u0629 \u0648\u0627\u062F\u064A \u0627\u0644\u0631\u0627\u0641\u062F\u064A\u0646 \u0644\u0644\u062A\u0623\u0645\u064A\u0646 \u0627\u0644\u062A\u0643\u0627\u0641\u0644\u064A";

async function runSafely(task, fallback = null) {
  try {
    return await task();
  } catch (error) {
    console.error("Announcements operation failed:", error);
    return fallback;
  }
}

function normalizeWhatsAppNumber(value) {
  const cleaned = String(value || "").replace(/[^\d+]/g, "").trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  return cleaned;
}

function buildWhatsAppText(item = {}) {
  const recipient = String(item.whatsappRecipientName || "").trim();
  const title = String(item.title || "").trim();
  const body = String(item.body || "").trim();
  const lines = [
    "*\u0625\u0634\u0639\u0627\u0631 \u0645\u0646 \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0648\u0627\u0631\u062F \u0627\u0644\u0628\u0634\u0631\u064A\u0629*",
    `*\u0627\u0644\u062C\u0647\u0629:* ${COMPANY_NAME_AR}`,
    "",
    recipient ? `*\u0639\u0646\u0627\u064A\u0629:* ${recipient}` : "",
    title ? `*\u0627\u0644\u0645\u0648\u0636\u0648\u0639:* ${title}` : "",
    "*\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629:*",
    body || "-",
    "",
    "\u0634\u0643\u0631\u0627 \u0644\u0643\u0645",
    COMPANY_NAME_AR
  ].filter(Boolean);
  return lines.join("\n").trim();
}

async function openWhatsAppForAnnouncement(item = {}) {
  const phone = normalizeWhatsAppNumber(item.whatsappNumber);
  if (!phone) {
    showToast("error", "WhatsApp number is required");
    return;
  }

  const text = buildWhatsAppText(item);
  if (!text) {
    showToast("error", "Message is empty");
    return;
  }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function isVisibleForRole(item) {
  if (canManage) return true;
  if (item.status !== "published") return false;
  return item.audience === "all" || item.audience === role;
}

function filteredAnnouncements() {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "";
  const audience = audienceFilter?.value || "";
  return announcements
    .filter((item) => isVisibleForRole(item))
    .filter((item) => {
      const hitQuery = !query || `${item.title || ""} ${item.body || ""} ${item.authorName || ""}`.toLowerCase().includes(query);
      const hitStatus = !status || item.status === status;
      const hitAudience = !audience || item.audience === audience;
      return hitQuery && hitStatus && hitAudience;
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = a?.createdAt?.seconds || 0;
      const bTime = b?.createdAt?.seconds || 0;
      return bTime - aTime;
    });
}

function renderKpis(items) {
  kpiTotalEl.textContent = String(items.length);
  kpiPublishedEl.textContent = String(items.filter((item) => item.status === "published").length);
  kpiDraftEl.textContent = String(items.filter((item) => item.status === "draft").length);
  kpiPinnedEl.textContent = String(items.filter((item) => item.pinned).length);
}

function announcementFormContent(item = {}) {
  return `
    <label>Title<input class="input" id="ann-title" value="${item.title || ""}" /></label>
    <label>Message<textarea class="textarea" id="ann-body" rows="5">${item.body || ""}</textarea></label>
    <label>WhatsApp Number (with country code)
      <input class="input" id="ann-whatsapp-number" value="${item.whatsappNumber || ""}" placeholder="9647XXXXXXXX" />
    </label>
    <label>WhatsApp Recipient Name (optional)
      <input class="input" id="ann-whatsapp-recipient" value="${item.whatsappRecipientName || ""}" placeholder="Employee name" />
    </label>
    <label>Audience
      <select class="select" id="ann-audience-input">
        <option value="all" ${item.audience === "all" ? "selected" : ""}>All Staff</option>
        <option value="employee" ${item.audience === "employee" ? "selected" : ""}>Employees</option>
        <option value="manager" ${item.audience === "manager" ? "selected" : ""}>Managers</option>
        <option value="hr_admin" ${item.audience === "hr_admin" ? "selected" : ""}>HR Admin</option>
        <option value="super_admin" ${item.audience === "super_admin" ? "selected" : ""}>Super Admin</option>
      </select>
    </label>
    <label>Status
      <select class="select" id="ann-status-input">
        <option value="published" ${item.status === "published" ? "selected" : ""}>Published</option>
        <option value="draft" ${item.status === "draft" ? "selected" : ""}>Draft</option>
        <option value="archived" ${item.status === "archived" ? "selected" : ""}>Archived</option>
      </select>
    </label>
    <label>Expires At
      <input class="input" id="ann-expires" type="date" value="${toDateInput(item.expiresAt)}" />
    </label>
    <label><input type="checkbox" id="ann-pinned" ${item.pinned ? "checked" : ""} /> Pin this announcement</label>
    <label><input type="checkbox" id="ann-send-whatsapp" /> Send via WhatsApp now</label>
  `;
}

function collectAnnouncementForm(existing = {}) {
  const expiresRaw = document.getElementById("ann-expires").value || "";
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59`).toISOString() : "";
  return {
    ...existing,
    title: document.getElementById("ann-title").value.trim(),
    body: document.getElementById("ann-body").value.trim(),
    whatsappNumber: normalizeWhatsAppNumber(document.getElementById("ann-whatsapp-number")?.value || ""),
    whatsappRecipientName: document.getElementById("ann-whatsapp-recipient")?.value.trim() || "",
    sendWhatsAppNow: Boolean(document.getElementById("ann-send-whatsapp")?.checked),
    audience: document.getElementById("ann-audience-input").value,
    status: document.getElementById("ann-status-input").value,
    pinned: Boolean(document.getElementById("ann-pinned").checked),
    expiresAt,
    authorUid: existing.authorUid || user?.uid || "",
    authorName: existing.authorName || user?.name || user?.email || ""
  };
}

function openAnnouncementModal(item = null) {
  const isEdit = Boolean(item);
  openModal({
    title: isEdit ? "Edit Announcement" : "New Announcement",
    content: announcementFormContent(item || {}),
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectAnnouncementForm(item || {});
          if (!payload.title) {
            showToast("error", "Title is required");
            return;
          }
          if (!payload.body) {
            showToast("error", "Message is required");
            return;
          }
          if (isEdit) {
            await updateAnnouncement(item.id, payload);
            if (payload.status === "published") {
              await notifyAnnouncementPublished(payload);
            }
            if (payload.sendWhatsAppNow) {
              await openWhatsAppForAnnouncement(payload);
            }
            showToast("success", "Announcement updated");
          } else {
            await createAnnouncement(payload);
            if (payload.status === "published") {
              await notifyAnnouncementPublished(payload);
            }
            if (payload.sendWhatsAppNow) {
              await openWhatsAppForAnnouncement(payload);
            }
            showToast("success", "Announcement posted");
          }
          await loadAnnouncementsData();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const item = announcements.find((entry) => entry.id === id);
  if (!item) return;

  if (action === "edit" && canManage) {
    openAnnouncementModal(item);
    return;
  }

  if (action === "publish" && canManage) {
    await updateAnnouncement(item.id, { ...item, status: "published" });
    await notifyAnnouncementPublished({ ...item, status: "published" });
    showToast("success", "Announcement published");
    await loadAnnouncementsData();
    return;
  }

  if (action === "unpublish" && canManage) {
    await updateAnnouncement(item.id, { ...item, status: "draft" });
    showToast("success", "Announcement moved to draft");
    await loadAnnouncementsData();
    return;
  }

  if (action === "send-whatsapp" && canManage) {
    await openWhatsAppForAnnouncement(item);
    return;
  }

  if (action === "delete" && canDelete) {
    const confirmed = window.confirm("Delete this announcement?");
    if (!confirmed) return;
    await deleteAnnouncement(item.id);
    showToast("success", "Announcement deleted");
    await loadAnnouncementsData();
  }
}

function renderAnnouncements() {
  const items = filteredAnnouncements();
  listEl.innerHTML = items
    .map((item) => {
      const createdAt = item?.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleString() : "-";
      return `
      <article class="card ann-card">
        <div class="ann-card-head">
          <h3 class="ann-card-title">${item.title || "-"}</h3>
          <div class="ann-meta">
            <span class="badge ann-status-${item.status || "draft"}">${(item.status || "draft").toUpperCase()}</span>
            ${item.pinned ? `<span class="badge ann-pin">PINNED</span>` : ""}
            <span class="badge">${(item.audience || "all").toUpperCase()}</span>
          </div>
        </div>
        <p class="ann-body">${item.body || "-"}</p>
        <div class="ann-footer">
          <small class="text-muted">By ${item.authorName || "-"} • ${createdAt} • Expires: ${formatDate(item.expiresAt)}</small>
          <div class="ann-actions">
            ${
              canManage
                ? `
              <button class="btn btn-ghost" data-action="edit" data-id="${item.id}">Edit</button>
              ${item.whatsappNumber ? `<button class="btn btn-ghost" data-action="send-whatsapp" data-id="${item.id}">Send WhatsApp</button>` : ""}
              ${
                item.status === "published"
                  ? `<button class="btn btn-ghost" data-action="unpublish" data-id="${item.id}">Unpublish</button>`
                  : `<button class="btn btn-ghost" data-action="publish" data-id="${item.id}">Publish</button>`
              }
              ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${item.id}">Delete</button>` : ""}
            `
                : ""
            }
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  emptyEl.classList.toggle("hidden", items.length > 0);
  renderKpis(items);

  listEl.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void runSafely(() => handleAction(button.dataset.action, button.dataset.id), null);
    });
  });
}

async function loadAnnouncementsData() {
  announcements = await runSafely(() => listAnnouncements(), []);
  renderAnnouncements();
}

function startRealtimeAnnouncements() {
  unsubscribeAnnouncements = watchAnnouncements(
    (items) => {
      announcements = items;
      renderAnnouncements();
    },
    () => {
      void loadAnnouncementsData();
    }
  );
}

async function loadUsersData() {
  users = await runSafely(() => listUsers(), []);
}

function isTargetRole(targetRole, audience) {
  if (audience === "all") return true;
  return targetRole === audience;
}

async function notifyAnnouncementPublished(item) {
  if (item.status !== "published") return;
  const targets = users.filter((u) => isTargetRole(String(u.role || ""), item.audience || "all"));
  await Promise.all(
    targets
      .map((target) => ({ ...target, uid: target.uid || target.id || "" }))
      .filter((target) => target.uid)
      .map((target) =>
      createNotification({
        toUid: target.uid,
        title: `Announcement: ${item.title}`,
        body: (item.body || "").slice(0, 140),
        type: "announcement",
        priority: item.pinned ? "high" : "medium",
        actionHref: "announcements.html"
      })
      )
  );
}

if (addBtn) addBtn.addEventListener("click", () => openAnnouncementModal());
if (searchInput) searchInput.addEventListener("input", renderAnnouncements);
if (statusFilter) statusFilter.addEventListener("change", renderAnnouncements);
if (audienceFilter) audienceFilter.addEventListener("change", renderAnnouncements);

window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderAnnouncements();
});

window.addEventListener("beforeunload", () => {
  if (typeof unsubscribeAnnouncements === "function") unsubscribeAnnouncements();
});

(async () => {
  await runSafely(() => loadUsersData(), []);
  startRealtimeAnnouncements();
  if (!announcements.length) await runSafely(() => loadAnnouncementsData(), null);
})();

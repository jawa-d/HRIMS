import { enforceAuth, getDefaultPage, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal, closeModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import {
  listPageAvailability,
  setPageEnabled,
  canManagePage,
  collectScheduleTransitions
} from "../Services/page-availability.service.js";
import { logSecurityEvent, listSecurityEvents } from "../Services/security-audit.service.js";

if (!enforceAuth("page_admin")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();

if (!["super_admin", "hr_admin"].includes(role)) {
  showToast("error", t("page_admin.restricted"));
  window.location.href = getDefaultPage(role, user);
  throw new Error("Forbidden");
}

renderNavbar({ user, role });
renderSidebar("page_admin");

const table = document.getElementById("page-admin-table");
const auditTable = document.getElementById("page-admin-audit-table");

const actor = {
  uid: user?.uid || "",
  name: user?.name || "",
  role: role || "",
  email: user?.email || ""
};

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusBadge(item) {
  if (item.immutable) {
    return `<span class="badge page-admin-badge locked">${t("page_admin.status_locked")}</span>`;
  }
  if (item.enabled) {
    return `<span class="badge page-admin-badge running">${t("page_admin.status_running")}</span>`;
  }
  return `<span class="badge page-admin-badge paused">${t("page_admin.status_paused")}</span>`;
}

function renderReason(item) {
  if (item.enabled) {
    if (!item.pauseAt) return `<span class="text-muted">-</span>`;
    return `
      <div class="page-admin-meta">
        <span>${item.reason || t("page_admin.no_reason")}</span>
        <small>${t("page_admin.pause_at_short")}: ${formatDateTime(item.pauseAt)}</small>
        <small>${item.resumeAt ? `${t("page_admin.resume_at")}: ${formatDateTime(item.resumeAt)}` : t("page_admin.no_eta")}</small>
      </div>
    `;
  }
  return `
    <div class="page-admin-meta">
      <span>${item.reason || t("page_admin.no_reason")}</span>
      <small>${item.resumeAt ? `${t("page_admin.resume_at")}: ${formatDateTime(item.resumeAt)}` : t("page_admin.no_eta")}</small>
    </div>
  `;
}

function actionButtons(item) {
  const manageable = canManagePage(item.key, role);
  if (!manageable) {
    return `<div class="page-admin-actions"><button class="btn btn-ghost page-admin-action-btn" disabled>${t("page_admin.action_locked")}</button></div>`;
  }

  if (item.immutable) {
    return `<div class="page-admin-actions"><button class="btn btn-ghost page-admin-action-btn" disabled>${t("page_admin.action_locked")}</button></div>`;
  }

  const label = item.enabled ? t("page_admin.action_pause") : t("page_admin.action_run");
  const className = item.enabled ? "btn btn-ghost" : "btn btn-primary";
  return `
    <div class="page-admin-actions">
      <button class="${className} page-admin-action-btn" data-mode="toggle" data-key="${item.key}" data-next="${item.enabled ? "off" : "on"}">${label}</button>
      <button class="btn btn-outline page-admin-action-btn" data-mode="schedule" data-key="${item.key}">${t("page_admin.action_schedule")}</button>
    </div>
  `;
}

function toDateTimeLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeDateLocal(value) {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
}

function parseScheduleForm() {
  const reason = (document.getElementById("page-maint-reason")?.value || "").trim();
  const pauseAt = normalizeDateLocal(document.getElementById("page-pause-at")?.value || "");
  const resumeAt = normalizeDateLocal(document.getElementById("page-resume-at")?.value || "");
  return { reason, pauseAt, resumeAt };
}

async function logPageAction(action, pageItem, metadata = {}) {
  await logSecurityEvent({
    action,
    severity: "warning",
    status: "success",
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    entity: "page_availability",
    entityId: pageItem.key,
    message: `${action} for ${pageItem.key}`,
    metadata: {
      pageHref: pageItem.href,
      ...metadata
    }
  });
}

function validateSchedule(pauseAt, resumeAt) {
  const now = Date.now();
  const pauseTs = pauseAt ? Date.parse(pauseAt) : NaN;
  const resumeTs = resumeAt ? Date.parse(resumeAt) : NaN;

  if (Number.isFinite(pauseTs) && pauseTs <= now) {
    return t("page_admin.error_pause_future");
  }
  if (Number.isFinite(resumeTs) && resumeTs <= now) {
    return t("page_admin.error_resume_future");
  }
  if (Number.isFinite(pauseTs) && Number.isFinite(resumeTs) && resumeTs <= pauseTs) {
    return t("page_admin.error_resume_after_pause");
  }
  return "";
}

async function openPauseModal(item, scheduleOnly = false) {
  const label = t(item.labelKey);
  openModal({
    title: scheduleOnly ? `${t("page_admin.action_schedule")} - ${label}` : `${t("page_admin.action_pause")} - ${label}`,
    content: `
      <div class="page-admin-modal-form">
        <label class="page-admin-modal-full">${t("page_admin.reason_label")}
          <textarea class="textarea" id="page-maint-reason" rows="3" placeholder="${t("page_admin.reason_placeholder")}">${item.reason || ""}</textarea>
        </label>
        <div class="page-admin-modal-grid">
          <label>${t("page_admin.pause_at_label")}
            <input class="input" id="page-pause-at" type="datetime-local" value="${toDateTimeLocalInput(item.pauseAt)}" />
          </label>
          <label>${t("page_admin.resume_at_label")}
            <input class="input" id="page-resume-at" type="datetime-local" value="${toDateTimeLocalInput(item.resumeAt)}" />
          </label>
        </div>
        <small class="text-muted page-admin-modal-note">${t("page_admin.schedule_hint")}</small>
      </div>
    `,
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        keepOpen: true,
        onClick: async () => {
          const { reason, pauseAt, resumeAt } = parseScheduleForm();
          const scheduleError = validateSchedule(pauseAt, resumeAt);
          if (scheduleError) {
            showToast("error", scheduleError);
            return;
          }

          if (scheduleOnly && !pauseAt) {
            showToast("error", t("page_admin.error_pause_required"));
            return;
          }

          const immediatePause = !pauseAt && !scheduleOnly;
          const changed = immediatePause
            ? setPageEnabled(item.key, false, { reason, resumeAt, actor })
            : setPageEnabled(item.key, true, { reason, pauseAt, resumeAt, actor });

          if (!changed) {
            showToast("error", t("page_admin.error_save"));
            return;
          }

          if (immediatePause) {
            await logPageAction("page_availability_paused", item, { reason, resumeAt });
            showToast("success", t("page_admin.updated_paused"));
          } else {
            await logPageAction("page_availability_schedule_updated", item, { reason, pauseAt, resumeAt });
            showToast("success", t("page_admin.updated_schedule"));
          }
          closeModal();
          await refreshAll();
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

async function openRunModal(item, scheduleOnly = false) {
  const label = t(item.labelKey);
  openModal({
    title: scheduleOnly ? `${t("page_admin.action_schedule")} - ${label}` : `${t("page_admin.action_run")} - ${label}`,
    content: `
      <div class="page-admin-modal-form">
        <div class="page-admin-modal-grid">
          <label>${t("page_admin.resume_at_label")}
            <input class="input" id="page-resume-at" type="datetime-local" value="${toDateTimeLocalInput(item.resumeAt)}" />
          </label>
        </div>
        <small class="text-muted page-admin-modal-note">${scheduleOnly ? t("page_admin.resume_schedule_hint") : t("page_admin.run_hint")}</small>
      </div>
    `,
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        keepOpen: true,
        onClick: async () => {
          const resumeAt = normalizeDateLocal(document.getElementById("page-resume-at")?.value || "");
          const scheduleError = validateSchedule("", resumeAt);
          if (scheduleError) {
            showToast("error", scheduleError);
            return;
          }

          if (resumeAt) {
            const changed = setPageEnabled(item.key, false, {
              reason: item.reason || t("page_admin.no_reason"),
              resumeAt,
              actor
            });
            if (!changed) {
              showToast("error", t("page_admin.error_save"));
              return;
            }
            await logPageAction("page_availability_schedule_updated", item, { resumeAt });
            showToast("success", t("page_admin.updated_schedule"));
          } else {
            const changed = setPageEnabled(item.key, true, { actor });
            if (!changed) {
              showToast("error", t("page_admin.error_save"));
              return;
            }
            await logPageAction("page_availability_resumed", item);
            showToast("success", t("page_admin.updated_running"));
          }

          closeModal();
          await refreshAll();
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

function renderTable() {
  const rows = listPageAvailability().filter((item) => item.key !== "page_admin");
  table.innerHTML = `
    <thead>
      <tr>
        <th data-i18n="page_admin.page_name">${t("page_admin.page_name")}</th>
        <th data-i18n="page_admin.page_path">${t("page_admin.page_path")}</th>
        <th data-i18n="page_admin.page_status">${t("page_admin.page_status")}</th>
        <th data-i18n="page_admin.reason_col">${t("page_admin.reason_col")}</th>
        <th data-i18n="common.actions">${t("common.actions")}</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (item) => `
            <tr>
              <td>${t(item.labelKey)}</td>
              <td><span class="text-muted">${item.href}</span></td>
              <td>${statusBadge(item)}</td>
              <td>${renderReason(item)}</td>
              <td>${actionButtons(item)}</td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  `;

  table.querySelectorAll("button[data-mode][data-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.key;
      const mode = button.dataset.mode;
      const item = rows.find((entry) => entry.key === key);
      if (!item) return;
      if (mode === "schedule") {
        if (item.enabled) await openPauseModal(item, true);
        else await openRunModal(item, true);
        return;
      }
      if (item.enabled) {
        await openPauseModal(item);
        return;
      }
      await openRunModal(item);
    });
  });
}

function renderAuditTable(events = []) {
  if (!auditTable) return;
  const rows = events.slice(0, 20);
  auditTable.innerHTML = `
    <thead>
      <tr>
        <th>${t("page_admin.audit_when")}</th>
        <th>${t("page_admin.audit_actor")}</th>
        <th>${t("page_admin.audit_page")}</th>
        <th>${t("page_admin.audit_action")}</th>
        <th>${t("page_admin.audit_note")}</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map((event) => `
                <tr>
                  <td>${formatDateTime(event.createdAt)}</td>
                  <td>${event.actorEmail || event.actorUid || "-"}</td>
                  <td>${event.entityId || "-"}</td>
                  <td>${event.action || "-"}</td>
                  <td>${event.message || "-"}</td>
                </tr>
              `)
              .join("")
          : `<tr><td colspan="5" class="text-muted">${t("page_admin.audit_empty")}</td></tr>`
      }
    </tbody>
  `;
}

async function refreshAll() {
  const transitions = collectScheduleTransitions();
  for (const transition of transitions) {
    await logSecurityEvent({
      action: transition.type === "auto_paused" ? "page_availability_auto_paused" : "page_availability_auto_resumed",
      severity: "warning",
      status: "success",
      actorUid: "system",
      actorEmail: "",
      actorRole: "system",
      entity: "page_availability",
      entityId: transition.pageKey,
      message: transition.type === "auto_paused" ? "Page auto-paused by schedule." : "Page auto-resumed by schedule."
    });
  }
  renderTable();
  const events = await listSecurityEvents();
  renderAuditTable(events.filter((event) => event.entity === "page_availability"));
}

refreshAll();

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

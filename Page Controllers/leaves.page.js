import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { canDo } from "../Services/permissions.service.js";
import { saveTablePrefs, getTablePrefs, paginate, exportRowsToCsv } from "../Services/table-tools.service.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { logSecurityEvent } from "../Services/security-audit.service.js";
import { listLeaves, createLeave, updateLeave, deleteLeave } from "../Services/leaves.service.js";
import { createNotification } from "../Services/notifications.service.js";
import { listEmployees } from "../Services/employees.service.js";
import { listTimeoffBalances } from "../Services/timeoff.service.js";

if (!enforceAuth("leaves")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("leaves");
if (window.lucide?.createIcons) window.lucide.createIcons();

const canCreate = canDo({ role, entity: "leaves", action: "create" });
const canEditAll = canDo({ role, entity: "leaves", action: "edit" });
const canDeleteAll = canDo({ role, entity: "leaves", action: "delete" });
const canReviewManager = canDo({ role, entity: "leaves", action: "review_manager" });
const canReviewHr = canDo({ role, entity: "leaves", action: "review_hr" });
const canApprove = canDo({ role, entity: "leaves", action: "approve" });
const canReject = canDo({ role, entity: "leaves", action: "reject" });
const canExport = canDo({ role, entity: "leaves", action: "export" }) || role === "manager";

const addButton = document.getElementById("add-leave-btn");
const exportButton = document.getElementById("leaves-export-btn");
const searchInput = document.getElementById("leave-search");
const statusFilter = document.getElementById("leave-status-filter");
const tbody = document.getElementById("leaves-body");
const emptyState = document.getElementById("leaves-empty");
const paginationEl = document.getElementById("leaves-pagination");
const totalEl = document.getElementById("leave-total");
const pendingEl = document.getElementById("leave-pending");
const approvedEl = document.getElementById("leave-approved");
const rejectedEl = document.getElementById("leave-rejected");
const annualEl = document.getElementById("leave-annual");
const usedEl = document.getElementById("leave-used");
const remainingEl = document.getElementById("leave-remaining");

if (!canCreate) addButton.classList.add("hidden");
if (!canExport && exportButton) exportButton.classList.add("hidden");

let leaves = [];
let allLeaves = [];
let employees = [];
let balances = [];
let currentEmployee = null;

const DEFAULT_ANNUAL = 24;
const PREF_KEY = "leaves_table";
const prefs = getTablePrefs(PREF_KEY, { query: "", status: "", page: 1, pageSize: 10 });
searchInput.value = prefs.query || "";
statusFilter.value = prefs.status || "";

function savePrefs() {
  saveTablePrefs(PREF_KEY, prefs);
}

function normalizeStatus(status = "") {
  return status === "pending" ? "submitted" : status;
}

function calcLeaveDays(leave) {
  if (leave.days) return Number(leave.days) || 0;
  if (!leave.from || !leave.to) return 0;
  const start = new Date(leave.from);
  const end = new Date(leave.to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diff, 0);
}

function resolveEmployeeForUser(profile, list) {
  if (!profile) return null;
  return (
    list.find((emp) => emp.id === profile.uid) ||
    list.find((emp) => emp.empId && emp.empId === profile.uid) ||
    list.find((emp) => emp.email && emp.email === profile.email) ||
    null
  );
}

function getBalanceByEmployeeId(employeeId) {
  if (!employeeId) return {};
  return balances.find((b) => b.employeeId === employeeId || b.id === employeeId) || {};
}

function resolveEmployeeForLeave(leave) {
  if (!leave) return null;
  return (
    employees.find((emp) => emp.id === leave.employeeId) ||
    employees.find((emp) => emp.empId && emp.empId === leave.employeeCode) ||
    employees.find((emp) => emp.email && emp.email === leave.employeeEmail) ||
    null
  );
}

function matchesEmployee(leave, emp, profile) {
  if (!leave) return false;
  if (emp?.id && leave.employeeId === emp.id) return true;
  if (profile?.uid && leave.employeeId === profile.uid) return true;
  if (emp?.empId && leave.employeeCode === emp.empId) return true;
  if (emp?.email && leave.employeeEmail === emp.email) return true;
  return false;
}

function canEditLeave(leave) {
  if (!leave) return false;
  if (canEditAll) return true;
  if (role !== "employee") return false;
  const status = normalizeStatus(leave.status);
  return ["submitted", "manager_review"].includes(status) && matchesEmployee(leave, currentEmployee, user);
}

function canDeleteLeave(leave) {
  if (!leave) return false;
  if (canDeleteAll) return true;
  return role === "employee" && normalizeStatus(leave.status) === "submitted" && matchesEmployee(leave, currentEmployee, user);
}

function getRemainingBalance(employeeId, leaveDate, extraDays = 0, emp = null, profile = null) {
  const balance = getBalanceByEmployeeId(employeeId);
  const annual = Number(balance.annual ?? DEFAULT_ANNUAL);
  const carryover = Number(balance.carryover ?? 0);
  const adjustment = Number(balance.adjustment ?? 0);
  const targetYear = leaveDate ? new Date(leaveDate).getFullYear() : new Date().getFullYear();
  const used = allLeaves
    .filter((leave) => normalizeStatus(leave.status) === "approved")
    .filter((leave) => !leave.from || new Date(leave.from).getFullYear() === targetYear)
    .filter((leave) => (emp || profile ? matchesEmployee(leave, emp, profile) : leave.employeeId === employeeId))
    .reduce((sum, leave) => sum + calcLeaveDays(leave), 0);
  return annual + carryover + adjustment - used - extraDays;
}

function updateBalanceSummary() {
  const emp = currentEmployee;
  if (!emp && !user) return;
  const balance = getBalanceByEmployeeId(emp?.id || user.uid);
  const annual = Number(balance.annual ?? DEFAULT_ANNUAL);
  const carryover = Number(balance.carryover ?? 0);
  const adjustment = Number(balance.adjustment ?? 0);
  const allowance = annual + carryover + adjustment;
  const used = allLeaves
    .filter((leave) => normalizeStatus(leave.status) === "approved")
    .filter((leave) => !leave.from || new Date(leave.from).getFullYear() === new Date().getFullYear())
    .filter((leave) => matchesEmployee(leave, emp, user))
    .reduce((sum, leave) => sum + calcLeaveDays(leave), 0);
  const remaining = allowance - used;

  if (annualEl) annualEl.textContent = String(allowance);
  if (usedEl) usedEl.textContent = String(used);
  if (remainingEl) remainingEl.textContent = String(remaining);
}

function workflowButtons(leave) {
  const status = normalizeStatus(leave.status);
  const actions = [];
  if (canEditLeave(leave)) actions.push(`<button class="btn btn-ghost" data-action="edit" data-id="${leave.id}">${t("common.edit")}</button>`);
  if (canDeleteLeave(leave)) actions.push(`<button class="btn btn-ghost" data-action="delete" data-id="${leave.id}">${t("common.delete")}</button>`);
  if (canReviewManager && status === "submitted") {
    actions.push(`<button class="btn btn-ghost" data-action="manager_review" data-id="${leave.id}">${t("common.status.manager_review")}</button>`);
  }
  if (canReviewManager && status === "manager_review") {
    actions.push(`<button class="btn btn-ghost" data-action="send_hr" data-id="${leave.id}">${t("common.status.hr_review")}</button>`);
  }
  if (canApprove && canReviewHr && status === "hr_review") {
    actions.push(`<button class="btn btn-ghost" data-action="approve" data-id="${leave.id}">${t("common.status.approved")}</button>`);
  }
  if (canReject && ["manager_review", "hr_review", "submitted"].includes(status)) {
    actions.push(`<button class="btn btn-ghost" data-action="reject" data-id="${leave.id}">${t("common.status.rejected")}</button>`);
  }
  return actions.length ? actions.join("") : `<span class="text-muted">${t("common.view_only")}</span>`;
}

function filterLeaves() {
  const query = (prefs.query || "").trim().toLowerCase();
  const status = prefs.status || "";
  return leaves.filter((leave) => {
    const normalized = normalizeStatus(leave.status);
    const matchesQuery =
      !query ||
      (leave.requestId || "").toLowerCase().includes(query) ||
      (leave.employeeId || "").toLowerCase().includes(query) ||
      (leave.employeeCode || "").toLowerCase().includes(query) ||
      (leave.type || "").toLowerCase().includes(query) ||
      (leave.category || "").toLowerCase().includes(query) ||
      normalized.toLowerCase().includes(query);
    const matchesStatus = !status || normalized === status;
    return matchesQuery && matchesStatus;
  });
}

function renderPagination(meta) {
  if (!paginationEl) return;
  if (meta.total <= meta.pageSize) {
    paginationEl.innerHTML = "";
    return;
  }
  paginationEl.innerHTML = `
    <button class="btn btn-ghost" data-page-action="prev" ${meta.page <= 1 ? "disabled" : ""}>Prev</button>
    <span class="page-label">Page ${meta.page} / ${meta.pages}</span>
    <button class="btn btn-ghost" data-page-action="next" ${meta.page >= meta.pages ? "disabled" : ""}>Next</button>
  `;
  paginationEl.querySelectorAll("button[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.pageAction;
      prefs.page = action === "prev" ? Math.max(1, prefs.page - 1) : prefs.page + 1;
      savePrefs();
      renderLeaves();
    });
  });
}

function renderLeaves() {
  const filtered = filterLeaves();
  const paged = paginate(filtered, prefs.page, prefs.pageSize);
  prefs.page = paged.page;
  savePrefs();

  tbody.innerHTML = paged.items
    .map(
      (leave) => `
      <tr>
        <td>
          <div class="employee-cell">
            <div>${leave.employeeName || leave.employeeId}</div>
            <div class="employee-meta">ID: ${leave.employeeCode || leave.employeeId}</div>
          </div>
        </td>
        <td>${leave.requestId || "-"}</td>
        <td><span class="chip">${leave.type || "General"}</span></td>
        <td>
          <div class="date-range">
            <span>${leave.from || "-"}</span>
            <span class="text-muted">to</span>
            <span>${leave.to || "-"}</span>
          </div>
        </td>
        <td>${leave.days || 1}</td>
        <td><span class="badge status-${normalizeStatus(leave.status)}">${t(`common.status.${normalizeStatus(leave.status)}`)}</span></td>
        <td>${workflowButtons(leave)}</td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);
  if (totalEl) totalEl.textContent = String(leaves.length);
  if (pendingEl) pendingEl.textContent = String(leaves.filter((l) => ["submitted", "manager_review", "hr_review"].includes(normalizeStatus(l.status))).length);
  if (approvedEl) approvedEl.textContent = String(leaves.filter((l) => normalizeStatus(l.status) === "approved").length);
  if (rejectedEl) rejectedEl.textContent = String(leaves.filter((l) => normalizeStatus(l.status) === "rejected").length);
  renderPagination(paged);

  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleLeaveAction(button.dataset.action, button.dataset.id));
  });
}

function leaveFormContent(leave = null) {
  const isEdit = Boolean(leave);
  const employeeName = leave?.employeeName || currentEmployee?.fullName || user.name || user.email || user.uid;
  const employeeCode = leave?.employeeCode || currentEmployee?.empId || user.uid;
  const remaining = getRemainingBalance(
    leave?.employeeId || currentEmployee?.id || user.uid,
    leave?.from || null,
    0,
    currentEmployee,
    user
  );
  return `
    <label>اسم الموظف<input class="input" value="${employeeName}" readonly /></label>
    <label>رقم الموظف<input class="input" value="${employeeCode}" readonly /></label>
    <label>الرصيد المتبقي<input class="input" value="${remaining}" readonly /></label>
    <label>النوع
      <select class="select" id="leave-type">
        <option value="Annual" ${isEdit && leave?.type === "Annual" ? "selected" : ""}>سنوية</option>
        <option value="Sick" ${isEdit && leave?.type === "Sick" ? "selected" : ""}>مرضية</option>
        <option value="Emergency" ${isEdit && leave?.type === "Emergency" ? "selected" : ""}>طارئة</option>
        <option value="Unpaid" ${isEdit && leave?.type === "Unpaid" ? "selected" : ""}>بدون راتب</option>
      </select>
    </label>
    <label>من<input class="input" id="leave-from" type="date" value="${leave?.from || ""}" /></label>
    <label>إلى<input class="input" id="leave-to" type="date" value="${leave?.to || ""}" /></label>
    <label>عدد الأيام<input class="input" id="leave-days" type="number" value="${leave?.days || 1}" /></label>
    <label>السبب<textarea class="textarea" id="leave-reason">${leave?.reason || ""}</textarea></label>
  `;
}

function collectLeaveForm() {
  const employeeId = currentEmployee?.id || user.uid;
  const employeeCode = currentEmployee?.empId || user.uid;
  return {
    employeeId,
    employeeCode,
    employeeEmail: user.email || "",
    employeeName: currentEmployee?.fullName || user.name || user.email || user.uid,
    type: document.getElementById("leave-type").value.trim(),
    from: document.getElementById("leave-from").value,
    to: document.getElementById("leave-to").value,
    days: Number(document.getElementById("leave-days").value || 1),
    reason: document.getElementById("leave-reason").value.trim(),
    approverId: ""
  };
}

function openLeaveModal(existingLeave = null) {
  const isEdit = Boolean(existingLeave);
  openModal({
    title: isEdit ? t("common.edit") : t("common.request_leave"),
    content: leaveFormContent(existingLeave),
    actions: [
      {
        label: isEdit ? t("common.save") : t("common.submit"),
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectLeaveForm();
          if (isEdit) {
            payload.employeeId = existingLeave.employeeId;
            payload.employeeCode = existingLeave.employeeCode;
            payload.employeeEmail = existingLeave.employeeEmail || "";
            payload.employeeName = existingLeave.employeeName || payload.employeeName;
            payload.status = normalizeStatus(existingLeave.status) || "submitted";
          } else {
            payload.status = "submitted";
          }

          const remaining = getRemainingBalance(payload.employeeId, payload.from, payload.days, currentEmployee, user);
          if (remaining < 0) {
            showToast("error", "رصيد الإجازات غير كافٍ");
            return;
          }
          if (isEdit) {
            await updateLeave(existingLeave.id, payload);
            await logSecurityEvent({
              action: "leave_update",
              entity: "leaves",
              entityId: existingLeave.id,
              actorUid: user?.uid || "",
              actorEmail: user?.email || "",
              actorRole: role || "",
              message: `Updated leave ${existingLeave.requestId || existingLeave.id}`
            });
            showToast("success", `${t("common.edit")} ${t("leaves.title")}`);
          } else {
            const createdId = await createLeave(payload);
            await logSecurityEvent({
              action: "leave_create",
              entity: "leaves",
              entityId: createdId,
              actorUid: user?.uid || "",
              actorEmail: user?.email || "",
              actorRole: role || "",
              message: `Created leave request ${createdId}`
            });
            showToast("success", `${t("common.submit")} ${t("leaves.title")}`);
          }
          await loadLeaves();
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

async function applyWorkflowAction(leave, status, message) {
  await updateLeave(leave.id, { status, approverId: user.uid });
  await createNotification({
    toUid: leave.employeeId,
    title: `Leave ${status}`,
    body: message || leave.reason || "Leave request updated",
    type: "leave",
    priority: status === "rejected" ? "high" : "medium",
    entityId: leave.id,
    actionHref: "leaves.html"
  });
  await logSecurityEvent({
    action: `leave_${status}`,
    entity: "leaves",
    entityId: leave.id,
    actorUid: user?.uid || "",
    actorEmail: user?.email || "",
    actorRole: role || "",
    message: `Leave ${leave.requestId || leave.id} moved to ${status}`
  });
}

async function handleLeaveAction(action, id) {
  const leave = leaves.find((item) => item.id === id);
  if (!leave) return;
  if (action === "edit") {
    if (!canEditLeave(leave)) return;
    openLeaveModal(leave);
    return;
  }
  if (action === "delete") {
    if (!canDeleteLeave(leave)) return;
    await deleteLeave(id);
    await logSecurityEvent({
      action: "leave_delete",
      entity: "leaves",
      entityId: id,
      severity: "warning",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      message: `Deleted leave ${leave.requestId || id}`
    });
    showToast("success", `${t("common.delete")} ${t("leaves.title")}`);
    await loadLeaves();
    return;
  }

  if (action === "manager_review" && canReviewManager) {
    await applyWorkflowAction(leave, "manager_review", "Under manager review");
    showToast("success", t("common.status.manager_review"));
    await loadLeaves();
    return;
  }
  if (action === "send_hr" && canReviewManager) {
    await applyWorkflowAction(leave, "hr_review", "Sent to HR for final approval");
    showToast("success", t("common.status.hr_review"));
    await loadLeaves();
    return;
  }
  if (action === "approve" && canApprove && canReviewHr) {
    const leaveEmployee = resolveEmployeeForLeave(leave);
    const remaining = getRemainingBalance(
      leave.employeeId,
      leave.from,
      calcLeaveDays(leave),
      leaveEmployee,
      leave.employeeEmail ? { email: leave.employeeEmail, uid: leave.employeeId } : null
    );
    if (remaining < 0) {
      showToast("error", "رصيد الإجازات غير كافٍ");
      return;
    }
    await applyWorkflowAction(leave, "approved", "Leave request approved");
    showToast("success", t("common.status.approved"));
    await loadLeaves();
    return;
  }
  if (action === "reject" && canReject) {
    await applyWorkflowAction(leave, "rejected", "Leave request rejected");
    showToast("success", t("common.status.rejected"));
    await loadLeaves();
  }
}

function exportCurrentRows() {
  const rows = filterLeaves().map((item) => ({ ...item, status: normalizeStatus(item.status) }));
  const ok = exportRowsToCsv({
    rows,
    filename: "leaves-export.csv",
    columns: [
      { key: "requestId", label: "Request ID" },
      { key: "employeeName", label: "Employee Name" },
      { key: "type", label: "Type" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "days", label: "Days" },
      { key: "status", label: "Status" }
    ]
  });
  if (ok) showToast("success", t("common.export_csv"));
}

async function loadLeaves() {
  showTableSkeleton(tbody, { rows: 6, cols: 7 });
  const [leavesData, employeesData, balancesData] = await Promise.all([
    listLeaves(),
    listEmployees(),
    listTimeoffBalances()
  ]);
  allLeaves = leavesData.map((item) => ({ ...item, status: normalizeStatus(item.status) }));
  employees = employeesData;
  balances = balancesData;
  currentEmployee = resolveEmployeeForUser(user, employees);
  leaves = role === "employee" ? allLeaves.filter((item) => matchesEmployee(item, currentEmployee, user)) : allLeaves;
  updateBalanceSummary();
  renderLeaves();
}

addButton.addEventListener("click", openLeaveModal);
if (exportButton) exportButton.addEventListener("click", exportCurrentRows);
if (searchInput) {
  searchInput.addEventListener("input", () => {
    prefs.query = searchInput.value || "";
    prefs.page = 1;
    savePrefs();
    renderLeaves();
  });
}
if (statusFilter) {
  statusFilter.addEventListener("change", () => {
    prefs.status = statusFilter.value || "";
    prefs.page = 1;
    savePrefs();
    renderLeaves();
  });
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  prefs.query = searchInput?.value || "";
  prefs.page = 1;
  savePrefs();
  renderLeaves();
});

trackUxEvent({ event: "page_open", module: "leaves" });
loadLeaves();

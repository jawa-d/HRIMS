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
import { listDepartments } from "../Services/departments.service.js";
import { listPositions } from "../Services/positions.service.js";
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  archiveEmployee,
  restoreEmployee,
  deleteEmployee,
  hasEmployeeDuplicate,
  exportEmployeesBackup,
  restoreEmployeesBackup
} from "../Services/employees.service.js";

if (!enforceAuth("employees")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("employees");

const canCreate = canDo({ role, entity: "employees", action: "create" });
const canEdit = canDo({ role, entity: "employees", action: "edit" });
const canDelete = canDo({ role, entity: "employees", action: "delete" });
const canExport = canDo({ role, entity: "employees", action: "export" }) || role === "manager";

const addButton = document.getElementById("add-employee-btn");
const exportButton = document.getElementById("employees-export-btn");
const backupButton = document.getElementById("employees-backup-btn");
const restoreButton = document.getElementById("employees-restore-btn");
const restoreFileInput = document.getElementById("employees-restore-file");
const searchInput = document.getElementById("employee-search");
const statusFilter = document.getElementById("employee-status-filter");
const tbody = document.getElementById("employees-body");
const emptyState = document.getElementById("employees-empty");
const paginationEl = document.getElementById("employees-pagination");

if (!canCreate && addButton) addButton.classList.add("hidden");
if (!canExport && exportButton) exportButton.classList.add("hidden");
if (!canExport && backupButton) backupButton.classList.add("hidden");
if (!canCreate && restoreButton) restoreButton.classList.add("hidden");

const PREF_KEY = "employees_table";
const prefs = getTablePrefs(PREF_KEY, { query: "", status: "", page: 1, pageSize: 10 });
let employees = [];
let departments = [];
let positions = [];

if (searchInput) searchInput.value = prefs.query || "";
if (statusFilter) statusFilter.value = prefs.status || "";

function savePrefs() {
  saveTablePrefs(PREF_KEY, prefs);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeEmployeeStatus(emp = {}) {
  if (emp.isArchived) return "archived";
  const value = String(emp.status || "active").trim().toLowerCase();
  return value === "inactive" ? "inactive" : "active";
}

function employeeStatusLabel(status = "active") {
  const key = `employees.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function filterEmployees() {
  const query = (prefs.query || "").trim().toLowerCase();
  const status = prefs.status || "";
  return employees.filter((emp) => {
    const matchesQuery =
      !query ||
      (emp.fullName || "").toLowerCase().includes(query) ||
      (emp.email || "").toLowerCase().includes(query) ||
      (emp.empId || "").toLowerCase().includes(query);
    const normalizedStatus = normalizeEmployeeStatus(emp);
    const matchesStatus = !status || normalizedStatus === status;
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
    <button class="btn btn-ghost" data-page-action="prev" ${meta.page <= 1 ? "disabled" : ""}>${t("common.prev")}</button>
    <span class="page-label">${t("common.page")} ${meta.page} / ${meta.pages}</span>
    <button class="btn btn-ghost" data-page-action="next" ${meta.page >= meta.pages ? "disabled" : ""}>${t("common.next")}</button>
  `;
  paginationEl.querySelectorAll("button[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.pageAction;
      prefs.page = action === "prev" ? Math.max(1, prefs.page - 1) : prefs.page + 1;
      savePrefs();
      renderEmployees();
    });
  });
}

function renderEmployees() {
  if (!tbody || !emptyState) return;
  const filtered = filterEmployees();
  const paged = paginate(filtered, prefs.page, prefs.pageSize);
  prefs.page = paged.page;
  savePrefs();

  tbody.innerHTML = paged.items
    .map((emp, index) => {
      const status = normalizeEmployeeStatus(emp);
      const empIdText = escapeHtml(emp.empId || emp.id || "-");
      const employeeName = escapeHtml(emp.fullName || "-");
      const employeeEmail = escapeHtml(emp.email || "-");
      const departmentText = escapeHtml(departments.find((dept) => dept.id === emp.departmentId)?.name || emp.departmentId || "-");
      const employeeId = String(emp.id || "");
      const encodedId = encodeURIComponent(employeeId);
      const safeDataId = escapeHtml(employeeId);
      const detailHref = `employee-details.html?id=${encodedId}`;
      return `
      <tr class="employee-row status-${status}" style="--row-index:${index};--emp-accent:${employeeAccent(emp)};">
        <td>${empIdText}</td>
        <td>
          <a href="${detailHref}">
            <span class="employee-name-wrap">
              <span class="employee-color-dot"></span>
              <span>${employeeName}</span>
            </span>
          </a>
        </td>
        <td>${employeeEmail}</td>
        <td>${departmentText}</td>
        <td><span class="badge employee-status-badge">${escapeHtml(employeeStatusLabel(status))}</span></td>
        <td>
          ${
            canEdit || canDelete
              ? `
            ${canEdit && !emp.isArchived ? `<button class="btn btn-ghost" data-action="edit" data-id="${safeDataId}">${t("common.edit")}</button>` : ""}
            ${canDelete && !emp.isArchived ? `<button class="btn btn-ghost" data-action="archive" data-id="${safeDataId}">${t("common.archive")}</button>` : ""}
            ${canDelete && emp.isArchived ? `<button class="btn btn-ghost" data-action="restore" data-id="${safeDataId}">${t("common.restore")}</button>` : ""}
            ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${safeDataId}">${t("common.delete")}</button>` : ""}
          `
              : `<span class="text-muted">${t("common.view_only")}</span>`
          }
        </td>
      </tr>
    `;
    })
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);
  renderPagination(paged);

  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void handleRowAction(button.dataset.action, button.dataset.id).catch((error) => {
        console.error("Employee action failed:", error);
        showToast("error", t("employees.action_failed"));
      });
    });
  });
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function employeeAccent(emp = {}) {
  const seed = hashSeed(emp.empId || emp.departmentId || emp.id || emp.fullName || "");
  const hue = seed % 360;
  return `hsl(${hue} 72% 44%)`;
}

function getDepartmentCode(departmentId) {
  const dept = departments.find((item) => item.id === departmentId);
  const source = (dept?.code || dept?.name || departmentId || "EMP").toString();
  const normalized = source.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return normalized || "EMP";
}

function generateEmployeeId(departmentId, excludeId = "") {
  const prefix = getDepartmentCode(departmentId);
  let max = 0;
  employees.forEach((emp) => {
    if (!emp || emp.id === excludeId) return;
    const value = String(emp.empId || "");
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!match) return;
    const serial = Number(match[1]);
    if (Number.isFinite(serial) && serial > max) max = serial;
  });
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function collectEmployeeForm() {
  return {
    empId: document.getElementById("emp-id").value.trim(),
    fullName: document.getElementById("emp-name").value.trim(),
    email: document.getElementById("emp-email").value.trim().toLowerCase(),
    phone: document.getElementById("emp-phone").value.trim(),
    departmentId: document.getElementById("emp-dept").value.trim(),
    positionId: document.getElementById("emp-position").value.trim(),
    salaryBase: Number(document.getElementById("emp-salary").value || 0),
    allowances: Number(document.getElementById("emp-allowances").value || 0),
    joinDate: document.getElementById("emp-join").value,
    status: document.getElementById("emp-status").value
  };
}

function isValidMoneyValue(value) {
  return Number.isFinite(value) && value >= 0;
}

function buildEmployeeFormContent(emp = {}) {
  const safe = (value = "") => escapeHtml(String(value || ""));
  const departmentOptions = [
    `<option value="">${t("employees.select_department")}</option>`,
    ...departments.map(
      (dept) => `<option value="${safe(dept.id)}" ${emp.departmentId === dept.id ? "selected" : ""}>${safe(dept.name || dept.id || "-")}</option>`
    ),
    ...(emp.departmentId && !departments.find((dept) => dept.id === emp.departmentId)
      ? [`<option value="${safe(emp.departmentId)}" selected>${safe(emp.departmentId)}</option>`]
      : [])
  ].join("");

  const positionOptions = [
    `<option value="">${t("employees.select_position")}</option>`,
    ...positions.map(
      (position) =>
        `<option value="${safe(position.id)}" ${emp.positionId === position.id ? "selected" : ""}>${safe(position.name || position.id || "-")}</option>`
    ),
    ...(emp.positionId && !positions.find((position) => position.id === emp.positionId)
      ? [`<option value="${safe(emp.positionId)}" selected>${safe(emp.positionId)}</option>`]
      : [])
  ].join("");

  return `
    <label>${t("employees.field.employee_id")}<input class="input" id="emp-id" value="${safe(emp.empId)}" readonly /></label>
    <label>${t("employees.field.full_name")}<input class="input" id="emp-name" value="${safe(emp.fullName)}" /></label>
    <label>${t("employees.field.email")}<input class="input" id="emp-email" value="${safe(emp.email)}" /></label>
    <label>${t("employees.field.phone")}<input class="input" id="emp-phone" value="${safe(emp.phone)}" /></label>
    <label>${t("employees.field.department")}<select class="select" id="emp-dept">${departmentOptions}</select></label>
    <label>${t("employees.field.position")}<select class="select" id="emp-position">${positionOptions}</select></label>
    <label>${t("employees.field.salary_base")}<input class="input" id="emp-salary" type="number" value="${Number(emp.salaryBase || 0)}" /></label>
    <label>${t("employees.field.allowances")}<input class="input" id="emp-allowances" type="number" value="${Number(emp.allowances || 0)}" /></label>
    <label>${t("employees.field.join_date")}<input class="input" id="emp-join" type="date" value="${safe(emp.joinDate)}" /></label>
    <label>${t("employees.field.status")}
      <select class="select" id="emp-status">
        <option value="active" ${emp.status === "active" ? "selected" : ""}>${t("common.active")}</option>
        <option value="inactive" ${emp.status === "inactive" ? "selected" : ""}>${t("common.inactive")}</option>
      </select>
    </label>
  `;
}

function bindEmployeeFormAutoId(emp) {
  const idInput = document.getElementById("emp-id");
  const departmentSelect = document.getElementById("emp-dept");
  if (!idInput || !departmentSelect) return;

  const isEdit = Boolean(emp?.id);
  if (isEdit) {
    if (!idInput.value && departmentSelect.value) {
      idInput.value = generateEmployeeId(departmentSelect.value, emp.id);
    }
    return;
  }

  if (!departmentSelect.value && departments.length) {
    departmentSelect.value = departments[0].id;
  }

  const applyGeneratedId = () => {
    idInput.value = generateEmployeeId(departmentSelect.value);
  };

  departmentSelect.addEventListener("change", applyGeneratedId);
  applyGeneratedId();
}

function openEmployeeModal(emp) {
  openModal({
    title: emp ? t("common.edit") : t("employees.add"),
    content: buildEmployeeFormContent(emp),
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const payload = collectEmployeeForm();
            if (!payload.departmentId) {
              showToast("error", t("employees.error.department_required"));
              return;
            }
            if (!isValidMoneyValue(payload.salaryBase) || !isValidMoneyValue(payload.allowances)) {
              showToast("error", t("employees.error.salary_allowances_invalid"));
              return;
            }
            if (!emp) {
              payload.empId = generateEmployeeId(payload.departmentId);
            }
            const duplicate = await hasEmployeeDuplicate(payload, emp?.id || "");
            if (duplicate.exists) {
              const fieldLabelMap = {
                empId: t("employees.field.employee_id"),
                email: t("employees.field.email"),
                phone: t("employees.field.phone")
              };
              const fieldLabel = fieldLabelMap[duplicate.field] || duplicate.field;
              showToast("error", `${t("employees.error.duplicate_value_prefix")} ${fieldLabel}. ${t("employees.error.duplicate_value_suffix")}`);
              await logSecurityEvent({
                action: "employee_duplicate_blocked",
                entity: "employees",
                entityId: emp?.id || "",
                severity: "warning",
                actorUid: user?.uid || "",
                actorEmail: user?.email || "",
                actorRole: role || "",
                message: `Blocked duplicate ${duplicate.field} during employee save.`
              });
              return;
            }
            if (emp) {
              await updateEmployee(emp.id, payload);
              await logSecurityEvent({
                action: "employee_update",
                entity: "employees",
                entityId: emp.id,
                actorUid: user?.uid || "",
                actorEmail: user?.email || "",
                actorRole: role || "",
                message: `Updated employee ${payload.empId || emp.id}`
              });
              showToast("success", `${t("common.edit")} ${t("employees.title")}`);
            } else {
              const createdId = await createEmployee(payload);
              await logSecurityEvent({
                action: "employee_create",
                entity: "employees",
                entityId: createdId,
                actorUid: user?.uid || "",
                actorEmail: user?.email || "",
                actorRole: role || "",
                message: `Created employee ${payload.empId || createdId}`
              });
              showToast("success", `${t("common.add")} ${t("employees.title")}`);
            }
            await loadEmployees();
          } catch (error) {
            console.error("Employee save failed:", error);
            const details = [error?.code, error?.message].filter(Boolean).join(" - ");
            showToast("error", details ? `${t("employees.error.save_failed")}: ${details}` : t("employees.error.save_failed"));
            return false;
          }
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
  bindEmployeeFormAutoId(emp);
}

async function handleRowAction(action, id) {
  const emp = employees.find((item) => item.id === id);
  if (!emp) return;
  if (action === "edit" && canEdit) {
    openEmployeeModal(emp);
  }
  if (action === "archive" && canDelete) {
    await archiveEmployee(id, { uid: user?.uid, email: user?.email, role });
    await logSecurityEvent({
      action: "employee_archive",
      entity: "employees",
      entityId: id,
      severity: "warning",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      message: `Archived employee ${emp.empId || id}`
    });
    showToast("success", t("employees.archived"));
    await loadEmployees();
  }
  if (action === "restore" && canDelete) {
    await restoreEmployee(id);
    await logSecurityEvent({
      action: "employee_restore",
      entity: "employees",
      entityId: id,
      severity: "info",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      message: `Restored employee ${emp.empId || id}`
    });
    showToast("success", t("employees.restored"));
    await loadEmployees();
  }
  if (action === "delete" && canDelete) {
    const confirmed = window.confirm(t("employees.confirm_delete_permanent"));
    if (!confirmed) return;
    await deleteEmployee(id);
    await logSecurityEvent({
      action: "employee_delete",
      entity: "employees",
      entityId: id,
      severity: "critical",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      message: `Deleted employee ${emp.empId || id}`
    });
    showToast("success", t("employees.deleted"));
    await loadEmployees();
  }
}

function exportCurrentRows() {
  const rows = filterEmployees();
  const ok = exportRowsToCsv({
    rows,
    filename: "employees-export.csv",
    columns: [
      { key: "empId", label: t("employees.field.employee_id") },
      { key: "fullName", label: t("employees.field.full_name") },
      { key: "email", label: t("employees.field.email") },
      { key: "departmentId", label: t("employees.field.department") },
      { key: "status", label: t("common.status") }
    ]
  });
  if (ok) showToast("success", t("common.export_csv"));
}

async function loadEmployees() {
  if (!tbody) return;
  showTableSkeleton(tbody, { rows: 6, cols: 6 });
  employees = await listEmployees({ includeArchived: true });
  renderEmployees();
}

async function loadReferenceData() {
  const [departmentsData, positionsData] = await Promise.all([listDepartments(), listPositions()]);
  departments = departmentsData;
  positions = positionsData;
}

async function backupEmployees() {
  const backup = await exportEmployeesBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  await logSecurityEvent({
    action: "employees_backup_export",
    entity: "employees",
    actorUid: user?.uid || "",
    actorEmail: user?.email || "",
    actorRole: role || "",
    message: "Exported employees backup."
  });
  showToast("success", t("employees.backup_downloaded"));
}

function requestRestoreFile() {
  if (!restoreFileInput) return;
  restoreFileInput.value = "";
  restoreFileInput.click();
}

async function handleRestoreFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    const restoredCount = await restoreEmployeesBackup(parsed, {
      uid: user?.uid || "",
      email: user?.email || "",
      role: role || ""
    });
    await logSecurityEvent({
      action: "employees_backup_restore",
      entity: "employees",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      message: `Restored ${restoredCount} employees from backup.`
    });
    showToast("success", `${t("employees.restore_success_prefix")} ${restoredCount} ${t("employees.restore_success_suffix")}`);
    await loadEmployees();
  } catch (_) {
    showToast("error", t("employees.invalid_backup_file"));
  }
}

if (addButton) addButton.addEventListener("click", () => openEmployeeModal());
if (exportButton) exportButton.addEventListener("click", exportCurrentRows);
if (backupButton) backupButton.addEventListener("click", backupEmployees);
if (restoreButton) restoreButton.addEventListener("click", requestRestoreFile);
if (restoreFileInput) restoreFileInput.addEventListener("change", handleRestoreFileChange);
if (searchInput) {
  searchInput.addEventListener("input", () => {
    prefs.query = searchInput.value || "";
    prefs.page = 1;
    savePrefs();
    renderEmployees();
  });
}
if (statusFilter) {
  statusFilter.addEventListener("change", () => {
    prefs.status = statusFilter.value || "";
    prefs.page = 1;
    savePrefs();
    renderEmployees();
  });
}
window.addEventListener("global-search", (event) => {
  if (!searchInput) return;
  searchInput.value = event.detail || "";
  prefs.query = searchInput.value;
  prefs.page = 1;
  savePrefs();
  renderEmployees();
});

trackUxEvent({ event: "page_open", module: "employees" });
(async () => {
  try {
    await loadReferenceData();
    await loadEmployees();
  } catch (error) {
    console.error("Employees page init failed:", error);
    showToast("error", t("employees.load_failed"));
  }
})();




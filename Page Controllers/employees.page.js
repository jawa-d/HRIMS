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

if (!canCreate) addButton.classList.add("hidden");
if (!canExport && exportButton) exportButton.classList.add("hidden");
if (!canExport && backupButton) backupButton.classList.add("hidden");
if (!canCreate && restoreButton) restoreButton.classList.add("hidden");

const PREF_KEY = "employees_table";
const prefs = getTablePrefs(PREF_KEY, { query: "", status: "", page: 1, pageSize: 10 });
let employees = [];
let departments = [];
let positions = [];

searchInput.value = prefs.query || "";
statusFilter.value = prefs.status || "";

function savePrefs() {
  saveTablePrefs(PREF_KEY, prefs);
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
    const normalizedStatus = emp.isArchived ? "archived" : (emp.status || "active");
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
  const filtered = filterEmployees();
  const paged = paginate(filtered, prefs.page, prefs.pageSize);
  prefs.page = paged.page;
  savePrefs();

  tbody.innerHTML = paged.items
    .map(
      (emp, index) => `
      <tr class="employee-row status-${emp.isArchived ? "archived" : (emp.status || "active")}" style="--row-index:${index};--emp-accent:${employeeAccent(emp)};">
        <td>${emp.empId || emp.id}</td>
        <td>
          <a href="employee-details.html?id=${emp.id}">
            <span class="employee-name-wrap">
              <span class="employee-color-dot"></span>
              <span>${emp.fullName || "-"}</span>
            </span>
          </a>
        </td>
        <td>${emp.email || "-"}</td>
        <td>${departments.find((dept) => dept.id === emp.departmentId)?.name || emp.departmentId || "-"}</td>
        <td><span class="badge employee-status-badge">${emp.isArchived ? "archived" : (emp.status || "active")}</span></td>
        <td>
          ${
            canEdit || canDelete
              ? `
            ${canEdit && !emp.isArchived ? `<button class="btn btn-ghost" data-action="edit" data-id="${emp.id}">${t("common.edit")}</button>` : ""}
            ${canDelete && !emp.isArchived ? `<button class="btn btn-ghost" data-action="archive" data-id="${emp.id}">Archive</button>` : ""}
            ${canDelete && emp.isArchived ? `<button class="btn btn-ghost" data-action="restore" data-id="${emp.id}">Restore</button>` : ""}
            ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${emp.id}">Delete</button>` : ""}
          `
              : `<span class="text-muted">${t("common.view_only")}</span>`
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);
  renderPagination(paged);

  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void handleRowAction(button.dataset.action, button.dataset.id).catch((error) => {
        console.error("Employee action failed:", error);
        showToast("error", "Employee action failed");
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

function employeeFormContent(emp = {}) {
  const departmentOptions = [
    `<option value="">Select department</option>`,
    ...departments.map(
      (dept) => `<option value="${dept.id}" ${emp.departmentId === dept.id ? "selected" : ""}>${dept.name || dept.id}</option>`
    ),
    ...(emp.departmentId && !departments.find((dept) => dept.id === emp.departmentId)
      ? [`<option value="${emp.departmentId}" selected>${emp.departmentId}</option>`]
      : [])
  ].join("");

  const positionOptions = [
    `<option value="">Select position</option>`,
    ...positions.map(
      (position) =>
        `<option value="${position.id}" ${emp.positionId === position.id ? "selected" : ""}>${position.name || position.id}</option>`
    ),
    ...(emp.positionId && !positions.find((position) => position.id === emp.positionId)
      ? [`<option value="${emp.positionId}" selected>${emp.positionId}</option>`]
      : [])
  ].join("");

  return `
    <label>رقم الموظف<input class="input" id="emp-id" value="${emp.empId || ""}" readonly /></label>
    <label>الاسم الكامل<input class="input" id="emp-name" value="${emp.fullName || ""}" /></label>
    <label>البريد الإلكتروني<input class="input" id="emp-email" value="${emp.email || ""}" /></label>
    <label>الهاتف<input class="input" id="emp-phone" value="${emp.phone || ""}" /></label>
    <label>Department<select class="select" id="emp-dept">${departmentOptions}</select></label>
    <label>Position<select class="select" id="emp-position">${positionOptions}</select></label>
    <label>الراتب الأساسي<input class="input" id="emp-salary" type="number" value="${emp.salaryBase || 0}" /></label>
    <label>المخصصات<input class="input" id="emp-allowances" type="number" value="${emp.allowances || 0}" /></label>
    <label>تاريخ المباشرة<input class="input" id="emp-join" type="date" value="${emp.joinDate || ""}" /></label>
    <label>الحالة
      <select class="select" id="emp-status">
        <option value="active" ${emp.status === "active" ? "selected" : ""}>${t("common.active")}</option>
        <option value="inactive" ${emp.status === "inactive" ? "selected" : ""}>${t("common.inactive")}</option>
      </select>
    </label>
  `;
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
    content: employeeFormContent(emp),
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectEmployeeForm();
          if (!payload.departmentId) {
            showToast("error", "Department is required");
            return;
          }
          if (!emp) {
            payload.empId = generateEmployeeId(payload.departmentId);
          }
          const duplicate = await hasEmployeeDuplicate(payload, emp?.id || "");
          if (duplicate.exists) {
            const fieldLabelMap = {
              empId: "Employee ID",
              email: "Email",
              phone: "Phone"
            };
            const fieldLabel = fieldLabelMap[duplicate.field] || duplicate.field;
            showToast("error", `Duplicate ${fieldLabel}. This value is already used.`);
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
    showToast("success", "Employee archived");
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
    showToast("success", "Employee restored");
    await loadEmployees();
  }
  if (action === "delete" && canDelete) {
    const confirmed = window.confirm("Delete this employee permanently?");
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
    showToast("success", "Employee deleted");
    await loadEmployees();
  }
}

function exportCurrentRows() {
  const rows = filterEmployees();
  const ok = exportRowsToCsv({
    rows,
    filename: "employees-export.csv",
    columns: [
      { key: "empId", label: "Employee ID" },
      { key: "fullName", label: "Full Name" },
      { key: "email", label: "Email" },
      { key: "departmentId", label: "Department" },
      { key: "status", label: "Status" }
    ]
  });
  if (ok) showToast("success", t("common.export_csv"));
}

async function loadEmployees() {
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
  showToast("success", "Employees backup downloaded");
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
    showToast("success", `Restored ${restoredCount} employees`);
    await loadEmployees();
  } catch (_) {
    showToast("error", "Invalid backup file");
  }
}

addButton.addEventListener("click", () => openEmployeeModal());
if (exportButton) exportButton.addEventListener("click", exportCurrentRows);
if (backupButton) backupButton.addEventListener("click", backupEmployees);
if (restoreButton) restoreButton.addEventListener("click", requestRestoreFile);
if (restoreFileInput) restoreFileInput.addEventListener("change", handleRestoreFileChange);
searchInput.addEventListener("input", () => {
  prefs.query = searchInput.value || "";
  prefs.page = 1;
  savePrefs();
  renderEmployees();
});
statusFilter.addEventListener("change", () => {
  prefs.status = statusFilter.value || "";
  prefs.page = 1;
  savePrefs();
  renderEmployees();
});
window.addEventListener("global-search", (event) => {
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
    showToast("error", "Could not load employees data");
  }
})();




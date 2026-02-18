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
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee
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
const searchInput = document.getElementById("employee-search");
const statusFilter = document.getElementById("employee-status-filter");
const tbody = document.getElementById("employees-body");
const emptyState = document.getElementById("employees-empty");
const paginationEl = document.getElementById("employees-pagination");

if (!canCreate) addButton.classList.add("hidden");
if (!canExport && exportButton) exportButton.classList.add("hidden");

const PREF_KEY = "employees_table";
const prefs = getTablePrefs(PREF_KEY, { query: "", status: "", page: 1, pageSize: 10 });
let employees = [];

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
    const matchesStatus = !status || emp.status === status;
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
      (emp) => `
      <tr>
        <td>${emp.empId || emp.id}</td>
        <td><a href="employee-details.html?id=${emp.id}">${emp.fullName || "-"}</a></td>
        <td>${emp.email || "-"}</td>
        <td>${emp.departmentId || "-"}</td>
        <td><span class="badge">${emp.status || "active"}</span></td>
        <td>
          ${
            canEdit || canDelete
              ? `
            ${canEdit ? `<button class="btn btn-ghost" data-action="edit" data-id="${emp.id}">${t("common.edit")}</button>` : ""}
            ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${emp.id}">${t("common.delete")}</button>` : ""}
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
    button.addEventListener("click", () => handleRowAction(button.dataset.action, button.dataset.id));
  });
}

function employeeFormContent(emp = {}) {
  return `
    <label>رقم الموظف<input class="input" id="emp-id" value="${emp.empId || ""}" /></label>
    <label>الاسم الكامل<input class="input" id="emp-name" value="${emp.fullName || ""}" /></label>
    <label>البريد الإلكتروني<input class="input" id="emp-email" value="${emp.email || ""}" /></label>
    <label>الهاتف<input class="input" id="emp-phone" value="${emp.phone || ""}" /></label>
    <label>رقم القسم<input class="input" id="emp-dept" value="${emp.departmentId || ""}" /></label>
    <label>رقم الوظيفة<input class="input" id="emp-position" value="${emp.positionId || ""}" /></label>
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
    email: document.getElementById("emp-email").value.trim(),
    phone: document.getElementById("emp-phone").value.trim(),
    departmentId: document.getElementById("emp-dept").value.trim(),
    positionId: document.getElementById("emp-position").value.trim(),
    salaryBase: Number(document.getElementById("emp-salary").value || 0),
    allowances: Number(document.getElementById("emp-allowances").value || 0),
    joinDate: document.getElementById("emp-join").value,
    status: document.getElementById("emp-status").value
  };
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
}

async function handleRowAction(action, id) {
  const emp = employees.find((item) => item.id === id);
  if (!emp) return;
  if (action === "edit" && canEdit) {
    openEmployeeModal(emp);
  }
  if (action === "delete" && canDelete) {
    await deleteEmployee(id);
    await logSecurityEvent({
      action: "employee_delete",
      entity: "employees",
      entityId: id,
      severity: "warning",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      message: `Deleted employee ${emp.empId || id}`
    });
    showToast("success", `${t("common.delete")} ${t("employees.title")}`);
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
  employees = await listEmployees();
  renderEmployees();
}

addButton.addEventListener("click", () => openEmployeeModal());
if (exportButton) exportButton.addEventListener("click", exportCurrentRows);
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
loadEmployees();

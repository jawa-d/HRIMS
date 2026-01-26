import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
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

const canManage = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-employee-btn");
const searchInput = document.getElementById("employee-search");
const statusFilter = document.getElementById("employee-status-filter");
const tbody = document.getElementById("employees-body");
const emptyState = document.getElementById("employees-empty");

if (!canManage) {
  addButton.classList.add("hidden");
}

let employees = [];

function renderEmployees() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const filtered = employees.filter((emp) => {
    const matchesQuery =
      !query ||
      (emp.fullName || "").toLowerCase().includes(query) ||
      (emp.email || "").toLowerCase().includes(query);
    const matchesStatus = !status || emp.status === status;
    return matchesQuery && matchesStatus;
  });

  tbody.innerHTML = filtered
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
            canManage
              ? `
            <button class="btn btn-ghost" data-action="edit" data-id="${emp.id}">Edit</button>
            <button class="btn btn-ghost" data-action="delete" data-id="${emp.id}">Delete</button>
          `
              : "<span class=\"text-muted\">View only</span>"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);

  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleRowAction(button.dataset.action, button.dataset.id));
  });
}

function employeeFormContent(emp = {}) {
  return `
    <label>Employee ID<input class="input" id="emp-id" value="${emp.empId || ""}" /></label>
    <label>Full Name<input class="input" id="emp-name" value="${emp.fullName || ""}" /></label>
    <label>Email<input class="input" id="emp-email" value="${emp.email || ""}" /></label>
    <label>Phone<input class="input" id="emp-phone" value="${emp.phone || ""}" /></label>
    <label>Department ID<input class="input" id="emp-dept" value="${emp.departmentId || ""}" /></label>
    <label>Position ID<input class="input" id="emp-position" value="${emp.positionId || ""}" /></label>
    <label>Base Salary<input class="input" id="emp-salary" type="number" value="${emp.salaryBase || 0}" /></label>
    <label>Allowances<input class="input" id="emp-allowances" type="number" value="${emp.allowances || 0}" /></label>
    <label>Join Date<input class="input" id="emp-join" type="date" value="${emp.joinDate || ""}" /></label>
    <label>Status
      <select class="select" id="emp-status">
        <option value="active" ${emp.status === "active" ? "selected" : ""}>Active</option>
        <option value="inactive" ${emp.status === "inactive" ? "selected" : ""}>Inactive</option>
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
    title: emp ? "Edit Employee" : "Add Employee",
    content: employeeFormContent(emp),
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectEmployeeForm();
          if (emp) {
            await updateEmployee(emp.id, payload);
            showToast("success", "Employee updated");
          } else {
            await createEmployee(payload);
            showToast("success", "Employee added");
          }
          await loadEmployees();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleRowAction(action, id) {
  const emp = employees.find((item) => item.id === id);
  if (!emp) return;
  if (action === "edit") {
    openEmployeeModal(emp);
  }
  if (action === "delete") {
    await deleteEmployee(id);
    showToast("success", "Employee removed");
    await loadEmployees();
  }
}

async function loadEmployees() {
  employees = await listEmployees();
  renderEmployees();
}

addButton.addEventListener("click", () => openEmployeeModal());
searchInput.addEventListener("input", renderEmployees);
statusFilter.addEventListener("change", renderEmployees);

loadEmployees();

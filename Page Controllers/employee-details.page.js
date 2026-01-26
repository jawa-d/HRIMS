import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { getEmployee } from "../Services/employees.service.js";

if (!enforceAuth("employees")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("employees");

const container = document.getElementById("employee-details");
const params = new URLSearchParams(window.location.search);
const employeeId = params.get("id");

async function loadDetails() {
  if (!employeeId) {
    container.innerHTML = '<div class="card">Missing employee ID</div>';
    return;
  }
  const emp = await getEmployee(employeeId);
  if (!emp) {
    container.innerHTML = '<div class="card">Employee not found</div>';
    return;
  }
  container.innerHTML = `
    <div class="card">
      <h3 class="section-title">Contact</h3>
      <div class="stack">
        <div><strong>Name:</strong> ${emp.fullName || "-"}</div>
        <div><strong>Email:</strong> ${emp.email || "-"}</div>
        <div><strong>Phone:</strong> ${emp.phone || "-"}</div>
      </div>
    </div>
    <div class="card">
      <h3 class="section-title">Job</h3>
      <div class="stack">
        <div><strong>Department:</strong> ${emp.departmentId || "-"}</div>
        <div><strong>Position:</strong> ${emp.positionId || "-"}</div>
        <div><strong>Status:</strong> ${emp.status || "active"}</div>
        <div><strong>Join Date:</strong> ${emp.joinDate || "-"}</div>
      </div>
    </div>
  `;
}

loadDetails();

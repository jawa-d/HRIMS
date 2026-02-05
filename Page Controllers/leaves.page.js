import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { listLeaves, createLeave, updateLeave } from "../Services/leaves.service.js";
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
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canApprove = ["super_admin", "hr_admin", "manager"].includes(role);
const addButton = document.getElementById("add-leave-btn");
const searchInput = document.getElementById("leave-search");
const statusFilter = document.getElementById("leave-status-filter");
const tbody = document.getElementById("leaves-body");
const emptyState = document.getElementById("leaves-empty");
const totalEl = document.getElementById("leave-total");
const pendingEl = document.getElementById("leave-pending");
const approvedEl = document.getElementById("leave-approved");
const rejectedEl = document.getElementById("leave-rejected");
const annualEl = document.getElementById("leave-annual");
const usedEl = document.getElementById("leave-used");
const remainingEl = document.getElementById("leave-remaining");

let leaves = [];
let allLeaves = [];
let employees = [];
let balances = [];
let currentEmployee = null;

const DEFAULT_ANNUAL = 24;

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

function getRemainingBalance(employeeId, leaveDate, extraDays = 0, emp = null, profile = null) {
  const balance = getBalanceByEmployeeId(employeeId);
  const annual = Number(balance.annual ?? DEFAULT_ANNUAL);
  const carryover = Number(balance.carryover ?? 0);
  const adjustment = Number(balance.adjustment ?? 0);
  const targetYear = leaveDate ? new Date(leaveDate).getFullYear() : new Date().getFullYear();
  const used = allLeaves
    .filter((leave) => leave.status === "approved")
    .filter((leave) => {
      if (!leave.from) return true;
      return new Date(leave.from).getFullYear() === targetYear;
    })
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
    .filter((leave) => leave.status === "approved")
    .filter((leave) => {
      if (!leave.from) return true;
      return new Date(leave.from).getFullYear() === new Date().getFullYear();
    })
    .filter((leave) => matchesEmployee(leave, emp, user))
    .reduce((sum, leave) => sum + calcLeaveDays(leave), 0);
  const remaining = allowance - used;

  if (annualEl) annualEl.textContent = String(allowance);
  if (usedEl) usedEl.textContent = String(used);
  if (remainingEl) remainingEl.textContent = String(remaining);
}

function renderLeaves() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "";
  const filtered = leaves.filter((leave) => {
    const matchesQuery =
      !query ||
      (leave.requestId || "").toLowerCase().includes(query) ||
      (leave.employeeId || "").toLowerCase().includes(query) ||
      (leave.employeeCode || "").toLowerCase().includes(query) ||
      (leave.type || "").toLowerCase().includes(query) ||
      (leave.category || "").toLowerCase().includes(query) ||
      (leave.status || "").toLowerCase().includes(query);
    const matchesStatus = !status || leave.status === status;
    return matchesQuery && matchesStatus;
  });

  tbody.innerHTML = filtered
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
        <td><span class="badge status-${leave.status || "pending"}">${leave.status}</span></td>
        <td>
          ${
            canApprove
              ? `
            <button class="btn btn-ghost" data-action="approve" data-id="${leave.id}">Approve</button>
            <button class="btn btn-ghost" data-action="reject" data-id="${leave.id}">Reject</button>
          `
              : "<span class=\"text-muted\">View only</span>"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);
  if (totalEl) totalEl.textContent = leaves.length;
  if (pendingEl) pendingEl.textContent = leaves.filter((l) => l.status === "pending").length;
  if (approvedEl) approvedEl.textContent = leaves.filter((l) => l.status === "approved").length;
  if (rejectedEl) rejectedEl.textContent = leaves.filter((l) => l.status === "rejected").length;

  if (canApprove) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
    });
  }
}

function leaveFormContent() {
  const employeeName = currentEmployee?.fullName || user.name || user.email || user.uid;
  const employeeCode = currentEmployee?.empId || user.uid;
  const remaining = getRemainingBalance(currentEmployee?.id || user.uid, null, 0, currentEmployee, user);
  return `
    <label>Employee Name<input class="input" value="${employeeName}" readonly /></label>
    <label>Employee ID<input class="input" value="${employeeCode}" readonly /></label>
    <label>Remaining Balance<input class="input" value="${remaining}" readonly /></label>
    <label>Type
      <select class="select" id="leave-type">
        <option value="Annual">Annual</option>
        <option value="Sick">Sick</option>
        <option value="Emergency">Emergency</option>
        <option value="Unpaid">Unpaid</option>
        <option value="Maternity">Maternity</option>
      </select>
    </label>
    <label>From<input class="input" id="leave-from" type="date" /></label>
    <label>To<input class="input" id="leave-to" type="date" /></label>
    <label>Days<input class="input" id="leave-days" type="number" value="1" /></label>
    <label>Reason Category
      <select class="select" id="leave-category">
        <option value="Personal">Personal</option>
        <option value="Medical">Medical</option>
        <option value="Family">Family</option>
        <option value="Travel">Travel</option>
        <option value="Other">Other</option>
      </select>
    </label>
    <label>Reason<textarea class="textarea" id="leave-reason"></textarea></label>
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
    category: document.getElementById("leave-category").value.trim(),
    from: document.getElementById("leave-from").value,
    to: document.getElementById("leave-to").value,
    days: Number(document.getElementById("leave-days").value || 1),
    reason: document.getElementById("leave-reason").value.trim(),
    approverId: ""
  };
}

function openLeaveModal() {
  openModal({
    title: "Request Leave",
    content: leaveFormContent(),
    actions: [
      {
        label: "Submit",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectLeaveForm();
          const remaining = getRemainingBalance(
            payload.employeeId,
            payload.from,
            payload.days,
            currentEmployee,
            user
          );
          if (remaining < 0) {
            showToast("error", "Insufficient leave balance");
            return;
          }
          await createLeave(payload);
          showToast("success", "Leave requested");
          await loadLeaves();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const leave = leaves.find((item) => item.id === id);
  if (!leave) return;
  const status = action === "approve" ? "approved" : "rejected";
  if (status === "approved") {
    const leaveEmployee = resolveEmployeeForLeave(leave);
    const remaining = getRemainingBalance(
      leave.employeeId,
      leave.from,
      calcLeaveDays(leave),
      leaveEmployee,
      leave.employeeEmail ? { email: leave.employeeEmail, uid: leave.employeeId } : null
    );
    if (remaining < 0) {
      showToast("error", "Insufficient leave balance");
      return;
    }
  }
  await updateLeave(id, { status, approverId: user.uid });
  await createNotification({
    toUid: leave.employeeId,
    title: `Leave ${status}`,
    body: leave.reason || "Leave request updated",
    type: "leave",
    entityId: id
  });
  showToast("success", `Leave ${status}`);
  await loadLeaves();
}

async function loadLeaves() {
  showTableSkeleton(tbody, { rows: 6, cols: 7 });
  const [leavesData, employeesData, balancesData] = await Promise.all([
    listLeaves(),
    listEmployees(),
    listTimeoffBalances()
  ]);
  allLeaves = leavesData;
  employees = employeesData;
  balances = balancesData;
  currentEmployee = resolveEmployeeForUser(user, employees);
  leaves =
    role === "employee"
      ? leavesData.filter((item) => matchesEmployee(item, currentEmployee, user))
      : leavesData;
  updateBalanceSummary();
  renderLeaves();
}

addButton.addEventListener("click", openLeaveModal);
if (searchInput) {
  searchInput.addEventListener("input", renderLeaves);
}
if (statusFilter) {
  statusFilter.addEventListener("change", renderLeaves);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderLeaves();
});
loadLeaves();

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listPayroll, createPayroll, updatePayroll } from "../Services/payroll.service.js";
import { createNotification } from "../Services/notifications.service.js";

if (!enforceAuth("payroll")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("payroll");

const canManage = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-payroll-btn");
const tbody = document.getElementById("payroll-body");
const emptyState = document.getElementById("payroll-empty");

if (!canManage) {
  addButton.classList.add("hidden");
}

let payroll = [];

function renderPayroll() {
  tbody.innerHTML = payroll
    .map(
      (entry) => `
      <tr>
        <td>${entry.employeeId}</td>
        <td>${entry.month}</td>
        <td>${entry.net}</td>
        <td><span class="badge">${entry.status}</span></td>
        <td>
          <button class="btn btn-ghost" data-action="view" data-id="${entry.id}">View</button>
          ${
            canManage && entry.status !== "published"
              ? `<button class="btn btn-ghost" data-action="publish" data-id="${entry.id}">Publish</button>`
              : ""
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", payroll.length > 0);

  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
  });
}

function payrollFormContent() {
  return `
    <label>Employee ID<input class="input" id="pay-employee" /></label>
    <label>Month<input class="input" id="pay-month" placeholder="2025-01" /></label>
    <label>Base<input class="input" id="pay-base" type="number" value="0" /></label>
    <label>Allowances<input class="input" id="pay-allow" type="number" value="0" /></label>
    <label>Deductions<input class="input" id="pay-deduct" type="number" value="0" /></label>
  `;
}

function collectPayrollForm() {
  const base = Number(document.getElementById("pay-base").value || 0);
  const allowances = Number(document.getElementById("pay-allow").value || 0);
  const deductions = Number(document.getElementById("pay-deduct").value || 0);
  return {
    employeeId: document.getElementById("pay-employee").value.trim(),
    month: document.getElementById("pay-month").value.trim(),
    base,
    allowancesTotal: allowances,
    deductionsTotal: deductions,
    net: base + allowances - deductions,
    status: "draft"
  };
}

function openPayrollModal() {
  openModal({
    title: "Create Payroll",
    content: payrollFormContent(),
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          await createPayroll(collectPayrollForm());
          showToast("success", "Payroll created");
          await loadPayroll();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const entry = payroll.find((item) => item.id === id);
  if (!entry) return;
  if (action === "view") {
    openModal({
      title: "Payslip",
      content: `
        <div class="stack">
          <div><strong>Employee:</strong> ${entry.employeeId}</div>
          <div><strong>Month:</strong> ${entry.month}</div>
          <div><strong>Base:</strong> ${entry.base}</div>
          <div><strong>Allowances:</strong> ${entry.allowancesTotal}</div>
          <div><strong>Deductions:</strong> ${entry.deductionsTotal}</div>
          <div><strong>Net:</strong> ${entry.net}</div>
        </div>
      `,
      actions: [{ label: "Close", className: "btn btn-ghost" }]
    });
  }
  if (action === "publish" && canManage) {
    await updatePayroll(id, { status: "published" });
    await createNotification({
      toUid: entry.employeeId,
      title: "Payroll Published",
      body: `Payroll for ${entry.month} is available`,
      type: "payroll",
      entityId: id
    });
    showToast("success", "Payroll published");
    await loadPayroll();
  }
}

async function loadPayroll() {
  const data = await listPayroll();
  payroll = role === "employee" ? data.filter((item) => item.employeeId === user.uid) : data;
  renderPayroll();
}

addButton.addEventListener("click", openPayrollModal);
loadPayroll();

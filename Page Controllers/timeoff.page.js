import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listEmployees } from "../Services/employees.service.js";
import { listLeaves } from "../Services/leaves.service.js";
import { listTimeoffBalances, upsertTimeoffBalance } from "../Services/timeoff.service.js";

if (!enforceAuth("timeoff")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("timeoff");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin"].includes(role);
const isEmployee = role === "employee";
const searchInput = document.getElementById("timeoff-search");
const exportBtn = document.getElementById("export-timeoff-btn");
const tbody = document.getElementById("timeoff-body");
const emptyState = document.getElementById("timeoff-empty");
const totalEl = document.getElementById("timeoff-total");
const usedEl = document.getElementById("timeoff-used");
const remainingEl = document.getElementById("timeoff-remaining");
const lowEl = document.getElementById("timeoff-low");

let employees = [];
let leaves = [];
let balances = [];

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

function getBalance(employeeId) {
  return balances.find((b) => b.employeeId === employeeId) || {};
}

function buildRows() {
  const currentYear = new Date().getFullYear();
  const query = (searchInput?.value || "").trim().toLowerCase();
  const employeeList = isEmployee
    ? employees.filter((emp) => emp.id === user.uid || emp.empId === user.uid || emp.email === user.email)
    : employees;

  const rows = employeeList.map((emp) => {
    const balance = getBalance(emp.id);
    const annual = Number(balance.annual ?? DEFAULT_ANNUAL);
    const carryover = Number(balance.carryover ?? 0);
    const adjustment = Number(balance.adjustment ?? 0);
    const used = leaves
      .filter((leave) => leave.employeeId === emp.id && leave.status === "approved")
      .filter((leave) => {
        if (!leave.from) return true;
        return new Date(leave.from).getFullYear() === currentYear;
      })
      .reduce((sum, leave) => sum + calcLeaveDays(leave), 0);
    const remaining = annual + carryover + adjustment - used;
    const status = remaining <= 3 ? "Low" : "OK";
    return {
      id: emp.id,
      name: emp.fullName || emp.email || emp.empId || emp.id,
      code: emp.empId || emp.id,
      annual,
      carryover,
      used,
      remaining,
      status
    };
  });

  return rows.filter((row) => !query || row.name.toLowerCase().includes(query));
}

function renderTable() {
  const rows = buildRows();
  tbody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>
          <div class="employee-cell">
            <div>${row.name}</div>
            <div class="employee-meta">ID: ${row.code}</div>
          </div>
        </td>
        <td>${row.annual}</td>
        <td>${row.carryover}</td>
        <td>${row.used}</td>
        <td>${row.remaining}</td>
        <td><span class="${row.status === "Low" ? "balance-low" : "balance-ok"}">${row.status}</span></td>
        <td>
          ${
            canManage
              ? `<button class="btn btn-ghost" data-action="edit" data-id="${row.id}">Adjust</button>`
              : "-"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", rows.length > 0);
  if (totalEl) totalEl.textContent = rows.length;
  if (usedEl) usedEl.textContent = rows.reduce((sum, row) => sum + row.used, 0);
  if (remainingEl) remainingEl.textContent = rows.reduce((sum, row) => sum + row.remaining, 0);
  if (lowEl) lowEl.textContent = rows.filter((row) => row.status === "Low").length;

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => openBalanceModal(button.dataset.id));
    });
  }
}

function openBalanceModal(employeeId) {
  const balance = getBalance(employeeId);
  const annual = balance.annual ?? DEFAULT_ANNUAL;
  const carryover = balance.carryover ?? 0;
  const adjustment = balance.adjustment ?? 0;
  openModal({
    title: "Adjust Balance",
    content: `
      <label>Annual Allowance<input class="input" id="balance-annual" type="number" value="${annual}" /></label>
      <label>Carryover<input class="input" id="balance-carry" type="number" value="${carryover}" /></label>
      <label>Adjustment<input class="input" id="balance-adjust" type="number" value="${adjustment}" /></label>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = {
            annual: Number(document.getElementById("balance-annual").value || DEFAULT_ANNUAL),
            carryover: Number(document.getElementById("balance-carry").value || 0),
            adjustment: Number(document.getElementById("balance-adjust").value || 0)
          };
          await upsertTimeoffBalance(employeeId, payload);
          showToast("success", "Balance updated");
          await loadBalances();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function exportToCsv() {
  const rows = buildRows();
  const header = ["Employee", "Employee ID", "Annual", "Carryover", "Used", "Remaining", "Status"];
  const lines = rows.map((row) =>
    [
      row.name,
      row.code,
      row.annual,
      row.carryover,
      row.used,
      row.remaining,
      row.status
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "timeoff-balance.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function loadBalances() {
  balances = await listTimeoffBalances();
  renderTable();
}

async function loadData() {
  const [employeesData, leavesData] = await Promise.all([listEmployees(), listLeaves()]);
  employees = employeesData;
  leaves = leavesData;
}

if (searchInput) {
  searchInput.addEventListener("input", renderTable);
}
exportBtn.addEventListener("click", exportToCsv);
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderTable();
});

(async () => {
  await loadData();
  await loadBalances();
})();

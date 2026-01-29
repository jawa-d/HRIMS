import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listPayroll, createPayroll, updatePayroll } from "../Services/payroll.service.js";
import { listEmployees } from "../Services/employees.service.js";

if (!enforceAuth("payroll")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("payroll");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin"].includes(role);
const isEmployee = role === "employee";
const monthSelect = document.getElementById("payroll-month");
const exportExcelBtn = document.getElementById("export-excel-btn");
const exportPdfBtn = document.getElementById("export-pdf-btn");
const saveBtn = document.getElementById("save-payroll-btn");
const tbody = document.getElementById("payroll-body");
const emptyState = document.getElementById("payroll-empty");
const totalBaseEl = document.getElementById("total-base");
const totalAllowancesEl = document.getElementById("total-allowances");
const totalDeductionsEl = document.getElementById("total-deductions");
const totalNetEl = document.getElementById("total-net");

if (!canManage) {
  saveBtn.classList.add("hidden");
}

let payroll = [];
let employees = [];
let currentMonth = "";
const formatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions() {
  const now = new Date();
  const months = Array.from({ length: 12 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return {
      key: formatMonth(date),
      label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    };
  });
  monthSelect.innerHTML = months
    .map((month) => `<option value="${month.key}">${month.label}</option>`)
    .join("");
  currentMonth = months[0].key;
  monthSelect.value = currentMonth;
}

function getVisibleEmployees() {
  if (!isEmployee) return employees;
  return employees.filter(
    (emp) => emp.id === user.uid || emp.empId === user.uid || emp.email === user.email
  );
}

function findPayrollEntry(emp, entries) {
  return entries.find(
    (entry) =>
      entry.employeeId === emp.id ||
      entry.employeeId === emp.empId ||
      entry.employeeCode === emp.empId
  );
}

function getRowValues(row) {
  const base = Number(row.querySelector('[data-field="base"]').value || 0);
  const allowances = Number(row.querySelector('[data-field="allowances"]').value || 0);
  const deductions = Number(row.querySelector('[data-field="deductions"]').value || 0);
  const net = base + allowances - deductions;
  return { base, allowances, deductions, net };
}

function updateRowNet(row) {
  const { net } = getRowValues(row);
  const netCell = row.querySelector(".net-value");
  if (netCell) netCell.textContent = formatter.format(net);
}

function updateTotals() {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const totals = rows.reduce(
    (acc, row) => {
      const { base, allowances, deductions, net } = getRowValues(row);
      acc.base += base;
      acc.allowances += allowances;
      acc.deductions += deductions;
      acc.net += net;
      return acc;
    },
    { base: 0, allowances: 0, deductions: 0, net: 0 }
  );
  totalBaseEl.textContent = formatter.format(totals.base);
  totalAllowancesEl.textContent = formatter.format(totals.allowances);
  totalDeductionsEl.textContent = formatter.format(totals.deductions);
  totalNetEl.textContent = formatter.format(totals.net);
}

function attachRowEvents() {
  tbody.querySelectorAll(".payroll-input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const row = event.target.closest("tr");
      updateRowNet(row);
      updateTotals();
    });
  });
}

function renderPayroll() {
  const visibleEmployees = getVisibleEmployees();
  const monthEntries = payroll.filter((entry) => entry.month === currentMonth);

  tbody.innerHTML = visibleEmployees
    .map((emp) => {
      const entry = findPayrollEntry(emp, monthEntries);
      const base = entry?.base ?? emp.salaryBase ?? 0;
      const allowances = entry?.allowancesTotal ?? emp.allowances ?? 0;
      const deductions = entry?.deductionsTotal ?? 0;
      const net = base + allowances - deductions;
      const status = entry?.status || "draft";
      const statusLabel = entry ? status : "not saved";
      return `
        <tr data-employee-id="${emp.id}" data-entry-id="${entry?.id || ""}">
          <td>
            <div class="employee-cell">
              <div>${emp.fullName || emp.empId || emp.id}</div>
              <div class="employee-meta">ID: ${emp.empId || emp.id}</div>
            </div>
          </td>
          <td><input class="input payroll-input" data-field="base" type="number" min="0" value="${base}" ${!canManage ? "disabled" : ""} /></td>
          <td><input class="input payroll-input" data-field="allowances" type="number" min="0" value="${allowances}" ${!canManage ? "disabled" : ""} /></td>
          <td><input class="input payroll-input" data-field="deductions" type="number" min="0" value="${deductions}" ${!canManage ? "disabled" : ""} /></td>
          <td class="net-value">${formatter.format(net)}</td>
          <td><span class="badge">${statusLabel}</span></td>
        </tr>
      `;
    })
    .join("");

  emptyState.classList.toggle("hidden", visibleEmployees.length > 0);
  attachRowEvents();
  updateTotals();
}

async function savePayroll(status = "draft") {
  if (!canManage) return;
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const tasks = rows.map(async (row) => {
    const { base, allowances, deductions, net } = getRowValues(row);
    const employeeId = row.dataset.employeeId;
    const entryId = row.dataset.entryId;
    const employee = employees.find((emp) => emp.id === employeeId);
    const payload = {
      employeeId,
      employeeName: employee?.fullName || "",
      employeeCode: employee?.empId || "",
      month: currentMonth,
      base,
      allowancesTotal: allowances,
      deductionsTotal: deductions,
      net,
      status
    };

    if (entryId) {
      await updatePayroll(entryId, payload);
    } else {
      const newId = await createPayroll(payload);
      row.dataset.entryId = newId;
    }
  });

  await Promise.all(tasks);
  showToast("success", "Payroll saved");
  await loadPayroll();
}

function buildExportData() {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  return rows.map((row) => {
    const employeeId = row.dataset.employeeId;
    const employee = employees.find((emp) => emp.id === employeeId) || {};
    const { base, allowances, deductions, net } = getRowValues(row);
    const status = row.querySelector(".badge")?.textContent || "";
    return {
      employeeName: employee.fullName || employee.empId || employee.id || employeeId,
      employeeCode: employee.empId || employeeId,
      base,
      allowances,
      deductions,
      net,
      status
    };
  });
}

function exportToCsv() {
  const rows = buildExportData();
  const header = ["Employee", "Employee ID", "Base", "Allowances", "Deductions", "Net", "Status"];
  const lines = rows.map((row) =>
    [
      row.employeeName,
      row.employeeCode,
      row.base,
      row.allowances,
      row.deductions,
      row.net,
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
  link.download = `payroll-${currentMonth}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportToPdf() {
  const rows = buildExportData();
  const totals = {
    base: totalBaseEl.textContent,
    allowances: totalAllowancesEl.textContent,
    deductions: totalDeductionsEl.textContent,
    net: totalNetEl.textContent
  };
  const printable = window.open("", "_blank");
  if (!printable) return;
  printable.document.write(`
    <html>
      <head>
        <title>Payroll ${currentMonth}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin-bottom: 8px; }
          .totals { margin: 16px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; text-align: left; }
          th { background: #f3f5f7; }
        </style>
      </head>
      <body>
        <h1>Payroll - ${currentMonth}</h1>
        <div class="totals">
          <strong>Total Base:</strong> ${totals.base} |
          <strong>Total Allowances:</strong> ${totals.allowances} |
          <strong>Total Deductions:</strong> ${totals.deductions} |
          <strong>Total Net:</strong> ${totals.net}
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Base</th>
              <th>Allowances</th>
              <th>Deductions</th>
              <th>Net</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td>${row.employeeName}</td>
                    <td>${row.employeeCode}</td>
                    <td>${row.base}</td>
                    <td>${row.allowances}</td>
                    <td>${row.deductions}</td>
                    <td>${row.net}</td>
                    <td>${row.status}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printable.document.close();
  printable.focus();
  printable.print();
}

async function loadEmployees() {
  employees = await listEmployees();
}

async function loadPayroll() {
  const data = isEmployee ? await listPayroll({ employeeId: user.uid }) : await listPayroll();
  payroll = data;
  renderPayroll();
}

buildMonthOptions();
monthSelect.addEventListener("change", async () => {
  currentMonth = monthSelect.value;
  await loadPayroll();
});
saveBtn.addEventListener("click", () => savePayroll("draft"));
exportExcelBtn.addEventListener("click", exportToCsv);
exportPdfBtn.addEventListener("click", exportToPdf);

(async () => {
  await loadEmployees();
  await loadPayroll();
})();

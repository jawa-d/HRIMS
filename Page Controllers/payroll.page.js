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
const searchInput = document.getElementById("payroll-search");
const saveBtn = document.getElementById("save-payroll-btn");
const approveBtn = document.getElementById("approve-payroll-btn");
const exportExcelBtn = document.getElementById("export-excel-btn");
const exportPdfBtn = document.getElementById("export-pdf-btn");

const monthLabelEl = document.getElementById("payroll-month-label");
const monthStatusBadgeEl = document.getElementById("month-status-badge");
const monthStatusTextEl = document.getElementById("month-status-text");

const tbody = document.getElementById("payroll-body");
const emptyState = document.getElementById("payroll-empty");

const totalEmployeesEl = document.getElementById("total-employees");
const totalCompletedEl = document.getElementById("total-completed");
const totalBaseEl = document.getElementById("total-base");
const totalAllowancesEl = document.getElementById("total-allowances");
const totalDeductionsEl = document.getElementById("total-deductions");
const totalNetEl = document.getElementById("total-net");

if (!canManage) {
  saveBtn.classList.add("hidden");
  approveBtn.classList.add("hidden");
}

let payrollEntries = [];
let monthEntries = [];
let employees = [];
let currentMonth = "";

const formatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "-";
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function safeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function buildMonthOptions() {
  const now = new Date();
  const months = Array.from({ length: 18 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = formatMonthKey(date);
    return {
      key,
      label: monthLabelFromKey(key)
    };
  });

  monthSelect.innerHTML = months.map((month) => `<option value="${month.key}">${month.label}</option>`).join("");
  currentMonth = months[0].key;
  monthSelect.value = currentMonth;
  monthLabelEl.textContent = monthLabelFromKey(currentMonth);
}

function getVisibleEmployees() {
  const query = (searchInput.value || "").trim().toLowerCase();
  let source = employees;

  if (isEmployee) {
    source = employees.filter((emp) => emp.id === user.uid || emp.empId === user.uid || emp.email === user.email);
  }

  if (!query) return source;
  return source.filter((emp) => {
    return [emp.fullName, emp.empId, emp.email]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(query));
  });
}

function findPayrollEntryForEmployee(emp, list) {
  const matches = list.filter((entry) => {
    return entry.employeeId === emp.id || entry.employeeId === emp.empId || entry.employeeCode === emp.empId;
  });
  matches.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
  return matches[0] || null;
}

function getRowValues(row) {
  const base = safeNumber(row.querySelector('[data-field="base"]').value);
  const allowances = safeNumber(row.querySelector('[data-field="allowances"]').value);
  const deductions = safeNumber(row.querySelector('[data-field="deductions"]').value);
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
      if (base > 0 || allowances > 0 || deductions > 0) acc.completed += 1;
      acc.base += base;
      acc.allowances += allowances;
      acc.deductions += deductions;
      acc.net += net;
      return acc;
    },
    { completed: 0, base: 0, allowances: 0, deductions: 0, net: 0 }
  );

  totalEmployeesEl.textContent = String(rows.length);
  totalCompletedEl.textContent = String(totals.completed);
  totalBaseEl.textContent = formatter.format(totals.base);
  totalAllowancesEl.textContent = formatter.format(totals.allowances);
  totalDeductionsEl.textContent = formatter.format(totals.deductions);
  totalNetEl.textContent = formatter.format(totals.net);
}

function getMonthStatus(entries, totalEmployeeCount) {
  if (!entries.length) return "draft";
  const approvedCount = entries.filter((entry) => entry.status === "approved").length;
  if (approvedCount === 0) return "processing";
  if (approvedCount >= totalEmployeeCount && totalEmployeeCount > 0) return "approved";
  return "processing";
}

function renderMonthStatus(totalEmployeeCount) {
  const status = getMonthStatus(monthEntries, totalEmployeeCount);

  monthStatusBadgeEl.className = "status-pill";
  if (status === "draft") {
    monthStatusBadgeEl.classList.add("status-pill-draft");
    monthStatusBadgeEl.textContent = "Draft";
    monthStatusTextEl.textContent = "No approved payroll yet. Set salary details then save.";
  } else if (status === "processing") {
    monthStatusBadgeEl.classList.add("status-pill-processing");
    monthStatusBadgeEl.textContent = "In Progress";
    const approvedCount = monthEntries.filter((entry) => entry.status === "approved").length;
    monthStatusTextEl.textContent = `${approvedCount}/${Math.max(totalEmployeeCount, 1)} approved entries for ${monthLabelFromKey(currentMonth)}.`;
  } else {
    monthStatusBadgeEl.classList.add("status-pill-approved");
    monthStatusBadgeEl.textContent = "Approved";
    monthStatusTextEl.textContent = `Payroll for ${monthLabelFromKey(currentMonth)} is fully approved.`;
  }
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
  monthEntries = payrollEntries.filter((entry) => entry.month === currentMonth);

  tbody.innerHTML = visibleEmployees
    .map((emp) => {
      const entry = findPayrollEntryForEmployee(emp, monthEntries);
      const base = entry?.base ?? safeNumber(emp.salaryBase);
      const allowances = entry?.allowancesTotal ?? safeNumber(emp.allowances);
      const deductions = entry?.deductionsTotal ?? 0;
      const net = base + allowances - deductions;
      const status = entry?.status || "draft";
      const statusClass = status === "approved" ? "entry-badge entry-badge-approved" : "entry-badge";

      return `
        <tr data-employee-id="${emp.id}" data-employee-code="${emp.empId || ""}" data-entry-id="${entry?.id || ""}">
          <td>
            <div class="employee-cell">
              <div>${emp.fullName || emp.empId || emp.id}</div>
              <div class="employee-meta">ID: ${emp.empId || emp.id} ${emp.email ? `| ${emp.email}` : ""}</div>
            </div>
          </td>
          <td><input class="input payroll-input" data-field="base" type="number" min="0" step="0.01" value="${base}" ${!canManage ? "disabled" : ""} /></td>
          <td><input class="input payroll-input" data-field="allowances" type="number" min="0" step="0.01" value="${allowances}" ${!canManage ? "disabled" : ""} /></td>
          <td><input class="input payroll-input" data-field="deductions" type="number" min="0" step="0.01" value="${deductions}" ${!canManage ? "disabled" : ""} /></td>
          <td class="net-value">${formatter.format(net)}</td>
          <td><span class="badge ${statusClass}">${status}</span></td>
        </tr>
      `;
    })
    .join("");

  emptyState.classList.toggle("hidden", visibleEmployees.length > 0);
  monthLabelEl.textContent = monthLabelFromKey(currentMonth);
  renderMonthStatus(visibleEmployees.length);
  attachRowEvents();
  updateTotals();
}

async function savePayroll(status = "draft") {
  if (!canManage) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));
  const tasks = rows.map(async (row) => {
    const { base, allowances, deductions, net } = getRowValues(row);
    const employeeId = row.dataset.employeeId;
    const employeeCode = row.dataset.employeeCode || "";
    const entryId = row.dataset.entryId;
    const employee = employees.find((emp) => emp.id === employeeId);

    const payload = {
      employeeId,
      employeeName: employee?.fullName || "",
      employeeCode,
      month: currentMonth,
      base,
      allowancesTotal: allowances,
      deductionsTotal: deductions,
      net,
      status
    };

    if (entryId) {
      await updatePayroll(entryId, payload);
      return;
    }

    const existing = findPayrollEntryForEmployee(employee || { id: employeeId, empId: employeeCode }, monthEntries);
    if (existing?.id) {
      await updatePayroll(existing.id, payload);
      row.dataset.entryId = existing.id;
      return;
    }

    const newId = await createPayroll(payload);
    row.dataset.entryId = newId;
  });

  await Promise.all(tasks);
  showToast("success", status === "approved" ? "Payroll month approved" : "Payroll month saved");
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
    [row.employeeName, row.employeeCode, row.base, row.allowances, row.deductions, row.net, row.status]
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
        <h1>Payroll - ${monthLabelFromKey(currentMonth)}</h1>
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
  const data = await listEmployees();
  employees = data.filter((emp) => emp.status !== "inactive");
}

async function loadPayroll() {
  const filter = isEmployee ? { employeeId: user.uid, month: currentMonth } : { month: currentMonth };
  payrollEntries = await listPayroll(filter);
  renderPayroll();
}

buildMonthOptions();
monthSelect.addEventListener("change", async () => {
  currentMonth = monthSelect.value;
  await loadPayroll();
});
searchInput.addEventListener("input", renderPayroll);
saveBtn.addEventListener("click", () => savePayroll("draft"));
approveBtn.addEventListener("click", () => savePayroll("approved"));
exportExcelBtn.addEventListener("click", exportToCsv);
exportPdfBtn.addEventListener("click", exportToPdf);

(async () => {
  await loadEmployees();
  await loadPayroll();
})();

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
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
const resetBtn = document.getElementById("reset-payroll-btn");
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
  resetBtn?.classList.add("hidden");
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

function getScopedEmployees() {
  if (isEmployee) {
    return employees.filter((emp) => emp.id === user.uid || emp.empId === user.uid || emp.email === user.email);
  }
  return employees;
}

function getVisibleEmployees() {
  const query = (searchInput.value || "").trim().toLowerCase();
  const source = getScopedEmployees();

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

function removedEmployeeIds(entries = []) {
  const set = new Set();
  entries.forEach((entry) => {
    if (entry?.status !== "removed") return;
    const id = String(entry.employeeId || "").trim();
    const code = String(entry.employeeCode || "").trim();
    if (id) set.add(id);
    if (code) set.add(code);
  });
  return set;
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
  monthEntries = payrollEntries.filter((entry) => entry.month === currentMonth);
  const removedSet = removedEmployeeIds(monthEntries);
  const visibleEmployees = getVisibleEmployees().filter((emp) => !removedSet.has(String(emp.id)) && !removedSet.has(String(emp.empId || "")));
  const scopedVisibleCount = getScopedEmployees().filter((emp) => !removedSet.has(String(emp.id)) && !removedSet.has(String(emp.empId || ""))).length;

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
          <td>
            ${
              canManage
                ? `<button class="btn btn-ghost" data-action="delete" data-id="${entry?.id || ""}" data-employee-id="${emp.id}">Delete</button>`
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  emptyState.classList.toggle("hidden", visibleEmployees.length > 0);
  monthLabelEl.textContent = monthLabelFromKey(currentMonth);
  renderMonthStatus(scopedVisibleCount);
  attachRowEvents();
  attachActionEvents();
  updateTotals();
}

function attachActionEvents() {
  tbody.querySelectorAll('button[data-action="delete"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const entryId = button.dataset.id;
      const employeeId = button.dataset.employeeId;
      if (!canManage || !employeeId) return;
      if (!window.confirm("Delete this payroll row from the selected month?")) return;

      try {
        const employee = employees.find((emp) => String(emp.id) === String(employeeId)) || {};
        const payload = {
          employeeId: String(employee.id || employeeId),
          employeeName: employee.fullName || "",
          employeeCode: employee.empId || "",
          month: currentMonth,
          base: 0,
          allowancesTotal: 0,
          deductionsTotal: 0,
          net: 0,
          status: "removed"
        };

        if (entryId) {
          await updatePayroll(entryId, payload);
        } else {
          const existing = findPayrollEntryForEmployee(
            { id: employeeId, empId: employee.empId || "" },
            monthEntries
          );
          if (existing?.id) {
            await updatePayroll(existing.id, payload);
          } else {
            await createPayroll(payload);
          }
        }

        showToast("success", "Payroll row deleted");
        await loadPayroll();
      } catch (error) {
        console.error("Payroll delete failed:", error);
        showToast("error", "Payroll delete failed");
      }
    });
  });
}

async function savePayroll(status = "draft", overridesByEmployee = null) {
  if (!canManage) return;

  const rowMap = new Map(
    Array.from(tbody.querySelectorAll("tr")).map((row) => [String(row.dataset.employeeId || ""), row])
  );
  const removedSet = removedEmployeeIds(monthEntries);
  const scopedEmployees = getScopedEmployees().filter(
    (emp) => !removedSet.has(String(emp.id)) && !removedSet.has(String(emp.empId || ""))
  );
  const tasks = scopedEmployees.map(async (employee) => {
    const employeeId = String(employee.id || "");
    const row = rowMap.get(employeeId) || null;
    const entry = findPayrollEntryForEmployee(employee, monthEntries);
    const employeeCode = employee.empId || "";
    const entryId = row?.dataset.entryId || entry?.id || "";
    const override = overridesByEmployee && Object.prototype.hasOwnProperty.call(overridesByEmployee, employeeId)
      ? overridesByEmployee[employeeId]
      : null;

    const values = override
      ? {
        base: safeNumber(override.base),
        allowances: safeNumber(override.allowances),
        deductions: safeNumber(override.deductions),
        net: safeNumber(override.base) + safeNumber(override.allowances) - safeNumber(override.deductions)
      }
      : row
        ? getRowValues(row)
        : (() => {
          const base = entry?.base ?? safeNumber(employee.salaryBase);
          const allowances = entry?.allowancesTotal ?? safeNumber(employee.allowances);
          const deductions = entry?.deductionsTotal ?? 0;
          const net = base + allowances - deductions;
          return { base, allowances, deductions, net };
        })();

    const payload = {
      employeeId,
      employeeName: employee.fullName || "",
      employeeCode,
      month: currentMonth,
      base: values.base,
      allowancesTotal: values.allowances,
      deductionsTotal: values.deductions,
      net: values.net,
      status
    };

    if (entryId) {
      await updatePayroll(entryId, payload);
      return;
    }

    const existing = findPayrollEntryForEmployee(employee || { id: employeeId, empId: employeeCode }, monthEntries);
    if (existing?.id) {
      await updatePayroll(existing.id, payload);
      if (row) row.dataset.entryId = existing.id;
      return;
    }

    const newId = await createPayroll(payload);
    if (row) row.dataset.entryId = newId;
  });

  await Promise.all(tasks);
  showToast("success", status === "approved" ? "Payroll month approved" : "Payroll month saved");
  await loadPayroll();
}

async function resetPayrollMonth() {
  if (!canManage) return;
  const confirmed = window.confirm("Reset base, allowances, and deductions to 0 for this month?");
  if (!confirmed) return;

  const removedEntries = monthEntries.filter((entry) => entry.status === "removed");
  if (removedEntries.length) {
    await Promise.all(
      removedEntries
        .filter((entry) => entry.id)
        .map((entry) =>
          updatePayroll(entry.id, {
            ...entry,
            base: 0,
            allowancesTotal: 0,
            deductionsTotal: 0,
            net: 0,
            status: "draft"
          })
        )
    );
    await loadPayroll();
  }

  const scopedEmployees = getScopedEmployees();
  const overridesByEmployee = {};
  scopedEmployees.forEach((emp) => {
    overridesByEmployee[String(emp.id)] = { base: 0, allowances: 0, deductions: 0 };
  });

  const rows = Array.from(tbody.querySelectorAll("tr"));
  rows.forEach((row) => {
    const baseInput = row.querySelector('[data-field="base"]');
    const allowancesInput = row.querySelector('[data-field="allowances"]');
    const deductionsInput = row.querySelector('[data-field="deductions"]');
    if (baseInput) baseInput.value = "0";
    if (allowancesInput) allowancesInput.value = "0";
    if (deductionsInput) deductionsInput.value = "0";
    updateRowNet(row);
  });
  updateTotals();

  await savePayroll("draft", overridesByEmployee);
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
  showTableSkeleton(tbody, { rows: 6, cols: 7 });
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
resetBtn?.addEventListener("click", resetPayrollMonth);
approveBtn.addEventListener("click", () => savePayroll("approved"));
exportExcelBtn.addEventListener("click", exportToCsv);
exportPdfBtn.addEventListener("click", exportToPdf);
window.addEventListener("global-search", (event) => {
  searchInput.value = event.detail || "";
  renderPayroll();
});

(async () => {
  try {
    await loadEmployees();
    await loadPayroll();
  } catch (error) {
    console.error("Payroll page init failed:", error);
    showToast("error", "Could not load payroll data");
  }
})();

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listPayroll, createPayroll, updatePayroll, batchUpsertPayroll } from "../Services/payroll.service.js";
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
let draggingRow = null;

const PAYROLL_ROW_ORDER_STORAGE_PREFIX = "hrms:payroll-row-order:";

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

function readNumberInput(input, { strict = false } = {}) {
  if (!input) return strict ? null : 0;
  const raw = String(input.value ?? "").trim();
  if (!raw) return 0;
  if (strict && input.validity?.badInput) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return strict ? null : 0;
  return num;
}

function normalizeStatus(status = "") {
  return String(status || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function payrollAccent(emp = {}) {
  const source = emp.empId || emp.id || emp.email || emp.fullName || "";
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function employeePrimaryId(emp = {}) {
  return String(emp.id || emp.uid || emp.empId || emp.email || "").trim();
}

function getRowOrderStorageKey(month) {
  return `${PAYROLL_ROW_ORDER_STORAGE_PREFIX}${month}`;
}

function readRowOrder(month) {
  const key = getRowOrderStorageKey(month);
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeRowOrder(month, ids = []) {
  const key = getRowOrderStorageKey(month);
  const normalized = Array.from(new Set(ids.map((item) => String(item || "").trim()).filter(Boolean)));
  window.localStorage.setItem(key, JSON.stringify(normalized));
}

function applyStoredOrder(employeeList = [], month = currentMonth) {
  const order = readRowOrder(month);
  if (!order.length) return employeeList;

  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return employeeList
    .map((emp, index) => ({ emp, index }))
    .sort((a, b) => {
      const aid = employeePrimaryId(a.emp);
      const bid = employeePrimaryId(b.emp);
      const aRank = orderIndex.has(aid) ? orderIndex.get(aid) : Number.POSITIVE_INFINITY;
      const bRank = orderIndex.has(bid) ? orderIndex.get(bid) : Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      return a.index - b.index;
    })
    .map((item) => item.emp);
}

function persistCurrentRowOrder() {
  const currentRows = Array.from(tbody.querySelectorAll("tr"));
  const orderedVisibleIds = currentRows
    .map((row) => String(row.dataset.employeeId || "").trim())
    .filter(Boolean);

  const previousOrder = readRowOrder(currentMonth);
  const scopedIds = getScopedEmployees()
    .map((emp) => employeePrimaryId(emp))
    .filter(Boolean);

  const nextOrder = [];
  orderedVisibleIds.forEach((id) => {
    if (!nextOrder.includes(id)) nextOrder.push(id);
  });
  previousOrder.forEach((id) => {
    if (!nextOrder.includes(id)) nextOrder.push(id);
  });
  scopedIds.forEach((id) => {
    if (!nextOrder.includes(id)) nextOrder.push(id);
  });

  writeRowOrder(currentMonth, nextOrder);
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
    const userUid = String(user?.uid || "").trim();
    const userEmail = String(user?.email || "").trim().toLowerCase();
    return employees.filter((emp) => {
      const primaryId = employeePrimaryId(emp);
      const empCode = String(emp.empId || "").trim();
      const empEmail = String(emp.email || "").trim().toLowerCase();
      return primaryId === userUid || empCode === userUid || empEmail === userEmail;
    });
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
  const base = readNumberInput(row.querySelector('[data-field="base"]'));
  const allowances = readNumberInput(row.querySelector('[data-field="allowances"]'));
  const deductions = readNumberInput(row.querySelector('[data-field="deductions"]'));
  const net = base + allowances - deductions;
  return { base, allowances, deductions, net };
}

function getRowValuesStrict(row) {
  const baseInput = row.querySelector('[data-field="base"]');
  const allowancesInput = row.querySelector('[data-field="allowances"]');
  const deductionsInput = row.querySelector('[data-field="deductions"]');
  const base = readNumberInput(baseInput, { strict: true });
  const allowances = readNumberInput(allowancesInput, { strict: true });
  const deductions = readNumberInput(deductionsInput, { strict: true });
  if (base === null) return { errorField: "base", values: null };
  if (allowances === null) return { errorField: "allowances", values: null };
  if (deductions === null) return { errorField: "deductions", values: null };
  return { errorField: "", values: { base, allowances, deductions, net: base + allowances - deductions } };
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
  const approvedCount = entries.filter((entry) => normalizeStatus(entry.status) === "approved").length;
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
    const approvedCount = monthEntries.filter((entry) => normalizeStatus(entry.status) === "approved").length;
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
  const visibleEmployees = applyStoredOrder(
    getVisibleEmployees().filter((emp) => !removedSet.has(String(emp.id)) && !removedSet.has(String(emp.empId || ""))),
    currentMonth
  );
  const scopedVisibleCount = getScopedEmployees().filter((emp) => !removedSet.has(String(emp.id)) && !removedSet.has(String(emp.empId || ""))).length;

  tbody.innerHTML = visibleEmployees
    .map((emp, index) => {
      const entry = findPayrollEntryForEmployee(emp, monthEntries);
      const base = entry?.base ?? safeNumber(emp.salaryBase);
      const allowances = entry?.allowancesTotal ?? safeNumber(emp.allowances);
      const deductions = entry?.deductionsTotal ?? 0;
      const net = base + allowances - deductions;
      const status = normalizeStatus(entry?.status || "draft");
      const statusClass = status === "approved" ? "entry-badge entry-badge-approved" : "entry-badge";

      return `
        <tr class="payroll-row" style="--payroll-accent:${payrollAccent(emp)};--row-index:${index};" data-employee-id="${employeePrimaryId(emp)}" data-employee-code="${emp.empId || ""}" data-entry-id="${entry?.id || ""}">
          <td>
            <div class="employee-cell">
              <div class="employee-name"><span class="employee-dot"></span><span>${emp.fullName || emp.empId || emp.id}</span></div>
              <div class="employee-meta">ID: ${emp.empId || employeePrimaryId(emp)} ${emp.email ? `| ${emp.email}` : ""}</div>
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
  attachRowReorderEvents();
  updateTotals();
}

function attachRowReorderEvents() {
  const rows = Array.from(tbody.querySelectorAll(".payroll-row"));
  rows.forEach((row) => {
    row.removeAttribute("draggable");
    row.classList.remove("is-draggable");
    row.classList.remove("is-dragging");
    row.classList.remove("drag-target");
  });
  if (!canManage || rows.length < 2) return;

  rows.forEach((row) => {
    row.setAttribute("draggable", "true");
    row.classList.add("is-draggable");

    row.addEventListener("dragstart", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input,button,select,textarea,a,label")) {
        event.preventDefault();
        return;
      }
      draggingRow = row;
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.dataset.employeeId || "");
      }
    });

    row.addEventListener("dragenter", (event) => {
      event.preventDefault();
      if (!draggingRow || row === draggingRow) return;
      row.classList.add("drag-target");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-target");
    });

    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggingRow || row === draggingRow) return;
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      if (before) {
        tbody.insertBefore(draggingRow, row);
      } else {
        tbody.insertBefore(draggingRow, row.nextSibling);
      }
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-target");
    });

    row.addEventListener("dragend", () => {
      rows.forEach((item) => item.classList.remove("drag-target"));
      if (!draggingRow) return;
      draggingRow.classList.remove("is-dragging");
      draggingRow = null;
      persistCurrentRowOrder();
      updateTotals();
    });
  });
}

function attachActionEvents() {
  tbody.querySelectorAll('button[data-action="delete"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const entryId = button.dataset.id;
      const employeeId = button.dataset.employeeId;
      if (!canManage || !employeeId) return;
      if (!window.confirm("Delete this payroll row from the selected month?")) return;

      try {
        const employee = employees.find((emp) => {
          const primaryId = employeePrimaryId(emp);
          const code = String(emp.empId || "").trim();
          return primaryId === String(employeeId || "").trim() || (code && code === String(employeeId || "").trim());
        }) || {};
        const normalizedEmployeeId = employeePrimaryId(employee) || String(employeeId || "").trim();
        const payload = {
          employeeId: normalizedEmployeeId,
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
            { id: normalizedEmployeeId, empId: employee.empId || "" },
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

  const rows = Array.from(tbody.querySelectorAll("tr"));
  const upsertItems = rows.map((row) => {
    const employeeId = String(row.dataset.employeeId || "").trim();
    const employeeCode = String(row.dataset.employeeCode || "").trim();
    if (!employeeId && !employeeCode) return null;

    const employee = employees.find((emp) => {
      const primaryId = employeePrimaryId(emp);
      const code = String(emp.empId || "").trim();
      return (employeeId && primaryId === employeeId)
        || (employeeCode && code === employeeCode)
        || (employeeId && code === employeeId);
    }) || {};

    const override = overridesByEmployee
      ? (overridesByEmployee[employeeId] ?? overridesByEmployee[employeeCode] ?? null)
      : null;

    const strictRow = getRowValuesStrict(row);
    if (strictRow.errorField) {
      const fieldLabelMap = {
        base: "Base",
        allowances: "Allowances",
        deductions: "Deductions"
      };
      const fieldLabel = fieldLabelMap[strictRow.errorField] || strictRow.errorField;
      showToast("error", `Invalid ${fieldLabel} value for ${employee.fullName || employeeCode || employeeId}`);
      const targetInput = row.querySelector(`[data-field="${strictRow.errorField}"]`);
      targetInput?.focus();
      throw new Error(`invalid-payroll-input:${strictRow.errorField}`);
    }

    const values = override
      ? {
        base: safeNumber(override.base),
        allowances: safeNumber(override.allowances),
        deductions: safeNumber(override.deductions),
        net: safeNumber(override.base) + safeNumber(override.allowances) - safeNumber(override.deductions)
      }
      : strictRow.values;

    const entryId = String(row.dataset.entryId || "").trim();
    const fallbackExisting = monthEntries.find((entry) => {
      const eid = String(entry.employeeId || "").trim();
      const ecode = String(entry.employeeCode || "").trim();
      return (employeeId && (eid === employeeId || ecode === employeeId))
        || (employeeCode && (ecode === employeeCode || eid === employeeCode));
    });

    return {
      id: entryId || fallbackExisting?.id || "",
      payload: {
        employeeId: employeeId || employeeCode,
        employeeName: employee.fullName || "",
        employeeCode: employeeCode || String(employee.empId || "").trim(),
        month: currentMonth,
        base: values.base,
        allowancesTotal: values.allowances,
        deductionsTotal: values.deductions,
        net: values.net,
        status
      }
    };
  }).filter(Boolean);

  try {
    await batchUpsertPayroll(upsertItems);
    showToast("success", status === "approved" ? "Payroll month approved" : "Payroll month saved");
    await loadPayroll();
  } catch (error) {
    if (String(error?.message || "").startsWith("invalid-payroll-input:")) {
      return;
    }
    console.error("Save payroll failed:", error);
    const details = [error?.code, error?.message].filter(Boolean).join(" - ");
    showToast("error", details ? `Payroll save failed: ${details}` : "Payroll save failed");
  }
}

async function resetPayrollMonth() {
  if (!canManage) return;
  const confirmed = window.confirm("Reset base, allowances, and deductions to 0 for this month?");
  if (!confirmed) return;

  const removedEntries = monthEntries.filter((entry) => entry.status === "removed");
  try {
    if (removedEntries.length) {
      await batchUpsertPayroll(
        removedEntries
          .filter((entry) => entry.id)
          .map((entry) => ({
            id: entry.id,
            payload: {
              ...entry,
              base: 0,
              allowancesTotal: 0,
              deductionsTotal: 0,
              net: 0,
              status: "draft"
            }
          }))
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
  } catch (error) {
    console.error("Reset payroll failed:", error);
    showToast("error", "Payroll reset failed");
  }
}

function buildExportData() {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  return rows.map((row) => {
    const employeeId = String(row.dataset.employeeId || "").trim();
    const employeeCode = String(row.dataset.employeeCode || "").trim();
    const employee = employees.find((emp) => {
      const primaryId = employeePrimaryId(emp);
      const code = String(emp.empId || "").trim();
      return primaryId === employeeId || (code && (code === employeeId || code === employeeCode));
    }) || {};
    const { base, allowances, deductions, net } = getRowValues(row);
    const status = row.querySelector(".badge")?.textContent || "";
    return {
      employeeName: employee.fullName || employee.empId || employeePrimaryId(employee) || employeeId,
      employeeCode: employee.empId || employeePrimaryId(employee) || employeeId,
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
  const logoUrl = new URL("../HRMS%20Html/assets/logo.jpg", window.location.href).href;
  const printedAt = new Date().toLocaleString();

  printable.document.write(`
    <html>
      <head>
        <title>Payroll ${currentMonth}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            font-size: 12px;
            margin: 0;
          }
          .sheet {
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 14px;
            max-width: 100%;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #0f766e;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .brand img {
            width: 46px;
            height: 46px;
            border-radius: 8px;
            object-fit: cover;
            border: 1px solid #cbd5e1;
          }
          .company-name {
            font-size: 17px;
            font-weight: 700;
            margin: 0;
          }
          .doc-title {
            margin: 2px 0 0;
            font-size: 13px;
            color: #334155;
          }
          .meta {
            text-align: right;
            color: #334155;
            font-size: 11px;
            line-height: 1.5;
          }
          .summary {
            border: 1px solid #dbe3ea;
            border-radius: 8px;
            background: #f8fafc;
            padding: 8px 10px;
            margin-bottom: 12px;
            line-height: 1.8;
          }
          .summary strong {
            color: #0b1324;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            font-size: 12px;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #d6dee6;
            padding: 7px 8px;
            text-align: left;
          }
          th {
            background: #e8f2f1;
            font-weight: 700;
            white-space: nowrap;
          }
          th:first-child, td:first-child {
            width: 24%;
          }
          th:last-child, td:last-child {
            width: 22%;
          }
          tr:nth-child(even) td {
            background: #fcfdff;
          }
          .num {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .footer {
            margin-top: 22px;
            display: flex;
            justify-content: space-between;
            gap: 22px;
          }
          .sign-box {
            width: 320px;
            text-align: center;
          }
          .sign-line {
            margin-top: 38px;
            border-top: 1px solid #1f2937;
            padding-top: 6px;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <header class="header">
            <div class="brand">
              <img src="${logoUrl}" alt="Company Logo" onerror="this.style.display='none'" />
              <div>
                <p class="company-name">شركة وادي الرافدين</p>
                <p class="doc-title">Payroll Statement - ${monthLabelFromKey(currentMonth)}</p>
              </div>
            </div>
            <div class="meta">
              <div><strong>Month:</strong> ${currentMonth}</div>
              <div><strong>Printed:</strong> ${printedAt}</div>
            </div>
          </header>

          <div class="summary">
            <strong>Total Base:</strong> ${totals.base}
            &nbsp; | &nbsp;
            <strong>Total Allowances:</strong> ${totals.allowances}
            &nbsp; | &nbsp;
            <strong>Total Deductions:</strong> ${totals.deductions}
            &nbsp; | &nbsp;
            <strong>Total Net:</strong> ${totals.net}
          </div>

          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Base</th>
                <th class="num">Allowances</th>
                <th class="num">Deductions</th>
                <th class="num">Net</th>
                <th>Employee Signature</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                    <tr>
                      <td>${row.employeeName}</td>
                      <td class="num">${formatter.format(Number(row.base || 0))}</td>
                      <td class="num">${formatter.format(Number(row.allowances || 0))}</td>
                      <td class="num">${formatter.format(Number(row.deductions || 0))}</td>
                      <td class="num"><strong>${formatter.format(Number(row.net || 0))}</strong></td>
                      <td></td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>

          <div class="footer">
            <div class="sign-box">
              <div>توقيع المدير المفوض</div>
              <div class="sign-line">احمد جاسم سلمان</div>
            </div>
            <div class="sign-box">
              <div>توقيع قسم الحسابات</div>
              <div class="sign-line">&nbsp;</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  printable.document.close();
  printable.focus();
  printable.print();
}

async function loadEmployees() {
  const data = await listEmployees({ includeArchived: false, limitCount: 250 });
  employees = data.filter((emp) => emp.status !== "inactive");
}

async function loadPayroll() {
  try {
    showTableSkeleton(tbody, { rows: 6, cols: 7 });
    if (isEmployee) {
      const byUid = await listPayroll({ employeeId: user.uid, month: currentMonth, limitCount: 120 });
      if (byUid.length) {
        payrollEntries = byUid;
      } else {
        const allMonth = await listPayroll({ month: currentMonth, limitCount: 400 });
        const mail = String(user?.email || "").trim().toLowerCase();
        payrollEntries = allMonth.filter((item) => {
          const id = String(item.employeeId || "").trim();
          const code = String(item.employeeCode || "").trim();
          const emp = employees.find((e) => String(e.id) === id || (code && String(e.empId || "") === code));
          const empMail = String(emp?.email || "").trim().toLowerCase();
          return id === String(user?.uid || "").trim() || empMail === mail;
        });
      }
    } else {
      payrollEntries = await listPayroll({ month: currentMonth, limitCount: 400 });
    }
    renderPayroll();
  } catch (error) {
    console.error("Load payroll failed:", error);
    payrollEntries = [];
    renderPayroll();
    showToast("error", "Could not load payroll data");
  }
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
trackUxEvent({ event: "page_open", module: "payroll" });

(async () => {
  try {
    await loadEmployees();
    await loadPayroll();
  } catch (error) {
    console.error("Payroll page init failed:", error);
    showToast("error", "Could not load payroll data");
  }
})();

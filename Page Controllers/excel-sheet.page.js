import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listEmployees } from "../Services/employees.service.js";
import { listExcelSheetInputs, upsertExcelSheetInput, clearExcelSheetYear } from "../Services/excel-sheet.service.js";

if (!enforceAuth("excel_sheet")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("excel_sheet");

const SHEET_YEAR = 2026;
const locale = document.documentElement.lang?.startsWith("ar") ? "ar-IQ" : "en-US";
const months = Array.from({ length: 12 }, (_, index) =>
  new Date(SHEET_YEAR, index, 1).toLocaleDateString(locale, { month: "short" })
);
const numberFormatter = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const headerRow = document.getElementById("excel-header-row");
const body = document.getElementById("excel-body");
const emptyState = document.getElementById("excel-empty");
const employeesCountEl = document.getElementById("excel-employees-count");
const grandTotalEl = document.getElementById("excel-grand-total");
const resetBtn = document.getElementById("excel-reset-btn");
const exportBtn = document.getElementById("excel-export-btn");

let employees = [];
let sheetState = {};
const pendingRowSaves = new Map();
let sheetMutationVersion = 0;
let saveErrorToastAt = 0;

function formatNumber(value) {
  const numeric = Number(value || 0);
  return numberFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

function toNumeric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function rowAccent(employee = {}) {
  const source = employee.empId || employee.id || employee.email || employee.fullName || "";
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function getEmployeeInputs(employeeId) {
  const row = Array.isArray(sheetState[employeeId]) ? sheetState[employeeId] : [];
  return Array.from({ length: 12 }, (_, index) => toNumeric(row[index] || 0));
}

function cumulativeFromInputs(inputs) {
  let running = 0;
  return inputs.map((value) => {
    running += toNumeric(value);
    return running;
  });
}

function buildHeader() {
  const monthHeaders = months.map((label) => `<th>${label}</th>`).join("");
  headerRow.innerHTML = `
    <th class="sticky-col">Employee Name</th>
    ${monthHeaders}
    <th>Year Total</th>
  `;
}

function buildRow(employee) {
  const inputs = getEmployeeInputs(employee.id);
  const cumulative = cumulativeFromInputs(inputs);
  const cells = months
    .map(
      (_, index) => `
        <td>
          <div class="excel-cell">
            <span class="excel-month-total" data-month-total="${index}">${formatNumber(cumulative[index])}</span>
            <input
              class="excel-month-input"
              type="number"
              min="0"
              step="0.01"
              data-employee-id="${employee.id}"
              data-month-index="${index}"
              value="${inputs[index] || ""}"
              placeholder="+0"
            />
          </div>
        </td>
      `
    )
    .join("");

  return `
    <tr class="excel-row" style="--excel-accent:${rowAccent(employee)}" data-employee-id="${employee.id}">
      <td class="sticky-col employee-col"><span class="employee-dot"></span><span>${employee.fullName || employee.email || employee.empId || employee.id}</span></td>
      ${cells}
      <td class="excel-row-total" data-row-total>${formatNumber(cumulative[11] || 0)}</td>
    </tr>
  `;
}

function updateRow(employeeId) {
  const row = body.querySelector(`tr[data-employee-id="${employeeId}"]`);
  if (!row) return;
  const inputs = getEmployeeInputs(employeeId);
  const cumulative = cumulativeFromInputs(inputs);

  const flashValue = (element) => {
    if (!element) return;
    element.classList.remove("excel-value-pop");
    void element.offsetWidth;
    element.classList.add("excel-value-pop");
  };

  row.querySelectorAll("[data-month-total]").forEach((element) => {
    const monthIndex = Number(element.dataset.monthTotal);
    element.textContent = formatNumber(cumulative[monthIndex] || 0);
    flashValue(element);
  });
  const totalCell = row.querySelector("[data-row-total]");
  if (totalCell) {
    totalCell.textContent = formatNumber(cumulative[11] || 0);
    flashValue(totalCell);
  }
}

function updateSummary() {
  employeesCountEl.textContent = formatNumber(employees.length);
  const grand = employees.reduce((sum, employee) => {
    const rowInputs = getEmployeeInputs(employee.id);
    const rowTotal = cumulativeFromInputs(rowInputs)[11] || 0;
    return sum + rowTotal;
  }, 0);
  grandTotalEl.textContent = formatNumber(grand);
}

function queueRowSave(employeeId) {
  if (!employeeId) return;
  const existing = pendingRowSaves.get(employeeId);
  if (existing) clearTimeout(existing);

  const versionAtQueue = sheetMutationVersion;
  const timer = setTimeout(async () => {
    pendingRowSaves.delete(employeeId);
    if (versionAtQueue !== sheetMutationVersion) return;
    try {
      await upsertExcelSheetInput({
        year: SHEET_YEAR,
        employeeId,
        inputs: getEmployeeInputs(employeeId)
      });
    } catch (error) {
      console.error("Failed to sync excel sheet row:", error);
      const now = Date.now();
      if (now - saveErrorToastAt > 5000) {
        showToast("error", "Could not sync row to Firebase");
        saveErrorToastAt = now;
      }
    }
  }, 350);

  pendingRowSaves.set(employeeId, timer);
}

function renderTable() {
  buildHeader();
  body.innerHTML = employees.map((employee) => buildRow(employee)).join("");
  emptyState.classList.toggle("hidden", employees.length > 0);
  updateSummary();
}

function handleCellInput(event) {
  const input = event.target.closest(".excel-month-input");
  if (!input) return;
  const employeeId = input.dataset.employeeId;
  const monthIndex = Number(input.dataset.monthIndex);
  if (!employeeId || Number.isNaN(monthIndex)) return;

  const rowInputs = getEmployeeInputs(employeeId);
  rowInputs[monthIndex] = toNumeric(input.value);
  sheetState[employeeId] = rowInputs;
  queueRowSave(employeeId);
  updateRow(employeeId);
  updateSummary();
}

function exportCsv() {
  const headers = ["Employee", ...months, "Year Total"];
  const lines = [headers.join(",")];

  employees.forEach((employee) => {
    const name = employee.fullName || employee.email || employee.empId || employee.id;
    const cumulative = cumulativeFromInputs(getEmployeeInputs(employee.id));
    const row = [name, ...cumulative.map((value) => value.toFixed(2)), (cumulative[11] || 0).toFixed(2)];
    lines.push(row.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(","));
  });

  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "excel-sheet-cumulative.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function resetAllInputs() {
  if (!window.confirm("Reset all monthly inputs for all employees?")) return;
  sheetMutationVersion += 1;
  pendingRowSaves.forEach((timerId) => clearTimeout(timerId));
  pendingRowSaves.clear();
  clearExcelSheetYear(SHEET_YEAR)
    .then(() => {
      sheetState = {};
      renderTable();
      showToast("success", "Sheet reset completed");
    })
    .catch((error) => {
      console.error("Failed to reset excel sheet:", error);
      showToast("error", "Could not reset sheet on Firebase");
    });
}

async function init() {
  try {
    const [rows, remoteState] = await Promise.all([
      listEmployees(),
      listExcelSheetInputs(SHEET_YEAR)
    ]);
    employees = rows
      .slice()
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", locale));
    sheetState = remoteState || {};
    renderTable();
  } catch (error) {
    console.error("Failed to load excel sheet employees:", error);
    employees = [];
    sheetState = {};
    renderTable();
    showToast("error", "Failed to load excel sheet from Firebase");
  }
}

body.addEventListener("input", handleCellInput);
resetBtn?.addEventListener("click", resetAllInputs);
exportBtn?.addEventListener("click", exportCsv);
trackUxEvent({ event: "page_open", module: "excel_sheet" });

if (window.lucide?.createIcons) window.lucide.createIcons();
void init();

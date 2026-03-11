import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listEmployees } from "../Services/employees.service.js";
import { listDepartments } from "../Services/departments.service.js";
import { listPositions } from "../Services/positions.service.js";
import { listAttendance } from "../Services/attendance.service.js";
import { listLeaves } from "../Services/leaves.service.js";
import { listPayroll } from "../Services/payroll.service.js";

if (!enforceAuth("employee_360")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("employee_360");

const isSelfOnly = role === "employee";

const selectEl = document.getElementById("employee360-select");
const refreshBtn = document.getElementById("employee360-refresh-btn");
const profileEl = document.getElementById("employee360-profile");
const attendanceBody = document.getElementById("employee360-attendance-body");
const leavesBody = document.getElementById("employee360-leaves-body");
const payrollBody = document.getElementById("employee360-payroll-body");
const attendanceRateEl = document.getElementById("kpi-attendance-rate");
const leaveDaysEl = document.getElementById("kpi-leave-days");
const pendingLeavesEl = document.getElementById("kpi-pending-leaves");
const latestPayrollEl = document.getElementById("kpi-latest-payroll");

const numberFmt = new Intl.NumberFormat(document.documentElement.lang?.startsWith("ar") ? "ar-IQ" : "en-US");

let employees = [];
let departments = [];
let positions = [];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleDateString();
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeStatus(value = "") {
  return String(value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function employeeAccent(employee = {}) {
  const seed = hashSeed(employee.empId || employee.uid || employee.id || employee.email || "");
  return `hsl(${seed % 360} 72% 44%)`;
}

function applyEmployeeTheme(employee) {
  const accent = employee ? employeeAccent(employee) : "";
  document.documentElement.style.setProperty("--employee360-accent", accent || "var(--primary)");
}

function sortByLatest(items = [], dateKeys = []) {
  return items
    .slice()
    .sort((a, b) => {
      const aTime = pickDateMillis(a, dateKeys);
      const bTime = pickDateMillis(b, dateKeys);
      return bTime - aTime;
    });
}

function pickDateMillis(item = {}, dateKeys = []) {
  for (const key of dateKeys) {
    const d = toDate(item[key]);
    if (d) return d.getTime();
  }
  return 0;
}

function statusBadge(value) {
  const text = normalizeStatus(value || "unknown");
  const statusClass = `status-${text}`;
  const key = `common.status.${text}`;
  const translated = t(key);
  const label = translated === key ? text.replace(/_/g, " ") : translated;
  return `<span class="badge ${statusClass}">${escapeHtml(label)}</span>`;
}

function emptyRow(colspan) {
  return `<tr><td colspan="${colspan}" class="employee360-empty">${escapeHtml(t("employee_360.no_data"))}</td></tr>`;
}

function resolveCurrentEmployee() {
  const selectedId = selectEl.value;
  return employees.find((item) => item.id === selectedId) || null;
}

function resolveSelfEmployee() {
  const uid = String(user?.uid || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  return (
    employees.find((item) => item.id === uid) ||
    employees.find((item) => String(item.uid || "").trim() === uid) ||
    employees.find((item) => String(item.email || "").trim().toLowerCase() === email) ||
    null
  );
}

function renderEmployeeOptions() {
  if (isSelfOnly) {
    const own = resolveSelfEmployee();
    if (!own) {
      selectEl.innerHTML = `<option value="">${escapeHtml(t("employee_360.no_employee_linked"))}</option>`;
      selectEl.disabled = true;
      return;
    }
    selectEl.innerHTML = `<option value="${escapeHtml(own.id)}">${escapeHtml(own.fullName || own.email || own.id)}</option>`;
    selectEl.disabled = true;
    return;
  }

  selectEl.innerHTML = employees
    .map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.fullName || employee.email || employee.id)}</option>`)
    .join("");
}

function renderProfile(employee) {
  if (!employee) {
    profileEl.innerHTML = `<div class="employee360-empty">${escapeHtml(t("employee_360.no_profile_found"))}</div>`;
    applyEmployeeTheme(null);
    return;
  }
  applyEmployeeTheme(employee);
  const department = departments.find((item) => item.id === employee.departmentId)?.name || employee.departmentId || "-";
  const position = positions.find((item) => item.id === employee.positionId)?.name || employee.positionId || "-";

  const fields = [
    [t("employees.field.employee_id"), employee.empId || employee.id || "-"],
    [t("employees.field.full_name"), employee.fullName || "-"],
    [t("employees.field.email"), employee.email || "-"],
    [t("employees.field.phone"), employee.phone || "-"],
    [t("employees.field.department"), department],
    [t("employees.field.position"), position],
    [t("employees.field.status"), employee.status || "active"],
    [t("employees.field.join_date"), formatDate(employee.joinDate)]
  ];

  profileEl.innerHTML = fields
    .map(([label, value], index) => `<article class="employee360-field" style="--field-index:${index}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

function calcApprovedLeaveDays(leaves) {
  return leaves
    .filter((item) => normalizeStatus(item.status) === "approved")
    .reduce((sum, item) => sum + Number(item.days || 0), 0);
}

function calcAttendanceRate(attendance) {
  const filtered = attendance.filter((item) => ["present", "late", "absent"].includes(normalizeStatus(item.status)));
  if (!filtered.length) return "0%";
  const presentLike = filtered.filter((item) => ["present", "late"].includes(normalizeStatus(item.status))).length;
  const rate = Math.round((presentLike / filtered.length) * 100);
  return `${rate}%`;
}

function renderAttendanceTable(items) {
  if (!items.length) {
    attendanceBody.innerHTML = emptyRow(4);
    return;
  }
  attendanceBody.innerHTML = items
    .slice(0, 10)
    .map(
      (item, index) => `
      <tr class="employee360-row" style="--row-index:${index}">
        <td>${formatDate(item.date || item.day || item.createdAt)}</td>
        <td>${statusBadge(item.status || "unknown")}</td>
        <td>${escapeHtml(item.checkIn || item.checkInAt || "-")}</td>
        <td>${escapeHtml(item.checkOut || item.checkOutAt || "-")}</td>
      </tr>
    `
    )
    .join("");
}

function renderLeavesTable(items) {
  if (!items.length) {
    leavesBody.innerHTML = emptyRow(4);
    return;
  }
  leavesBody.innerHTML = items
    .slice(0, 10)
    .map(
      (item, index) => `
      <tr class="employee360-row" style="--row-index:${index}">
        <td>${formatDate(item.from)}</td>
        <td>${formatDate(item.to)}</td>
        <td>${escapeHtml(item.type || "-")}</td>
        <td>${statusBadge(item.status || "submitted")}</td>
      </tr>
    `
    )
    .join("");
}

function renderPayrollTable(items) {
  if (!items.length) {
    payrollBody.innerHTML = emptyRow(4);
    return;
  }
  payrollBody.innerHTML = items
    .slice(0, 10)
    .map(
      (item, index) => `
      <tr class="employee360-row" style="--row-index:${index}">
        <td>${escapeHtml(item.month || "-")}</td>
        <td>${statusBadge(item.status || "draft")}</td>
        <td>${numberFmt.format(Number(item.gross || 0))}</td>
        <td>${numberFmt.format(Number(item.net || 0))}</td>
      </tr>
    `
    )
    .join("");
}

function isMatchEmployee(record = {}, employee = {}) {
  const employeeKeys = new Set(
    [
      employee.id,
      employee.uid,
      employee.empId,
      String(employee.email || "").trim().toLowerCase()
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );

  const recordKeys = [
    record.employeeId,
    record.empId,
    record.uid,
    String(record.employeeEmail || record.email || "").trim().toLowerCase()
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return recordKeys.some((key) => employeeKeys.has(key));
}

async function resolveEmployeeData(employee) {
  const [attendanceById, leavesById, payrollById] = await Promise.all([
    listAttendance({ employeeId: employee.id }),
    listLeaves({ employeeId: employee.id }),
    listPayroll({ employeeId: employee.id })
  ]);

  const needsFallback = {
    attendance: !attendanceById.length,
    leaves: !leavesById.length,
    payroll: !payrollById.length
  };

  if (!needsFallback.attendance && !needsFallback.leaves && !needsFallback.payroll) {
    return { attendance: attendanceById, leaves: leavesById, payroll: payrollById };
  }

  const [allAttendance, allLeaves, allPayroll] = await Promise.all([listAttendance(), listLeaves(), listPayroll()]);

  return {
    attendance: needsFallback.attendance ? allAttendance.filter((item) => isMatchEmployee(item, employee)) : attendanceById,
    leaves: needsFallback.leaves ? allLeaves.filter((item) => isMatchEmployee(item, employee)) : leavesById,
    payroll: needsFallback.payroll ? allPayroll.filter((item) => isMatchEmployee(item, employee)) : payrollById
  };
}

async function loadEmployeeDetails(employeeId) {
  if (!employeeId) return;
  const employee = employees.find((item) => item.id === employeeId);
  if (!employee) return;
  const data = await resolveEmployeeData(employee);
  const attendance = sortByLatest(data.attendance, ["date", "day", "createdAt"]);
  const leaves = sortByLatest(data.leaves, ["from", "createdAt"]);
  const payroll = sortByLatest(data.payroll, ["createdAt", "month", "updatedAt"]);

  const pendingLeaves = leaves.filter((item) => {
    const status = normalizeStatus(item.status);
    return ["submitted", "pending", "manager_review", "hr_review"].includes(status);
  }).length;
  const approvedDays = calcApprovedLeaveDays(leaves);
  const latestPayroll = payroll[0]?.net || 0;

  attendanceRateEl.textContent = calcAttendanceRate(attendance);
  leaveDaysEl.textContent = numberFmt.format(approvedDays);
  pendingLeavesEl.textContent = numberFmt.format(pendingLeaves);
  latestPayrollEl.textContent = numberFmt.format(Number(latestPayroll));

  renderAttendanceTable(attendance);
  renderLeavesTable(leaves);
  renderPayrollTable(payroll);
}

async function init() {
  try {
    const [employeesData, departmentsData, positionsData] = await Promise.all([
      listEmployees(),
      listDepartments(),
      listPositions()
    ]);
    employees = employeesData
      .slice()
      .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
    departments = departmentsData;
    positions = positionsData;

    renderEmployeeOptions();
    const current = resolveCurrentEmployee();
    if (current) {
      renderProfile(current);
      await loadEmployeeDetails(current.id);
    } else {
      renderProfile(null);
    }
  } catch (error) {
    console.error("Failed to load employee 360:", error);
    showToast("error", t("employee_360.load_failed"));
  }
}

if (selectEl) {
  selectEl.addEventListener("change", async () => {
    const employee = resolveCurrentEmployee();
    renderProfile(employee);
    await loadEmployeeDetails(employee?.id || "");
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    void init();
  });
}

if (window.lucide?.createIcons) window.lucide.createIcons();
void init();

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, getLanguage, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listEmployees } from "../Services/employees.service.js";
import { listLeaves } from "../Services/leaves.service.js";
import { listPayroll } from "../Services/payroll.service.js";
import { listAttendance } from "../Services/attendance.service.js";
import { listDepartments } from "../Services/departments.service.js";
import { listPositions } from "../Services/positions.service.js";
import { listNotifications, markNotificationRead } from "../Services/notifications.service.js";
import { listInsuranceDocs } from "../Services/insurance-docs.service.js";

if (!enforceAuth("dashboard")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("dashboard");
if (window.lucide?.createIcons) window.lucide.createIcons();

const kpiEmployees = document.getElementById("kpi-employees");
const kpiDepartments = document.getElementById("kpi-departments");
const kpiPositions = document.getElementById("kpi-positions");
const kpiLeaves = document.getElementById("kpi-leaves");
const kpiPayroll = document.getElementById("kpi-payroll");
const kpiAttendance = document.getElementById("kpi-attendance");
const kpiTodayAttendance = document.getElementById("kpi-today-attendance");
const kpiPendingApprovals = document.getElementById("kpi-pending-approvals");
const kpiPayrollReady = document.getElementById("kpi-payroll-ready");
const kpiCriticalAlerts = document.getElementById("kpi-critical-alerts");
const activityList = document.getElementById("activity-list");
const notificationsList = document.getElementById("notifications-list");
const welcomeName = document.getElementById("welcome-name");
const welcomeDate = document.getElementById("welcome-date");
const welcomeTotal = document.getElementById("welcome-total");
const welcomeDepts = document.getElementById("welcome-depts");
const insuranceKpiTotalDocs = document.getElementById("insurance-kpi-total-docs");
const insuranceKpiActiveDocs = document.getElementById("insurance-kpi-active-docs");
const insuranceKpiExpiringDocs = document.getElementById("insurance-kpi-expiring-docs");
const insuranceKpiTotalAmount = document.getElementById("insurance-kpi-total-amount");

let activityItems = [];
let notificationItems = [];
let activitySourceItems = [];
let notificationSourceItems = [];
let chartRenderToken = 0;

function detectPerformanceMode() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const saveData = Boolean(nav.connection && nav.connection.saveData);
  return Boolean(prefersReduced || lowCpu || lowMemory || saveData);
}

function scheduleWork(fn, delay = 0) {
  const run = () => window.setTimeout(fn, delay);
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 300 });
    return;
  }
  window.requestAnimationFrame(run);
}

function renderActivity(items, persistSource = true) {
  if (persistSource) {
    activitySourceItems = items;
  }
  activityItems = items;
  activityList.innerHTML = items.length
    ? items
      .map(
        (item) => `
      <div class="activity-item">
        <strong>${item.title}</strong>
        <div class="text-muted">${item.subtitle}</div>
      </div>
    `
      )
      .join("")
    : `<div class="empty-state">${t("activity.empty")}</div>`;
}

function renderNotifications(items, persistSource = true) {
  if (persistSource) {
    notificationSourceItems = items;
  }
  notificationItems = items;
  if (!items.length) {
    notificationsList.innerHTML = `<div class="empty-state">${t("notifications.empty")}</div>`;
    return;
  }
  notificationsList.innerHTML = items
    .map(
      (item) => `
      <div class="notification-item">
        <div>
          <strong>${item.title}</strong>
          <div class="text-muted">${item.body}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <span class="badge">${t("dashboard.notifications.priority_prefix")}:${t(`notifications.priority.${String(item.priority || "medium").toLowerCase()}`)}</span>
          ${item.isRead ? "" : `<button class="btn btn-ghost" data-id="${item.id}">${t("notifications.mark_read")}</button>`}
        </div>
      </div>
    `
    )
    .join("");

  notificationsList.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await markNotificationRead(button.dataset.id);
      notificationSourceItems = notificationSourceItems.map((item) =>
        String(item.id) === String(button.dataset.id) ? { ...item, isRead: true } : item
      );
      notificationItems = notificationItems.map((item) =>
        String(item.id) === String(button.dataset.id) ? { ...item, isRead: true } : item
      );
      button.closest(".notification-item")?.remove();
    });
  });
}

function normalizeLeaveStatus(status = "") {
  return status === "pending" ? "submitted" : status;
}

function translateLeaveStatus(status = "") {
  const normalized = normalizeLeaveStatus(status);
  const key = `common.status.${normalized}`;
  const value = t(key);
  return value === key ? normalized : value;
}

function isToday(value) {
  const d = toDate(value);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const firebaseDate = value.toDate();
    return Number.isNaN(firebaseDate.getTime()) ? null : firebaseDate;
  }
  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const str = value.trim();
    if (!str) return null;

    const yyyyMmDd = /^(\d{4})-(\d{2})-(\d{2})$/;
    const ddMmYyyy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
    const iso = new Date(str);
    if (!Number.isNaN(iso.getTime())) return iso;
    if (yyyyMmDd.test(str)) {
      const [, y, m, d] = str.match(yyyyMmDd);
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (ddMmYyyy.test(str)) {
      const [, d, m, y] = str.match(ddMmYyyy);
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
}

function normalizeStatus(status = "") {
  return String(status).trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isActiveInsuranceStatus(status = "") {
  return ["active", "valid", "running", "in_force"].includes(normalizeStatus(status));
}

function normalizeInsuranceDoc(item = {}) {
  const createdAt = toDate(item.createdAt);
  const issueDate = toDate(item.issueDate || item.startDate) || createdAt;
  const expiryDate = toDate(item.expiryDate || item.endDate);
  const status = normalizeStatus(item.status || "");
  return {
    insuranceType: String(item.insuranceType || "other").trim() || "other",
    status,
    createdAt,
    issueDate,
    expiryDate,
    insuredAmount: toAmount(item.insuredAmount || item.amount || item.sumInsured),
    premium: toAmount(item.premium)
  };
}

function formatCompactNumber(value) {
  const lang = getLanguage() === "ar" ? "ar" : undefined;
  return new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function getRecentMonthTokens(months = 6) {
  const list = [];
  const d = new Date();
  d.setDate(1);
  for (let i = months - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    list.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return list;
}

function isPendingLeaveStatus(status = "") {
  return ["submitted", "pending", "manager_review", "hr_review", "in_review"].includes(normalizeStatus(status));
}

function isPayrollReadyStatus(status = "") {
  return ["ready", "approved", "published", "ready_to_publish"].includes(normalizeStatus(status));
}

function isCriticalNotification(item = {}) {
  const priority = normalizeStatus(item.priority || "");
  const type = normalizeStatus(item.type || "");
  return ["high", "critical", "urgent"].includes(priority) || type === "security";
}

function countTodayAttendance(attendance = []) {
  const seen = new Set();
  attendance.forEach((item) => {
    if (!isToday(item.date || item.day || item.checkInAt || item.createdAt)) return;
    const key = item.employeeId || item.empId || item.id;
    if (key) seen.add(String(key));
  });
  return seen.size;
}

function bindDashboardQuickLinks() {
  const cards = document.querySelectorAll("[data-nav-target]");
  cards.forEach((card) => {
    const href = card.getAttribute("data-nav-target");
    if (!href || card.dataset.bound === "1") return;
    card.dataset.bound = "1";
    card.addEventListener("click", () => {
      window.location.href = href;
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      window.location.href = href;
    });
  });
}

function applyDashboardSearch(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderActivity(activitySourceItems, false);
    renderNotifications(notificationSourceItems, false);
    return;
  }

  const filteredActivity = activitySourceItems.filter((item) => {
    return (item.title || "").toLowerCase().includes(q) || (item.subtitle || "").toLowerCase().includes(q);
  });

  const filteredNotifications = notificationSourceItems.filter((item) => {
    return (item.title || "").toLowerCase().includes(q) || (item.body || "").toLowerCase().includes(q);
  });

  renderActivity(filteredActivity, false);
  renderNotifications(filteredNotifications, false);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function loadDashboard() {
  const performanceMode = detectPerformanceMode();
  if (performanceMode) {
    document.body.classList.add("performance-mode");
  } else {
    document.body.classList.remove("performance-mode");
  }

  if (welcomeName) welcomeName.textContent = user?.name || t("dashboard.fallback.team");
  bindDashboardQuickLinks();
  if (welcomeDate) {
    const today = new Date();
    welcomeDate.textContent = today.toLocaleDateString(getLanguage() === "ar" ? "ar" : undefined, {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
  }

  const results = await Promise.allSettled([
    listEmployees({ limitCount: 120 }),
    listDepartments({ limitCount: 80 }),
    listPositions({ limitCount: 120 }),
    listLeaves({ limitCount: 200 }),
    listPayroll({ limitCount: 200 }),
    listAttendance({ limitCount: 300 }),
    listNotifications({ limitCount: 50 }),
    listInsuranceDocs({ limitCount: 800 })
  ]);

  const getValue = (index, fallback = []) => {
    const item = results[index];
    if (item.status === "fulfilled") return item.value;
    console.error("Dashboard data load failed:", item.reason);
    return fallback;
  };

  const employees = asArray(getValue(0, []));
  const departments = asArray(getValue(1, []));
  const positions = asArray(getValue(2, []));
  const leaves = asArray(getValue(3, []));
  const payroll = asArray(getValue(4, []));
  const attendance = asArray(getValue(5, []));
  const notifications = asArray(getValue(6, []));
  const insuranceDocs = asArray(getValue(7, [])).map(normalizeInsuranceDoc);

  kpiEmployees.textContent = String(employees.length);
  kpiDepartments.textContent = String(departments.length);
  kpiPositions.textContent = String(positions.length);
  kpiLeaves.textContent = String(leaves.length);
  kpiPayroll.textContent = String(payroll.length);
  kpiAttendance.textContent = String(attendance.length);
  if (welcomeTotal) welcomeTotal.textContent = String(employees.length);
  if (welcomeDepts) welcomeDepts.textContent = String(departments.length);

  const todayAttendance = countTodayAttendance(attendance);
  const pendingApprovals = leaves.filter((l) => isPendingLeaveStatus(normalizeLeaveStatus(l.status))).length;
  const payrollReady = payroll.filter((p) => isPayrollReadyStatus(p.status)).length;
  const criticalAlerts = notifications.filter((n) => isCriticalNotification(n)).length;

  if (kpiTodayAttendance) kpiTodayAttendance.textContent = String(todayAttendance);
  if (kpiPendingApprovals) kpiPendingApprovals.textContent = String(pendingApprovals);
  if (kpiPayrollReady) kpiPayrollReady.textContent = String(payrollReady);
  if (kpiCriticalAlerts) kpiCriticalAlerts.textContent = String(criticalAlerts);
  if (insuranceKpiTotalDocs) insuranceKpiTotalDocs.textContent = String(insuranceDocs.length);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86400000);
  const activeInsuranceDocs = insuranceDocs.filter((doc) => {
    if (doc.status) return isActiveInsuranceStatus(doc.status);
    if (!doc.expiryDate) return true;
    return doc.expiryDate >= now;
  });
  const expiringInsuranceDocs = insuranceDocs.filter((doc) => doc.expiryDate && doc.expiryDate >= now && doc.expiryDate <= in30Days);
  const insuredAmountTotal = insuranceDocs.reduce((sum, doc) => sum + doc.insuredAmount, 0);

  if (insuranceKpiActiveDocs) insuranceKpiActiveDocs.textContent = String(activeInsuranceDocs.length);
  if (insuranceKpiExpiringDocs) insuranceKpiExpiringDocs.textContent = String(expiringInsuranceDocs.length);
  if (insuranceKpiTotalAmount) insuranceKpiTotalAmount.textContent = formatCompactNumber(insuredAmountTotal);

  renderActivity([
    ...employees.slice(0, 3).map((emp) => ({
      title: emp.fullName || emp.empId || t("dashboard.activity.employee_fallback"),
      subtitle: t("dashboard.activity.added_to_directory")
    })),
    ...leaves.slice(0, 3).map((leave) => ({
      title: `${t("dashboard.activity.leave_request")}: ${translateLeaveStatus(leave.status || "submitted")}`,
      subtitle: leave.reason || t("dashboard.activity.request_update")
    }))
  ]);

  renderNotifications(notifications.slice(0, 5));

  if (window.Chart) {
    const currentToken = ++chartRenderToken;
    const css = getComputedStyle(document.documentElement);
    const chartText = css.getPropertyValue("--text-muted").trim() || "#475569";
    const chartPrimary = css.getPropertyValue("--primary").trim() || "#0f766e";
    const chartAccent = css.getPropertyValue("--accent").trim() || "#0ea5e9";
    const chartBorder = css.getPropertyValue("--border").trim() || "rgba(15, 23, 42, 0.14)";
    const chartSoft = css.getPropertyValue("--primary-soft").trim() || "rgba(15, 118, 110, 0.14)";

    window.Chart.defaults.font.family = "Manrope, Cairo, sans-serif";
    window.Chart.defaults.color = chartText;
    window.Chart.defaults.interaction = { mode: "index", intersect: false };
    window.Chart.defaults.hover = { mode: "index", intersect: false };
    window.Chart.defaults.elements.line.tension = 0.35;
    window.Chart.defaults.elements.point.radius = 3;
    window.Chart.defaults.elements.point.hoverRadius = 6;
    window.Chart.defaults.elements.point.hitRadius = 12;
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      animation: performanceMode ? false : { duration: 520 },
      plugins: {
        legend: {
          labels: {
            color: chartText
          }
        }
      },
      scales: {
        x: {
          grid: { color: chartBorder }
        },
        y: {
          grid: { color: chartBorder }
        }
      }
    };

    const approved = leaves.filter((l) => normalizeLeaveStatus(l.status) === "approved").length;
    const inFlow = leaves.filter((l) => ["submitted", "manager_review", "hr_review"].includes(normalizeLeaveStatus(l.status))).length;
    const rejected = leaves.filter((l) => normalizeLeaveStatus(l.status) === "rejected").length;

    const departmentNames = new Map(departments.map((dept) => [dept.id, dept.name || dept.id]));
    const departmentByName = new Map(departments.map((dept) => [String(dept.name || "").trim(), dept.name || dept.id]));
    const deptCounts = employees.reduce((acc, emp) => {
      const raw = (emp.departmentId || "").trim();
      const byId = departmentNames.get(raw);
      const byName = departmentByName.get(raw);
      const label = byId || byName || raw || t("dashboard.department.unassigned");
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const deptLabels = Object.keys(deptCounts);

    const present = attendance.filter((item) => normalizeStatus(item.status) === "present").length;
    const late = attendance.filter((item) => normalizeStatus(item.status) === "late").length;
    const absent = attendance.filter((item) => normalizeStatus(item.status) === "absent").length;

    const payrollByMonth = payroll.reduce((acc, entry) => {
      const month = (entry.month || "Unknown").trim();
      const net = Number(entry.net || 0);
      acc[month] = (acc[month] || 0) + net;
      return acc;
    }, {});
    const payrollLabels = Object.keys(payrollByMonth).sort();
    const recentLabels = payrollLabels.slice(-6);
    const payrollTotals = recentLabels.map((month) => payrollByMonth[month]);
    const employeeMonthTokens = getRecentMonthTokens(6);
    const monthlyJoinCounts = new Map(employeeMonthTokens.map((token) => [token, 0]));
    employees.forEach((employee) => {
      const d = toDate(employee.hireDate || employee.joinDate || employee.startDate || employee.createdAt);
      if (!d) return;
      const token = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyJoinCounts.has(token)) return;
      monthlyJoinCounts.set(token, (monthlyJoinCounts.get(token) || 0) + 1);
    });
    const employeeTrendValues = employeeMonthTokens.map((token) => monthlyJoinCounts.get(token) || 0);

    const insuranceTypeMap = insuranceDocs.reduce((acc, doc) => {
      const key = doc.insuranceType || "other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const insuranceTypeLabels = Object.keys(insuranceTypeMap);
    const insuranceTypeValues = insuranceTypeLabels.map((key) => insuranceTypeMap[key]);

    const insuranceMonthTokens = getRecentMonthTokens(6);
    const insuranceMonthMap = new Map(insuranceMonthTokens.map((token) => [token, 0]));
    insuranceDocs.forEach((doc) => {
      const d = doc.issueDate || toDate(doc.createdAt);
      if (!d) return;
      const token = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!insuranceMonthMap.has(token)) return;
      insuranceMonthMap.set(token, (insuranceMonthMap.get(token) || 0) + 1);
    });
    const insuranceTrendValues = insuranceMonthTokens.map((token) => insuranceMonthMap.get(token) || 0);

    const chartQueue = [
      () => new window.Chart(document.getElementById("headcount-chart"), {
        type: "line",
        data: {
          labels: employeeMonthTokens,
          datasets: [{ label: t("dashboard.chart.headcount_label"), data: employeeTrendValues, borderColor: chartPrimary, backgroundColor: chartSoft, fill: true }]
        },
        options: chartDefaults
      }),
      () => new window.Chart(document.getElementById("leave-chart"), {
        type: "doughnut",
        data: {
          labels: [t("dashboard.chart.leave.approved"), t("dashboard.chart.leave.in_review"), t("dashboard.chart.leave.rejected")],
          datasets: [{ data: [approved, inFlow, rejected], backgroundColor: [chartAccent, chartPrimary, chartText] }]
        },
        options: chartDefaults
      }),
      () => new window.Chart(document.getElementById("department-chart"), {
        type: "bar",
        data: {
          labels: deptLabels.length ? deptLabels : [t("dashboard.chart.no_data")],
          datasets: [{ label: t("dashboard.chart.department_label"), data: deptLabels.length ? deptLabels.map((label) => deptCounts[label]) : [0], backgroundColor: chartPrimary }]
        },
        options: chartDefaults
      }),
      () => new window.Chart(document.getElementById("attendance-chart"), {
        type: "bar",
        data: {
          labels: [t("dashboard.chart.attendance.present"), t("dashboard.chart.attendance.late"), t("dashboard.chart.attendance.absent")],
          datasets: [{ label: t("dashboard.chart.attendance_label"), data: [present, late, absent], backgroundColor: [chartAccent, "#f59e0b", chartText] }]
        },
        options: chartDefaults
      }),
      () => new window.Chart(document.getElementById("payroll-chart"), {
        type: "line",
        data: {
          labels: recentLabels.length ? recentLabels : [t("dashboard.chart.no_data")],
          datasets: [{ label: t("dashboard.chart.payroll_label"), data: payrollTotals.length ? payrollTotals : [0], borderColor: chartPrimary, backgroundColor: chartSoft, fill: true }]
        },
        options: chartDefaults
      }),
      () => {
        const canvas = document.getElementById("insurance-type-chart");
        if (!canvas) return null;
        return new window.Chart(canvas, {
          type: "doughnut",
          data: {
            labels: insuranceTypeLabels.length ? insuranceTypeLabels : [t("dashboard.chart.no_data")],
            datasets: [{ data: insuranceTypeValues.length ? insuranceTypeValues : [0], backgroundColor: [chartPrimary, chartAccent, "#f59e0b", "#6366f1", "#ef4444", "#14b8a6", "#334155"] }]
          },
          options: chartDefaults
        });
      },
      () => {
        const canvas = document.getElementById("insurance-trend-chart");
        if (!canvas) return null;
        return new window.Chart(canvas, {
          type: "line",
          data: {
            labels: insuranceMonthTokens,
            datasets: [{ label: t("dashboard.chart.insurance_issued_label"), data: insuranceTrendValues, borderColor: chartAccent, backgroundColor: chartSoft, fill: true }]
          },
          options: chartDefaults
        });
      }
    ];

    chartQueue.forEach((render, index) => {
      scheduleWork(() => {
        if (currentToken !== chartRenderToken) return;
        try {
          render();
        } catch (error) {
          console.error("Dashboard chart render failed:", error);
        }
      }, performanceMode ? index * 18 : index * 44);
    });
  }

  if (window.lucide?.createIcons) window.lucide.createIcons();
}

trackUxEvent({ event: "page_open", module: "dashboard" });
loadDashboard().catch((error) => {
  console.error("Dashboard load failed:", error);
});
window.addEventListener("global-search", (event) => applyDashboardSearch(event.detail));

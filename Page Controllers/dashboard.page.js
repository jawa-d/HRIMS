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

let activityItems = [];
let notificationItems = [];
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

function renderActivity(items) {
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

function renderNotifications(items) {
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
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function applyDashboardSearch(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderActivity(activityItems);
    renderNotifications(notificationItems);
    return;
  }

  const filteredActivity = activityItems.filter((item) => {
    return (item.title || "").toLowerCase().includes(q) || (item.subtitle || "").toLowerCase().includes(q);
  });

  const filteredNotifications = notificationItems.filter((item) => {
    return (item.title || "").toLowerCase().includes(q) || (item.body || "").toLowerCase().includes(q);
  });

  renderActivity(filteredActivity);
  renderNotifications(filteredNotifications);
}

async function loadDashboard() {
  const performanceMode = detectPerformanceMode();
  if (performanceMode) {
    document.body.classList.add("performance-mode");
  } else {
    document.body.classList.remove("performance-mode");
  }

  if (welcomeName) welcomeName.textContent = user?.name || "Team";
  if (welcomeDate) {
    const today = new Date();
    welcomeDate.textContent = today.toLocaleDateString(getLanguage() === "ar" ? "ar" : undefined, {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
  }

  const results = await Promise.allSettled([
    listEmployees(),
    listDepartments(),
    listPositions(),
    listLeaves(),
    listPayroll(),
    listAttendance(),
    listNotifications()
  ]);

  const getValue = (index, fallback = []) => {
    const item = results[index];
    if (item.status === "fulfilled") return item.value;
    console.error("Dashboard data load failed:", item.reason);
    return fallback;
  };

  const employees = getValue(0, []);
  const departments = getValue(1, []);
  const positions = getValue(2, []);
  const leaves = getValue(3, []);
  const payroll = getValue(4, []);
  const attendance = getValue(5, []);
  const notifications = getValue(6, []);

  kpiEmployees.textContent = String(employees.length);
  kpiDepartments.textContent = String(departments.length);
  kpiPositions.textContent = String(positions.length);
  kpiLeaves.textContent = String(leaves.length);
  kpiPayroll.textContent = String(payroll.length);
  kpiAttendance.textContent = String(attendance.length);
  if (welcomeTotal) welcomeTotal.textContent = String(employees.length);
  if (welcomeDepts) welcomeDepts.textContent = String(departments.length);

  const todayAttendance = attendance.filter((item) => isToday(item.date || item.day || item.checkInAt)).length;
  const pendingApprovals = leaves.filter((l) => ["submitted", "manager_review", "hr_review"].includes(normalizeLeaveStatus(l.status))).length;
  const payrollReady = payroll.filter((p) => {
    const status = (p.status || "").toLowerCase();
    return status === "ready" || status === "approved" || status === "published";
  }).length;
  const criticalAlerts = notifications.filter((n) => (n.priority || "").toLowerCase() === "high" || n.type === "security").length;

  if (kpiTodayAttendance) kpiTodayAttendance.textContent = String(todayAttendance);
  if (kpiPendingApprovals) kpiPendingApprovals.textContent = String(pendingApprovals);
  if (kpiPayrollReady) kpiPayrollReady.textContent = String(payrollReady);
  if (kpiCriticalAlerts) kpiCriticalAlerts.textContent = String(criticalAlerts);

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
      const label = byId || byName || raw || "Unassigned";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const deptLabels = Object.keys(deptCounts);

    const present = attendance.filter((item) => item.status === "present").length;
    const late = attendance.filter((item) => item.status === "late").length;
    const absent = attendance.filter((item) => item.status === "absent").length;

    const payrollByMonth = payroll.reduce((acc, entry) => {
      const month = (entry.month || "Unknown").trim();
      const net = Number(entry.net || 0);
      acc[month] = (acc[month] || 0) + net;
      return acc;
    }, {});
    const payrollLabels = Object.keys(payrollByMonth).sort();
    const recentLabels = payrollLabels.slice(-6);
    const payrollTotals = recentLabels.map((month) => payrollByMonth[month]);
    const chartQueue = [
      () => new window.Chart(document.getElementById("headcount-chart"), {
        type: "line",
        data: {
          labels: [
            t("dashboard.chart.month.jan"),
            t("dashboard.chart.month.feb"),
            t("dashboard.chart.month.mar"),
            t("dashboard.chart.month.apr"),
            t("dashboard.chart.month.may"),
            t("dashboard.chart.month.jun")
          ],
          datasets: [{ label: t("dashboard.chart.headcount_label"), data: [12, 18, 20, 24, 28, employees.length], borderColor: chartPrimary, backgroundColor: chartSoft, fill: true }]
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
      })
    ];

    chartQueue.forEach((render, index) => {
      scheduleWork(() => {
        if (currentToken !== chartRenderToken) return;
        render();
      }, performanceMode ? index * 18 : index * 44);
    });
  }

  if (window.lucide?.createIcons) window.lucide.createIcons();
}

trackUxEvent({ event: "page_open", module: "dashboard" });
loadDashboard();
window.addEventListener("global-search", (event) => applyDashboardSearch(event.detail));

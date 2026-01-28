import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, getLanguage } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
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
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const kpiEmployees = document.getElementById("kpi-employees");
const kpiDepartments = document.getElementById("kpi-departments");
const kpiPositions = document.getElementById("kpi-positions");
const kpiLeaves = document.getElementById("kpi-leaves");
const kpiPayroll = document.getElementById("kpi-payroll");
const kpiAttendance = document.getElementById("kpi-attendance");
const activityList = document.getElementById("activity-list");
const notificationsList = document.getElementById("notifications-list");
const welcomeName = document.getElementById("welcome-name");
const welcomeDate = document.getElementById("welcome-date");
const welcomeTotal = document.getElementById("welcome-total");
const welcomeDepts = document.getElementById("welcome-depts");

let activityItems = [];
let notificationItems = [];

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
    : '<div class="empty-state">No activity found</div>';
}

function renderNotifications(items) {
  notificationItems = items;
  if (!items.length) {
    notificationsList.innerHTML = '<div class="empty-state">No notifications</div>';
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
        <button class="btn btn-ghost" data-id="${item.id}">Mark read</button>
      </div>
    `
    )
    .join("");

  notificationsList.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await markNotificationRead(button.dataset.id);
      button.closest(".notification-item").remove();
    });
  });
}

function applyDashboardSearch(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderActivity(activityItems);
    renderNotifications(notificationItems);
    return;
  }

  const filteredActivity = activityItems.filter((item) => {
    return (
      (item.title || "").toLowerCase().includes(q) ||
      (item.subtitle || "").toLowerCase().includes(q)
    );
  });

  const filteredNotifications = notificationItems.filter((item) => {
    return (
      (item.title || "").toLowerCase().includes(q) ||
      (item.body || "").toLowerCase().includes(q)
    );
  });

  renderActivity(filteredActivity);
  renderNotifications(filteredNotifications);
}

async function loadDashboard() {
  if (welcomeName) {
    welcomeName.textContent = user?.name || "Team";
  }
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

  kpiEmployees.textContent = employees.length;
  kpiDepartments.textContent = departments.length;
  kpiPositions.textContent = positions.length;
  kpiLeaves.textContent = leaves.length;
  kpiPayroll.textContent = payroll.length;
  kpiAttendance.textContent = attendance.length;
  if (welcomeTotal) welcomeTotal.textContent = employees.length;
  if (welcomeDepts) welcomeDepts.textContent = departments.length;

  renderActivity([
    ...employees.slice(0, 3).map((emp) => ({
      title: emp.fullName || emp.empId || "Employee",
      subtitle: "Added to directory"
    })),
    ...leaves.slice(0, 2).map((leave) => ({
      title: `Leave ${leave.status || "pending"}`,
      subtitle: leave.reason || "Request update"
    }))
  ]);

  renderNotifications(notifications.slice(0, 5));

  if (window.Chart) {
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false
    };
    const headcountCtx = document.getElementById("headcount-chart");
    new window.Chart(headcountCtx, {
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [
          {
            label: "Headcount",
            data: [12, 18, 20, 24, 28, employees.length],
            borderColor: "#0038a8",
            backgroundColor: "rgba(0, 56, 168, 0.2)",
            fill: true
          }
        ]
      },
      options: chartDefaults
    });

    const leaveCtx = document.getElementById("leave-chart");
    const approved = leaves.filter((l) => l.status === "approved").length;
    const pending = leaves.filter((l) => l.status === "pending").length;
    const rejected = leaves.filter((l) => l.status === "rejected").length;
    new window.Chart(leaveCtx, {
      type: "doughnut",
      data: {
        labels: ["Approved", "Pending", "Rejected"],
        datasets: [
          {
            data: [approved, pending, rejected],
            backgroundColor: ["#00c2a8", "#0038a8", "#0b1220"]
          }
        ]
      },
      options: chartDefaults
    });

    const departmentCtx = document.getElementById("department-chart");
    const departmentNames = new Map(
      departments.map((dept) => [dept.id, dept.name || dept.id])
    );
    const deptCounts = employees.reduce((acc, emp) => {
      const raw = (emp.departmentId || "").trim();
      const byId = departmentNames.get(raw);
      const byName = departments.find((dept) => dept.name === raw)?.name;
      const label = byId || byName || raw || "Unassigned";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const deptLabels = Object.keys(deptCounts);
    new window.Chart(departmentCtx, {
      type: "bar",
      data: {
        labels: deptLabels.length ? deptLabels : ["No data"],
        datasets: [
          {
            label: "Employees",
            data: deptLabels.length ? deptLabels.map((label) => deptCounts[label]) : [0],
            backgroundColor: "#0038a8"
          }
        ]
      },
      options: chartDefaults
    });

    const attendanceCtx = document.getElementById("attendance-chart");
    const present = attendance.filter((item) => item.status === "present").length;
    const late = attendance.filter((item) => item.status === "late").length;
    const absent = attendance.filter((item) => item.status === "absent").length;
    new window.Chart(attendanceCtx, {
      type: "bar",
      data: {
        labels: ["Present", "Late", "Absent"],
        datasets: [
          {
            label: "Attendance",
            data: [present, late, absent],
            backgroundColor: ["#00c2a8", "#ffb347", "#0b1220"]
          }
        ]
      },
      options: chartDefaults
    });

    const payrollCtx = document.getElementById("payroll-chart");
    const payrollByMonth = payroll.reduce((acc, entry) => {
      const month = (entry.month || "Unknown").trim();
      const net = Number(entry.net || 0);
      acc[month] = (acc[month] || 0) + net;
      return acc;
    }, {});
    const payrollLabels = Object.keys(payrollByMonth).sort();
    const recentLabels = payrollLabels.slice(-6);
    const payrollTotals = recentLabels.map((month) => payrollByMonth[month]);
    new window.Chart(payrollCtx, {
      type: "line",
      data: {
        labels: recentLabels.length ? recentLabels : ["No data"],
        datasets: [
          {
            label: "Net Payroll",
            data: payrollTotals.length ? payrollTotals : [0],
            borderColor: "#0038a8",
            backgroundColor: "rgba(0, 56, 168, 0.15)",
            fill: true
          }
        ]
      },
      options: chartDefaults
    });
  }

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

loadDashboard();

window.addEventListener("global-search", (event) => {
  applyDashboardSearch(event.detail);
});

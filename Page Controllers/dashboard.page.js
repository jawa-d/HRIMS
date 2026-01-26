import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { listEmployees } from "../Services/employees.service.js";
import { listLeaves } from "../Services/leaves.service.js";
import { listPayroll } from "../Services/payroll.service.js";
import { listAttendance } from "../Services/attendance.service.js";
import { listNotifications, markNotificationRead } from "../Services/notifications.service.js";

if (!enforceAuth("dashboard")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("dashboard");

const kpiEmployees = document.getElementById("kpi-employees");
const kpiLeaves = document.getElementById("kpi-leaves");
const kpiPayroll = document.getElementById("kpi-payroll");
const kpiAttendance = document.getElementById("kpi-attendance");
const activityList = document.getElementById("activity-list");
const notificationsList = document.getElementById("notifications-list");

function renderActivity(items) {
  activityList.innerHTML = items
    .map(
      (item) => `
      <div class="activity-item">
        <strong>${item.title}</strong>
        <div class="text-muted">${item.subtitle}</div>
      </div>
    `
    )
    .join("");
}

function renderNotifications(items) {
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

async function loadDashboard() {
  const [employees, leaves, payroll, attendance, notifications] = await Promise.all([
    listEmployees(),
    listLeaves(),
    listPayroll(),
    listAttendance(),
    listNotifications()
  ]);

  kpiEmployees.textContent = employees.length;
  kpiLeaves.textContent = leaves.length;
  kpiPayroll.textContent = payroll.length;
  kpiAttendance.textContent = attendance.length;

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
      }
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
      }
    });
  }
}

loadDashboard();

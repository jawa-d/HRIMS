import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { listEmployees } from "../Services/employees.service.js";
import { listLeaves } from "../Services/leaves.service.js";

if (!enforceAuth("reports")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("reports");

const exportButton = document.getElementById("export-reports-btn");
exportButton.addEventListener("click", () => alert("Export coming soon"));

async function loadReports() {
  const [employees, leaves] = await Promise.all([listEmployees(), listLeaves()]);
  const deptCounts = employees.reduce((acc, emp) => {
    const key = emp.departmentId || "Unassigned";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const leaveStatus = leaves.reduce(
    (acc, leave) => {
      const key = leave.status || "pending";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { approved: 0, pending: 0, rejected: 0 }
  );

  if (window.Chart) {
    new window.Chart(document.getElementById("dept-chart"), {
      type: "bar",
      data: {
        labels: Object.keys(deptCounts),
        datasets: [
          {
            label: "Employees",
            data: Object.values(deptCounts),
            backgroundColor: "#0038a8"
          }
        ]
      }
    });

    new window.Chart(document.getElementById("report-leave-chart"), {
      type: "pie",
      data: {
        labels: Object.keys(leaveStatus),
        datasets: [
          {
            data: Object.values(leaveStatus),
            backgroundColor: ["#00c2a8", "#0038a8", "#0b1220"]
          }
        ]
      }
    });
  }
}

loadReports();

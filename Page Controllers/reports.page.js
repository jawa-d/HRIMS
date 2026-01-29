import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { listEmployees } from "../Services/employees.service.js";
import { listLeaves } from "../Services/leaves.service.js";
import { listDepartments } from "../Services/departments.service.js";
import { listPositions } from "../Services/positions.service.js";
import { listAttendance } from "../Services/attendance.service.js";
import { listPayroll } from "../Services/payroll.service.js";

if (!enforceAuth("reports")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("reports");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const exportExcelBtn = document.getElementById("export-excel-btn");
const exportPdfBtn = document.getElementById("export-pdf-btn");
const totalsEls = {
  employees: document.getElementById("report-employees"),
  departments: document.getElementById("report-departments"),
  positions: document.getElementById("report-positions"),
  leaves: document.getElementById("report-leaves"),
  attendance: document.getElementById("report-attendance"),
  payroll: document.getElementById("report-payroll")
};

let reportData = null;

function normalizeLabel(value) {
  const label = (value || "").toString().trim();
  return label || "Unassigned";
}

function mapCounts(list, getter) {
  return list.reduce((acc, item) => {
    const key = normalizeLabel(getter(item));
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sortLabelsByValue(map) {
  return Object.keys(map).sort((a, b) => map[b] - map[a]);
}

function buildChart(ctx, config) {
  return new window.Chart(ctx, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      hover: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { enabled: true, mode: "index", intersect: false }
      },
      ...config.options
    }
  });
}

function buildAreaGradient(ctx, color) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, `${color}55`);
  gradient.addColorStop(1, `${color}08`);
  return gradient;
}

function buildAreaSeries(ctx, label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: buildAreaGradient(ctx, color),
    fill: true,
    tension: 0.35,
    pointRadius: 3,
    pointHoverRadius: 6
  };
}

function getCanvasCtx(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

function setupChartDefaults() {
  if (!window.Chart) return;
  window.Chart.defaults.font.family = "Manrope, Cairo, sans-serif";
  window.Chart.defaults.color = "#1f2937";
  window.Chart.defaults.elements.line.tension = 0.35;
  window.Chart.defaults.elements.point.radius = 3;
  window.Chart.defaults.elements.point.hoverRadius = 6;
  window.Chart.defaults.elements.point.hitRadius = 12;
}

function buildHeadcountSeries(employees) {
  const now = new Date();
  const months = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return date;
  });
  const labels = months.map((date) =>
    date.toLocaleDateString(undefined, { month: "short" })
  );

  const hasJoinDates = employees.some((emp) => emp.joinDate);
  if (hasJoinDates) {
    const series = months.map((date) => {
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return employees.filter((emp) => {
        if (!emp.joinDate) return true;
        return new Date(emp.joinDate) <= endOfMonth;
      }).length;
    });
    return { labels, series };
  }

  const total = employees.length || 0;
  const base = Math.max(0, total - 5);
  const series = months.map((_, index) => base + index);
  series[series.length - 1] = total;
  return { labels, series };
}

function exportToCsv(data) {
  const lines = [];
  lines.push(["Report", "Value"].join(","));
  lines.push(["Employees", data.employees.length].join(","));
  lines.push(["Departments", data.departments.length].join(","));
  lines.push(["Positions", data.positions.length].join(","));
  lines.push(["Leaves", data.leaves.length].join(","));
  lines.push(["Attendance", data.attendance.length].join(","));
  lines.push(["Payroll", data.payroll.length].join(","));
  lines.push("");

  const section = (title, rows) => {
    lines.push(title);
    lines.push(rows.headers.join(","));
    rows.data.forEach((row) => lines.push(row.map((cell) => `"${cell}"`).join(",")));
    lines.push("");
  };

  section("Department Headcount", {
    headers: ["Department", "Employees"],
    data: data.departmentLabels.map((label) => [label, data.departmentCounts[label]])
  });

  section("Position Distribution", {
    headers: ["Position", "Employees"],
    data: data.positionLabels.map((label) => [label, data.positionCounts[label]])
  });

  section("Leave Status", {
    headers: ["Status", "Count"],
    data: data.leaveStatusLabels.map((label) => [label, data.leaveStatus[label]])
  });

  section("Leave Types", {
    headers: ["Type", "Count"],
    data: data.leaveTypeLabels.map((label) => [label, data.leaveTypes[label]])
  });

  section("Attendance Status", {
    headers: ["Status", "Count"],
    data: data.attendanceLabels.map((label) => [label, data.attendanceStatus[label]])
  });

  section("Payroll by Month", {
    headers: ["Month", "Total Net"],
    data: data.payrollLabels.map((label) => [label, data.payrollByMonth[label]])
  });

  section("Employee Status", {
    headers: ["Status", "Count"],
    data: data.employeeStatusLabels.map((label) => [label, data.employeeStatus[label]])
  });

  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "hr-reports.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportToPdf(data) {
  const printable = window.open("", "_blank");
  if (!printable) return;
  const tableRows = (labels, values) =>
    labels
      .map(
        (label) => `
        <tr>
          <td>${label}</td>
          <td>${values[label]}</td>
        </tr>
      `
      )
      .join("");

  printable.document.write(`
    <html>
      <head>
        <title>HR Reports</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin-bottom: 8px; }
          h2 { margin-top: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; text-align: left; }
          th { background: #f3f5f7; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .summary div { padding: 10px 12px; border: 1px solid #e5e5e5; border-radius: 8px; }
        </style>
      </head>
      <body>
        <h1>HR Reports</h1>
        <div class="summary">
          <div><strong>Employees:</strong> ${data.employees.length}</div>
          <div><strong>Departments:</strong> ${data.departments.length}</div>
          <div><strong>Positions:</strong> ${data.positions.length}</div>
          <div><strong>Leaves:</strong> ${data.leaves.length}</div>
          <div><strong>Attendance:</strong> ${data.attendance.length}</div>
          <div><strong>Payroll:</strong> ${data.payroll.length}</div>
        </div>
        <h2>Department Headcount</h2>
        <table>
          <thead><tr><th>Department</th><th>Employees</th></tr></thead>
          <tbody>${tableRows(data.departmentLabels, data.departmentCounts)}</tbody>
        </table>
        <h2>Position Distribution</h2>
        <table>
          <thead><tr><th>Position</th><th>Employees</th></tr></thead>
          <tbody>${tableRows(data.positionLabels, data.positionCounts)}</tbody>
        </table>
        <h2>Leave Status</h2>
        <table>
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>${tableRows(data.leaveStatusLabels, data.leaveStatus)}</tbody>
        </table>
        <h2>Leave Types</h2>
        <table>
          <thead><tr><th>Type</th><th>Count</th></tr></thead>
          <tbody>${tableRows(data.leaveTypeLabels, data.leaveTypes)}</tbody>
        </table>
        <h2>Attendance Status</h2>
        <table>
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>${tableRows(data.attendanceLabels, data.attendanceStatus)}</tbody>
        </table>
        <h2>Payroll by Month</h2>
        <table>
          <thead><tr><th>Month</th><th>Total Net</th></tr></thead>
          <tbody>${tableRows(data.payrollLabels, data.payrollByMonth)}</tbody>
        </table>
        <h2>Employee Status</h2>
        <table>
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>${tableRows(data.employeeStatusLabels, data.employeeStatus)}</tbody>
        </table>
      </body>
    </html>
  `);
  printable.document.close();
  printable.focus();
  printable.print();
}

async function loadReports() {
  const [employees, leaves, departments, positions, attendance, payroll] = await Promise.all([
    listEmployees(),
    listLeaves(),
    listDepartments(),
    listPositions(),
    listAttendance(),
    listPayroll()
  ]);

  totalsEls.employees.textContent = employees.length;
  totalsEls.departments.textContent = departments.length;
  totalsEls.positions.textContent = positions.length;
  totalsEls.leaves.textContent = leaves.length;
  totalsEls.attendance.textContent = attendance.length;
  totalsEls.payroll.textContent = payroll.length;

  const departmentNames = new Map(
    departments.map((dept) => [dept.id, dept.name || dept.id])
  );
  const deptCounts = employees.reduce((acc, emp) => {
    const raw = (emp.departmentId || "").trim();
    const byId = departmentNames.get(raw);
    const label = byId || raw || "Unassigned";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const positionNames = new Map(
    positions.map((pos) => [pos.id, pos.name || pos.id])
  );
  const positionCounts = employees.reduce((acc, emp) => {
    const raw = (emp.positionId || "").trim();
    const byId = positionNames.get(raw);
    const label = byId || raw || "Unassigned";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const leaveStatus = mapCounts(leaves, (leave) => leave.status || "pending");
  const leaveTypes = mapCounts(leaves, (leave) => leave.type || "General");
  const attendanceStatus = mapCounts(attendance, (record) => record.status || "present");
  const payrollByMonth = payroll.reduce((acc, entry) => {
    const month = normalizeLabel(entry.month);
    const net = Number(entry.net || 0);
    acc[month] = (acc[month] || 0) + net;
    return acc;
  }, {});
  const employeeStatus = mapCounts(employees, (emp) => emp.status || "active");

  const departmentLabels = sortLabelsByValue(deptCounts);
  const positionLabels = sortLabelsByValue(positionCounts);
  const leaveStatusLabels = sortLabelsByValue(leaveStatus);
  const leaveTypeLabels = sortLabelsByValue(leaveTypes);
  const attendanceLabels = sortLabelsByValue(attendanceStatus);
  const payrollLabels = Object.keys(payrollByMonth).sort();
  const employeeStatusLabels = sortLabelsByValue(employeeStatus);

  reportData = {
    employees,
    leaves,
    departments,
    positions,
    attendance,
    payroll,
    departmentCounts: deptCounts,
    positionCounts,
    leaveStatus,
    leaveTypes,
    attendanceStatus,
    payrollByMonth,
    employeeStatus,
    departmentLabels,
    positionLabels,
    leaveStatusLabels,
    leaveTypeLabels,
    attendanceLabels,
    payrollLabels,
    employeeStatusLabels
  };

  if (window.Chart) {
    setupChartDefaults();
    const trend = getCanvasCtx("headcount-trend-chart");
    if (trend) {
      const { labels, series } = buildHeadcountSeries(employees);
      buildChart(trend.canvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            buildAreaSeries(trend.ctx, "Headcount", series, "#2563eb")
          ]
        }
      });
    }

    const dept = getCanvasCtx("dept-chart");
    if (dept) {
      buildChart(dept.canvas, {
        type: "line",
        data: {
          labels: departmentLabels,
          datasets: [
            buildAreaSeries(
              dept.ctx,
              "Employees",
              departmentLabels.map((label) => deptCounts[label]),
              "#3b82f6"
            )
          ]
        }
      });
    }

    const position = getCanvasCtx("position-chart");
    if (position) {
      buildChart(position.canvas, {
        type: "line",
        data: {
          labels: positionLabels,
          datasets: [
            buildAreaSeries(
              position.ctx,
              "Employees",
              positionLabels.map((label) => positionCounts[label]),
              "#14b8a6"
            )
          ]
        }
      });
    }

    const leaveStatusCanvas = getCanvasCtx("leave-status-chart");
    if (leaveStatusCanvas) {
      buildChart(leaveStatusCanvas.canvas, {
        type: "line",
        data: {
          labels: leaveStatusLabels,
          datasets: [
            buildAreaSeries(
              leaveStatusCanvas.ctx,
              "Requests",
              leaveStatusLabels.map((label) => leaveStatus[label]),
              "#f59e0b"
            )
          ]
        }
      });
    }

    const leaveTypeCanvas = getCanvasCtx("leave-type-chart");
    if (leaveTypeCanvas) {
      buildChart(leaveTypeCanvas.canvas, {
        type: "line",
        data: {
          labels: leaveTypeLabels,
          datasets: [
            buildAreaSeries(
              leaveTypeCanvas.ctx,
              "Requests",
              leaveTypeLabels.map((label) => leaveTypes[label]),
              "#8b5cf6"
            )
          ]
        }
      });
    }

    const attendanceCanvas = getCanvasCtx("attendance-chart");
    if (attendanceCanvas) {
      buildChart(attendanceCanvas.canvas, {
        type: "line",
        data: {
          labels: attendanceLabels,
          datasets: [
            buildAreaSeries(
              attendanceCanvas.ctx,
              "Attendance",
              attendanceLabels.map((label) => attendanceStatus[label]),
              "#22c55e"
            )
          ]
        }
      });
    }

    const payrollCanvas = getCanvasCtx("payroll-chart");
    if (payrollCanvas) {
      buildChart(payrollCanvas.canvas, {
        type: "line",
        data: {
          labels: payrollLabels,
          datasets: [
            buildAreaSeries(
              payrollCanvas.ctx,
              "Net Payroll",
              payrollLabels.map((label) => payrollByMonth[label]),
              "#0ea5e9"
            )
          ]
        }
      });
    }

    const statusCanvas = getCanvasCtx("employee-status-chart");
    if (statusCanvas) {
      buildChart(statusCanvas.canvas, {
        type: "line",
        data: {
          labels: employeeStatusLabels,
          datasets: [
            buildAreaSeries(
              statusCanvas.ctx,
              "Employees",
              employeeStatusLabels.map((label) => employeeStatus[label]),
              "#16a34a"
            )
          ]
        }
      });
    }

    return;
  }
}

loadReports();

exportExcelBtn.addEventListener("click", () => {
  if (reportData) exportToCsv(reportData);
});
exportPdfBtn.addEventListener("click", () => {
  if (reportData) exportToPdf(reportData);
});

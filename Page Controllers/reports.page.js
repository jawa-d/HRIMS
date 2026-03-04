import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listEmployees } from "../Services/employees.service.js";
import { listLeaves } from "../Services/leaves.service.js";
import { listDepartments } from "../Services/departments.service.js";
import { listPositions } from "../Services/positions.service.js";
import { listAttendance } from "../Services/attendance.service.js";
import { listPayroll } from "../Services/payroll.service.js";
import {
  createBackupSnapshot,
  listBackupSnapshots,
  restoreBackupById,
  restoreBackupPayload,
  runDailyBackup
} from "../Services/backup-restore.service.js";

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
const backupNowBtn = document.getElementById("backup-now-btn");
const backupExcelBtn = document.getElementById("backup-excel-btn");
const backupWordBtn = document.getElementById("backup-word-btn");
const restoreLatestBtn = document.getElementById("restore-latest-btn");
const restoreFileBtn = document.getElementById("restore-file-btn");
const restoreFileInput = document.getElementById("restore-file-input");
const backupStatusLabel = document.getElementById("backup-status-label");
const totalsEls = {
  employees: document.getElementById("report-employees"),
  departments: document.getElementById("report-departments"),
  positions: document.getElementById("report-positions"),
  leaves: document.getElementById("report-leaves"),
  attendance: document.getElementById("report-attendance"),
  payroll: document.getElementById("report-payroll")
};

let reportData = null;
let latestBackup = null;
const chartInstances = [];

const actor = {
  uid: user?.uid || "",
  name: user?.name || "",
  role: role || ""
};
const BACKUP_KEEP_COUNT = 30;

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
  const instance = new window.Chart(ctx, {
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
  chartInstances.push(instance);
  return instance;
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

function clearCharts() {
  while (chartInstances.length) {
    const instance = chartInstances.pop();
    try {
      instance?.destroy();
    } catch (_) {
      // Ignore chart destroy errors.
    }
  }
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

function escapeCell(value) {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, "\"\"")}"`;
  return raw;
}

function toTimeLabel(value) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString();
  }
  return "-";
}

function backupToCsv(payload) {
  const summary = payload?.summary || {};
  const lines = [];
  lines.push("Collection,Count");
  Object.keys(summary).forEach((key) => {
    lines.push(`${escapeCell(key)},${escapeCell(summary[key])}`);
  });
  lines.push("");

  Object.keys(payload?.collections || {}).forEach((name) => {
    const records = payload.collections[name] || [];
    lines.push(`${name}`);
    if (!records.length) {
      lines.push("No records");
      lines.push("");
      return;
    }
    const keys = Object.keys(records[0]).filter((key) => key !== "id");
    lines.push(["id", ...keys].map(escapeCell).join(","));
    records.forEach((record) => {
      const row = ["id", ...keys].map((key) => {
        if (key === "id") return escapeCell(record.id || "");
        return escapeCell(typeof record[key] === "object" ? JSON.stringify(record[key]) : record[key]);
      });
      lines.push(row.join(","));
    });
    lines.push("");
  });

  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hrms-backup-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function backupToWord(payload) {
  const summaryRows = Object.keys(payload?.summary || {})
    .map((key) => `<tr><td>${key}</td><td>${payload.summary[key]}</td></tr>`)
    .join("");

  const sections = Object.keys(payload?.collections || {})
    .map((name) => {
      const list = payload.collections[name] || [];
      if (!list.length) {
        return `<h3>${name}</h3><p>No records.</p>`;
      }
      const keys = Object.keys(list[0]).filter((key) => key !== "id");
      const headers = ["id", ...keys].map((key) => `<th>${key}</th>`).join("");
      const rows = list
        .slice(0, 250)
        .map((record) => {
          const cells = ["id", ...keys]
            .map((key) => {
              const value = key === "id" ? record.id : record[key];
              return `<td>${typeof value === "object" ? JSON.stringify(value) : (value ?? "")}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<h3>${name}</h3><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
          h1 { margin-bottom: 8px; }
          h3 { margin-top: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 12px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>HRMS Backup Report</h1>
        <p>Created: ${payload?.createdAtIso || new Date().toISOString()}</p>
        <h2>Summary</h2>
        <table><thead><tr><th>Collection</th><th>Count</th></tr></thead><tbody>${summaryRows}</tbody></table>
        ${sections}
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hrms-backup-${new Date().toISOString().slice(0, 10)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

async function refreshBackupStatus() {
  try {
    const snapshots = await listBackupSnapshots(5);
    latestBackup = snapshots[0] || null;
    if (!backupStatusLabel) return;
    if (!latestBackup) {
      backupStatusLabel.textContent = "No backup yet";
      return;
    }
    const timeLabel = toTimeLabel(latestBackup.createdAt) || latestBackup.createdAtIso || "-";
    backupStatusLabel.textContent = `Latest backup: ${timeLabel}`;
  } catch (error) {
    console.error("Refresh backup status failed:", error);
    if (backupStatusLabel) backupStatusLabel.textContent = "Backup status unavailable";
  }
}

async function backupNow() {
  const result = await createBackupSnapshot(actor, { keepCount: BACKUP_KEEP_COUNT });
  latestBackup = { id: result.id, payload: result.snapshot, createdAtIso: result.snapshot.createdAtIso };
  if (backupStatusLabel) backupStatusLabel.textContent = `Latest backup: ${result.snapshot.createdAtIso}`;
}

async function loadReports() {
  try {
    const [employees, leaves, departments, positions, attendance, payroll] = await Promise.all([
      listEmployees({ limitCount: 300 }),
      listLeaves({ limitCount: 400 }),
      listDepartments({ limitCount: 120 }),
      listPositions({ limitCount: 120 }),
      listAttendance({ limitCount: 500 }),
      listPayroll({ limitCount: 400 })
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
      clearCharts();
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
    }
  } catch (error) {
    console.error("Load reports failed:", error);
    showToast("error", "Could not load reports data");
  }
}

loadReports();

async function initBackupPanel() {
  await refreshBackupStatus();
  try {
    const daily = await runDailyBackup(actor, { keepCount: BACKUP_KEEP_COUNT });
    if (!daily.skipped) {
      await refreshBackupStatus();
    }
  } catch (_) {
    // no-op for UI flow
  }
}

void initBackupPanel();

exportExcelBtn.addEventListener("click", () => {
  if (reportData) exportToCsv(reportData);
});
exportPdfBtn.addEventListener("click", () => {
  if (reportData) exportToPdf(reportData);
});

backupNowBtn?.addEventListener("click", async () => {
  try {
    await backupNow();
    showToast("success", "Backup created successfully.");
  } catch (error) {
    console.error("Backup now failed:", error);
    showToast("error", "Backup failed");
  }
});

backupExcelBtn?.addEventListener("click", async () => {
  if (!latestBackup?.payload) {
    const snapshots = await listBackupSnapshots(1);
    latestBackup = snapshots[0] || null;
  }
  if (!latestBackup?.payload) {
    showToast("error", "No backup available yet.");
    return;
  }
  backupToCsv(latestBackup.payload);
});

backupWordBtn?.addEventListener("click", async () => {
  if (!latestBackup?.payload) {
    const snapshots = await listBackupSnapshots(1);
    latestBackup = snapshots[0] || null;
  }
  if (!latestBackup?.payload) {
    showToast("error", "No backup available yet.");
    return;
  }
  backupToWord(latestBackup.payload);
});

restoreLatestBtn?.addEventListener("click", async () => {
  try {
    const snapshots = await listBackupSnapshots(1);
    const latest = snapshots[0];
    if (!latest?.id) {
      showToast("error", "No backup to restore.");
      return;
    }
    const confirmed = window.confirm("Restore latest backup now? This will replace current data.");
    if (!confirmed) return;
    await restoreBackupById(latest.id);
    showToast("success", "Restore completed. Refreshing page...");
    window.location.reload();
  } catch (error) {
    console.error("Restore latest failed:", error);
    showToast("error", "Restore failed");
  }
});

restoreFileBtn?.addEventListener("click", () => {
  restoreFileInput?.click();
});

restoreFileInput?.addEventListener("change", async () => {
  const file = restoreFileInput.files?.[0];
  if (!file) return;
  const confirmed = window.confirm("Restore from selected file? This will replace current data.");
  if (!confirmed) {
    restoreFileInput.value = "";
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await restoreBackupPayload(payload);
    restoreFileInput.value = "";
    showToast("success", "Restore from file completed. Refreshing page...");
    window.location.reload();
  } catch (_) {
    showToast("error", "Invalid backup file.");
  }
});

trackUxEvent({ event: "page_open", module: "reports" });

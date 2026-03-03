import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listAccountingObligations } from "../Services/accounting.service.js";
import { createNotification } from "../Services/notifications.service.js";
import { trackUxEvent } from "../Services/telemetry.service.js";

if (!enforceAuth("advances_report")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("advances_report");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const searchInput = document.getElementById("adv-search");
const stageFilter = document.getElementById("adv-stage-filter");
const monthFilter = document.getElementById("adv-month-filter");
const tbody = document.getElementById("adv-report-body");
const emptyState = document.getElementById("adv-report-empty");
const kpiOpenTotal = document.getElementById("adv-kpi-open-total");
const kpiOpenCount = document.getElementById("adv-kpi-open-count");
const kpiOverdueCount = document.getElementById("adv-kpi-overdue-count");
const kpiClosureRate = document.getElementById("adv-kpi-closure-rate");
const exportExcelBtn = document.getElementById("adv-export-excel-btn");
const exportPdfBtn = document.getElementById("adv-export-pdf-btn");

let advances = [];

function safeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function money(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(safeNumber(value));
}

function norm(value = "") {
  return String(value || "").trim().toLowerCase();
}

function stageLabel(stage = "") {
  const normalized = norm(stage);
  if (normalized === "requested") return t("accounting.workflow.requested");
  if (normalized === "approved") return t("accounting.workflow.approved");
  if (normalized === "disbursed") return t("accounting.workflow.disbursed");
  if (normalized === "closed") return t("accounting.workflow.closed");
  if (normalized === "rejected") return t("accounting.workflow.rejected");
  return stage || "-";
}

function isOverdue(item = {}) {
  const due = String(item.dueDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < new Date().toISOString().slice(0, 10) && norm(item.status) === "open";
}

function ageDays(item = {}) {
  const createdAtMs = typeof item?.createdAt?.toMillis === "function"
    ? item.createdAt.toMillis()
    : (typeof item?.createdAt?.seconds === "number" ? item.createdAt.seconds * 1000 : Date.now());
  return Math.max(0, Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24)));
}

function filteredRows() {
  const query = norm(searchInput?.value);
  const stage = norm(stageFilter?.value);
  const month = norm(monthFilter?.value);
  return advances.filter((item) => {
    const matchesStage = !stage || norm(item.workflowStage) === stage;
    const dateSource = String(item.dueDate || item.createdAtDate || "");
    const matchesMonth = !month || norm(dateSource).startsWith(month);
    const matchesQuery =
      !query ||
      [
        item.partyName,
        item.partyRef,
        item.employeeCode,
        item.employeeUid,
        item.departmentName,
        item.notes
      ]
        .filter(Boolean)
        .some((field) => norm(field).includes(query));
    return matchesStage && matchesMonth && matchesQuery;
  });
}

function renderKpis(rows) {
  const openRows = rows.filter((item) => norm(item.status) === "open");
  const closedRows = rows.filter((item) => norm(item.workflowStage) === "closed");
  const overdueRows = rows.filter((item) => isOverdue(item));
  const openTotal = openRows.reduce((sum, item) => sum + safeNumber(item.balance), 0);
  const closureRate = rows.length ? Math.round((closedRows.length / rows.length) * 100) : 0;

  if (kpiOpenTotal) kpiOpenTotal.textContent = money(openTotal);
  if (kpiOpenCount) kpiOpenCount.textContent = String(openRows.length);
  if (kpiOverdueCount) kpiOverdueCount.textContent = String(overdueRows.length);
  if (kpiClosureRate) kpiClosureRate.textContent = `${closureRate}%`;
}

function renderRows() {
  const rows = filteredRows();
  renderKpis(rows);
  tbody.innerHTML = rows
    .map((item) => `
      <tr>
        <td>${item.partyName || "-"}</td>
        <td>${item.employeeCode || "-"}</td>
        <td>${item.departmentName || "-"}</td>
        <td>${stageLabel(item.workflowStage || "requested")} / ${item.status || "-"}</td>
        <td>${item.dueDate || "-"}</td>
        <td>${ageDays(item)}</td>
        <td class="${isOverdue(item) ? "adv-overdue" : ""}">${isOverdue(item) ? t("common.yes") : t("common.no")}</td>
        <td>${money(item.balance)}</td>
        <td>${item.partyRef || "-"}${item.notes ? `<br><small class="text-muted">${item.notes}</small>` : ""}</td>
      </tr>
    `)
    .join("");
  emptyState.classList.toggle("hidden", rows.length > 0);
}

async function emitAutoAlerts() {
  const dayToken = new Date().toISOString().slice(0, 10);
  const storageKey = `advance_alerts_${dayToken}`;
  const sentMap = (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (_) {
      return {};
    }
  })();

  const overdueRows = advances.filter((item) => isOverdue(item));
  const highRows = advances.filter((item) => norm(item.status) === "open" && safeNumber(item.balance) >= 1000000);
  const nearDueRows = advances.filter((item) => {
    if (norm(item.status) !== "open") return false;
    const due = String(item.dueDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
    const days = Math.floor((new Date(`${due}T00:00:00`).getTime() - new Date(`${dayToken}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 3;
  });
  const toNotify = [...overdueRows, ...highRows, ...nearDueRows];

  await Promise.all(
    toNotify.map(async (item) => {
      const uid = String(item.employeeUid || "").trim();
      const id = String(item.id || "").trim();
      if (!uid || !id) return;
      if (sentMap[id]) return;
      try {
        await createNotification({
          toUid: uid,
          title: isOverdue(item)
            ? t("accounting.alert.overdue")
            : (nearDueRows.some((row) => row.id === item.id) ? t("accounting.alert.due_soon") : t("accounting.alert.high_balance")),
          message: `${item.partyRef || t("accounting.kind.advance")} / ${safeNumber(item.balance)}`,
          priority: "high",
          actionHref: "advances-report.html"
        });
        sentMap[id] = true;
      } catch (_) {
        // no-op
      }
    })
  );

  try {
    localStorage.setItem(storageKey, JSON.stringify(sentMap));
  } catch (_) {
    // no-op
  }
}

function getExportRows() {
  return filteredRows().map((item) => ({
    Employee: item.partyName || "",
    EmployeeCode: item.employeeCode || "",
    Department: item.departmentName || "",
    Workflow: stageLabel(item.workflowStage || "requested"),
    Status: item.status || "",
    DueDate: item.dueDate || "",
    AgeDays: ageDays(item),
    Overdue: isOverdue(item) ? t("common.yes") : t("common.no"),
    OpenBalance: safeNumber(item.balance),
    Ref: item.partyRef || "",
    Notes: item.notes || ""
  }));
}

function exportExcel() {
  const rows = getExportRows();
  if (!rows.length) {
    showToast("info", t("accounting.msg.no_rows_export"));
    return;
  }
  if (!window.XLSX) {
    showToast("error", t("accounting.msg.excel_lib_missing"));
    return;
  }
  const sheet = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, sheet, t("advances_report.title"));
  window.XLSX.writeFile(wb, `advances-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportPdf() {
  const rows = getExportRows();
  if (!rows.length) {
    showToast("info", t("accounting.msg.no_rows_export"));
    return;
  }
  const jsPdfLib = window.jspdf?.jsPDF;
  if (!jsPdfLib) {
    showToast("error", t("accounting.msg.pdf_lib_missing"));
    return;
  }
  const doc = new jsPdfLib({ orientation: "landscape" });
  const period = monthFilter?.value || new Date().toISOString().slice(0, 7);
  doc.setFontSize(13);
  doc.text(`${t("accounting.export.company_name")} - ${t("advances_report.title")}`, 14, 14);
  doc.text(`${t("accounting.export.period")}: ${period}`, 14, 20);
  doc.autoTable({
    startY: 24,
    head: [[t("accounting.employee"), t("common.code"), t("accounting.department"), t("advances_report.filter.status"), t("common.status"), t("accounting.due_date"), t("accounting.age_days"), t("accounting.overdue"), t("accounting.open_advances_amount"), t("common.ref"), t("common.notes")]],
    body: rows.map((row) => [
      row.Employee,
      row.EmployeeCode,
      row.Department,
      row.Workflow,
      row.Status,
      row.DueDate,
      String(row.AgeDays),
      row.Overdue,
      String(row.OpenBalance),
      row.Ref,
      row.Notes
    ])
  });
  const finalY = doc.lastAutoTable?.finalY || 200;
  doc.text(`${t("accounting.export.signature")}: __________________`, 14, finalY + 12);
  doc.save(`advances-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function loadData() {
  const rows = await listAccountingObligations();
  advances = rows.filter((item) => norm(item.kind) === "advance");
  renderRows();
  await emitAutoAlerts();
}

searchInput?.addEventListener("input", renderRows);
stageFilter?.addEventListener("change", renderRows);
monthFilter.value = new Date().toISOString().slice(0, 7);
monthFilter?.addEventListener("change", renderRows);
exportExcelBtn?.addEventListener("click", exportExcel);
exportPdfBtn?.addEventListener("click", exportPdf);

(async () => {
  try {
    await loadData();
  } catch (error) {
    console.error("Advances report init failed:", error);
    showToast("error", t("accounting.msg.load_advances_failed"));
  }
})();

trackUxEvent({ event: "page_open", module: "advances_report" });

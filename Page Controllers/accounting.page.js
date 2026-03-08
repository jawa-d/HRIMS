import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { canDo } from "../Services/permissions.service.js";
import {
  createAccountingEntry,
  deleteAccountingEntry,
  getCashboxConfig,
  listAccountingEntries,
  listAccountingObligations,
  updateAccountingEntry,
  upsertCashboxConfig
} from "../Services/accounting.service.js";

if (!enforceAuth("accounting")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("accounting");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canCreate = canDo({ role, entity: "accounting", action: "create" });
const canEdit = canDo({ role, entity: "accounting", action: "edit" });
const canDelete = canDo({ role, entity: "accounting", action: "delete" });
const openingBalanceEl = document.getElementById("acc-opening-balance");
const totalInEl = document.getElementById("acc-total-in");
const totalOutEl = document.getElementById("acc-total-out");
const totalExpenseEl = document.getElementById("acc-total-expense");
const advanceCountEl = document.getElementById("acc-advance-count");
const advanceDeductionEl = document.getElementById("acc-advance-deduction");
const monthMovementEl = document.getElementById("acc-month-movement");
const advanceClosureRateEl = document.getElementById("acc-advance-closure-rate");
const netEl = document.getElementById("acc-total-net");
const recentBody = document.getElementById("accounting-recent-body");
const emptyState = document.getElementById("accounting-empty");
const openingBtn = document.getElementById("accounting-opening-btn");
const quickInBtn = document.getElementById("accounting-quick-in-btn");
const quickOutBtn = document.getElementById("accounting-quick-out-btn");
const exportExcelBtn = document.getElementById("accounting-export-excel-btn");
const openFlowBtn = document.getElementById("accounting-open-flow");
const openCashboxBtn = document.getElementById("accounting-open-cashbox");
const roadmapProgressEl = document.getElementById("acc-roadmap-progress");
const roadmapProgressLabelEl = document.getElementById("acc-roadmap-progress-label");
const stepOpeningEl = document.getElementById("acc-step-opening");
const stepFlowEl = document.getElementById("acc-step-flow");
const stepObligationEl = document.getElementById("acc-step-obligation");
const stepCloseEl = document.getElementById("acc-step-close");
const stepOpeningStatusEl = document.getElementById("acc-step-opening-status");
const stepFlowStatusEl = document.getElementById("acc-step-flow-status");
const stepObligationStatusEl = document.getElementById("acc-step-obligation-status");
const stepCloseStatusEl = document.getElementById("acc-step-close-status");
const healthScoreEl = document.getElementById("acc-health-score");
const healthLabelEl = document.getElementById("acc-health-label");
const healthNoteEl = document.getElementById("acc-health-note");
const barInEl = document.getElementById("acc-bar-in");
const barOutEl = document.getElementById("acc-bar-out");
const barExpenseEl = document.getElementById("acc-bar-expense");
const barInValueEl = document.getElementById("acc-bar-in-value");
const barOutValueEl = document.getElementById("acc-bar-out-value");
const barExpenseValueEl = document.getElementById("acc-bar-expense-value");
const recoListEl = document.getElementById("acc-reco-list");

let entries = [];
let obligations = [];
let openingBalance = 0;
let summarySnapshot = {
  month: "",
  totalIn: 0,
  totalOut: 0,
  totalExpense: 0,
  monthMovement: 0,
  totalNet: 0,
  openAdvanceCount: 0,
  openAdvanceDue: 0,
  closureRate: 0,
  monthRows: []
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthPrefix() {
  return todayKey().slice(0, 7);
}

function safeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function accentFor(item = {}) {
  const source = item.id || item.category || item.notes || item.type || "";
  return `hsl(${hashSeed(source) % 360} 72% 44%)`;
}

function typeBadge(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "in") return "in";
  if (normalized === "expense") return "expense";
  return "out";
}

function currency(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(safeNumber(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setTone(el, value) {
  if (!el) return;
  el.classList.remove("pos", "neg");
  if (value > 0) el.classList.add("pos");
  if (value < 0) el.classList.add("neg");
}

function renderExecutiveSnapshot() {
  const totalFlow = summarySnapshot.totalIn + summarySnapshot.totalOut + summarySnapshot.totalExpense;
  const inShare = totalFlow ? Math.round((summarySnapshot.totalIn / totalFlow) * 100) : 0;
  const outShare = totalFlow ? Math.round((summarySnapshot.totalOut / totalFlow) * 100) : 0;
  const expenseShare = totalFlow ? Math.round((summarySnapshot.totalExpense / totalFlow) * 100) : 0;
  const collectionComponent = clamp(Math.round(summarySnapshot.closureRate * 0.35), 0, 35);
  const netComponent = summarySnapshot.totalNet >= 0 ? 35 : 10;
  const activityComponent = clamp(summarySnapshot.monthRows.length * 3, 0, 18);
  const riskPenalty = summarySnapshot.openAdvanceDue > summarySnapshot.totalIn * 0.45 ? 14 : 0;
  const score = clamp(collectionComponent + netComponent + activityComponent - riskPenalty, 0, 100);

  let label = t("accounting.health_label.risk");
  let labelClass = "risk";
  let note = t("accounting.health_note.risk");
  if (score >= 85) {
    label = t("accounting.health_label.excellent");
    labelClass = "excellent";
    note = t("accounting.health_note.excellent");
  } else if (score >= 70) {
    label = t("accounting.health_label.good");
    labelClass = "good";
    note = t("accounting.health_note.good");
  } else if (score >= 50) {
    label = t("accounting.health_label.watch");
    labelClass = "watch";
    note = t("accounting.health_note.watch");
  }

  if (healthScoreEl) healthScoreEl.textContent = String(score);
  if (healthNoteEl) healthNoteEl.textContent = note;
  if (healthLabelEl) {
    healthLabelEl.classList.remove("excellent", "good", "watch", "risk");
    healthLabelEl.classList.add(labelClass);
    healthLabelEl.textContent = label;
  }

  if (barInEl) barInEl.style.width = `${inShare}%`;
  if (barOutEl) barOutEl.style.width = `${outShare}%`;
  if (barExpenseEl) barExpenseEl.style.width = `${expenseShare}%`;
  if (barInValueEl) barInValueEl.textContent = `${inShare}%`;
  if (barOutValueEl) barOutValueEl.textContent = `${outShare}%`;
  if (barExpenseValueEl) barExpenseValueEl.textContent = `${expenseShare}%`;

  if (recoListEl) {
    const actions = [];
    if (summarySnapshot.openAdvanceCount > 0) {
      actions.push(`${t("accounting.reco.follow_up_prefix")} ${summarySnapshot.openAdvanceCount} ${t("accounting.reco.follow_up_suffix")}`);
    }
    if (summarySnapshot.monthMovement < 0) {
      actions.push(t("accounting.reco.reduce_outflow"));
    }
    if (summarySnapshot.closureRate < 60) {
      actions.push(t("accounting.reco.increase_closure"));
    }
    if (!actions.length) {
      actions.push(t("accounting.reco.balanced"));
    }
    recoListEl.innerHTML = actions.map((item) => `<li>${item}</li>`).join("");
  }
}

function markRoadmapStep(stepEl, statusEl, done, doneText = "Done", pendingText = "Pending") {
  if (!stepEl || !statusEl) return;
  stepEl.classList.remove("is-done", "is-pending");
  stepEl.classList.add(done ? "is-done" : "is-pending");
  statusEl.textContent = done ? doneText : pendingText;
}

function renderRoadmap() {
  const hasOpening = openingBalance > 0;
  const hasFlowRecords = summarySnapshot.monthRows.length >= 5;
  const hasHealthyObligations = summarySnapshot.closureRate >= 60 || summarySnapshot.openAdvanceCount === 0;
  const hasReviewReadyNet = summarySnapshot.totalNet >= 0;
  const doneCount = [hasOpening, hasFlowRecords, hasHealthyObligations, hasReviewReadyNet].filter(Boolean).length;
  const progress = Math.round((doneCount / 4) * 100);

  markRoadmapStep(stepOpeningEl, stepOpeningStatusEl, hasOpening, t("accounting.status.ready"), t("accounting.status.set_balance"));
  markRoadmapStep(stepFlowEl, stepFlowStatusEl, hasFlowRecords, t("accounting.status.tracked"), t("accounting.status.add_entries"));
  markRoadmapStep(stepObligationEl, stepObligationStatusEl, hasHealthyObligations, t("accounting.status.controlled"), t("accounting.status.review_dues"));
  markRoadmapStep(stepCloseEl, stepCloseStatusEl, hasReviewReadyNet, t("accounting.status.review_ready"), t("accounting.status.needs_review"));

  if (roadmapProgressEl) {
    roadmapProgressEl.style.width = `${progress}%`;
  }
  if (roadmapProgressLabelEl) {
    roadmapProgressLabelEl.textContent = `${t("accounting.progress")} ${progress}%`;
  }
}

function renderSummary() {
  const month = monthPrefix();
  const monthRows = entries.filter((item) => String(item.date || "").startsWith(month));
  const totalIn = monthRows.filter((r) => r.type === "in").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const totalOut = monthRows.filter((r) => r.type === "out").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const totalExpense = monthRows.filter((r) => r.type === "expense").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const openAdvances = obligations.filter((item) => String(item.kind || "").toLowerCase() === "advance" && String(item.status || "").toLowerCase() === "open");
  const allAdvances = obligations.filter((item) => String(item.kind || "").toLowerCase() === "advance");
  const closedAdvances = allAdvances.filter((item) => {
    const stage = String(item.workflowStage || "").toLowerCase();
    return stage === "closed" || String(item.status || "").toLowerCase() === "settled";
  });
  const openAdvanceCount = openAdvances.length;
  const openAdvanceDue = openAdvances.reduce((sum, item) => sum + safeNumber(item.balance), 0);
  const monthMovement = totalIn - totalOut - totalExpense;
  const closureRate = allAdvances.length ? Math.round((closedAdvances.length / allAdvances.length) * 100) : 0;
  const totalNet = openingBalance + totalIn - totalOut - totalExpense;
  summarySnapshot = {
    month,
    totalIn,
    totalOut,
    totalExpense,
    monthMovement,
    totalNet,
    openAdvanceCount,
    openAdvanceDue,
    closureRate,
    monthRows
  };

  if (openingBalanceEl) openingBalanceEl.textContent = currency(openingBalance);
  totalInEl.textContent = currency(totalIn);
  totalOutEl.textContent = currency(totalOut);
  totalExpenseEl.textContent = currency(totalExpense);
  if (advanceCountEl) advanceCountEl.textContent = String(openAdvanceCount);
  if (advanceDeductionEl) advanceDeductionEl.textContent = currency(openAdvanceDue);
  if (monthMovementEl) monthMovementEl.textContent = currency(monthMovement);
  if (advanceClosureRateEl) advanceClosureRateEl.textContent = `${closureRate}%`;
  netEl.textContent = currency(totalNet);
  setTone(monthMovementEl, monthMovement);
  setTone(netEl, totalNet);
  renderExecutiveSnapshot();
  renderRoadmap();
}

function renderRecent() {
  const rows = entries.slice(0, 8);
  recentBody.innerHTML = rows
    .map((entry, index) => {
      const actions = [];
      if (canEdit) {
        actions.push(`<button class="btn btn-ghost" data-action="edit" data-id="${entry.id}">${t("common.edit")}</button>`);
      }
      if (canDelete) {
        actions.push(`<button class="btn btn-ghost" data-action="delete" data-id="${entry.id}">${t("common.delete")}</button>`);
      }
      return `
        <tr class="acc-row type-${typeBadge(entry.type)}" style="--acc-accent:${accentFor(entry)};--row-index:${index};">
          <td>${entry.journalNo || "-"}</td>
          <td>${entry.date || "-"}</td>
          <td><span class="badge acc-type acc-type-${typeBadge(entry.type)}">${entry.type || "out"}</span></td>
          <td>${currency(entry.amount)}</td>
          <td>${entry.category || "-"}</td>
          <td>${entry.notes || "-"}</td>
          <td>${actions.join("") || `<span class="text-muted">${t("common.view_only")}</span>`}</td>
        </tr>
      `;
    })
    .join("");
  if (canEdit || canDelete) {
    recentBody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        void handleRecentAction(button.dataset.action, button.dataset.id);
      });
    });
  }
  emptyState.classList.toggle("hidden", rows.length > 0);
}

function openEditModal(entry) {
  if (!entry || !canEdit) return;
  const currentType = typeBadge(entry.type);
  openModal({
    title: "Edit Entry",
    content: `
      <label>Date<input id="acc-edit-date" class="input" type="date" value="${entry.date || todayKey()}" /></label>
      <label>Type
        <select id="acc-edit-type" class="select">
          <option value="in" ${currentType === "in" ? "selected" : ""}>In</option>
          <option value="out" ${currentType === "out" ? "selected" : ""}>Out</option>
          <option value="expense" ${currentType === "expense" ? "selected" : ""}>Expense</option>
        </select>
      </label>
      <label>Amount<input id="acc-edit-amount" class="input" type="number" min="0" step="0.01" value="${safeNumber(entry.amount)}" /></label>
      <label>Category<input id="acc-edit-category" class="input" value="${entry.category || ""}" /></label>
      <label>Notes<textarea id="acc-edit-notes" class="textarea">${entry.notes || ""}</textarea></label>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const amount = safeNumber(document.getElementById("acc-edit-amount").value);
            if (amount <= 0) {
              showToast("error", "Amount must be greater than 0");
              return false;
            }
            await updateAccountingEntry(entry.id, {
              date: document.getElementById("acc-edit-date").value || todayKey(),
              type: document.getElementById("acc-edit-type").value,
              amount,
              category: document.getElementById("acc-edit-category").value.trim(),
              notes: document.getElementById("acc-edit-notes").value.trim(),
              receiptNo: entry.receiptNo || "",
              externalReceiptNo: entry.externalReceiptNo || "",
              attachmentUrl: entry.attachmentUrl || "",
              attachmentName: entry.attachmentName || "",
              source: entry.source || "accounting_overview"
            });
            showToast("success", "Entry updated");
            await loadAccounting();
            return true;
          } catch (error) {
            console.error("Accounting overview update failed:", error);
            if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
              showToast("error", "This entry is in a closed period and cannot be edited.");
              return false;
            }
            showToast("error", "Failed to update entry");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleRecentAction(action, id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;

  if (action === "edit" && canEdit) {
    openEditModal(entry);
    return;
  }

  if (action === "delete" && canDelete) {
    if (!window.confirm("Delete this accounting entry?")) return;
    try {
      await deleteAccountingEntry(id);
      showToast("success", "Entry deleted");
      await loadAccounting();
    } catch (error) {
      console.error("Accounting overview delete failed:", error);
      if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
        showToast("error", "This entry is in a closed period and cannot be deleted.");
        return;
      }
      showToast("error", "Failed to delete entry");
    }
  }
}

async function loadAccounting() {
  const [entryRows, config, obligationRows] = await Promise.all([
    listAccountingEntries(),
    getCashboxConfig(),
    listAccountingObligations()
  ]);
  entries = entryRows;
  obligations = obligationRows;
  openingBalance = safeNumber(config?.openingBalance);
  renderSummary();
  renderRecent();
}

function openOpeningBalanceModal() {
  if (!canCreate) return;
  openModal({
    title: "Set Cashbox Opening Balance",
    content: `
      <label>Opening Amount
        <input id="acc-opening-input" class="input" type="number" min="0" step="0.01" value="${safeNumber(openingBalance)}" />
      </label>
      <p class="text-muted">Final net = Opening + In - Out - Daily Expenses</p>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const value = safeNumber(document.getElementById("acc-opening-input").value);
            await upsertCashboxConfig({ openingBalance: value });
            openingBalance = value;
            renderSummary();
            showToast("success", "Opening balance updated");
            return true;
          } catch (error) {
            console.error("Opening balance save failed:", error);
            showToast("error", "Failed to update opening balance");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function openQuickModal(type) {
  if (!canCreate) return;
  openModal({
    title: type === "in" ? "Add Cash In" : "Add Cash Out",
    content: `
      <label>Date<input id="acc-date" class="input" type="date" value="${todayKey()}" /></label>
      <label>Amount<input id="acc-amount" class="input" type="number" min="0" step="0.01" value="0" /></label>
      <label>Category<input id="acc-category" class="input" placeholder="Category" /></label>
      <label>Notes<textarea id="acc-notes" class="textarea" placeholder="Optional note"></textarea></label>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const amount = safeNumber(document.getElementById("acc-amount").value);
            if (amount <= 0) {
              showToast("error", "Amount must be greater than 0");
              return false;
            }
            await createAccountingEntry({
              type,
              amount,
              date: document.getElementById("acc-date").value || todayKey(),
              category: document.getElementById("acc-category").value.trim(),
              notes: document.getElementById("acc-notes").value.trim(),
              source: "accounting_overview",
              createdByUid: user.uid,
              createdByName: user.name || user.email || user.uid
            });
            showToast("success", "Accounting entry saved");
            await loadAccounting();
            return true;
          } catch (error) {
            console.error("Quick accounting save failed:", error);
            if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
              showToast("error", "Selected period is closed. Reopen month/year first.");
              return false;
            }
            showToast("error", "Failed to save entry");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function exportFinanceExcel() {
  if (!window.XLSX) {
    showToast("error", "Excel export library not loaded");
    return;
  }
  const month = summarySnapshot.month || monthPrefix();
  const monthRows = summarySnapshot.monthRows || [];
  if (!monthRows.length) {
    showToast("info", "No monthly records to export");
    return;
  }

  const summaryRows = [
    { Metric: "Month", Value: month },
    { Metric: "Opening Balance", Value: safeNumber(openingBalance) },
    { Metric: "Total In", Value: safeNumber(summarySnapshot.totalIn) },
    { Metric: "Total Out", Value: safeNumber(summarySnapshot.totalOut) },
    { Metric: "Daily Expenses", Value: safeNumber(summarySnapshot.totalExpense) },
    { Metric: "Month Movement", Value: safeNumber(summarySnapshot.monthMovement) },
    { Metric: "Open Advances Count", Value: safeNumber(summarySnapshot.openAdvanceCount) },
    { Metric: "Open Advances Amount", Value: safeNumber(summarySnapshot.openAdvanceDue) },
    { Metric: "Advance Closure Rate %", Value: safeNumber(summarySnapshot.closureRate) },
    { Metric: "Net Balance", Value: safeNumber(summarySnapshot.totalNet) }
  ];

  const transactionRows = monthRows.map((entry) => ({
    Date: entry.date || "",
    JournalNo: entry.journalNo || "",
    Type: entry.type || "",
    Amount: safeNumber(entry.amount),
    Category: entry.category || "",
    Notes: entry.notes || "",
    Source: entry.source || ""
  }));
  const obligationsRows = obligations.map((item) => ({
    Kind: item.kind || "",
    Party: item.partyName || "",
    Reference: item.partyRef || "",
    Balance: safeNumber(item.balance),
    Status: item.status || "",
    DueDate: item.dueDate || "",
    Stage: item.workflowStage || ""
  }));

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(summaryRows), t("accounting.export.sheet_summary"));
  window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(transactionRows), t("accounting.export.sheet_transactions"));
  window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(obligationsRows), t("accounting.export.sheet_obligations"));
  window.XLSX.writeFile(workbook, `finance-overview-${month}.xlsx`);
}

if (!canCreate) {
  openingBtn?.classList.add("hidden");
  quickInBtn?.classList.add("hidden");
  quickOutBtn?.classList.add("hidden");
}

openingBtn?.addEventListener("click", openOpeningBalanceModal);
quickInBtn?.addEventListener("click", () => openQuickModal("in"));
quickOutBtn?.addEventListener("click", () => openQuickModal("out"));
exportExcelBtn?.addEventListener("click", exportFinanceExcel);
openFlowBtn?.addEventListener("click", () => {
  window.location.href = "accounting-flow.html";
});
openCashboxBtn?.addEventListener("click", () => {
  window.location.href = "cashbox.html";
});

(async () => {
  try {
    await loadAccounting();
  } catch (error) {
    console.error("Accounting page init failed:", error);
    showToast("error", "Failed to load accounting");
  }
})();

trackUxEvent({ event: "page_open", module: "accounting" });

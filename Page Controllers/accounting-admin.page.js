import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import {
  closeAccountingMonth,
  closeAccountingYear,
  createAccountingObligation,
  createChartAccount,
  deleteAccountingObligation,
  deleteChartAccount,
  getAccountingClosures,
  listAccountingObligations,
  listChartAccounts,
  closeAdvanceObligation,
  postAccountingObligationMovement,
  reopenAccountingMonth,
  reopenAccountingYear,
  updateAccountingObligation,
  updateChartAccount
} from "../Services/accounting.service.js";
import { trackUxEvent } from "../Services/telemetry.service.js";

if (!enforceAuth("accounting_admin")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("accounting_admin");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin"].includes(role);
const coaBody = document.getElementById("coa-body");
const oblBody = document.getElementById("obl-body");
const coaAddBtn = document.getElementById("coa-add-btn");
const oblAddBtn = document.getElementById("obl-add-btn");
const coaSearchInput = document.getElementById("coa-search");
const oblSearchInput = document.getElementById("obl-search");
const oblStatusFilter = document.getElementById("obl-status-filter");
const coaExportExcelBtn = document.getElementById("coa-export-excel-btn");
const coaExportPdfBtn = document.getElementById("coa-export-pdf-btn");
const oblExportExcelBtn = document.getElementById("obl-export-excel-btn");
const oblExportPdfBtn = document.getElementById("obl-export-pdf-btn");
const oblTotalCountEl = document.getElementById("obl-total-count");
const oblOpenCountEl = document.getElementById("obl-open-count");
const oblSettledCountEl = document.getElementById("obl-settled-count");
const closeMonthInput = document.getElementById("close-month-input");
const closeYearInput = document.getElementById("close-year-input");
const closeMonthBtn = document.getElementById("close-month-btn");
const reopenMonthBtn = document.getElementById("reopen-month-btn");
const closeYearBtn = document.getElementById("close-year-btn");
const reopenYearBtn = document.getElementById("reopen-year-btn");
const closedMonthsList = document.getElementById("closed-months-list");
const closedYearsList = document.getElementById("closed-years-list");

let chart = [];
let obligations = [];
let closures = { months: {}, years: {} };

function money(value) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function norm(value = "") {
  return String(value || "").trim().toLowerCase();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function obligationKindLabel(kind = "") {
  const normalized = norm(kind);
  if (normalized === "custody") return "Custody (عهد)";
  if (normalized === "advance") return "Advance (سلف)";
  if (normalized === "receivable") return "AR Receivable (ذمم مدينة)";
  if (normalized === "payable") return "AP Payable (ذمم دائنة)";
  return kind || "-";
}

function filteredChartRows() {
  const query = norm(coaSearchInput?.value);
  return chart.filter((item) => {
    if (!query) return true;
    return [item.code, item.name, item.type, item.parentCode, item.status]
      .filter(Boolean)
      .some((field) => norm(field).includes(query));
  });
}

function filteredObligationRows() {
  const query = norm(oblSearchInput?.value);
  const status = norm(oblStatusFilter?.value);
  return obligations.filter((item) => {
    const matchesStatus = !status || norm(item.status) === status;
    if (!matchesStatus) return false;
    if (!query) return true;
    return [item.kind, item.partyName, item.partyRef, item.status, item.notes]
      .filter(Boolean)
      .some((field) => norm(field).includes(query));
  });
}

function renderObligationStats() {
  const total = obligations.length;
  const open = obligations.filter((item) => norm(item.status) === "open").length;
  const settled = obligations.filter((item) => norm(item.status) === "settled").length;
  if (oblTotalCountEl) oblTotalCountEl.textContent = String(total);
  if (oblOpenCountEl) oblOpenCountEl.textContent = String(open);
  if (oblSettledCountEl) oblSettledCountEl.textContent = String(settled);
}

function renderClosures() {
  const months = Object.keys(closures.months || {}).sort();
  const years = Object.keys(closures.years || {}).sort();
  closedMonthsList.innerHTML = months.length ? months.map((m) => `<span class="chip">${m}</span>`).join("") : "<span class='text-muted'>None</span>";
  closedYearsList.innerHTML = years.length ? years.map((y) => `<span class="chip">${y}</span>`).join("") : "<span class='text-muted'>None</span>";
}

function renderChart() {
  coaBody.innerHTML = filteredChartRows()
    .map((item) => {
      return `
        <tr>
          <td>${item.code || "-"}</td>
          <td>${item.name || "-"}</td>
          <td>${item.type || "-"}</td>
          <td>${item.parentCode || "-"}</td>
          <td>${item.status || "-"}</td>
          <td>
            ${
              canManage
                ? `
              <button class="btn btn-ghost" data-coa-action="edit" data-id="${item.id}">Edit</button>
              <button class="btn btn-ghost" data-coa-action="delete" data-id="${item.id}">Delete</button>
            `
                : "<span class='text-muted'>View only</span>"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  if (canManage) {
    coaBody.querySelectorAll("button[data-coa-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void handleCoaAction(btn.dataset.coaAction, btn.dataset.id);
      });
    });
  }
}

function renderObligations() {
  oblBody.innerHTML = filteredObligationRows()
    .map((item) => {
      const isAdvance = norm(item.kind) === "advance";
      return `
        <tr>
          <td>${obligationKindLabel(item.kind)}</td>
          <td>${item.partyName || "-"}</td>
          <td>${item.partyRef || "-"}</td>
          <td>${money(item.balance)}</td>
          <td>${item.status || "-"}</td>
          <td>
            ${
              canManage
                ? `
              <button class="btn btn-ghost" data-obl-action="edit" data-id="${item.id}">Edit</button>
              <button class="btn btn-ghost" data-obl-action="${isAdvance ? "close" : "post"}" data-id="${item.id}">${isAdvance ? "Close" : "Post"}</button>
              <button class="btn btn-ghost" data-obl-action="delete" data-id="${item.id}">Delete</button>
            `
                : "<span class='text-muted'>View only</span>"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  if (canManage) {
    oblBody.querySelectorAll("button[data-obl-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void handleObligationAction(btn.dataset.oblAction, btn.dataset.id);
      });
    });
  }
}

function openAdvanceCloseModal(item) {
  if (!item || !canManage) return;
  const currentBalance = Number(item.balance || 0);
  if (currentBalance <= 0) {
    showToast("info", "This advance is already settled.");
    return;
  }

  openModal({
    title: `Close Advance - ${item.partyName || item.id}`,
    content: `
      <p class="text-muted">Closing this advance will deduct <strong>${money(currentBalance)}</strong> from cash and reduce Net Balance.</p>
      <label>Date<input id="adv-close-date" class="input" type="date" value="${todayKey()}" /></label>
      <label>Notes<textarea id="adv-close-notes" class="textarea" placeholder="Optional note"></textarea></label>
    `,
    actions: [
      {
        label: "Close Advance",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const result = await closeAdvanceObligation({
              obligationId: item.id,
              date: document.getElementById("adv-close-date").value || todayKey(),
              notes: document.getElementById("adv-close-notes").value.trim(),
              actorUid: user.uid || "",
              actorName: user.name || user.email || user.uid || ""
            });
            showToast("success", `Advance closed. Journal: ${result.journalNo}`);
            await loadAll();
            return true;
          } catch (error) {
            console.error("Close advance failed:", error);
            const msg = String(error?.code || error?.message || "");
            if (msg.includes("PERIOD_CLOSED")) {
              showToast("error", "Selected period is closed. Reopen month/year first.");
              return false;
            }
            if (msg.includes("ALREADY_SETTLED")) {
              showToast("info", "This advance is already settled.");
              await loadAll();
              return true;
            }
            showToast("error", "Failed to close advance");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function openObligationPostModal(item) {
  if (!item || !canManage) return;
  const kind = norm(item.kind);
  let operationOptions = "";
  if (kind === "custody" || kind === "advance") {
    operationOptions = `
      <option value="issue_out">Issue Invoice/Advance (Decrease Cash)</option>
      <option value="settle_in">Settlement / Close (No Extra Deduction)</option>
    `;
  } else if (kind === "receivable") {
    operationOptions = `<option value="collect_in">Collection / Close (Increase Cash)</option>`;
  } else if (kind === "payable") {
    operationOptions = `<option value="pay_out">Payment Invoice (Decrease Cash)</option>`;
  }

  openModal({
    title: `Post Movement - ${item.partyName || item.id}`,
    content: `
      <p class="text-muted">Posting here creates accounting entry automatically and updates invoice/item status and balance.</p>
      <label>Operation
        <select id="obl-post-operation" class="select">
          ${operationOptions}
        </select>
      </label>
      <label>Date<input id="obl-post-date" class="input" type="date" value="${todayKey()}" /></label>
      <label>Amount<input id="obl-post-amount" class="input" type="number" min="0" step="0.01" value="0" /></label>
      <label>Expense Receipt No<input id="obl-post-receipt-no" class="input" /></label>
      <label>External Receipt No<input id="obl-post-external-receipt-no" class="input" /></label>
      <label>Notes<textarea id="obl-post-notes" class="textarea"></textarea></label>
    `,
    actions: [
      {
        label: "Post",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const amount = Number(document.getElementById("obl-post-amount").value || 0);
            if (!Number.isFinite(amount) || amount <= 0) {
              showToast("error", "Amount must be greater than 0");
              return false;
            }
            const result = await postAccountingObligationMovement({
              obligationId: item.id,
              operation: document.getElementById("obl-post-operation").value,
              amount,
              date: document.getElementById("obl-post-date").value,
              receiptNo: document.getElementById("obl-post-receipt-no").value.trim(),
              externalReceiptNo: document.getElementById("obl-post-external-receipt-no").value.trim(),
              notes: document.getElementById("obl-post-notes").value.trim(),
              actorUid: user.uid || "",
              actorName: user.name || user.email || user.uid || ""
            });
            showToast("success", `Posted. Journal: ${result.journalNo}`);
            await loadAll();
            return true;
          } catch (error) {
            console.error("Post obligation movement failed:", error);
            const msg = String(error?.code || error?.message || "");
            if (msg.includes("PERIOD_CLOSED")) {
              showToast("error", "Selected period is closed. Reopen month/year first.");
              return false;
            }
            if (msg.includes("INSUFFICIENT_BALANCE")) {
              showToast("error", "Amount exceeds current balance.");
              return false;
            }
            showToast("error", "Failed to post movement");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function openCoaModal(existing = null) {
  if (!canManage) return;
  const rec = existing || {};
  const isEdit = Boolean(existing);
  openModal({
    title: isEdit ? "Edit Account" : "Add Account",
    content: `
      <label>Code<input id="coa-code" class="input" value="${rec.code || ""}" /></label>
      <label>Name<input id="coa-name" class="input" value="${rec.name || ""}" /></label>
      <label>Type
        <select id="coa-type" class="select">
          <option value="asset" ${rec.type === "asset" ? "selected" : ""}>Asset</option>
          <option value="liability" ${rec.type === "liability" ? "selected" : ""}>Liability</option>
          <option value="equity" ${rec.type === "equity" ? "selected" : ""}>Equity</option>
          <option value="revenue" ${rec.type === "revenue" ? "selected" : ""}>Revenue</option>
          <option value="expense" ${rec.type === "expense" || !rec.type ? "selected" : ""}>Expense</option>
        </select>
      </label>
      <label>Parent Code<input id="coa-parent" class="input" value="${rec.parentCode || ""}" /></label>
      <label>Status
        <select id="coa-status" class="select">
          <option value="active" ${rec.status === "active" || !rec.status ? "selected" : ""}>Active</option>
          <option value="inactive" ${rec.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </label>
      <label>Notes<textarea id="coa-notes" class="textarea">${rec.notes || ""}</textarea></label>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = {
            code: document.getElementById("coa-code").value.trim(),
            name: document.getElementById("coa-name").value.trim(),
            type: document.getElementById("coa-type").value,
            parentCode: document.getElementById("coa-parent").value.trim(),
            status: document.getElementById("coa-status").value,
            notes: document.getElementById("coa-notes").value.trim()
          };
          if (!payload.code || !payload.name) {
            showToast("error", "Code and name are required");
            return false;
          }
          try {
            if (isEdit) await updateChartAccount(rec.id, payload);
            else await createChartAccount(payload);
            showToast("success", "Account saved");
            await loadAll();
            return true;
          } catch (error) {
            console.error("Save chart account failed:", error);
            showToast("error", "Failed to save account");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function openObligationModal(existing = null) {
  if (!canManage) return;
  const rec = existing || {};
  const isEdit = Boolean(existing);
  openModal({
    title: isEdit ? "Edit Item" : "Add Item",
    content: `
      <label>Kind
        <select id="obl-kind" class="select">
          <option value="custody" ${rec.kind === "custody" ? "selected" : ""}>Custody</option>
          <option value="advance" ${rec.kind === "advance" ? "selected" : ""}>Advance</option>
          <option value="receivable" ${rec.kind === "receivable" || !rec.kind ? "selected" : ""}>Receivable</option>
          <option value="payable" ${rec.kind === "payable" ? "selected" : ""}>Payable</option>
        </select>
      </label>
      <label>Party Name<input id="obl-name" class="input" value="${rec.partyName || ""}" /></label>
      <label>Reference/Invoice No<input id="obl-ref" class="input" value="${rec.partyRef || ""}" /></label>
      <label>Balance<input id="obl-balance" class="input" type="number" min="0" step="0.01" value="${Number(rec.balance || 0)}" /></label>
      <label>Status
        <select id="obl-status" class="select">
          <option value="open" ${rec.status === "open" || !rec.status ? "selected" : ""}>Open</option>
          <option value="settled" ${rec.status === "settled" ? "selected" : ""}>Settled</option>
        </select>
      </label>
      <label>Notes<textarea id="obl-notes" class="textarea">${rec.notes || ""}</textarea></label>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = {
            kind: document.getElementById("obl-kind").value,
            partyName: document.getElementById("obl-name").value.trim(),
            partyRef: document.getElementById("obl-ref").value.trim(),
            balance: Number(document.getElementById("obl-balance").value || 0),
            status: document.getElementById("obl-status").value,
            notes: document.getElementById("obl-notes").value.trim()
          };
          if (!payload.partyName) {
            showToast("error", "Party name is required");
            return false;
          }
          try {
            if (isEdit) await updateAccountingObligation(rec.id, payload);
            else await createAccountingObligation(payload);
            showToast("success", "Item saved");
            await loadAll();
            return true;
          } catch (error) {
            console.error("Save obligation failed:", error);
            showToast("error", "Failed to save item");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleCoaAction(action, id) {
  const item = chart.find((x) => x.id === id);
  if (!item || !canManage) return;
  if (action === "edit") {
    openCoaModal(item);
    return;
  }
  if (action === "delete") {
    if (!window.confirm("Delete this account?")) return;
    await deleteChartAccount(id);
    showToast("success", "Account deleted");
    await loadAll();
  }
}

async function handleObligationAction(action, id) {
  const item = obligations.find((x) => x.id === id);
  if (!item || !canManage) return;
  if (action === "edit") {
    openObligationModal(item);
    return;
  }
  if (action === "close") {
    openAdvanceCloseModal(item);
    return;
  }
  if (action === "post") {
    openObligationPostModal(item);
    return;
  }
  if (action === "delete") {
    if (!window.confirm("Delete this item?")) return;
    await deleteAccountingObligation(id);
    showToast("success", "Item deleted");
    await loadAll();
  }
}

async function runCloseAction(kind, op) {
  if (!canManage) return;
  try {
    if (kind === "month") {
      const month = String(closeMonthInput.value || "").trim();
      if (!month) {
        showToast("error", "Month is required");
        return;
      }
      if (op === "close") await closeAccountingMonth(month);
      else await reopenAccountingMonth(month);
    } else {
      const year = String(closeYearInput.value || "").trim();
      if (!/^\d{4}$/.test(year)) {
        showToast("error", "Year must be 4 digits");
        return;
      }
      if (op === "close") await closeAccountingYear(year);
      else await reopenAccountingYear(year);
    }
    showToast("success", "Closing state updated");
    await loadAll();
  } catch (error) {
    console.error("Closing action failed:", error);
    showToast("error", "Failed to update closing state");
  }
}

function fileDateToken() {
  return todayKey();
}

function getChartExportRows() {
  return filteredChartRows().map((item) => ({
    Code: item.code || "",
    Name: item.name || "",
    Type: item.type || "",
    Parent: item.parentCode || "",
    Status: item.status || "",
    Notes: item.notes || ""
  }));
}

function getObligationExportRows() {
  return filteredObligationRows().map((item) => ({
    Kind: obligationKindLabel(item.kind),
    Party: item.partyName || "",
    Ref: item.partyRef || "",
    Balance: Number(item.balance) || 0,
    Status: item.status || "",
    Notes: item.notes || ""
  }));
}

function exportExcel(rows, sheetName, fileName) {
  if (!rows.length) {
    showToast("info", "No rows to export");
    return;
  }
  if (!window.XLSX) {
    showToast("error", "Excel export library not loaded");
    return;
  }
  const sheet = window.XLSX.utils.json_to_sheet(rows);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  window.XLSX.writeFile(workbook, fileName);
}

function exportPdf(rows, fileName, title, headers) {
  if (!rows.length) {
    showToast("info", "No rows to export");
    return;
  }
  const jsPdfLib = window.jspdf?.jsPDF;
  if (!jsPdfLib) {
    showToast("error", "PDF export library not loaded");
    return;
  }

  const doc = new jsPdfLib({ orientation: "landscape" });
  doc.setFontSize(13);
  doc.text(title, 14, 14);
  const body = rows.map((row) => headers.map((header) => String(row[header] ?? "")));
  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: 20,
      head: [headers],
      body
    });
  } else {
    let y = 24;
    body.forEach((r) => {
      doc.text(r.join(" | "), 14, y);
      y += 7;
    });
  }
  doc.save(fileName);
}

function exportChartExcel() {
  exportExcel(getChartExportRows(), "ChartOfAccounts", `chart-of-accounts-${fileDateToken()}.xlsx`);
}

function exportChartPdf() {
  const rows = getChartExportRows();
  exportPdf(rows, `chart-of-accounts-${fileDateToken()}.pdf`, "Chart of Accounts", ["Code", "Name", "Type", "Parent", "Status", "Notes"]);
}

function exportObligationExcel() {
  exportExcel(getObligationExportRows(), "InvoicesObligations", `invoices-obligations-${fileDateToken()}.xlsx`);
}

function exportObligationPdf() {
  const rows = getObligationExportRows();
  exportPdf(rows, `invoices-obligations-${fileDateToken()}.pdf`, "Custody / Advances / AR / AP", ["Kind", "Party", "Ref", "Balance", "Status", "Notes"]);
}

async function loadAll() {
  const [chartRows, obligationRows, closeState] = await Promise.all([
    listChartAccounts(),
    listAccountingObligations(),
    getAccountingClosures()
  ]);
  chart = chartRows;
  obligations = obligationRows;
  closures = closeState;
  renderObligationStats();
  renderChart();
  renderObligations();
  renderClosures();
}

if (!canManage) {
  coaAddBtn?.classList.add("hidden");
  oblAddBtn?.classList.add("hidden");
  closeMonthBtn?.classList.add("hidden");
  reopenMonthBtn?.classList.add("hidden");
  closeYearBtn?.classList.add("hidden");
  reopenYearBtn?.classList.add("hidden");
}

coaAddBtn?.addEventListener("click", () => openCoaModal());
oblAddBtn?.addEventListener("click", () => openObligationModal());
coaSearchInput?.addEventListener("input", renderChart);
oblSearchInput?.addEventListener("input", renderObligations);
oblStatusFilter?.addEventListener("change", renderObligations);
coaExportExcelBtn?.addEventListener("click", exportChartExcel);
coaExportPdfBtn?.addEventListener("click", exportChartPdf);
oblExportExcelBtn?.addEventListener("click", exportObligationExcel);
oblExportPdfBtn?.addEventListener("click", exportObligationPdf);
closeMonthBtn?.addEventListener("click", () => void runCloseAction("month", "close"));
reopenMonthBtn?.addEventListener("click", () => void runCloseAction("month", "reopen"));
closeYearBtn?.addEventListener("click", () => void runCloseAction("year", "close"));
reopenYearBtn?.addEventListener("click", () => void runCloseAction("year", "reopen"));

closeMonthInput.value = new Date().toISOString().slice(0, 7);
closeYearInput.value = String(new Date().getFullYear());

(async () => {
  try {
    await loadAll();
  } catch (error) {
    console.error("Accounting admin init failed:", error);
    showToast("error", "Failed to load accounting admin");
  }
})();

trackUxEvent({ event: "page_open", module: "accounting_admin" });

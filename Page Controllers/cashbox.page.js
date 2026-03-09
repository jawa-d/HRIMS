import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import {
  createAccountingEntry,
  deleteAccountingEntry,
  getCashboxConfig,
  listAccountingEntries,
  updateAccountingEntry,
  uploadAccountingAttachment,
  upsertCashboxConfig
} from "../Services/accounting.service.js";

if (!enforceAuth("cashbox")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("cashbox");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const EXPENSE_CATEGORIES = [
  "Electricity Bill",
  "Internet Bill",
  "Water Bill",
  "Office Supplies",
  "Fuel",
  "Transport",
  "Maintenance",
  "Hospitality",
  "Other"
];

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const addBtn = document.getElementById("cashbox-add-btn");
const openingBtn = document.getElementById("cashbox-opening-btn");
const exportExcelBtn = document.getElementById("cashbox-export-excel-btn");
const exportPdfBtn = document.getElementById("cashbox-export-pdf-btn");
const dateFilter = document.getElementById("cashbox-date-filter");
const searchInput = document.getElementById("cashbox-search");
const tbody = document.getElementById("cashbox-body");
const emptyState = document.getElementById("cashbox-empty");
const openingEl = document.getElementById("cashbox-opening-balance");
const todayTotalEl = document.getElementById("cashbox-today-total");
const monthTotalEl = document.getElementById("cashbox-month-total");
const countEl = document.getElementById("cashbox-count");
const netEl = document.getElementById("cashbox-net-balance");

let entries = [];
let openingBalance = 0;
let storageUnavailable = false;
const MAX_EMBED_IMAGE_BYTES = 700 * 1024;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthPrefix(dateKey = todayKey()) {
  return String(dateKey || "").slice(0, 7);
}

function safeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function currency(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(safeNumber(value));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function expenseAccent(entry = {}) {
  const source = entry.id || entry.category || entry.notes || entry.date || "";
  return `hsl(${hashSeed(source) % 360} 72% 44%)`;
}

function getExpenseRows() {
  return entries.filter((item) => item.type === "expense");
}

function filteredRows() {
  const targetDate = (dateFilter?.value || "").trim();
  const query = (searchInput?.value || "").trim().toLowerCase();
  return getExpenseRows().filter((entry) => {
    const matchesDate = !targetDate || entry.date === targetDate;
    const matchesQuery =
      !query ||
      [entry.journalNo, entry.category, entry.notes, entry.date, entry.createdByName, entry.attachmentName, entry.receiptNo, entry.externalReceiptNo]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    return matchesDate && matchesQuery;
  });
}

function renderSummary() {
  const day = dateFilter?.value || todayKey();
  const dayRows = entries.filter((item) => item.date && item.date <= day);
  const totalIn = dayRows
    .filter((item) => item.type === "in")
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const totalOut = dayRows
    .filter((item) => item.type === "out")
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const dayTotal = getExpenseRows()
    .filter((item) => item.date === day)
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const monthTotal = getExpenseRows()
    .filter((item) => String(item.date || "").startsWith(monthPrefix(day)))
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const totalExpense = dayRows
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const net = openingBalance + totalIn - totalOut - totalExpense;
  const count = getExpenseRows().length;

  if (openingEl) openingEl.textContent = currency(openingBalance);
  todayTotalEl.textContent = currency(dayTotal);
  monthTotalEl.textContent = currency(monthTotal);
  countEl.textContent = String(count);
  if (netEl) netEl.textContent = currency(net);
}

function renderRows() {
  const rows = filteredRows();
  tbody.innerHTML = rows
    .map((entry, index) => {
      const attachment = entry.attachmentUrl
        ? `<a class="cashbox-attachment" href="${entry.attachmentUrl}" target="_blank" rel="noopener noreferrer">${entry.attachmentName || "View"}</a>`
        : "-";
      return `
        <tr class="cashbox-row" style="--cash-accent:${expenseAccent(entry)};--row-index:${index};">
          <td>${entry.journalNo || "-"}</td>
          <td>${entry.date || "-"}</td>
          <td>${currency(entry.amount)}</td>
          <td>${entry.category || "-"}</td>
          <td>${entry.receiptNo || "-"}</td>
          <td>${entry.externalReceiptNo || "-"}</td>
          <td>${entry.notes || "-"}</td>
          <td>${attachment}</td>
          <td>${entry.createdByName || "-"}</td>
          <td>
            ${
              canManage
                ? `
              <button class="btn btn-ghost" data-action="edit" data-id="${entry.id}">Edit</button>
              <button class="btn btn-ghost" data-action="delete" data-id="${entry.id}">Delete</button>
            `
                : "<span class=\"text-muted\">View only</span>"
            }
          </td>
        </tr>
      `;
    })
    .join("");
  emptyState.classList.toggle("hidden", rows.length > 0);

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        void handleAction(button.dataset.action, button.dataset.id);
      });
    });
  }
}

function getCategoryFromModal() {
  const select = document.getElementById("cash-category");
  const custom = document.getElementById("cash-category-custom");
  if (!select) return "";
  if (select.value !== "Other") return String(select.value || "").trim();
  return String(custom?.value || "").trim();
}

function buildExpenseCategoryField(selectedCategory = "") {
  const isCustom = selectedCategory && !EXPENSE_CATEGORIES.includes(selectedCategory);
  const selected = isCustom ? "Other" : (selectedCategory || EXPENSE_CATEGORIES[0]);
  const options = EXPENSE_CATEGORIES.map(
    (item) => `<option value="${item}" ${selected === item ? "selected" : ""}>${item}</option>`
  ).join("");
  return `
    <label>Category
      <select id="cash-category" class="select">
        ${options}
      </select>
    </label>
    <label id="cash-category-custom-wrap" class="${selected === "Other" ? "" : "hidden"}">
      Custom Category
      <input id="cash-category-custom" class="input" value="${isCustom ? selectedCategory : ""}" />
    </label>
  `;
}

function bindExpenseCategoryBehavior() {
  const select = document.getElementById("cash-category");
  const wrap = document.getElementById("cash-category-custom-wrap");
  if (!select) return;
  const toggle = () => {
    wrap?.classList.toggle("hidden", select.value !== "Other");
  };
  select.addEventListener("change", toggle);
  toggle();
}

async function readAttachmentFromModal(existing = null) {
  const input = document.getElementById("cash-attachment");
  const file = input?.files?.[0] || null;
  if (!file) {
    return {
      attachmentUrl: existing?.attachmentUrl || "",
      attachmentName: existing?.attachmentName || ""
    };
  }
  if (!storageUnavailable) {
    try {
      const uploaded = await uploadAccountingAttachment(file, "cashbox", user.uid || "unknown");
      return {
        attachmentUrl: uploaded.url,
        attachmentName: uploaded.name
      };
    } catch (error) {
      storageUnavailable = true;
      console.warn("Storage upload unavailable. Falling back to embedded image.", error);
    }
  }

  if (file.size > MAX_EMBED_IMAGE_BYTES) {
    throw new Error("Image is too large. Please use image size under 700KB.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    attachmentUrl: dataUrl,
    attachmentName: file.name || "embedded-image"
  };
}

function openExpenseModal(existing = null) {
  if (!canManage) return;
  const record = existing || {};
  const isEdit = Boolean(existing);
  openModal({
    title: isEdit ? "Edit Daily Expense" : "Add Daily Expense",
    content: `
      <label>Date<input id="cash-date" class="input" type="date" value="${record.date || (dateFilter?.value || todayKey())}" /></label>
      <label>Amount<input id="cash-amount" class="input" type="number" min="0" step="0.01" value="${safeNumber(record.amount)}" /></label>
      <div id="cash-category-wrap">${buildExpenseCategoryField(record.category || "")}</div>
      <label>Expense Receipt No<input id="cash-receipt-no" class="input" value="${record.receiptNo || ""}" /></label>
      <label>External Receipt No<input id="cash-external-receipt-no" class="input" value="${record.externalReceiptNo || ""}" /></label>
      <label>Notes<textarea id="cash-notes" class="textarea">${record.notes || ""}</textarea></label>
      <label>Attachment Image
        <input id="cash-attachment" class="input" type="file" accept="image/*" />
      </label>
      ${record.attachmentUrl ? `<a class="cashbox-attachment" href="${record.attachmentUrl}" target="_blank" rel="noopener noreferrer">Current attachment: ${record.attachmentName || "View"}</a>` : ""}
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const amount = safeNumber(document.getElementById("cash-amount").value);
            if (amount <= 0) {
              showToast("error", "Amount must be greater than 0");
              return false;
            }
            const category = getCategoryFromModal();
            if (!category) {
              showToast("error", "Category is required");
              return false;
            }
            const attachment = await readAttachmentFromModal(record);
            const payload = {
              type: "expense",
              amount,
              date: document.getElementById("cash-date").value || todayKey(),
              category,
              receiptNo: document.getElementById("cash-receipt-no").value.trim(),
              externalReceiptNo: document.getElementById("cash-external-receipt-no").value.trim(),
              notes: document.getElementById("cash-notes").value.trim(),
              attachmentUrl: attachment.attachmentUrl,
              attachmentName: attachment.attachmentName,
              source: "cashbox",
              createdByUid: user.uid,
              createdByName: user.name || user.email || user.uid
            };
            if (isEdit) {
              await updateAccountingEntry(record.id, payload);
            } else {
              await createAccountingEntry(payload);
            }
            if (dateFilter) dateFilter.value = payload.date || todayKey();
            if (searchInput) searchInput.value = "";
            showToast("success", "Daily expense saved");
            await loadCashbox();
            return true;
          } catch (error) {
            console.error("Cashbox save failed:", error);
            if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
              showToast("error", "Selected period is closed. Reopen month/year first.");
              return false;
            }
            showToast("error", "Failed to save daily expense");
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });

  setTimeout(bindExpenseCategoryBehavior, 0);
}

async function handleAction(action, id) {
  const entry = getExpenseRows().find((item) => item.id === id);
  if (!entry || !canManage) return;
  if (action === "edit") {
    openExpenseModal(entry);
    return;
  }
  if (action === "delete") {
    if (!window.confirm("Delete this expense entry?")) return;
    try {
      await deleteAccountingEntry(id);
      showToast("success", "Expense deleted");
      await loadCashbox();
    } catch (error) {
      console.error("Cashbox delete failed:", error);
      if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
        showToast("error", "This entry is in a closed period and cannot be deleted.");
        return;
      }
      showToast("error", "Failed to delete expense");
    }
  }
}

async function loadCashbox() {
  const [entryRows, config] = await Promise.all([listAccountingEntries(), getCashboxConfig()]);
  entries = entryRows;
  openingBalance = safeNumber(config?.openingBalance);
  renderSummary();
  renderRows();
}

function openOpeningBalanceModal() {
  if (!canManage) return;
  openModal({
    title: "Set Cashbox Opening Balance",
    content: `
      <label>Opening Amount
        <input id="cash-opening-input" class="input" type="number" min="0" step="0.01" value="${safeNumber(openingBalance)}" />
      </label>
      <p class="text-muted">Cashbox net = Opening + In - Out - Expenses</p>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const value = safeNumber(document.getElementById("cash-opening-input").value);
            await upsertCashboxConfig({ openingBalance: value });
            openingBalance = value;
            renderSummary();
            showToast("success", "Opening balance updated");
            return true;
          } catch (error) {
            console.error("Cashbox opening balance save failed:", error);
            const code = String(error?.code || "");
            if (code.includes("permission-denied")) {
              showToast("error", "Permission denied while updating opening balance");
            } else {
              showToast("error", "Failed to update opening balance");
            }
            return false;
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function exportExcel() {
  const rows = filteredRows().map((item) => ({
    Date: item.date || "",
    JournalNo: item.journalNo || "",
    Amount: safeNumber(item.amount),
    Category: item.category || "",
    ExpenseReceiptNo: item.receiptNo || "",
    ExternalReceiptNo: item.externalReceiptNo || "",
    Notes: item.notes || "",
    Attachment: String(item.attachmentUrl || "").startsWith("data:") ? "Embedded image" : (item.attachmentUrl || ""),
    CreatedBy: item.createdByName || ""
  }));
  if (!rows.length) {
    showToast("info", "No rows to export");
    return;
  }
  if (!window.XLSX) {
    showToast("error", "Excel export library not loaded");
    return;
  }
  const sheet = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, sheet, "Cashbox");
  window.XLSX.writeFile(wb, `cashbox-${dateFilter.value || todayKey()}.xlsx`);
}

function exportPdf() {
  const rows = filteredRows().map((item) => ({
    Date: item.date || "",
    JournalNo: item.journalNo || "",
    Amount: String(safeNumber(item.amount)),
    Category: item.category || "",
    ExpenseReceiptNo: item.receiptNo || "",
    ExternalReceiptNo: item.externalReceiptNo || "",
    Notes: item.notes || "",
    Attachment: String(item.attachmentUrl || "").startsWith("data:") ? "Embedded image" : (item.attachmentUrl || ""),
    CreatedBy: item.createdByName || ""
  }));
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
  doc.text(`Cashbox Report - ${dateFilter.value || todayKey()}`, 14, 14);
  const body = rows.map((r) => [
    r.Date,
    r.JournalNo,
    r.Amount,
    r.Category,
    r.ExpenseReceiptNo,
    r.ExternalReceiptNo,
    r.Notes,
    r.Attachment,
    r.CreatedBy
  ]);
  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: 20,
      head: [["Date", "Journal No", "Amount", "Category", "Expense Receipt No", "External Receipt No", "Notes", "Attachment", "Created By"]],
      body
    });
  } else {
    let y = 24;
    body.forEach((r) => {
      doc.text(r.join(" | "), 14, y);
      y += 7;
    });
  }
  doc.save(`cashbox-${dateFilter.value || todayKey()}.pdf`);
}

dateFilter.value = todayKey();
if (!canManage) {
  addBtn?.classList.add("hidden");
  openingBtn?.classList.add("hidden");
}

addBtn?.addEventListener("click", () => openExpenseModal());
openingBtn?.addEventListener("click", openOpeningBalanceModal);
exportExcelBtn?.addEventListener("click", exportExcel);
exportPdfBtn?.addEventListener("click", exportPdf);
dateFilter?.addEventListener("change", () => {
  renderSummary();
  renderRows();
});
searchInput?.addEventListener("input", renderRows);

(async () => {
  try {
    await loadCashbox();
  } catch (error) {
    console.error("Cashbox init failed:", error);
    showToast("error", "Failed to load cashbox");
  }
})();

trackUxEvent({ event: "page_open", module: "cashbox" });

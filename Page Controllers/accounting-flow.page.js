import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import {
  createAccountingEntry,
  deleteAccountingEntry,
  listAccountingEntries,
  updateAccountingEntry,
  uploadAccountingAttachment
} from "../Services/accounting.service.js";

if (!enforceAuth("accounting_flow")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("accounting_flow");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const IN_CATEGORIES = [
  "Sales Income",
  "Customer Payment",
  "Capital Injection",
  "Refund",
  "Collection",
  "Other"
];

const OUT_CATEGORIES = [
  "Electricity Bill",
  "Internet Bill",
  "Water Bill",
  "Office Supplies",
  "Transport",
  "Maintenance",
  "Other"
];
const CATEGORY_STORAGE_KEY = "hrms_accflow_custom_categories_v1";

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const addBtn = document.getElementById("accflow-add-btn");
const exportExcelBtn = document.getElementById("accflow-export-excel-btn");
const exportPdfBtn = document.getElementById("accflow-export-pdf-btn");
const searchInput = document.getElementById("accflow-search");
const typeFilter = document.getElementById("accflow-type-filter");
const monthFilter = document.getElementById("accflow-month-filter");
const tbody = document.getElementById("accflow-body");
const emptyState = document.getElementById("accflow-empty");
const totalInEl = document.getElementById("accflow-total-in");
const totalOutEl = document.getElementById("accflow-total-out");
const totalNetEl = document.getElementById("accflow-total-net");

let entries = [];
let storageUnavailable = false;
let customCategories = { in: [], out: [] };
const MAX_EMBED_IMAGE_BYTES = 700 * 1024;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return todayKey().slice(0, 7);
}

function monthFromDate(dateValue = "") {
  const value = String(dateValue || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return currentMonth();
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

function rowAccent(entry = {}) {
  const source = entry.id || entry.category || entry.notes || entry.date || "";
  return `hsl(${hashSeed(source) % 360} 72% 44%)`;
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

function getCategoriesByType(type = "") {
  const bucket = String(type || "").toLowerCase() === "in" ? "in" : "out";
  const base = bucket === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  const extras = Array.isArray(customCategories[bucket]) ? customCategories[bucket] : [];
  const merged = [...base, ...extras];
  const seen = new Set();
  const out = [];
  merged.forEach((item) => {
    const label = String(item || "").trim().replace(/\s+/g, " ");
    if (!label) return;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(label);
  });
  if (!out.some((item) => item.toLocaleLowerCase() === "other")) {
    out.push("Other");
  }
  return out;
}

function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    customCategories = {
      in: Array.isArray(parsed?.in) ? parsed.in : [],
      out: Array.isArray(parsed?.out) ? parsed.out : []
    };
  } catch (error) {
    console.warn("Failed to load custom accounting-flow categories:", error);
    customCategories = { in: [], out: [] };
  }
}

function saveCustomCategories() {
  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(customCategories));
  } catch (error) {
    console.warn("Failed to save custom accounting-flow categories:", error);
  }
}

function addCustomCategory(type = "", value = "") {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  if (!label) return;
  if (label.toLocaleLowerCase() === "other") return;
  const bucket = String(type || "").toLowerCase() === "in" ? "in" : "out";
  const base = bucket === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  const existsInBase = base.some((item) => String(item || "").trim().toLocaleLowerCase() === label.toLocaleLowerCase());
  if (existsInBase) return;
  const existsInCustom = (customCategories[bucket] || []).some((item) => String(item || "").trim().toLocaleLowerCase() === label.toLocaleLowerCase());
  if (existsInCustom) return;
  customCategories[bucket].push(label);
  saveCustomCategories();
}

function getCategoryValueFromModal() {
  const select = document.getElementById("accflow-category");
  const custom = document.getElementById("accflow-category-custom");
  if (!select) return "";
  if (select.value !== "Other") return String(select.value || "").trim();
  return String(custom?.value || "").trim();
}

function buildCategoryField(type, selectedCategory = "") {
  const categories = getCategoriesByType(type);
  const isCustom = selectedCategory && !categories.includes(selectedCategory);
  const selected = isCustom ? "Other" : (selectedCategory || categories[0] || "Other");
  const options = categories
    .map((item) => `<option value="${item}" ${selected === item ? "selected" : ""}>${item}</option>`)
    .join("");
  return `
    <label>${t("common.category")}
      <select id="accflow-category" class="select">
        ${options}
      </select>
    </label>
    <label id="accflow-category-custom-wrap" class="${selected === "Other" ? "" : "hidden"}">
      ${t("accounting.custom_category")}
      <input id="accflow-category-custom" class="input" value="${isCustom ? selectedCategory : ""}" />
    </label>
  `;
}

function bindModalCategoryBehavior() {
  const typeSelect = document.getElementById("accflow-type");
  const categoryWrap = document.getElementById("accflow-category-wrap");
  const categorySelect = document.getElementById("accflow-category");
  const categoryCustomWrap = document.getElementById("accflow-category-custom-wrap");
  if (!typeSelect || !categoryWrap || !categorySelect) return;

  const toggleCustomField = () => {
    const shouldShow = categorySelect.value === "Other";
    categoryCustomWrap?.classList.toggle("hidden", !shouldShow);
  };

  categorySelect.addEventListener("change", toggleCustomField);
  toggleCustomField();

  typeSelect.addEventListener("change", () => {
    categoryWrap.innerHTML = buildCategoryField(typeSelect.value);
    bindModalCategoryBehavior();
  });
}

function filteredEntries() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const type = (typeFilter?.value || "").trim();
  const month = (monthFilter?.value || "").trim();
  return entries.filter((item) => {
    if (item.type === "expense") return false;
    const matchesType = !type || item.type === type;
    const matchesMonth = !month || String(item.date || "").startsWith(month);
    const matchesQuery =
      !query ||
      [item.journalNo, item.category, item.notes, item.date, item.createdByName, item.attachmentName, item.receiptNo, item.externalReceiptNo]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    return matchesType && matchesMonth && matchesQuery;
  });
}

function renderTotals(rows) {
  const totalIn = rows.filter((r) => r.type === "in").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const totalOut = rows.filter((r) => r.type === "out").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  totalInEl.textContent = currency(totalIn);
  totalOutEl.textContent = currency(totalOut);
  totalNetEl.textContent = currency(totalIn - totalOut);
}

function renderRows() {
  const rows = filteredEntries();
  renderTotals(rows);

  tbody.innerHTML = rows
    .map((entry, index) => {
      const attachment = entry.attachmentUrl
        ? `<a class="accflow-attachment" href="${entry.attachmentUrl}" target="_blank" rel="noopener noreferrer">${entry.attachmentName || "View"}</a>`
        : "-";
      return `
        <tr class="accflow-row type-${entry.type || "out"}" style="--flow-accent:${rowAccent(entry)};--row-index:${index};">
          <td>${entry.journalNo || "-"}</td>
          <td>${entry.date || "-"}</td>
          <td><span class="badge accflow-type type-${entry.type || "out"}">${entry.type || "out"}</span></td>
          <td>${currency(entry.amount)}</td>
          <td>${entry.category || "-"}</td>
          <td>${entry.receiptNo || "-"}</td>
          <td>${entry.externalReceiptNo || "-"}</td>
          <td>${entry.notes || "-"}</td>
          <td>${attachment}</td>
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
        void handleRowAction(button.dataset.action, button.dataset.id);
      });
    });
  }
}

async function readAttachmentFromModal(existing = null) {
  const input = document.getElementById("accflow-attachment");
  const file = input?.files?.[0] || null;
  if (!file) {
    return {
      attachmentUrl: existing?.attachmentUrl || "",
      attachmentName: existing?.attachmentName || ""
    };
  }
  if (!storageUnavailable) {
    try {
      const uploaded = await uploadAccountingAttachment(file, "cashflow", user.uid || "unknown");
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

function openEntryModal(existing = null) {
  if (!canManage) return;
  const isEdit = Boolean(existing);
  const record = existing || {};
  const currentType = record.type || "out";
  openModal({
    title: isEdit ? t("common.edit") : t("common.add"),
    content: `
      <div class="modal-form-grid">
        <label>${t("common.date")}<input id="accflow-date" class="input" type="date" value="${record.date || todayKey()}" /></label>
        <label>${t("common.type")}
          <select id="accflow-type" class="select">
            <option value="in" ${currentType === "in" ? "selected" : ""}>In</option>
            <option value="out" ${currentType === "out" ? "selected" : ""}>Out</option>
          </select>
        </label>
        <label>${t("common.amount")}<input id="accflow-amount" class="input" type="number" min="0" step="0.01" value="${safeNumber(record.amount)}" /></label>
        <div id="accflow-category-wrap">${buildCategoryField(currentType, record.category || "")}</div>
        <label>${t("accounting.receipt_no")}<input id="accflow-receipt-no" class="input" value="${record.receiptNo || ""}" /></label>
        <label>${t("accounting.external_receipt_no")}<input id="accflow-external-receipt-no" class="input" value="${record.externalReceiptNo || ""}" /></label>
        <label class="field-full">${t("common.notes")}<textarea id="accflow-notes" class="textarea">${record.notes || ""}</textarea></label>
        <label class="field-full">${t("accounting.attachment_image")}
          <input id="accflow-attachment" class="input" type="file" accept="image/*" />
        </label>
        ${record.attachmentUrl ? `<a class="accflow-attachment field-full" href="${record.attachmentUrl}" target="_blank" rel="noopener noreferrer">Current attachment: ${record.attachmentName || t("common.view")}</a>` : ""}
      </div>
    `,
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const amount = safeNumber(document.getElementById("accflow-amount").value);
            if (amount <= 0) {
              showToast("error", t("accounting.msg.amount_gt_zero"));
              return false;
            }
            const category = getCategoryValueFromModal();
            if (!category) {
              showToast("error", t("accounting.msg.category_required"));
              return false;
            }
            const selectedType = document.getElementById("accflow-type").value;
            addCustomCategory(selectedType, category);

            const attachment = await readAttachmentFromModal(record);
            const payload = {
              date: document.getElementById("accflow-date").value || todayKey(),
              type: selectedType,
              amount,
              category,
              receiptNo: document.getElementById("accflow-receipt-no").value.trim(),
              externalReceiptNo: document.getElementById("accflow-external-receipt-no").value.trim(),
              notes: document.getElementById("accflow-notes").value.trim(),
              attachmentUrl: attachment.attachmentUrl,
              attachmentName: attachment.attachmentName,
              source: "accounting_flow",
              createdByUid: user.uid,
              createdByName: user.name || user.email || user.uid
            };
            if (isEdit) {
              await updateAccountingEntry(record.id, payload);
            } else {
              await createAccountingEntry(payload);
            }
            if (monthFilter) monthFilter.value = monthFromDate(payload.date);
            if (typeFilter) typeFilter.value = "";
            if (searchInput) searchInput.value = "";
            showToast("success", "Entry saved");
            await loadEntries();
            return true;
          } catch (error) {
            console.error("Accounting flow save failed:", error);
            if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
              showToast("error", "Selected period is closed. Reopen month/year first.");
              return false;
            }
            showToast("error", "Failed to save entry");
            return false;
          }
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });

  setTimeout(bindModalCategoryBehavior, 0);
}

async function handleRowAction(action, id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry || !canManage) return;
  if (action === "edit") {
    openEntryModal(entry);
    return;
  }
  if (action === "delete") {
    if (!window.confirm("Delete this accounting entry?")) return;
    try {
      await deleteAccountingEntry(id);
      showToast("success", "Entry deleted");
      await loadEntries();
    } catch (error) {
      console.error("Accounting flow delete failed:", error);
      if (error?.code === "PERIOD_CLOSED" || String(error?.message || "").includes("PERIOD_CLOSED")) {
        showToast("error", "This entry is in a closed period and cannot be deleted.");
        return;
      }
      showToast("error", "Failed to delete entry");
    }
  }
}

function getExportRows() {
  return filteredEntries().map((item) => ({
    Date: item.date || "",
    JournalNo: item.journalNo || "",
    Type: item.type || "",
    Amount: safeNumber(item.amount),
    Category: item.category || "",
    ExpenseReceiptNo: item.receiptNo || "",
    ExternalReceiptNo: item.externalReceiptNo || "",
    Notes: item.notes || "",
    Attachment: String(item.attachmentUrl || "").startsWith("data:") ? "Embedded image" : (item.attachmentUrl || "")
  }));
}

function exportExcel() {
  const rows = getExportRows();
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
  window.XLSX.utils.book_append_sheet(wb, sheet, "CashFlow");
  window.XLSX.writeFile(wb, `cashflow-${monthFilter.value || currentMonth()}.xlsx`);
}

function exportPdf() {
  const rows = getExportRows();
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
  doc.text(`Cash In/Out Report - ${monthFilter.value || currentMonth()}`, 14, 14);
  const body = rows.map((row) => [
    row.Date,
    row.JournalNo,
    row.Type,
    String(row.Amount),
    row.Category,
    row.ExpenseReceiptNo,
    row.ExternalReceiptNo,
    row.Notes,
    row.Attachment
  ]);
  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: 20,
      head: [["Date", "Journal No", "Type", "Amount", "Category", "Expense Receipt No", "External Receipt No", "Notes", "Attachment"]],
      body
    });
  } else {
    let y = 24;
    body.forEach((r) => {
      doc.text(r.join(" | "), 14, y);
      y += 7;
    });
  }
  doc.save(`cashflow-${monthFilter.value || currentMonth()}.pdf`);
}

async function loadEntries() {
  entries = await listAccountingEntries();
  renderRows();
}

if (!canManage) {
  addBtn?.classList.add("hidden");
}
addBtn?.addEventListener("click", () => openEntryModal());
exportExcelBtn?.addEventListener("click", exportExcel);
exportPdfBtn?.addEventListener("click", exportPdf);
searchInput?.addEventListener("input", renderRows);
typeFilter?.addEventListener("change", renderRows);
monthFilter.value = currentMonth();
monthFilter?.addEventListener("change", renderRows);

(async () => {
  try {
    await loadEntries();
  } catch (error) {
    console.error("Accounting flow init failed:", error);
    showToast("error", "Failed to load cash flow");
  }
})();

trackUxEvent({ event: "page_open", module: "accounting_flow" });

loadCustomCategories();

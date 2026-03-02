import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import {
  createAccountingEntry,
  getCashboxConfig,
  listAccountingEntries,
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

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const openingBalanceEl = document.getElementById("acc-opening-balance");
const totalInEl = document.getElementById("acc-total-in");
const totalOutEl = document.getElementById("acc-total-out");
const totalExpenseEl = document.getElementById("acc-total-expense");
const netEl = document.getElementById("acc-total-net");
const recentBody = document.getElementById("accounting-recent-body");
const emptyState = document.getElementById("accounting-empty");
const openingBtn = document.getElementById("accounting-opening-btn");
const quickInBtn = document.getElementById("accounting-quick-in-btn");
const quickOutBtn = document.getElementById("accounting-quick-out-btn");
const openFlowBtn = document.getElementById("accounting-open-flow");
const openCashboxBtn = document.getElementById("accounting-open-cashbox");

let entries = [];
let openingBalance = 0;

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

function renderSummary() {
  const month = monthPrefix();
  const monthRows = entries.filter((item) => String(item.date || "").startsWith(month));
  const totalIn = monthRows.filter((r) => r.type === "in").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const totalOut = monthRows.filter((r) => r.type === "out").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const totalExpense = monthRows.filter((r) => r.type === "expense").reduce((sum, r) => sum + safeNumber(r.amount), 0);
  const totalNet = openingBalance + totalIn - totalOut - totalExpense;

  if (openingBalanceEl) openingBalanceEl.textContent = currency(openingBalance);
  totalInEl.textContent = currency(totalIn);
  totalOutEl.textContent = currency(totalOut);
  totalExpenseEl.textContent = currency(totalExpense);
  netEl.textContent = currency(totalNet);
}

function renderRecent() {
  const rows = entries.slice(0, 8);
  recentBody.innerHTML = rows
    .map((entry, index) => {
      return `
        <tr class="acc-row type-${typeBadge(entry.type)}" style="--acc-accent:${accentFor(entry)};--row-index:${index};">
          <td>${entry.journalNo || "-"}</td>
          <td>${entry.date || "-"}</td>
          <td><span class="badge acc-type acc-type-${typeBadge(entry.type)}">${entry.type || "out"}</span></td>
          <td>${currency(entry.amount)}</td>
          <td>${entry.category || "-"}</td>
          <td>${entry.notes || "-"}</td>
        </tr>
      `;
    })
    .join("");
  emptyState.classList.toggle("hidden", rows.length > 0);
}

async function loadAccounting() {
  const [entryRows, config] = await Promise.all([listAccountingEntries(), getCashboxConfig()]);
  entries = entryRows;
  openingBalance = safeNumber(config?.openingBalance);
  renderSummary();
  renderRecent();
}

function openOpeningBalanceModal() {
  if (!canManage) return;
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
  if (!canManage) return;
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

if (!canManage) {
  openingBtn?.classList.add("hidden");
  quickInBtn?.classList.add("hidden");
  quickOutBtn?.classList.add("hidden");
}

openingBtn?.addEventListener("click", openOpeningBalanceModal);
quickInBtn?.addEventListener("click", () => openQuickModal("in"));
quickOutBtn?.addEventListener("click", () => openQuickModal("out"));
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

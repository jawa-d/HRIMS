import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t, translateDom } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import {
  approveAdvanceObligation,
  closeAdvanceObligation,
  closeAccountingMonth,
  closeAccountingYear,
  createAccountingObligation,
  createChartAccount,
  disburseAdvanceObligation,
  deleteAccountingObligation,
  deleteChartAccount,
  getAccountingClosures,
  listAccountingObligationMovements,
  listAccountingObligations,
  listChartAccounts,
  postAccountingObligationMovement,
  rejectAdvanceObligation,
  reopenAccountingMonth,
  reopenAccountingYear,
  updateAccountingObligation,
  updateChartAccount
} from "../Services/accounting.service.js";
import { canDo } from "../Services/permissions.service.js";
import { listEmployees } from "../Services/employees.service.js";
import { createNotification } from "../Services/notifications.service.js";
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
const canAdvanceRequest = canDo({ role, entity: "accounting", action: "advance_request" });
const canAdvanceApprove = canDo({ role, entity: "accounting", action: "advance_approve" });
const canAdvanceDisburse = canDo({ role, entity: "accounting", action: "advance_disburse" });
const canAdvanceClose = canDo({ role, entity: "accounting", action: "advance_close" });
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
let obligationMovements = [];
let employees = [];
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
  if (normalized === "custody") return t("accounting.kind.custody");
  if (normalized === "advance") return t("accounting.kind.advance");
  if (normalized === "receivable") return t("accounting.kind.receivable");
  if (normalized === "payable") return t("accounting.kind.payable");
  return kind || "-";
}

function obligationStageLabel(stage = "") {
  const normalized = norm(stage);
  if (normalized === "requested") return t("accounting.workflow.requested");
  if (normalized === "approved") return t("accounting.workflow.approved");
  if (normalized === "disbursed") return t("accounting.workflow.disbursed");
  if (normalized === "closed") return t("accounting.workflow.closed");
  if (normalized === "rejected") return t("accounting.workflow.rejected");
  return stage || "-";
}

function obligationStatusLabel(status = "") {
  const normalized = norm(status);
  if (normalized === "open") return t("accounting_admin.status_open");
  if (normalized === "settled") return t("accounting_admin.status_settled");
  return status || "-";
}

function isOverdue(item = {}) {
  const due = String(item.dueDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < todayKey() && norm(item.status) === "open";
}

function stageChipClass(stage = "") {
  const normalized = norm(stage);
  if (normalized === "approved" || normalized === "closed") return "badge acc-type-in";
  if (normalized === "disbursed") return "badge acc-type-out";
  if (normalized === "rejected") return "badge acc-type-expense";
  return "badge";
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
    const matchesStatus = !status || norm(item.status) === status || norm(item.workflowStage) === status;
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
  closedMonthsList.innerHTML = months.length ? months.map((m) => `<span class="chip">${m}</span>`).join("") : `<span class='text-muted'>${t("common.no")}</span>`;
  closedYearsList.innerHTML = years.length ? years.map((y) => `<span class="chip">${y}</span>`).join("") : `<span class='text-muted'>${t("common.no")}</span>`;
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
              <button class="btn btn-ghost" data-coa-action="edit" data-id="${item.id}">${t("common.edit")}</button>
              <button class="btn btn-ghost" data-coa-action="delete" data-id="${item.id}">${t("common.delete")}</button>
            `
                : `<span class='text-muted'>${t("common.view_only")}</span>`
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
      const stage = norm(item.workflowStage || "requested");
      const stageChip = `<span class="${stageChipClass(stage)}">${obligationStageLabel(stage)}</span>`;
      const advanceActions = [];
      if (stage === "requested" && canAdvanceApprove) {
        advanceActions.push(`<button class="btn btn-ghost" data-obl-action="approve" data-id="${item.id}">${t("accounting.action.approve")}</button>`);
        advanceActions.push(`<button class="btn btn-ghost" data-obl-action="reject" data-id="${item.id}">${t("accounting.action.reject")}</button>`);
      }
      if (stage === "approved" && canAdvanceDisburse) {
        advanceActions.push(`<button class="btn btn-ghost" data-obl-action="disburse" data-id="${item.id}">${t("accounting.action.disburse")}</button>`);
      }
      if (stage === "disbursed" && canAdvanceClose) {
        advanceActions.push(`<button class="btn btn-ghost" data-obl-action="close" data-id="${item.id}">${t("accounting.action.close")}</button>`);
      }
      if (canManage) {
        advanceActions.push(`<button class="btn btn-ghost" data-obl-action="edit" data-id="${item.id}">${t("common.edit")}</button>`);
        advanceActions.push(`<button class="btn btn-ghost" data-obl-action="delete" data-id="${item.id}">${t("common.delete")}</button>`);
      }
      return `
        <tr class="${isOverdue(item) ? "type-expense" : ""}">
          <td>${obligationKindLabel(item.kind)}</td>
          <td>${item.partyName || "-"}</td>
          <td>${item.partyRef || "-"}</td>
          <td>${money(item.balance)}</td>
          <td>${obligationStatusLabel(item.status)}<br><small class="text-muted">${stageChip}</small></td>
          <td>${item.employeeCode || "-"}<br><small class="text-muted">${item.departmentName || "-"}</small></td>
          <td>${item.dueDate || "-"}</td>
          <td>
            ${
              isAdvance
                ? (advanceActions.join("") || `<span class='text-muted'>${t("common.view_only")}</span>`)
                : canManage
                ? `
              <button class="btn btn-ghost" data-obl-action="edit" data-id="${item.id}">${t("common.edit")}</button>
              <button class="btn btn-ghost" data-obl-action="${isAdvance ? "close" : "post"}" data-id="${item.id}">${isAdvance ? t("accounting.action.close") : t("accounting.action.post")}</button>
              <button class="btn btn-ghost" data-obl-action="delete" data-id="${item.id}">${t("common.delete")}</button>
            `
                : `<span class='text-muted'>${t("common.view_only")}</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");

  oblBody.querySelectorAll("button[data-obl-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void handleObligationAction(btn.dataset.oblAction, btn.dataset.id);
    });
  });
  translateDom(oblBody);
}

function openAdvanceCloseModal(item) {
  if (!item || !canAdvanceClose) return;
  const currentBalance = Number(item.balance || 0);
  if (currentBalance <= 0) {
    showToast("info", t("accounting.msg.advance_already_settled"));
    return;
  }

  openModal({
    title: `${t("accounting.action.close")} - ${item.partyName || item.id}`,
    content: `
      <p class="text-muted">${t("accounting.msg.advance_close_hint_prefix")} <strong>${money(currentBalance)}</strong> ${t("accounting.msg.advance_close_hint_suffix")}</p>
      <label>${t("common.date")}<input id="adv-close-date" class="input" type="date" value="${todayKey()}" /></label>
      <label>${t("common.notes")}<textarea id="adv-close-notes" class="textarea"></textarea></label>
    `,
    actions: [
      {
        label: t("accounting.action.close"),
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
            if (item.employeeUid) {
              await createNotification({
                toUid: item.employeeUid,
                title: t("accounting.notify.advance_closed_title"),
                message: `${t("accounting.notify.advance_closed_message")} ${item.partyRef || ""}`.trim(),
                priority: "high",
                actionHref: "advances-report.html"
              });
            }
            showToast("success", `${t("accounting.msg.advance_closed_success")} ${result.journalNo}`);
            await loadAll();
            return true;
          } catch (error) {
            console.error("Close advance failed:", error);
            const msg = String(error?.code || error?.message || "");
            if (msg.includes("PERIOD_CLOSED")) {
              showToast("error", t("accounting.msg.period_closed"));
              return false;
            }
            if (msg.includes("INVALID_STAGE")) {
              showToast("error", t("accounting.msg.invalid_close_stage"));
              return false;
            }
            if (msg.includes("ALREADY_SETTLED")) {
              showToast("info", t("accounting.msg.advance_already_settled"));
              await loadAll();
              return true;
            }
            showToast("error", t("accounting.msg.advance_close_failed"));
            return false;
          }
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

function openObligationPostModal(item) {
  if (!item || !canManage) return;
  const kind = norm(item.kind);
  let operationOptions = "";
  if (kind === "custody") {
    operationOptions = `
      <option value="issue_out">${t("accounting.operation.issue_out")}</option>
      <option value="settle_in">${t("accounting.operation.settle_in")}</option>
    `;
  } else if (kind === "receivable") {
    operationOptions = `<option value="collect_in">${t("accounting.operation.collect_in")}</option>`;
  } else if (kind === "payable") {
    operationOptions = `<option value="pay_out">${t("accounting.operation.pay_out")}</option>`;
  }

  openModal({
    title: `${t("accounting.action.post")} - ${item.partyName || item.id}`,
    content: `
      <p class="text-muted">${t("accounting.msg.post_hint")}</p>
      <label>${t("accounting.operation.label")}
        <select id="obl-post-operation" class="select">
          ${operationOptions}
        </select>
      </label>
      <label>${t("common.date")}<input id="obl-post-date" class="input" type="date" value="${todayKey()}" /></label>
      <label>${t("common.amount")}<input id="obl-post-amount" class="input" type="number" min="0" step="0.01" value="0" /></label>
      <label>${t("accounting.receipt_no")}<input id="obl-post-receipt-no" class="input" /></label>
      <label>${t("accounting.external_receipt_no")}<input id="obl-post-external-receipt-no" class="input" /></label>
      <label>${t("common.notes")}<textarea id="obl-post-notes" class="textarea"></textarea></label>
    `,
    actions: [
      {
        label: t("accounting.action.post"),
        className: "btn btn-primary",
        onClick: async () => {
          try {
            const amount = Number(document.getElementById("obl-post-amount").value || 0);
            if (!Number.isFinite(amount) || amount <= 0) {
              showToast("error", t("accounting.msg.amount_gt_zero"));
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
            showToast("success", `${t("accounting.msg.posted_success")} ${result.journalNo}`);
            await loadAll();
            return true;
          } catch (error) {
            console.error("Post obligation movement failed:", error);
            const msg = String(error?.code || error?.message || "");
            if (msg.includes("PERIOD_CLOSED")) {
              showToast("error", t("accounting.msg.period_closed"));
              return false;
            }
            if (msg.includes("INSUFFICIENT_BALANCE")) {
              showToast("error", t("accounting.msg.amount_exceeds_balance"));
              return false;
            }
            showToast("error", t("accounting.msg.post_failed"));
            return false;
          }
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

function openCoaModal(existing = null) {
  if (!canManage) return;
  const rec = existing || {};
  const isEdit = Boolean(existing);
  openModal({
    title: isEdit ? t("accounting.msg.edit_account") : t("accounting_admin.add_account"),
    content: `
      <label>${t("common.code")}<input id="coa-code" class="input" value="${rec.code || ""}" /></label>
      <label>${t("common.name")}<input id="coa-name" class="input" value="${rec.name || ""}" /></label>
      <label>${t("common.type")}
        <select id="coa-type" class="select">
          <option value="asset" ${rec.type === "asset" ? "selected" : ""}>${t("accounting.type.asset")}</option>
          <option value="liability" ${rec.type === "liability" ? "selected" : ""}>${t("accounting.type.liability")}</option>
          <option value="equity" ${rec.type === "equity" ? "selected" : ""}>${t("accounting.type.equity")}</option>
          <option value="revenue" ${rec.type === "revenue" ? "selected" : ""}>${t("accounting.type.revenue")}</option>
          <option value="expense" ${rec.type === "expense" || !rec.type ? "selected" : ""}>${t("accounting.type.expense")}</option>
        </select>
      </label>
      <label>${t("common.parent")} ${t("common.code")}<input id="coa-parent" class="input" value="${rec.parentCode || ""}" /></label>
      <label>${t("common.status")}
        <select id="coa-status" class="select">
          <option value="active" ${rec.status === "active" || !rec.status ? "selected" : ""}>${t("common.active")}</option>
          <option value="inactive" ${rec.status === "inactive" ? "selected" : ""}>${t("common.inactive")}</option>
        </select>
      </label>
      <label>${t("common.notes")}<textarea id="coa-notes" class="textarea">${rec.notes || ""}</textarea></label>
    `,
    actions: [
      {
        label: t("common.save"),
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
            showToast("error", t("accounting.msg.code_name_required"));
            return false;
          }
          try {
            if (isEdit) await updateChartAccount(rec.id, payload);
            else await createChartAccount(payload);
            showToast("success", t("accounting.msg.account_saved"));
            await loadAll();
            return true;
          } catch (error) {
            console.error("Save chart account failed:", error);
            showToast("error", t("accounting.msg.account_save_failed"));
            return false;
          }
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

function openObligationModal(existing = null) {
  if (!(canManage || canAdvanceRequest)) return;
  const rec = existing || {};
  const isEdit = Boolean(existing);
  const options = employees
    .map((emp) => {
      const label = `${emp.fullName || emp.name || emp.email || emp.id} (${emp.empId || emp.id || ""})`;
      return `<option value="${emp.id}" ${String(rec.employeeUid || "") === String(emp.id) ? "selected" : ""}>${label}</option>`;
    })
    .join("");
  openModal({
    title: isEdit ? t("accounting.msg.edit_item") : t("accounting.action.request"),
    content: `
      <label>${t("common.kind")}
        <select id="obl-kind" class="select">
          <option value="custody" ${rec.kind === "custody" ? "selected" : ""}>${t("accounting.kind.custody")}</option>
          <option value="advance" ${rec.kind === "advance" || !rec.kind ? "selected" : ""}>${t("accounting.kind.advance")}</option>
          <option value="receivable" ${rec.kind === "receivable" || !rec.kind ? "selected" : ""}>${t("accounting.kind.receivable")}</option>
          <option value="payable" ${rec.kind === "payable" ? "selected" : ""}>${t("accounting.kind.payable")}</option>
        </select>
      </label>
      <label>${t("accounting.employee")}
        <select id="obl-employee" class="select">
          <option value="">-</option>
          ${options}
        </select>
      </label>
      <label>${t("common.party")}<input id="obl-name" class="input" value="${rec.partyName || ""}" /></label>
      <label>${t("common.ref")}<input id="obl-ref" class="input" value="${rec.partyRef || ""}" /></label>
      <label>${t("accounting.due_date")}<input id="obl-due-date" class="input" type="date" value="${rec.dueDate || ""}" /></label>
      <label>${t("common.balance")}<input id="obl-balance" class="input" type="number" min="0" step="0.01" value="${Number(rec.balance || 0)}" /></label>
      <label>${t("common.status")}
        <select id="obl-status" class="select">
          <option value="open" ${rec.status === "open" || !rec.status ? "selected" : ""}>${t("accounting_admin.status_open")}</option>
          <option value="settled" ${rec.status === "settled" ? "selected" : ""}>${t("accounting_admin.status_settled")}</option>
        </select>
      </label>
      <label>${t("advances_report.filter.status")}
        <select id="obl-stage" class="select">
          <option value="requested" ${rec.workflowStage === "requested" || !rec.workflowStage ? "selected" : ""}>${t("accounting.workflow.requested")}</option>
          <option value="approved" ${rec.workflowStage === "approved" ? "selected" : ""}>${t("accounting.workflow.approved")}</option>
          <option value="disbursed" ${rec.workflowStage === "disbursed" ? "selected" : ""}>${t("accounting.workflow.disbursed")}</option>
          <option value="closed" ${rec.workflowStage === "closed" ? "selected" : ""}>${t("accounting.workflow.closed")}</option>
          <option value="rejected" ${rec.workflowStage === "rejected" ? "selected" : ""}>${t("accounting.workflow.rejected")}</option>
        </select>
      </label>
      <label>${t("common.notes")}<textarea id="obl-notes" class="textarea">${rec.notes || ""}</textarea></label>
    `,
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        onClick: async () => {
          const employeeUid = document.getElementById("obl-employee").value;
          const employee = employees.find((row) => String(row.id) === String(employeeUid));
          const payload = {
            kind: document.getElementById("obl-kind").value,
            partyName: document.getElementById("obl-name").value.trim(),
            partyRef: document.getElementById("obl-ref").value.trim(),
            dueDate: document.getElementById("obl-due-date").value || "",
            balance: Number(document.getElementById("obl-balance").value || 0),
            status: document.getElementById("obl-status").value,
            workflowStage: document.getElementById("obl-stage").value,
            notes: document.getElementById("obl-notes").value.trim(),
            employeeUid: employeeUid || "",
            employeeCode: employee?.empId || employeeUid || "",
            departmentId: employee?.departmentId || "",
            departmentName: employee?.departmentName || employee?.department || employee?.departmentId || "",
            requestedByUid: user.uid || "",
            requestedByName: user.name || user.email || user.uid || ""
          };
          if (!payload.partyName) {
            showToast("error", t("accounting.msg.party_required"));
            return false;
          }
          try {
            if (isEdit) await updateAccountingObligation(rec.id, payload);
            else {
              if (payload.kind === "advance" && !canAdvanceRequest) {
                showToast("error", t("accounting.msg.no_permission_request"));
                return false;
              }
              await createAccountingObligation(payload);
              if (payload.kind === "advance" && payload.employeeUid) {
                await createNotification({
                  toUid: payload.employeeUid,
                  title: t("accounting.notify.advance_request_title"),
                  message: `${t("accounting.notify.advance_request_message")} ${payload.partyRef || ""}`.trim(),
                  priority: "high",
                  actionHref: "advances-report.html"
                });
              }
            }
            showToast("success", t("accounting.msg.item_saved"));
            await loadAll();
            return true;
          } catch (error) {
            console.error("Save obligation failed:", error);
            showToast("error", t("accounting.msg.item_save_failed"));
            return false;
          }
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
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
    if (!window.confirm(t("accounting.msg.confirm_delete_account"))) return;
    await deleteChartAccount(id);
    showToast("success", t("accounting.msg.account_deleted"));
    await loadAll();
  }
}

async function handleObligationAction(action, id) {
  const item = obligations.find((x) => x.id === id);
  if (!item) return;
  if (action === "edit") {
    if (!canManage) return;
    openObligationModal(item);
    return;
  }
  if (action === "approve" && norm(item.kind) === "advance" && canAdvanceApprove) {
    await approveAdvanceObligation({
      obligationId: item.id,
      actorUid: user.uid || "",
      actorName: user.name || user.email || user.uid || ""
    });
    if (item.employeeUid) {
      await createNotification({
        toUid: item.employeeUid,
        title: t("accounting.notify.advance_approved_title"),
        message: `${t("accounting.notify.advance_approved_message")} ${item.partyRef || ""}`.trim(),
        priority: "high",
        actionHref: "advances-report.html"
      });
    }
    showToast("success", t("accounting.msg.advance_approved"));
    await loadAll();
    return;
  }
  if (action === "reject" && norm(item.kind) === "advance" && canAdvanceApprove) {
    await rejectAdvanceObligation({
      obligationId: item.id,
      actorUid: user.uid || "",
      actorName: user.name || user.email || user.uid || ""
    });
    showToast("success", t("accounting.msg.advance_rejected"));
    await loadAll();
    return;
  }
  if (action === "disburse" && norm(item.kind) === "advance" && canAdvanceDisburse) {
    const result = await disburseAdvanceObligation({
      obligationId: item.id,
      date: todayKey(),
      notes: t("accounting.msg.advance_disbursed_note"),
      actorUid: user.uid || "",
      actorName: user.name || user.email || user.uid || ""
    });
    if (item.employeeUid) {
      await createNotification({
        toUid: item.employeeUid,
        title: t("accounting.notify.advance_disbursed_title"),
        message: `${t("accounting.notify.advance_disbursed_message")} ${item.partyRef || ""}`.trim(),
        priority: "high",
        actionHref: "advances-report.html"
      });
    }
    showToast("success", `${t("accounting.msg.disbursed_success")} ${result.journalNo}`);
    await loadAll();
    return;
  }
  if (action === "close") {
    openAdvanceCloseModal(item);
    return;
  }
  if (action === "post") {
    if (!canManage) return;
    openObligationPostModal(item);
    return;
  }
  if (action === "delete") {
    if (!canManage) return;
    if (!window.confirm(t("accounting.msg.confirm_delete_item"))) return;
    await deleteAccountingObligation(id);
    showToast("success", t("accounting.msg.item_deleted"));
    await loadAll();
  }
}

async function runCloseAction(kind, op) {
  if (!canManage) return;
  try {
    if (kind === "month") {
      const month = String(closeMonthInput.value || "").trim();
      if (!month) {
        showToast("error", t("accounting.msg.month_required"));
        return;
      }
      if (op === "close") await closeAccountingMonth(month);
      else await reopenAccountingMonth(month);
    } else {
      const year = String(closeYearInput.value || "").trim();
      if (!/^\d{4}$/.test(year)) {
        showToast("error", t("accounting.msg.year_four_digits"));
        return;
      }
      if (op === "close") await closeAccountingYear(year);
      else await reopenAccountingYear(year);
    }
    showToast("success", t("accounting.msg.closing_updated"));
    await loadAll();
  } catch (error) {
    console.error("Closing action failed:", error);
    showToast("error", t("accounting.msg.closing_update_failed"));
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
    EmployeeCode: item.employeeCode || "",
    Department: item.departmentName || "",
    Workflow: obligationStageLabel(item.workflowStage || ""),
    DueDate: item.dueDate || "",
    Overdue: isOverdue(item) ? t("common.yes") : t("common.no"),
    Balance: Number(item.balance) || 0,
    Status: item.status || "",
    Notes: item.notes || ""
  }));
}

function exportExcel(rows, sheetName, fileName) {
  if (!rows.length) {
    showToast("info", t("accounting.msg.no_rows_export"));
    return;
  }
  if (!window.XLSX) {
    showToast("error", t("accounting.msg.excel_lib_missing"));
    return;
  }
  const sheet = window.XLSX.utils.json_to_sheet(rows);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  window.XLSX.writeFile(workbook, fileName);
}

function exportPdf(rows, fileName, title, headers) {
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
  doc.setFontSize(13);
  doc.text(title, 14, 14);
  doc.text(`${t("accounting.export.period")}: ${new Date().toISOString().slice(0, 7)}`, 14, 20);
  const body = rows.map((row) => headers.map((header) => String(row[header] ?? "")));
  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: 24,
      head: [headers],
      body
    });
    const finalY = doc.lastAutoTable?.finalY || 200;
    doc.text(`${t("accounting.export.signature")}: __________________`, 14, finalY + 12);
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
  exportPdf(rows, `chart-of-accounts-${fileDateToken()}.pdf`, t("accounting_admin.coa"), ["Code", "Name", "Type", "Parent", "Status", "Notes"]);
}

function exportObligationExcel() {
  exportExcel(getObligationExportRows(), "InvoicesObligations", `invoices-obligations-${fileDateToken()}.xlsx`);
}

function exportObligationPdf() {
  const rows = getObligationExportRows();
  exportPdf(rows, `invoices-obligations-${fileDateToken()}.pdf`, t("accounting_admin.obligations"), ["Kind", "Party", "Ref", "EmployeeCode", "Department", "Workflow", "DueDate", "Overdue", "Balance", "Status", "Notes"]);
}

async function loadAll() {
  const [chartRows, obligationRows, closeState, employeesRows, movementRows] = await Promise.all([
    listChartAccounts(),
    listAccountingObligations(),
    getAccountingClosures(),
    listEmployees(),
    listAccountingObligationMovements({ kind: "advance" })
  ]);
  chart = chartRows;
  obligations = obligationRows;
  closures = closeState;
  employees = employeesRows;
  obligationMovements = movementRows;
  renderObligationStats();
  renderChart();
  renderObligations();
  renderClosures();
}

if (!canManage) {
  coaAddBtn?.classList.add("hidden");
  closeMonthBtn?.classList.add("hidden");
  reopenMonthBtn?.classList.add("hidden");
  closeYearBtn?.classList.add("hidden");
  reopenYearBtn?.classList.add("hidden");
}
if (!(canManage || canAdvanceRequest)) {
  oblAddBtn?.classList.add("hidden");
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

if (oblStatusFilter && !oblStatusFilter.dataset.workflowExtended) {
  oblStatusFilter.dataset.workflowExtended = "1";
  ["requested", "approved", "disbursed", "closed", "rejected"].forEach((stage) => {
    const option = document.createElement("option");
    option.value = stage;
    option.textContent = obligationStageLabel(stage);
    oblStatusFilter.appendChild(option);
  });
}

closeMonthInput.value = new Date().toISOString().slice(0, 7);
closeYearInput.value = String(new Date().getFullYear());

(async () => {
  try {
    await loadAll();
  } catch (error) {
    console.error("Accounting admin init failed:", error);
    showToast("error", t("accounting.msg.load_admin_failed"));
  }
})();

trackUxEvent({ event: "page_open", module: "accounting_admin" });

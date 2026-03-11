import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listLeaves, createLeave, deleteLeave } from "../Services/leaves.service.js";
import { listEmployees } from "../Services/employees.service.js";

if (!enforceAuth("my_leaves")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("my_leaves");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const submitBtn = document.getElementById("my-leave-submit-btn");
const typeEl = document.getElementById("my-leave-type");
const fromEl = document.getElementById("my-leave-from");
const toEl = document.getElementById("my-leave-to");
const daysEl = document.getElementById("my-leave-days");
const categoryEl = document.getElementById("my-leave-category");
const reasonEl = document.getElementById("my-leave-reason");
const searchEl = document.getElementById("my-leave-search");
const statusFilterEl = document.getElementById("my-leave-status-filter");
const tbody = document.getElementById("my-leaves-body");
const emptyEl = document.getElementById("my-leaves-empty");
const pendingCountEl = document.getElementById("my-pending-count");
const approvedCountEl = document.getElementById("my-approved-count");
const rejectedCountEl = document.getElementById("my-rejected-count");
const decisionEl = document.getElementById("my-last-decision");

let myLeaves = [];
let currentEmployee = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeStatus(status = "") {
  const value = String(status || "").trim().toLowerCase();
  if (value === "pending") return "submitted";
  return value.replaceAll("-", "_").replaceAll(" ", "_");
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?.seconds === "number") {
    const parsed = new Date(value.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveEmployeeForUser(profile, list) {
  if (!profile) return null;
  const uid = String(profile.uid || "").trim();
  const email = String(profile.email || "").trim().toLowerCase();
  return (
    list.find((emp) => String(emp.id || "").trim() === uid) ||
    list.find((emp) => String(emp.empId || "").trim() === uid) ||
    list.find((emp) => String(emp.email || "").trim().toLowerCase() === email) ||
    null
  );
}

function calcDays(from, to) {
  if (!from || !to) return 0;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, diff);
}

function matchesMine(leave) {
  if (!leave) return false;
  const uid = String(user?.uid || "").trim();
  const mail = String(user?.email || "").trim().toLowerCase();
  if (uid && String(leave.employeeId || "").trim() === uid) return true;
  if (currentEmployee?.id && String(leave.employeeId || "").trim() === String(currentEmployee.id || "").trim()) return true;
  if (currentEmployee?.empId && String(leave.employeeCode || "").trim() === String(currentEmployee.empId || "").trim()) return true;
  if (mail && String(leave.employeeEmail || leave.email || "").trim().toLowerCase() === mail) return true;
  return false;
}

function sortByNewest(a, b) {
  const aTime = toDate(a?.updatedAt || a?.createdAt)?.getTime() || 0;
  const bTime = toDate(b?.updatedAt || b?.createdAt)?.getTime() || 0;
  return bTime - aTime;
}

function resetForm() {
  typeEl.value = "Annual";
  categoryEl.value = "Personal";
  fromEl.value = "";
  toEl.value = "";
  daysEl.value = "1";
  reasonEl.value = "";
}

function renderSummary() {
  const pending = myLeaves.filter((item) => ["submitted", "manager_review", "hr_review"].includes(normalizeStatus(item.status))).length;
  const approved = myLeaves.filter((item) => normalizeStatus(item.status) === "approved").length;
  const rejected = myLeaves.filter((item) => normalizeStatus(item.status) === "rejected").length;
  pendingCountEl.textContent = String(pending);
  approvedCountEl.textContent = String(approved);
  rejectedCountEl.textContent = String(rejected);

  const latestDecision = myLeaves
    .filter((item) => ["approved", "rejected"].includes(normalizeStatus(item.status)))
    .sort(sortByNewest)[0];
  if (!latestDecision) {
    decisionEl.textContent = t("my_leaves.no_final_decision");
    return;
  }
  const statusKey = `common.status.${normalizeStatus(latestDecision.status)}`;
  const statusText = t(statusKey) === statusKey ? normalizeStatus(latestDecision.status).toUpperCase() : t(statusKey);
  decisionEl.textContent = `${t("my_leaves.latest_result_prefix")} ${statusText} ${t("my_leaves.latest_result_for_request")} ${
    latestDecision.requestId || latestDecision.id
  }.`;
}

function renderTable() {
  const query = (searchEl.value || "").trim().toLowerCase();
  const status = statusFilterEl.value || "";
  const filtered = myLeaves.filter((item) => {
    const matchesSearch =
      !query ||
      (item.requestId || "").toLowerCase().includes(query) ||
      (item.type || "").toLowerCase().includes(query) ||
      (item.reason || "").toLowerCase().includes(query) ||
      normalizeStatus(item.status).includes(query);
    const normalizedStatus = normalizeStatus(item.status);
    const matchesStatus =
      !status ||
      normalizedStatus === status ||
      (status === "pending" && ["submitted", "manager_review", "hr_review"].includes(normalizedStatus));
    return matchesSearch && matchesStatus;
  });

  tbody.innerHTML = filtered
    .map((item) => {
      const normalizedStatus = normalizeStatus(item.status || "submitted");
      const canDelete = normalizedStatus === "submitted";
      const days = Number(item.days || calcDays(item.from, item.to) || 1);
      const statusLabelKey = `common.status.${normalizedStatus}`;
      const statusLabel = t(statusLabelKey) === statusLabelKey ? normalizedStatus : t(statusLabelKey);
      return `
        <tr>
          <td>${escapeHtml(item.requestId || item.id || "-")}</td>
          <td>${escapeHtml(item.type || "-")}</td>
          <td>${escapeHtml(item.from || "-")} <span class="text-muted">${escapeHtml(t("my_leaves.to_connector"))}</span> ${escapeHtml(item.to || "-")}</td>
          <td>${days}</td>
          <td><span class="badge status-${normalizedStatus}">${escapeHtml(statusLabel)}</span></td>
          <td>${
            canDelete
              ? `<button class="btn btn-ghost" data-action="delete" data-id="${escapeHtml(item.id)}">${escapeHtml(t("common.delete"))}</button>`
              : `<span class="text-muted">${escapeHtml(t("my_leaves.final_status"))}</span>`
          }</td>
        </tr>
      `;
    })
    .join("");

  emptyEl.classList.toggle("hidden", filtered.length > 0);

  tbody.querySelectorAll("button[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const leaveId = btn.dataset.id;
      try {
        await deleteLeave(leaveId);
        showToast("success", t("my_leaves.pending_deleted"));
        await loadMyLeaves();
      } catch (error) {
        console.error("Delete leave failed:", error);
        showToast("error", t("my_leaves.delete_failed"));
      }
    });
  });
}

async function submitRequest() {
  const from = fromEl.value;
  const to = toEl.value;
  const days = Number(daysEl.value || calcDays(from, to) || 1);
  if (!from || !to) {
    showToast("error", t("my_leaves.error.select_dates"));
    return;
  }
  if (new Date(from) > new Date(to)) {
    showToast("error", t("my_leaves.error.from_after_to"));
    return;
  }
  if (days <= 0) {
    showToast("error", t("my_leaves.error.days_positive"));
    return;
  }

  const payload = {
    employeeId: currentEmployee?.id || user.uid,
    employeeCode: currentEmployee?.empId || user.uid,
    employeeEmail: user.email || "",
    employeeName: currentEmployee?.fullName || user.name || user.email || user.uid,
    type: typeEl.value.trim(),
    category: categoryEl.value.trim(),
    from,
    to,
    days,
    reason: reasonEl.value.trim(),
    approverId: "",
    status: "submitted"
  };

  try {
    submitBtn.disabled = true;
    await createLeave(payload);
    showToast("success", t("my_leaves.submit_success"));
    resetForm();
    await loadMyLeaves();
  } catch (error) {
    console.error("Submit leave failed:", error);
    showToast("error", t("my_leaves.submit_failed"));
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadMyLeaves() {
  try {
    showTableSkeleton(tbody, { rows: 6, cols: 6 });
    const employeesData = await listEmployees({ limitCount: 200 });
    currentEmployee = resolveEmployeeForUser(user, employeesData);

    let leavesData = [];
    if (currentEmployee?.id) {
      leavesData = await listLeaves({ employeeId: currentEmployee.id, limitCount: 200 });
      if (!leavesData.length) {
        leavesData = await listLeaves({ limitCount: 300 });
      }
    } else {
      leavesData = await listLeaves({ limitCount: 300 });
    }

    myLeaves = leavesData.filter(matchesMine).sort(sortByNewest);
    renderSummary();
    renderTable();
  } catch (error) {
    console.error("Load my leaves failed:", error);
    myLeaves = [];
    renderSummary();
    renderTable();
    showToast("error", t("my_leaves.load_failed"));
  }
}

if (submitBtn) submitBtn.addEventListener("click", submitRequest);
if (searchEl) searchEl.addEventListener("input", renderTable);
if (statusFilterEl) statusFilterEl.addEventListener("change", renderTable);
window.addEventListener("global-search", (event) => {
  if (!searchEl) return;
  searchEl.value = event.detail || "";
  renderTable();
});

trackUxEvent({ event: "page_open", module: "my_leaves" });
loadMyLeaves();

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
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

function resolveEmployeeForUser(profile, list) {
  if (!profile) return null;
  return (
    list.find((emp) => emp.id === profile.uid) ||
    list.find((emp) => emp.empId && emp.empId === profile.uid) ||
    list.find((emp) => emp.email && emp.email === profile.email) ||
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
  if (leave.employeeId && leave.employeeId === user.uid) return true;
  if (currentEmployee?.id && leave.employeeId === currentEmployee.id) return true;
  if (currentEmployee?.empId && leave.employeeCode === currentEmployee.empId) return true;
  if (user?.email && leave.employeeEmail === user.email) return true;
  return false;
}

function sortByNewest(a, b) {
  const aTime = a?.updatedAt?.seconds || a?.createdAt?.seconds || 0;
  const bTime = b?.updatedAt?.seconds || b?.createdAt?.seconds || 0;
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
  const pending = myLeaves.filter((item) => item.status === "pending").length;
  const approved = myLeaves.filter((item) => item.status === "approved").length;
  const rejected = myLeaves.filter((item) => item.status === "rejected").length;
  pendingCountEl.textContent = String(pending);
  approvedCountEl.textContent = String(approved);
  rejectedCountEl.textContent = String(rejected);

  const latestDecision = myLeaves
    .filter((item) => item.status === "approved" || item.status === "rejected")
    .sort(sortByNewest)[0];
  if (!latestDecision) {
    decisionEl.textContent = "No final decision yet.";
    return;
  }
  decisionEl.textContent = `Latest result: ${latestDecision.status.toUpperCase()} for request ${
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
      (item.status || "").toLowerCase().includes(query);
    const matchesStatus = !status || item.status === status;
    return matchesSearch && matchesStatus;
  });

  tbody.innerHTML = filtered
    .map((item) => {
      const canDelete = item.status === "pending";
      const days = Number(item.days || calcDays(item.from, item.to) || 1);
      return `
        <tr>
          <td>${item.requestId || item.id}</td>
          <td>${item.type || "-"}</td>
          <td>${item.from || "-"} <span class="text-muted">to</span> ${item.to || "-"}</td>
          <td>${days}</td>
          <td><span class="badge status-${item.status || "pending"}">${item.status || "pending"}</span></td>
          <td>${
            canDelete
              ? `<button class="btn btn-ghost" data-action="delete" data-id="${item.id}">Delete</button>`
              : "<span class=\"text-muted\">Final</span>"
          }</td>
        </tr>
      `;
    })
    .join("");

  emptyEl.classList.toggle("hidden", filtered.length > 0);

  tbody.querySelectorAll("button[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const leaveId = btn.dataset.id;
      await deleteLeave(leaveId);
      showToast("success", "Pending request deleted");
      await loadMyLeaves();
    });
  });
}

async function submitRequest() {
  const from = fromEl.value;
  const to = toEl.value;
  const days = Number(daysEl.value || calcDays(from, to) || 1);
  if (!from || !to) {
    showToast("error", "Please select from/to dates");
    return;
  }
  if (new Date(from) > new Date(to)) {
    showToast("error", "From date cannot be after To date");
    return;
  }
  if (days <= 0) {
    showToast("error", "Days must be greater than 0");
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
    status: "pending"
  };

  await createLeave(payload);
  showToast("success", "Leave request submitted to department");
  resetForm();
  await loadMyLeaves();
}

async function loadMyLeaves() {
  showTableSkeleton(tbody, { rows: 6, cols: 6 });
  const [leavesData, employees] = await Promise.all([listLeaves(), listEmployees()]);
  currentEmployee = resolveEmployeeForUser(user, employees);
  myLeaves = leavesData.filter(matchesMine).sort(sortByNewest);
  renderSummary();
  renderTable();
}

submitBtn.addEventListener("click", submitRequest);
searchEl.addEventListener("input", renderTable);
statusFilterEl.addEventListener("change", renderTable);
window.addEventListener("global-search", (event) => {
  searchEl.value = event.detail || "";
  renderTable();
});

loadMyLeaves();

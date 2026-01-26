import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listLeaves, createLeave, updateLeave } from "../Services/leaves.service.js";
import { createNotification } from "../Services/notifications.service.js";

if (!enforceAuth("leaves")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("leaves");

const canApprove = ["super_admin", "hr_admin", "manager"].includes(role);
const addButton = document.getElementById("add-leave-btn");
const tbody = document.getElementById("leaves-body");
const emptyState = document.getElementById("leaves-empty");

let leaves = [];

function renderLeaves() {
  tbody.innerHTML = leaves
    .map(
      (leave) => `
      <tr>
        <td>${leave.employeeId}</td>
        <td>${leave.type}</td>
        <td>${leave.from}</td>
        <td>${leave.to}</td>
        <td><span class="badge">${leave.status}</span></td>
        <td>
          ${
            canApprove
              ? `
            <button class="btn btn-ghost" data-action="approve" data-id="${leave.id}">Approve</button>
            <button class="btn btn-ghost" data-action="reject" data-id="${leave.id}">Reject</button>
          `
              : "<span class=\"text-muted\">Pending</span>"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", leaves.length > 0);

  if (canApprove) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
    });
  }
}

function leaveFormContent() {
  return `
    <label>Type<input class="input" id="leave-type" placeholder="Annual" /></label>
    <label>From<input class="input" id="leave-from" type="date" /></label>
    <label>To<input class="input" id="leave-to" type="date" /></label>
    <label>Days<input class="input" id="leave-days" type="number" value="1" /></label>
    <label>Reason<textarea class="textarea" id="leave-reason"></textarea></label>
  `;
}

function collectLeaveForm() {
  return {
    employeeId: user.uid,
    type: document.getElementById("leave-type").value.trim(),
    from: document.getElementById("leave-from").value,
    to: document.getElementById("leave-to").value,
    days: Number(document.getElementById("leave-days").value || 1),
    reason: document.getElementById("leave-reason").value.trim(),
    approverId: ""
  };
}

function openLeaveModal() {
  openModal({
    title: "Request Leave",
    content: leaveFormContent(),
    actions: [
      {
        label: "Submit",
        className: "btn btn-primary",
        onClick: async () => {
          await createLeave(collectLeaveForm());
          showToast("success", "Leave requested");
          await loadLeaves();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const leave = leaves.find((item) => item.id === id);
  if (!leave) return;
  const status = action === "approve" ? "approved" : "rejected";
  await updateLeave(id, { status, approverId: user.uid });
  await createNotification({
    toUid: leave.employeeId,
    title: `Leave ${status}`,
    body: leave.reason || "Leave request updated",
    type: "leave",
    entityId: id
  });
  showToast("success", `Leave ${status}`);
  await loadLeaves();
}

async function loadLeaves() {
  const data = await listLeaves();
  leaves = role === "employee" ? data.filter((item) => item.employeeId === user.uid) : data;
  renderLeaves();
}

addButton.addEventListener("click", openLeaveModal);
loadLeaves();

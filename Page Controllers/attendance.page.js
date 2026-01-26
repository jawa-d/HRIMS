import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listAttendance, createAttendance, updateAttendance } from "../Services/attendance.service.js";
import { createNotification } from "../Services/notifications.service.js";

if (!enforceAuth("attendance")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("attendance");

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const addButton = document.getElementById("add-attendance-btn");
const tbody = document.getElementById("attendance-body");
const emptyState = document.getElementById("attendance-empty");

if (!canManage) {
  addButton.classList.add("hidden");
}

let records = [];

function renderAttendance() {
  tbody.innerHTML = records
    .map(
      (record) => `
      <tr>
        <td>${record.employeeId}</td>
        <td>${record.date}</td>
        <td>${record.checkIn || "-"}</td>
        <td>${record.checkOut || "-"}</td>
        <td><span class="badge">${record.status}</span></td>
        <td>
          ${
            canManage
              ? `<button class="btn btn-ghost" data-action="edit" data-id="${record.id}">Edit</button>`
              : "-"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", records.length > 0);

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => openAttendanceModal(button.dataset.id));
    });
  }
}

function attendanceFormContent(record = {}) {
  return `
    <label>Employee ID<input class="input" id="att-employee" value="${record.employeeId || ""}" /></label>
    <label>Date<input class="input" id="att-date" type="date" value="${record.date || ""}" /></label>
    <label>Check In<input class="input" id="att-in" type="time" value="${record.checkIn || ""}" /></label>
    <label>Check Out<input class="input" id="att-out" type="time" value="${record.checkOut || ""}" /></label>
    <label>Status
      <select class="select" id="att-status">
        <option value="present" ${record.status === "present" ? "selected" : ""}>Present</option>
        <option value="late" ${record.status === "late" ? "selected" : ""}>Late</option>
        <option value="absent" ${record.status === "absent" ? "selected" : ""}>Absent</option>
      </select>
    </label>
    <label>Notes<textarea class="textarea" id="att-notes">${record.notes || ""}</textarea></label>
  `;
}

function collectAttendanceForm() {
  return {
    employeeId: document.getElementById("att-employee").value.trim(),
    date: document.getElementById("att-date").value,
    checkIn: document.getElementById("att-in").value,
    checkOut: document.getElementById("att-out").value,
    status: document.getElementById("att-status").value,
    notes: document.getElementById("att-notes").value.trim()
  };
}

function openAttendanceModal(id) {
  const record = records.find((item) => item.id === id);
  openModal({
    title: record ? "Edit Attendance" : "Log Attendance",
    content: attendanceFormContent(record || {}),
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectAttendanceForm();
          if (record) {
            await updateAttendance(record.id, payload);
          } else {
            await createAttendance(payload);
          }
          if (payload.status !== "present") {
            await createNotification({
              toUid: payload.employeeId,
              title: "Attendance Alert",
              body: `Status marked as ${payload.status}`,
              type: "attendance",
              entityId: record?.id || ""
            });
          }
          showToast("success", "Attendance saved");
          await loadAttendance();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function loadAttendance() {
  const data = await listAttendance();
  records = role === "employee" ? data.filter((item) => item.employeeId === user.uid) : data;
  renderAttendance();
}

addButton.addEventListener("click", () => openAttendanceModal());
loadAttendance();

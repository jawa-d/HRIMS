import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listAttendance, createAttendance, updateAttendance, deleteAttendance } from "../Services/attendance.service.js";
import { createNotification } from "../Services/notifications.service.js";

if (!enforceAuth("attendance")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("attendance");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const addButton = document.getElementById("add-attendance-btn");
const searchInput = document.getElementById("attendance-search");
const statusFilter = document.getElementById("attendance-status-filter");
const tbody = document.getElementById("attendance-body");
const emptyState = document.getElementById("attendance-empty");
const totalEl = document.getElementById("attendance-total");
const presentEl = document.getElementById("attendance-present");
const lateEl = document.getElementById("attendance-late");
const absentEl = document.getElementById("attendance-absent");

if (!canManage) {
  addButton.classList.add("hidden");
}

let records = [];

function normalizeStatus(status = "") {
  return String(status || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function attendanceAccent(record = {}) {
  const source = record.employeeId || record.employeeName || record.id || record.date || "";
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function matchesCurrentUser(record = {}) {
  const uid = String(user?.uid || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  return (
    String(record.employeeId || "").trim() === uid ||
    String(record.uid || "").trim() === uid ||
    String(record.employeeEmail || record.email || "").trim().toLowerCase() === email
  );
}

function calcHours(record) {
  if (!record.checkIn || !record.checkOut) return "-";
  const [inH, inM] = record.checkIn.split(":").map(Number);
  const [outH, outM] = record.checkOut.split(":").map(Number);
  if (Number.isNaN(inH) || Number.isNaN(outH)) return "-";
  const start = inH * 60 + (inM || 0);
  const end = outH * 60 + (outM || 0);
  if (end <= start) return "-";
  const hours = (end - start) / 60;
  return hours.toFixed(1);
}

function renderAttendance() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "";
  const filtered = records.filter((record) => {
    const normalized = normalizeStatus(record.status || "present");
    const matchesQuery =
      !query ||
      (record.employeeId || "").toLowerCase().includes(query) ||
      (record.employeeName || "").toLowerCase().includes(query) ||
      (record.date || "").toLowerCase().includes(query) ||
      normalized.includes(query);
    const matchesStatus = !status || normalized === status;
    return matchesQuery && matchesStatus;
  });

  tbody.innerHTML = filtered
    .map(
      (record, index) => `
      <tr class="attendance-row status-${normalizeStatus(record.status || "present")}" style="--att-accent:${attendanceAccent(record)};--row-index:${index};">
        <td>
          <div class="employee-cell">
            <div class="employee-name"><span class="employee-dot"></span><span>${record.employeeName || record.employeeId}</span></div>
            <div class="employee-meta">ID: ${record.employeeId}</div>
          </div>
        </td>
        <td>${record.date}</td>
        <td>${record.checkIn || "-"}</td>
        <td>${record.checkOut || "-"}</td>
        <td>${calcHours(record)}</td>
        <td><span class="badge status-${normalizeStatus(record.status || "present")}">${normalizeStatus(record.status || "present")}</span></td>
        <td>
          ${
            canManage
              ? `
                <button class="btn btn-ghost" data-action="edit" data-id="${record.id}">Edit</button>
                <button class="btn btn-ghost" data-action="delete" data-id="${record.id}">Delete</button>
              `
              : "-"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);
  if (totalEl) totalEl.textContent = records.length;
  if (presentEl) presentEl.textContent = records.filter((r) => normalizeStatus(r.status) === "present").length;
  if (lateEl) lateEl.textContent = records.filter((r) => normalizeStatus(r.status) === "late").length;
  if (absentEl) absentEl.textContent = records.filter((r) => normalizeStatus(r.status) === "absent").length;

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await handleAttendanceAction(button.dataset.action, button.dataset.id);
        } catch (error) {
          console.error("Attendance action failed:", error);
          showToast("error", "Attendance action failed");
        }
      });
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
    employeeName: user.name || user.email || user.uid,
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
          try {
            if (record) {
              await updateAttendance(record.id, payload);
            } else {
              await createAttendance(payload);
            }
            if (normalizeStatus(payload.status) !== "present") {
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
          } catch (error) {
            console.error("Save attendance failed:", error);
            showToast("error", "Failed to save attendance");
          }
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAttendanceAction(action, id) {
  if (action === "edit") {
    openAttendanceModal(id);
    return;
  }
  if (action === "delete") {
    await deleteAttendance(id);
    showToast("success", "Attendance deleted");
    await loadAttendance();
  }
}

async function loadAttendance() {
  try {
    showTableSkeleton(tbody, { rows: 6, cols: 7 });
    let data = [];
    if (role === "employee" && user?.uid) {
      data = await listAttendance({ employeeId: user.uid, limitCount: 200 });
      if (!data.length) {
        const fallback = await listAttendance({ limitCount: 300 });
        data = fallback.filter(matchesCurrentUser);
      }
    } else {
      data = await listAttendance({ limitCount: 400 });
    }
    records = data;
    renderAttendance();
  } catch (error) {
    console.error("Load attendance failed:", error);
    records = [];
    renderAttendance();
    showToast("error", "Could not load attendance records");
  }
}

addButton.addEventListener("click", () => openAttendanceModal());
if (searchInput) {
  searchInput.addEventListener("input", renderAttendance);
}
if (statusFilter) {
  statusFilter.addEventListener("change", renderAttendance);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderAttendance();
});
trackUxEvent({ event: "page_open", module: "attendance" });
loadAttendance();

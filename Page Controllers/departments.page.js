import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment
} from "../Services/departments.service.js";

if (!enforceAuth("departments")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("departments");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-department-btn");
const searchInput = document.getElementById("department-search");
const sortSelect = document.getElementById("department-sort");
const tbody = document.getElementById("departments-body");
const emptyState = document.getElementById("departments-empty");
const totalEl = document.getElementById("departments-total");
const visibleEl = document.getElementById("departments-visible");
const roleEl = document.getElementById("departments-role");

if (!canManage) {
  addButton.classList.add("hidden");
}

let departments = [];

function getDeptCode(dept) {
  if (dept.code) return dept.code;
  if (dept.name) return dept.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  return (dept.id || "").slice(0, 3).toUpperCase();
}

function renderDepartments() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const filtered = departments.filter((dept) => {
    return !query || (dept.name || "").toLowerCase().includes(query);
  });
  const sorted = [...filtered].sort((a, b) => {
    const nameA = (a.name || "").toLowerCase();
    const nameB = (b.name || "").toLowerCase();
    if (sortSelect?.value === "za") return nameB.localeCompare(nameA);
    return nameA.localeCompare(nameB);
  });

  tbody.innerHTML = sorted
    .map(
      (dept) => `
      <tr>
        <td>${dept.name}</td>
        <td><span class="chip">${getDeptCode(dept) || "-"}</span></td>
        <td>
          ${
            canManage
              ? `
            <button class="btn btn-ghost" data-action="edit" data-id="${dept.id}">Edit</button>
            <button class="btn btn-ghost" data-action="delete" data-id="${dept.id}">Delete</button>
          `
              : "-"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", sorted.length > 0);
  if (totalEl) totalEl.textContent = departments.length;
  if (visibleEl) visibleEl.textContent = sorted.length;

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
    });
  }
}

function openDepartmentModal(dept) {
  openModal({
    title: dept ? "Edit Department" : "Add Department",
    content: `<label>Name<input class="input" id="dept-name" value="${dept?.name || ""}" /></label>`,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const name = document.getElementById("dept-name").value.trim();
          if (!name) return;
          if (dept) {
            await updateDepartment(dept.id, { name });
          } else {
            await createDepartment({ name });
          }
          showToast("success", "Department saved");
          await loadDepartments();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const dept = departments.find((item) => item.id === id);
  if (!dept) return;
  if (action === "edit") {
    openDepartmentModal(dept);
  }
  if (action === "delete") {
    await deleteDepartment(id);
    showToast("success", "Department deleted");
    await loadDepartments();
  }
}

async function loadDepartments() {
  showTableSkeleton(tbody, { rows: 6, cols: 3 });
  departments = await listDepartments();
  renderDepartments();
}

addButton.addEventListener("click", () => openDepartmentModal());
if (searchInput) {
  searchInput.addEventListener("input", renderDepartments);
}
if (sortSelect) {
  sortSelect.addEventListener("change", renderDepartments);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderDepartments();
});
if (roleEl) roleEl.textContent = canManage ? "Manage departments" : "View only";
loadDepartments();

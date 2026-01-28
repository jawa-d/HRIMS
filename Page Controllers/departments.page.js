import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
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

const canManage = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-department-btn");
const searchInput = document.getElementById("department-search");
const tbody = document.getElementById("departments-body");
const emptyState = document.getElementById("departments-empty");

if (!canManage) {
  addButton.classList.add("hidden");
}

let departments = [];

function renderDepartments() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const filtered = departments.filter((dept) => {
    return !query || (dept.name || "").toLowerCase().includes(query);
  });

  tbody.innerHTML = filtered
    .map(
      (dept) => `
      <tr>
        <td>${dept.name}</td>
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

  emptyState.classList.toggle("hidden", filtered.length > 0);

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
  departments = await listDepartments();
  renderDepartments();
}

addButton.addEventListener("click", () => openDepartmentModal());
if (searchInput) {
  searchInput.addEventListener("input", renderDepartments);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderDepartments();
});
loadDepartments();

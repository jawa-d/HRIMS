import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition
} from "../Services/positions.service.js";

if (!enforceAuth("positions")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("positions");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-position-btn");
const searchInput = document.getElementById("position-search");
const sortSelect = document.getElementById("position-sort");
const tbody = document.getElementById("positions-body");
const emptyState = document.getElementById("positions-empty");
const totalEl = document.getElementById("positions-total");
const visibleEl = document.getElementById("positions-visible");
const roleEl = document.getElementById("positions-role");

if (!canManage) {
  addButton.classList.add("hidden");
}

let positions = [];

function getPositionCode(position) {
  if (position.code) return position.code;
  if (position.name) return position.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  return (position.id || "").slice(0, 3).toUpperCase();
}

function renderPositions() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const filtered = positions.filter((position) => {
    return !query || (position.name || "").toLowerCase().includes(query);
  });
  const sorted = [...filtered].sort((a, b) => {
    const nameA = (a.name || "").toLowerCase();
    const nameB = (b.name || "").toLowerCase();
    if (sortSelect?.value === "za") return nameB.localeCompare(nameA);
    return nameA.localeCompare(nameB);
  });

  tbody.innerHTML = sorted
    .map(
      (position) => `
      <tr>
        <td>${position.name}</td>
        <td><span class="chip">${getPositionCode(position) || "-"}</span></td>
        <td>
          ${
            canManage
              ? `
            <button class="btn btn-ghost" data-action="edit" data-id="${position.id}">Edit</button>
            <button class="btn btn-ghost" data-action="delete" data-id="${position.id}">Delete</button>
          `
              : "-"
          }
        </td>
      </tr>
    `
    )
    .join("");

  emptyState.classList.toggle("hidden", sorted.length > 0);
  if (totalEl) totalEl.textContent = positions.length;
  if (visibleEl) visibleEl.textContent = sorted.length;

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
    });
  }
}

function openPositionModal(position) {
  openModal({
    title: position ? "Edit Position" : "Add Position",
    content: `<label>Name<input class="input" id="position-name" value="${position?.name || ""}" /></label>`,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const name = document.getElementById("position-name").value.trim();
          if (!name) return;
          if (position) {
            await updatePosition(position.id, { name });
          } else {
            await createPosition({ name });
          }
          showToast("success", "Position saved");
          await loadPositions();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const position = positions.find((item) => item.id === id);
  if (!position) return;
  if (action === "edit") {
    openPositionModal(position);
  }
  if (action === "delete") {
    await deletePosition(id);
    showToast("success", "Position deleted");
    await loadPositions();
  }
}

async function loadPositions() {
  positions = await listPositions();
  renderPositions();
}

addButton.addEventListener("click", () => openPositionModal());
if (searchInput) {
  searchInput.addEventListener("input", renderPositions);
}
if (sortSelect) {
  sortSelect.addEventListener("change", renderPositions);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderPositions();
});
if (roleEl) roleEl.textContent = canManage ? "Manage positions" : "View only";
loadPositions();

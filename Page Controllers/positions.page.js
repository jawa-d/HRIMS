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

const canManage = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-position-btn");
const tbody = document.getElementById("positions-body");
const emptyState = document.getElementById("positions-empty");

if (!canManage) {
  addButton.classList.add("hidden");
}

let positions = [];

function renderPositions() {
  tbody.innerHTML = positions
    .map(
      (position) => `
      <tr>
        <td>${position.name}</td>
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

  emptyState.classList.toggle("hidden", positions.length > 0);

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
loadPositions();

import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listEmployees } from "../Services/employees.service.js";
import { listAssets, createAsset, updateAsset, deleteAsset } from "../Services/assets.service.js";

if (!enforceAuth("assets")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("assets");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const canDelete = ["super_admin", "hr_admin"].includes(role);
const addButton = document.getElementById("add-asset-btn");
const searchInput = document.getElementById("asset-search");
const statusFilter = document.getElementById("asset-status-filter");
const tbody = document.getElementById("assets-body");
const emptyState = document.getElementById("assets-empty");
const totalEl = document.getElementById("assets-total");
const assignedEl = document.getElementById("assets-assigned");
const availableEl = document.getElementById("assets-available");
const maintenanceEl = document.getElementById("assets-maintenance");

if (!canManage) {
  addButton.classList.add("hidden");
}

let assets = [];
let employees = [];

function getEmployeeOptions(selected = "") {
  return employees
    .map(
      (emp) =>
        `<option value="${emp.id}" ${selected === emp.id ? "selected" : ""}>${
          emp.fullName || emp.email || emp.empId || emp.id
        }</option>`
    )
    .join("");
}

function assetFormContent(asset = {}) {
  return `
    <label>Asset Name<input class="input" id="asset-name" value="${asset.name || ""}" /></label>
    <label>Asset Tag<input class="input" id="asset-tag" value="${asset.tag || ""}" /></label>
    <label>Category<input class="input" id="asset-category" value="${asset.category || ""}" /></label>
    <label>Status
      <select class="select" id="asset-status">
        <option value="available" ${asset.status === "available" ? "selected" : ""}>Available</option>
        <option value="maintenance" ${asset.status === "maintenance" ? "selected" : ""}>Maintenance</option>
      </select>
    </label>
    <label>Notes<textarea class="textarea" id="asset-notes">${asset.notes || ""}</textarea></label>
  `;
}

function collectAssetForm() {
  return {
    name: document.getElementById("asset-name").value.trim(),
    tag: document.getElementById("asset-tag").value.trim(),
    category: document.getElementById("asset-category").value.trim(),
    status: document.getElementById("asset-status").value,
    notes: document.getElementById("asset-notes").value.trim()
  };
}

function openAssetModal(asset) {
  openModal({
    title: asset ? "Edit Asset" : "Add Asset",
    content: assetFormContent(asset),
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectAssetForm();
          if (!payload.name) return;
          if (asset) {
            await updateAsset(asset.id, payload);
          } else {
            await createAsset(payload);
          }
          showToast("success", "Asset saved");
          await loadAssets();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

function openAssignModal(asset) {
  openModal({
    title: "Assign Asset",
    content: `
      <label>Employee
        <select class="select" id="asset-assign">
          <option value="">Select employee</option>
          ${getEmployeeOptions(asset.assignedTo || "")}
        </select>
      </label>
    `,
    actions: [
      {
        label: "Assign",
        className: "btn btn-primary",
        onClick: async () => {
          const employeeId = document.getElementById("asset-assign").value;
          const employee = employees.find((emp) => emp.id === employeeId);
          if (!employeeId) return;
          await updateAsset(asset.id, {
            status: "assigned",
            assignedTo: employeeId,
            assignedToName: employee?.fullName || employee?.email || employee?.empId || employeeId,
            assignedAt: new Date().toISOString()
          });
          showToast("success", "Asset assigned");
          await loadAssets();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const asset = assets.find((item) => item.id === id);
  if (!asset) return;
  if (action === "edit") {
    openAssetModal(asset);
  }
  if (action === "assign") {
    openAssignModal(asset);
  }
  if (action === "return") {
    await updateAsset(asset.id, {
      status: "available",
      assignedTo: "",
      assignedToName: "",
      assignedAt: ""
    });
    showToast("success", "Asset returned");
    await loadAssets();
  }
  if (action === "maintenance") {
    await updateAsset(asset.id, { status: "maintenance" });
    showToast("success", "Marked maintenance");
    await loadAssets();
  }
  if (action === "delete" && canDelete) {
    await deleteAsset(asset.id);
    showToast("success", "Asset deleted");
    await loadAssets();
  }
}

function renderAssets() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "";
  const filtered = assets.filter((asset) => {
    const matchesQuery =
      !query ||
      (asset.name || "").toLowerCase().includes(query) ||
      (asset.tag || "").toLowerCase().includes(query) ||
      (asset.assignedToName || "").toLowerCase().includes(query);
    const matchesStatus = !status || asset.status === status;
    return matchesQuery && matchesStatus;
  });

  tbody.innerHTML = filtered
    .map((asset) => {
      const statusLabel = asset.status || "available";
      const assigned = asset.assignedToName || "-";
      return `
        <tr>
          <td>
            <div class="asset-cell">
              <div>${asset.name || "-"}</div>
              <div class="asset-meta">${asset.notes || "No notes"}</div>
            </div>
          </td>
          <td>${asset.tag || "-"}</td>
          <td>${asset.category || "-"}</td>
          <td>${assigned}</td>
          <td><span class="badge status-${statusLabel}">${statusLabel}</span></td>
          <td>
            ${
              canManage
                ? `
              <button class="btn btn-ghost" data-action="edit" data-id="${asset.id}">Edit</button>
              ${
                asset.status === "assigned"
                  ? `<button class="btn btn-ghost" data-action="return" data-id="${asset.id}">Return</button>`
                  : `<button class="btn btn-ghost" data-action="assign" data-id="${asset.id}">Assign</button>`
              }
              <button class="btn btn-ghost" data-action="maintenance" data-id="${asset.id}">Maintenance</button>
              ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${asset.id}">Delete</button>` : ""}
            `
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  emptyState.classList.toggle("hidden", filtered.length > 0);

  if (totalEl) totalEl.textContent = assets.length;
  if (assignedEl) assignedEl.textContent = assets.filter((a) => a.status === "assigned").length;
  if (availableEl) availableEl.textContent = assets.filter((a) => a.status === "available").length;
  if (maintenanceEl) maintenanceEl.textContent = assets.filter((a) => a.status === "maintenance").length;

  if (canManage) {
    tbody.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
    });
  }
}

async function loadAssets() {
  assets = await listAssets();
  renderAssets();
}

async function loadEmployees() {
  employees = await listEmployees();
}

addButton.addEventListener("click", () => openAssetModal());
if (searchInput) {
  searchInput.addEventListener("input", renderAssets);
}
if (statusFilter) {
  statusFilter.addEventListener("change", renderAssets);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderAssets();
});

(async () => {
  await loadEmployees();
  await loadAssets();
})();

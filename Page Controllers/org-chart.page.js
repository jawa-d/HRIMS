import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { watchEmployees } from "../Services/employees.service.js";
import { watchDepartments } from "../Services/departments.service.js";
import { watchPositions } from "../Services/positions.service.js";

if (!enforceAuth("orgchart")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("orgchart");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const treeRoot = document.getElementById("org-tree");
const emptyState = document.getElementById("org-empty");
const searchInput = document.getElementById("org-search");
const collapseBtn = document.getElementById("org-collapse-btn");

let employees = [];
let departments = [];
let positions = [];
let parentMap = new Map();
let unsubscribers = [];
let dataReady = {
  employees: false,
  departments: false,
  positions: false
};

function buildMaps() {
  const deptMap = new Map(departments.map((dept) => [dept.id, dept.name || dept.id]));
  const posMap = new Map(positions.map((pos) => [pos.id, pos.name || pos.id]));
  return { deptMap, posMap };
}

function resolveManagerId(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const byId = employees.find((emp) => emp.id === trimmed);
  if (byId) return byId.id;
  const byEmpId = employees.find((emp) => emp.empId === trimmed);
  if (byEmpId) return byEmpId.id;
  const byEmail = employees.find((emp) => emp.email === trimmed);
  if (byEmail) return byEmail.id;
  return "";
}

function buildHierarchy() {
  const nodes = new Map();
  const childrenMap = new Map();
  employees.forEach((emp) => {
    nodes.set(emp.id, { ...emp, id: emp.id });
    childrenMap.set(emp.id, []);
  });

  employees.forEach((emp) => {
    const managerId = resolveManagerId(emp.managerId);
    if (managerId && childrenMap.has(managerId)) {
      childrenMap.get(managerId).push(emp.id);
      parentMap.set(emp.id, managerId);
    }
  });

  const roots = employees
    .filter((emp) => !resolveManagerId(emp.managerId))
    .map((emp) => emp.id);

  return { nodes, childrenMap, roots };
}

function createNode(id, nodes, childrenMap, maps) {
  const emp = nodes.get(id);
  const children = childrenMap.get(id) || [];
  const deptName = maps.deptMap.get(emp.departmentId) || emp.departmentId || "Unassigned";
  const positionName = maps.posMap.get(emp.positionId) || emp.positionId || "Role";
  const displayName = emp.fullName || emp.email || emp.empId || emp.id;
  const searchText = `${displayName} ${positionName} ${deptName}`.toLowerCase();

  const node = document.createElement("div");
  node.className = "org-node";
  node.dataset.id = id;
  node.dataset.name = searchText;

  node.innerHTML = `
    <div class="org-card">
      <div class="org-info">
        <div class="org-name">${displayName}</div>
        <div class="org-meta">${positionName} • ${deptName}</div>
      </div>
      <div class="org-actions-inline">
        <span class="chip">${children.length} Reports</span>
        ${
          children.length
            ? `<button class="org-toggle" data-toggle="collapse" title="Toggle">
                <i data-lucide="chevron-down"></i>
              </button>`
            : ""
        }
      </div>
    </div>
  `;

  if (children.length) {
    const childrenWrap = document.createElement("div");
    childrenWrap.className = "org-children";
    children.forEach((childId) => {
      childrenWrap.appendChild(createNode(childId, nodes, childrenMap, maps));
    });
    node.appendChild(childrenWrap);
  }

  return node;
}

function renderTree() {
  treeRoot.innerHTML = "";
  parentMap = new Map();
  const maps = buildMaps();
  const { nodes, childrenMap, roots } = buildHierarchy();

  if (!roots.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  roots.forEach((rootId) => {
    treeRoot.appendChild(createNode(rootId, nodes, childrenMap, maps));
  });

  treeRoot.querySelectorAll("[data-toggle='collapse']").forEach((button) => {
    button.addEventListener("click", () => {
      const node = button.closest(".org-node");
      node.classList.toggle("collapsed");
    });
  });

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

function expandAncestors(nodeId) {
  let current = nodeId;
  while (parentMap.has(current)) {
    const parentId = parentMap.get(current);
    const parentEl = treeRoot.querySelector(`.org-node[data-id="${parentId}"]`);
    if (parentEl) parentEl.classList.remove("collapsed");
    current = parentId;
  }
}

function applySearch() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const nodes = treeRoot.querySelectorAll(".org-node");
  nodes.forEach((node) => node.classList.remove("org-highlight"));
  if (!query) return;

  nodes.forEach((node) => {
    if (node.dataset.name.includes(query)) {
      node.classList.add("org-highlight");
      expandAncestors(node.dataset.id);
    }
  });
}

function collapseAll() {
  treeRoot.querySelectorAll(".org-node").forEach((node) => {
    if (node.querySelector(".org-children")) {
      node.classList.add("collapsed");
    }
  });
}

function renderWhenReady() {
  if (!dataReady.employees || !dataReady.departments || !dataReady.positions) return;
  renderTree();
  applySearch();
}

function onRealtimeError(error) {
  console.error("Org chart realtime sync failed", error);
  showToast("error", "Could not sync org chart data from Firebase");
}

function initRealtimeSync() {
  unsubscribers = [
    watchEmployees(
      (data) => {
        employees = data;
        dataReady.employees = true;
        renderWhenReady();
      },
      onRealtimeError
    ),
    watchDepartments(
      (data) => {
        departments = data;
        dataReady.departments = true;
        renderWhenReady();
      },
      onRealtimeError
    ),
    watchPositions(
      (data) => {
        positions = data;
        dataReady.positions = true;
        renderWhenReady();
      },
      onRealtimeError
    )
  ];
}

if (searchInput) {
  searchInput.addEventListener("input", applySearch);
}
if (collapseBtn) {
  collapseBtn.addEventListener("click", collapseAll);
}
window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  applySearch();
});
window.addEventListener("beforeunload", () => {
  unsubscribers.forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
});

initRealtimeSync();

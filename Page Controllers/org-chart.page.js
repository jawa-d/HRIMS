import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { watchEmployees, listEmployees } from "../Services/employees.service.js";
import { watchDepartments, listDepartments } from "../Services/departments.service.js";
import { watchPositions, listPositions } from "../Services/positions.service.js";

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
const ORG_CHART_CACHE_KEY = "hrms_orgchart_cache_v1";

let employees = [];
let departments = [];
let positions = [];
let parentMap = new Map();
let unsubscribers = [];
const UNASSIGNED_DEPARTMENT_ID = "__unassigned__";
let dataReady = {
  employees: false,
  departments: false,
  positions: false
};
let fallbackLoading = false;
let syncErrorNotified = false;

function readOrgChartCache() {
  try {
    const raw = localStorage.getItem(ORG_CHART_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      positions: Array.isArray(parsed.positions) ? parsed.positions : []
    };
  } catch (_) {
    return null;
  }
}

function persistOrgChartCache() {
  try {
    localStorage.setItem(
      ORG_CHART_CACHE_KEY,
      JSON.stringify({
        employees,
        departments,
        positions,
        savedAt: Date.now()
      })
    );
  } catch (_) {
    // Ignore storage quota or private mode issues.
  }
}

function applyNextData(current, next) {
  if (!Array.isArray(next)) return current;
  // Avoid wiping visible data when Firebase call fails and a service returns [] fallback.
  if (next.length === 0 && Array.isArray(current) && current.length > 0) return current;
  return next;
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function departmentAccent(departmentId = "") {
  const source = String(departmentId || UNASSIGNED_DEPARTMENT_ID);
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

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

function normalizeDepartmentId(value) {
  return String(value || "").trim() || UNASSIGNED_DEPARTMENT_ID;
}

function buildHierarchyByDepartment() {
  const nodes = new Map();
  const childrenMap = new Map();
  const deptMembers = new Map();
  const deptNameMap = new Map(departments.map((dept) => [dept.id, dept.name || dept.id]));

  employees.forEach((emp) => {
    nodes.set(emp.id, { ...emp, id: emp.id });
    childrenMap.set(emp.id, []);
    const deptId = normalizeDepartmentId(emp.departmentId);
    if (!deptMembers.has(deptId)) deptMembers.set(deptId, []);
    deptMembers.get(deptId).push(emp.id);
  });

  employees.forEach((emp) => {
    const managerId = resolveManagerId(emp.managerId);
    const empDeptId = normalizeDepartmentId(emp.departmentId);
    const managerDeptId = normalizeDepartmentId(nodes.get(managerId)?.departmentId);
    if (managerId && childrenMap.has(managerId) && empDeptId === managerDeptId) {
      childrenMap.get(managerId).push(emp.id);
      parentMap.set(emp.id, managerId);
    }
  });

  const departmentOrder = [
    ...departments.map((dept) => dept.id),
    ...Array.from(deptMembers.keys()).filter((deptId) => !deptNameMap.has(deptId))
  ];

  const departmentGroups = departmentOrder
    .map((deptId) => {
      const memberIds = deptMembers.get(deptId) || [];
      const roots = memberIds.filter((id) => !parentMap.has(id));
      return {
        id: deptId,
        label: deptId === UNASSIGNED_DEPARTMENT_ID ? "Unassigned Department" : deptNameMap.get(deptId) || deptId,
        roots,
        memberCount: memberIds.length
      };
    })
    .filter((group) => group.memberCount > 0);

  return { nodes, childrenMap, departmentGroups };
}

function createNode(id, nodes, childrenMap, maps) {
  const emp = nodes.get(id);
  const children = childrenMap.get(id) || [];
  const deptName = maps.deptMap.get(emp.departmentId) || emp.departmentId || "Unassigned";
  const positionName = maps.posMap.get(emp.positionId) || emp.positionId || "Role";
  const displayName = emp.fullName || emp.email || emp.empId || emp.id;
  const searchText = `${displayName} ${positionName} ${deptName}`.toLowerCase();
  const accent = departmentAccent(normalizeDepartmentId(emp.departmentId));

  const node = document.createElement("div");
  node.className = "org-node";
  node.dataset.id = id;
  node.dataset.name = searchText;
  node.style.setProperty("--org-accent", accent);

  node.innerHTML = `
    <div class="org-card">
      <div class="org-info">
        <div class="org-name"><span class="org-dot"></span><span>${displayName}</span></div>
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

function createDepartmentSection(group, nodes, childrenMap, maps) {
  const section = document.createElement("section");
  section.className = "org-department";
  section.dataset.name = group.label.toLowerCase();
  section.style.setProperty("--org-accent", departmentAccent(group.id));
  section.innerHTML = `
    <div class="org-department-head">
      <h4 class="org-department-title">${group.label}</h4>
      <span class="chip">${group.memberCount} Employees</span>
    </div>
    <div class="org-department-tree"></div>
  `;

  const tree = section.querySelector(".org-department-tree");
  group.roots.forEach((rootId) => {
    tree.appendChild(createNode(rootId, nodes, childrenMap, maps));
  });
  return section;
}

function renderTree() {
  treeRoot.innerHTML = "";
  parentMap = new Map();
  const maps = buildMaps();
  const { nodes, childrenMap, departmentGroups } = buildHierarchyByDepartment();

  if (!departmentGroups.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  departmentGroups.forEach((group) => {
    treeRoot.appendChild(createDepartmentSection(group, nodes, childrenMap, maps));
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
  const departmentsEls = treeRoot.querySelectorAll(".org-department");

  nodes.forEach((node) => node.classList.remove("org-highlight"));
  departmentsEls.forEach((section) => section.classList.remove("hidden"));
  if (!query) return;

  nodes.forEach((node) => {
    if (node.dataset.name.includes(query)) {
      node.classList.add("org-highlight");
      expandAncestors(node.dataset.id);
    }
  });

  departmentsEls.forEach((section) => {
    const byDepartment = section.dataset.name.includes(query);
    const hasMatchedNode = section.querySelector(".org-node.org-highlight");
    section.classList.toggle("hidden", !byDepartment && !hasMatchedNode);
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
  if (!syncErrorNotified) {
    showToast("error", "Could not sync org chart data from Firebase");
    syncErrorNotified = true;
  }
  void loadSnapshotFallback();
}

async function loadSnapshotFallback() {
  if (fallbackLoading) return;
  fallbackLoading = true;
  try {
    const [employeesResult, departmentsResult, positionsResult] = await Promise.allSettled([
      listEmployees(),
      listDepartments(),
      listPositions()
    ]);

    if (employeesResult.status === "fulfilled") {
      employees = applyNextData(employees, employeesResult.value);
      dataReady.employees = true;
    }
    if (departmentsResult.status === "fulfilled") {
      departments = applyNextData(departments, departmentsResult.value);
      dataReady.departments = true;
    }
    if (positionsResult.status === "fulfilled") {
      positions = applyNextData(positions, positionsResult.value);
      dataReady.positions = true;
    }

    if (dataReady.employees && dataReady.departments && dataReady.positions) {
      persistOrgChartCache();
    }

    renderWhenReady();
  } catch (error) {
    console.error("Org chart fallback load failed", error);
  } finally {
    fallbackLoading = false;
  }
}

function initRealtimeSync() {
  unsubscribers = [
    watchEmployees(
      (data) => {
        employees = data;
        dataReady.employees = true;
        persistOrgChartCache();
        renderWhenReady();
      },
      onRealtimeError
    ),
    watchDepartments(
      (data) => {
        departments = data;
        dataReady.departments = true;
        persistOrgChartCache();
        renderWhenReady();
      },
      onRealtimeError
    ),
    watchPositions(
      (data) => {
        positions = data;
        dataReady.positions = true;
        persistOrgChartCache();
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

trackUxEvent({ event: "page_open", module: "orgchart" });
const cached = readOrgChartCache();
if (cached) {
  employees = cached.employees;
  departments = cached.departments;
  positions = cached.positions;
  dataReady = {
    employees: true,
    departments: true,
    positions: true
  };
  renderWhenReady();
}
initRealtimeSync();

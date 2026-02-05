import { listEmployees } from "./employees.service.js";
import { listAssets } from "./assets.service.js";
import { listLeaves } from "./leaves.service.js";
import { listDepartments } from "./departments.service.js";
import { listPositions } from "./positions.service.js";

const CACHE_TTL_MS = 45 * 1000;

let cachedAt = 0;
let cachedIndex = [];
let inflight = null;

function scoreMatch(text, query) {
  if (!text) return 0;
  const value = String(text).toLowerCase();
  if (!value.includes(query)) return 0;
  if (value.startsWith(query)) return 40;
  const words = value.split(/\s+/);
  if (words.some((word) => word.startsWith(query))) return 24;
  return 12;
}

function normalize(value) {
  return String(value || "").trim();
}

async function buildIndex() {
  const [employees, assets, leaves, departments, positions] = await Promise.allSettled([
    listEmployees(),
    listAssets(),
    listLeaves(),
    listDepartments(),
    listPositions()
  ]);

  const ok = (result) => (result.status === "fulfilled" ? result.value : []);
  const records = [];

  ok(employees).forEach((emp) => {
    records.push({
      id: `emp:${emp.id}`,
      type: "employee",
      title: normalize(emp.fullName || emp.empId || emp.email || "Employee"),
      subtitle: normalize(emp.email || emp.departmentId || ""),
      keywords: [emp.empId, emp.email, emp.departmentId, emp.positionId, emp.status].map(normalize).join(" "),
      href: `employee-details.html?id=${encodeURIComponent(emp.id)}`
    });
  });

  ok(assets).forEach((asset) => {
    records.push({
      id: `asset:${asset.id}`,
      type: "asset",
      title: normalize(asset.name || asset.tag || "Asset"),
      subtitle: normalize(asset.tag || asset.assignedToName || ""),
      keywords: [asset.name, asset.tag, asset.category, asset.status, asset.assignedToName].map(normalize).join(" "),
      href: "assets.html"
    });
  });

  ok(leaves).forEach((leave) => {
    const leaveLabel = normalize(leave.requestId || leave.id || "Leave");
    records.push({
      id: `leave:${leave.id}`,
      type: "leave",
      title: leaveLabel,
      subtitle: normalize(`${leave.employeeName || leave.employeeId || ""} ${leave.status || ""}`),
      keywords: [leave.type, leave.category, leave.reason, leave.employeeName, leave.employeeId, leave.status, leave.requestId]
        .map(normalize)
        .join(" "),
      href: "leaves.html"
    });
  });

  ok(departments).forEach((dept) => {
    records.push({
      id: `department:${dept.id}`,
      type: "department",
      title: normalize(dept.name || dept.id || "Department"),
      subtitle: "Department",
      keywords: [dept.name, dept.code].map(normalize).join(" "),
      href: "departments.html"
    });
  });

  ok(positions).forEach((pos) => {
    records.push({
      id: `position:${pos.id}`,
      type: "position",
      title: normalize(pos.name || pos.id || "Position"),
      subtitle: "Position",
      keywords: [pos.name, pos.code].map(normalize).join(" "),
      href: "positions.html"
    });
  });

  return records;
}

async function getIndex() {
  if (cachedIndex.length && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  if (!inflight) {
    inflight = buildIndex()
      .then((records) => {
        cachedIndex = records;
        cachedAt = Date.now();
        return cachedIndex;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export async function searchGlobal(query, limit = 8) {
  const q = normalize(query).toLowerCase();
  if (!q) return [];

  const index = await getIndex();
  return index
    .map((item) => ({
      ...item,
      score:
        scoreMatch(item.title, q) +
        scoreMatch(item.subtitle, q) +
        scoreMatch(item.keywords, q)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

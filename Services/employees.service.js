import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  limit,
  writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const employeesRef = collection(db, "employees");
const DEFAULT_EMPLOYEE_LIMIT = 200;

function isArchivedEmployee(item = {}) {
  if (item?.isArchived === true) return true;
  return String(item?.status || "").trim().toLowerCase() === "archived";
}

function normalizeListOptions(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(500, Math.floor(parsedLimit))
    : DEFAULT_EMPLOYEE_LIMIT;
  return {
    includeArchived: Boolean(options.includeArchived),
    limitCount
  };
}

export async function listEmployees(options = {}) {
  const { includeArchived, limitCount } = normalizeListOptions(options);
  try {
    const constraints = [orderBy("createdAt", "desc"), limit(limitCount)];
    const snap = await getDocs(query(employeesRef, ...constraints));
    const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return includeArchived ? rows : rows.filter((item) => !isArchivedEmployee(item));
  } catch (_) {
    return [];
  }
}

export function watchEmployees(onChange, onError, options = {}) {
  const { includeArchived, limitCount } = normalizeListOptions(options);
  const constraints = [orderBy("createdAt", "desc"), limit(limitCount)];
  const employeesQuery = query(employeesRef, ...constraints);
  return onSnapshot(
    employeesQuery,
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onChange(includeArchived ? rows : rows.filter((item) => !isArchivedEmployee(item)));
    },
    onError
  );
}

export async function getEmployee(id) {
  const snap = await getDoc(doc(db, "employees", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createEmployee(payload) {
  const data = {
    ...payload,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(employeesRef, data);
  return ref.id;
}

export async function updateEmployee(id, payload) {
  await updateDoc(doc(db, "employees", id), { ...payload, updatedAt: ts() });
}

export async function archiveEmployee(id, actor = {}) {
  await updateDoc(doc(db, "employees", id), {
    isArchived: true,
    archivedAt: ts(),
    archivedBy: {
      uid: actor.uid || "",
      email: actor.email || "",
      role: actor.role || ""
    },
    status: "archived",
    updatedAt: ts()
  });
}

export async function restoreEmployee(id) {
  await updateDoc(doc(db, "employees", id), {
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    status: "active",
    updatedAt: ts()
  });
}

export async function deleteEmployee(id) {
  await deleteDoc(doc(db, "employees", id));
}

export async function hasEmployeeDuplicate(payload, excludeId = "") {
  const email = String(payload?.email || "").trim().toLowerCase();
  const empId = String(payload?.empId || "").trim();
  const phone = String(payload?.phone || "").trim();
  const checks = [
    email ? { field: "email", value: email } : null,
    empId ? { field: "empId", value: empId } : null,
    phone ? { field: "phone", value: phone } : null
  ].filter(Boolean);

  for (const check of checks) {
    const snap = await getDocs(query(employeesRef, where(check.field, "==", check.value), limit(5)));
    const hit = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .find((item) => !item.isArchived && item.id !== excludeId);
    if (hit) {
      return { exists: true, field: check.field, employee: hit };
    }
  }
  return { exists: false };
}

export async function exportEmployeesBackup() {
  const rows = await listEmployees({ includeArchived: true });
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    rows
  };
}

export async function restoreEmployeesBackup(data = {}, actor = {}) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const chunkSize = 300;
  let restored = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let operations = 0;
    for (const row of chunk) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      const { id: _discard, ...rowData } = row;
      const payload = {
        ...rowData,
        updatedAt: ts(),
        restoredAt: ts(),
        restoredBy: {
          uid: actor.uid || "",
          email: actor.email || "",
          role: actor.role || ""
        }
      };
      batch.set(doc(db, "employees", id), payload, { merge: true });
      operations += 1;
      restored += 1;
    }
    if (operations > 0) await batch.commit();
  }
  return restored;
}

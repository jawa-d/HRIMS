import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const employeesRef = collection(db, "employees");

function normalizeListOptions(options = {}) {
  return {
    includeArchived: Boolean(options.includeArchived)
  };
}

export async function listEmployees(options = {}) {
  const { includeArchived } = normalizeListOptions(options);
  const snap = await getDocs(query(employeesRef, orderBy("createdAt", "desc")));
  const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  if (includeArchived) return items;
  return items.filter((item) => !item.isArchived);
}

export function watchEmployees(onChange, onError, options = {}) {
  const { includeArchived } = normalizeListOptions(options);
  const employeesQuery = query(employeesRef, orderBy("createdAt", "desc"));
  return onSnapshot(
    employeesQuery,
    (snap) => {
      const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onChange(includeArchived ? items : items.filter((item) => !item.isArchived));
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
    const snap = await getDocs(query(employeesRef, where(check.field, "==", check.value)));
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
  let restored = 0;
  for (const row of rows) {
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
    await setDoc(doc(db, "employees", id), payload, { merge: true });
    restored += 1;
  }
  return restored;
}

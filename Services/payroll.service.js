import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const payrollRef = collection(db, "payroll");
const DEFAULT_PAYROLL_LIMIT = 300;
const BATCH_CHUNK_SIZE = 300;

function tsToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export async function listPayroll(filter = {}) {
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_PAYROLL_LIMIT;
  const constraints = [];
  if (filter.employeeId) constraints.push(where("employeeId", "==", filter.employeeId));
  if (filter.month) constraints.push(where("month", "==", filter.month));
  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));

  try {
    const snap = await getDocs(query(payrollRef, ...constraints));
    return snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const monthSort = String(b.month || "").localeCompare(String(a.month || ""));
        if (monthSort !== 0) return monthSort;
        return tsToMillis(b.createdAt) - tsToMillis(a.createdAt);
      });
  } catch (_) {
    return [];
  }
}

export async function getPayroll(id) {
  const snap = await getDoc(doc(db, "payroll", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPayroll(payload) {
  const data = {
    ...payload,
    status: payload.status || "draft",
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(payrollRef, data);
  return ref.id;
}

export async function updatePayroll(id, payload) {
  await updateDoc(doc(db, "payroll", id), { ...payload, updatedAt: ts() });
}

export async function deletePayroll(id) {
  await deleteDoc(doc(db, "payroll", id));
}

export async function batchUpsertPayroll(entries = []) {
  const items = Array.isArray(entries) ? entries : [];
  for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
    const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const payload = item?.payload || {};
      const id = String(item?.id || "").trim();
      const target = id ? doc(db, "payroll", id) : doc(payrollRef);
      batch.set(target, {
        ...payload,
        updatedAt: ts(),
        createdAt: payload.createdAt || ts()
      }, { merge: true });
    });
    await batch.commit();
  }
}

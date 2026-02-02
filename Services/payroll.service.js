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
  where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const payrollRef = collection(db, "payroll");

function tsToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export async function listPayroll(filter = {}) {
  const constraints = [];
  if (filter.employeeId) constraints.push(where("employeeId", "==", filter.employeeId));
  if (filter.month) constraints.push(where("month", "==", filter.month));

  const snap = constraints.length ? await getDocs(query(payrollRef, ...constraints)) : await getDocs(payrollRef);
  return snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => {
      const monthSort = String(b.month || "").localeCompare(String(a.month || ""));
      if (monthSort !== 0) return monthSort;
      return tsToMillis(b.createdAt) - tsToMillis(a.createdAt);
    });
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

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
  where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const payrollRef = collection(db, "payroll");

export async function listPayroll(filter = {}) {
  const constraints = [orderBy("createdAt", "desc")];
  if (filter.employeeId) {
    constraints.push(where("employeeId", "==", filter.employeeId));
  }
  const snap = await getDocs(query(payrollRef, ...constraints));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getPayroll(id) {
  const snap = await getDoc(doc(db, "payroll", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPayroll(payload) {
  const data = {
    ...payload,
    status: payload.status || "draft",
    createdAt: ts()
  };
  const ref = await addDoc(payrollRef, data);
  return ref.id;
}

export async function updatePayroll(id, payload) {
  await updateDoc(doc(db, "payroll", id), { ...payload });
}

export async function deletePayroll(id) {
  await deleteDoc(doc(db, "payroll", id));
}

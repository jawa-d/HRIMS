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

const leavesRef = collection(db, "leaves");

export async function listLeaves(filter = {}) {
  const constraints = [orderBy("createdAt", "desc")];
  if (filter.employeeId) {
    constraints.push(where("employeeId", "==", filter.employeeId));
  }
  const snap = await getDocs(query(leavesRef, ...constraints));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getLeave(id) {
  const snap = await getDoc(doc(db, "leaves", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createLeave(payload) {
  const data = {
    ...payload,
    status: payload.status || "pending",
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(leavesRef, data);
  return ref.id;
}

export async function updateLeave(id, payload) {
  await updateDoc(doc(db, "leaves", id), { ...payload, updatedAt: ts() });
}

export async function deleteLeave(id) {
  await deleteDoc(doc(db, "leaves", id));
}

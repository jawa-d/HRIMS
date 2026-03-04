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
  where,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const leavesRef = collection(db, "leaves");
const DEFAULT_LEAVES_LIMIT = 250;

export async function listLeaves(filter = {}) {
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_LEAVES_LIMIT;
  const constraints = [];
  if (filter.employeeId) {
    constraints.push(where("employeeId", "==", filter.employeeId));
  }
  if (filter.status) {
    constraints.push(where("status", "==", String(filter.status).trim().toLowerCase()));
  }
  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));
  try {
    const snap = await getDocs(query(leavesRef, ...constraints));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
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
  await updateDoc(ref, { requestId: payload.requestId || ref.id });
  return ref.id;
}

export async function updateLeave(id, payload) {
  await updateDoc(doc(db, "leaves", id), { ...payload, updatedAt: ts() });
}

export async function deleteLeave(id) {
  await deleteDoc(doc(db, "leaves", id));
}

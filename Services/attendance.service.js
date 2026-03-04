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

const attendanceRef = collection(db, "attendance");
const DEFAULT_ATTENDANCE_LIMIT = 300;

export async function listAttendance(filter = {}) {
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_ATTENDANCE_LIMIT;
  const constraints = [];
  if (filter.employeeId) {
    constraints.push(where("employeeId", "==", filter.employeeId));
  }
  if (filter.status) {
    constraints.push(where("status", "==", String(filter.status).trim().toLowerCase()));
  }
  constraints.push(orderBy("date", "desc"), limit(limitCount));
  try {
    const snap = await getDocs(query(attendanceRef, ...constraints));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

export async function getAttendance(id) {
  const snap = await getDoc(doc(db, "attendance", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createAttendance(payload) {
  const data = {
    ...payload,
    createdAt: ts()
  };
  const ref = await addDoc(attendanceRef, data);
  return ref.id;
}

export async function updateAttendance(id, payload) {
  await updateDoc(doc(db, "attendance", id), { ...payload });
}

export async function deleteAttendance(id) {
  await deleteDoc(doc(db, "attendance", id));
}

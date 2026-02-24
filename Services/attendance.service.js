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

const attendanceRef = collection(db, "attendance");

export async function listAttendance(filter = {}) {
  const constraints = [orderBy("date", "desc")];
  if (filter.employeeId) {
    constraints.push(where("employeeId", "==", filter.employeeId));
  }
  try {
    const snap = await getDocs(query(attendanceRef, ...constraints));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    try {
      const fallback = [];
      if (filter.employeeId) fallback.push(where("employeeId", "==", filter.employeeId));
      const q = fallback.length ? query(attendanceRef, ...fallback) : attendanceRef;
      const snap = await getDocs(q);
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (_) {
      return [];
    }
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

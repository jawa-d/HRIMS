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
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const departmentsRef = collection(db, "departments");
const DEFAULT_DEPARTMENT_LIMIT = 120;

export async function listDepartments(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_DEPARTMENT_LIMIT;
  try {
    const snap = await getDocs(query(departmentsRef, orderBy("createdAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    throw error;
  }
}

export function watchDepartments(onChange, onError, options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_DEPARTMENT_LIMIT;
  const departmentsQuery = query(departmentsRef, orderBy("createdAt", "desc"), limit(limitCount));
  return onSnapshot(
    departmentsQuery,
    (snap) => {
      onChange(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    },
    onError
  );
}

export async function getDepartment(id) {
  const snap = await getDoc(doc(db, "departments", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createDepartment(payload) {
  const data = {
    ...payload,
    createdAt: ts()
  };
  const ref = await addDoc(departmentsRef, data);
  return ref.id;
}

export async function updateDepartment(id, payload) {
  await updateDoc(doc(db, "departments", id), { ...payload });
}

export async function deleteDepartment(id) {
  await deleteDoc(doc(db, "departments", id));
}

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
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const employeesRef = collection(db, "employees");

export async function listEmployees() {
  const snap = await getDocs(query(employeesRef, orderBy("createdAt", "desc")));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export function watchEmployees(onChange, onError) {
  const employeesQuery = query(employeesRef, orderBy("createdAt", "desc"));
  return onSnapshot(
    employeesQuery,
    (snap) => {
      onChange(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
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
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(employeesRef, data);
  return ref.id;
}

export async function updateEmployee(id, payload) {
  await updateDoc(doc(db, "employees", id), { ...payload, updatedAt: ts() });
}

export async function deleteEmployee(id) {
  await deleteDoc(doc(db, "employees", id));
}

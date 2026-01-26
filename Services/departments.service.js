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
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const departmentsRef = collection(db, "departments");

export async function listDepartments() {
  const snap = await getDocs(query(departmentsRef, orderBy("createdAt", "desc")));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
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

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

const positionsRef = collection(db, "positions");

export async function listPositions() {
  const snap = await getDocs(query(positionsRef, orderBy("createdAt", "desc")));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getPosition(id) {
  const snap = await getDoc(doc(db, "positions", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPosition(payload) {
  const data = {
    ...payload,
    createdAt: ts()
  };
  const ref = await addDoc(positionsRef, data);
  return ref.id;
}

export async function updatePosition(id, payload) {
  await updateDoc(doc(db, "positions", id), { ...payload });
}

export async function deletePosition(id) {
  await deleteDoc(doc(db, "positions", id));
}

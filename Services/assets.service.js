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

const assetsRef = collection(db, "assets");

export async function listAssets() {
  const snap = await getDocs(query(assetsRef, orderBy("createdAt", "desc")));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getAsset(id) {
  const snap = await getDoc(doc(db, "assets", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createAsset(payload) {
  const data = {
    status: "available",
    assignedTo: "",
    assignedToName: "",
    ...payload,
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(assetsRef, data);
  return ref.id;
}

export async function updateAsset(id, payload) {
  await updateDoc(doc(db, "assets", id), { ...payload, updatedAt: ts() });
}

export async function deleteAsset(id) {
  await deleteDoc(doc(db, "assets", id));
}

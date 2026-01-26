import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const usersRef = collection(db, "users");

export async function listUsers() {
  const snap = await getDocs(query(usersRef, orderBy("createdAt", "desc")));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function upsertUser(uid, payload) {
  const data = {
    ...payload,
    uid,
    createdAt: payload.createdAt || ts()
  };
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function updateUser(uid, payload) {
  await updateDoc(doc(db, "users", uid), { ...payload });
}

export async function deleteUser(uid) {
  await deleteDoc(doc(db, "users", uid));
}

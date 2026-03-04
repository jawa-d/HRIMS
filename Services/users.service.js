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
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const usersRef = collection(db, "users");
const DEFAULT_USERS_LIMIT = 120;

export async function listUsers(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_USERS_LIMIT;
  try {
    const snap = await getDocs(query(usersRef, orderBy("createdAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
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

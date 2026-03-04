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

const positionsRef = collection(db, "positions");
const DEFAULT_POSITION_LIMIT = 120;

export async function listPositions(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_POSITION_LIMIT;
  try {
    const snap = await getDocs(query(positionsRef, orderBy("createdAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

export function watchPositions(onChange, onError, options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_POSITION_LIMIT;
  const positionsQuery = query(positionsRef, orderBy("createdAt", "desc"), limit(limitCount));
  return onSnapshot(
    positionsQuery,
    (snap) => {
      onChange(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    },
    onError
  );
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

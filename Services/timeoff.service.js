import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const timeoffRef = collection(db, "timeoff_balances");
const DEFAULT_TIMEOFF_LIMIT = 200;

export async function listTimeoffBalances(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_TIMEOFF_LIMIT;
  try {
    const snap = await getDocs(query(timeoffRef, orderBy("updatedAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

export async function getTimeoffBalance(employeeId) {
  const snap = await getDoc(doc(db, "timeoff_balances", employeeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function upsertTimeoffBalance(employeeId, payload) {
  const data = {
    ...payload,
    employeeId,
    updatedAt: ts()
  };
  await setDoc(doc(db, "timeoff_balances", employeeId), data, { merge: true });
}

export async function deleteTimeoffBalance(employeeId) {
  await deleteDoc(doc(db, "timeoff_balances", employeeId));
}

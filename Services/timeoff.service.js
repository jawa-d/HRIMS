import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const timeoffRef = collection(db, "timeoff_balances");

export async function listTimeoffBalances() {
  const snap = await getDocs(timeoffRef);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
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

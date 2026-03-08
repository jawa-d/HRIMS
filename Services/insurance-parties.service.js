import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const partiesRef = collection(db, "insurance_parties");
const DEFAULT_LIMIT = 600;

export async function listInsuranceParties(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(1000, Math.floor(parsedLimit)) : DEFAULT_LIMIT;
  try {
    const snap = await getDocs(query(partiesRef, orderBy("createdAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

export async function createInsuranceParty(payload) {
  const ref = await addDoc(partiesRef, {
    ...payload,
    createdAt: ts(),
    updatedAt: ts()
  });
  return ref.id;
}

export async function updateInsuranceParty(id, payload) {
  await updateDoc(doc(db, "insurance_parties", id), {
    ...payload,
    updatedAt: ts()
  });
}

export async function deleteInsuranceParty(id) {
  await deleteDoc(doc(db, "insurance_parties", id));
}

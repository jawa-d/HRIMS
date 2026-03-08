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

const insuranceDocsRef = collection(db, "insurance_documents");
const DEFAULT_LIMIT = 500;

export async function listInsuranceDocs(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(1000, Math.floor(parsedLimit)) : DEFAULT_LIMIT;
  try {
    const snap = await getDocs(query(insuranceDocsRef, orderBy("createdAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

export async function createInsuranceDoc(payload) {
  const ref = await addDoc(insuranceDocsRef, {
    ...payload,
    createdAt: ts(),
    updatedAt: ts()
  });
  return ref.id;
}

export async function updateInsuranceDoc(id, payload) {
  await updateDoc(doc(db, "insurance_documents", id), {
    ...payload,
    updatedAt: ts()
  });
}

export async function deleteInsuranceDoc(id) {
  await deleteDoc(doc(db, "insurance_documents", id));
}

import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const excelSheetRef = collection(db, "excel_sheet_inputs");
const DEFAULT_YEAR_LIMIT = 300;
const BATCH_CHUNK_SIZE = 400;

function normalizeInputs(inputs = []) {
  const arr = Array.isArray(inputs) ? inputs : [];
  return Array.from({ length: 12 }, (_, index) => {
    const n = Number(arr[index] || 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  });
}

function docIdFor(employeeId, year) {
  return `${String(year)}__${String(employeeId)}`;
}

export async function listExcelSheetInputs(year) {
  const q = query(excelSheetRef, where("year", "==", Number(year)), limit(DEFAULT_YEAR_LIMIT));
  const snap = await getDocs(q);
  const out = {};
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const employeeId = String(data.employeeId || "").trim();
    if (!employeeId) return;
    out[employeeId] = normalizeInputs(data.inputs);
  });
  return out;
}

export async function upsertExcelSheetInput({ year, employeeId, inputs }) {
  const cleanEmployeeId = String(employeeId || "").trim();
  if (!cleanEmployeeId) return;
  const payload = {
    year: Number(year),
    employeeId: cleanEmployeeId,
    inputs: normalizeInputs(inputs),
    updatedAt: ts()
  };
  await setDoc(doc(db, "excel_sheet_inputs", docIdFor(cleanEmployeeId, year)), payload, { merge: true });
}

export async function clearExcelSheetYear(year) {
  const q = query(excelSheetRef, where("year", "==", Number(year)), limit(DEFAULT_YEAR_LIMIT));
  const snap = await getDocs(q);
  for (let i = 0; i < snap.docs.length; i += BATCH_CHUNK_SIZE) {
    const slice = snap.docs.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    slice.forEach((docSnap) => {
      batch.delete(doc(db, "excel_sheet_inputs", docSnap.id));
    });
    await batch.commit();
  }
}

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

const vaultRef = collection(db, "secure_vault_entries");
const DEFAULT_VAULT_LIMIT = 150;

function normalizePayload(payload = {}) {
  return {
    siteName: String(payload.siteName || "").trim(),
    siteUrl: String(payload.siteUrl || "").trim(),
    usernameCipher: payload.usernameCipher || null,
    passwordCipher: payload.passwordCipher || null,
    notes: String(payload.notes || "").trim(),
    ownerUid: String(payload.ownerUid || "").trim(),
    ownerName: String(payload.ownerName || "").trim(),
    ownerRole: String(payload.ownerRole || "").trim()
  };
}

function byUpdatedAtDesc(a, b) {
  const aTime = a?.updatedAt?.seconds || 0;
  const bTime = b?.updatedAt?.seconds || 0;
  return bTime - aTime;
}

export async function listVaultEntries(options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_VAULT_LIMIT;
  try {
    const q = query(vaultRef, orderBy("updatedAt", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    try {
      const snap = await getDocs(query(vaultRef, limit(limitCount)));
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).sort(byUpdatedAtDesc);
    } catch (_) {
      return [];
    }
  }
}

export function watchVaultEntries(onChange, onError, options = {}) {
  const parsedLimit = Number(options.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_VAULT_LIMIT;
  const q = query(vaultRef, orderBy("updatedAt", "desc"), limit(limitCount));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    },
    onError
  );
}

export async function getVaultEntry(id) {
  const snap = await getDoc(doc(db, "secure_vault_entries", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createVaultEntry(payload) {
  const now = ts();
  const data = {
    ...normalizePayload(payload),
    createdAt: now,
    updatedAt: now
  };
  const ref = await addDoc(vaultRef, data);
  return ref.id;
}

export async function updateVaultEntry(id, payload) {
  await updateDoc(doc(db, "secure_vault_entries", id), {
    ...normalizePayload(payload),
    updatedAt: ts()
  });
}

export async function deleteVaultEntry(id) {
  await deleteDoc(doc(db, "secure_vault_entries", id));
}

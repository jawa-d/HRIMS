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
  where,
  onSnapshot,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const announcementsRef = collection(db, "announcements");
const LOCAL_ANNOUNCEMENTS_KEY = "hrms_announcements_local";
const DEFAULT_ANNOUNCEMENTS_LIMIT = 120;

function nowTs() {
  return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
}

function readLocalAnnouncements() {
  try {
    const raw = localStorage.getItem(LOCAL_ANNOUNCEMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocalAnnouncements(items) {
  localStorage.setItem(LOCAL_ANNOUNCEMENTS_KEY, JSON.stringify(items));
}

function mergeById(primary = [], secondary = []) {
  const map = new Map();
  [...secondary, ...primary].forEach((item) => {
    if (!item || !item.id) return;
    map.set(item.id, item);
  });
  return Array.from(map.values()).sort(byCreatedAtDesc);
}

function upsertLocalAnnouncement(item) {
  if (!item || !item.id) return;
  const current = readLocalAnnouncements();
  const next = current.filter((entry) => entry.id !== item.id);
  next.unshift(item);
  writeLocalAnnouncements(next.sort(byCreatedAtDesc));
}

function localId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAnnouncementPayload(payload = {}) {
  return {
    title: String(payload.title || "").trim(),
    body: String(payload.body || "").trim(),
    whatsappNumber: String(payload.whatsappNumber || "").trim(),
    whatsappRecipientName: String(payload.whatsappRecipientName || "").trim(),
    audience: String(payload.audience || "all").trim(),
    status: String(payload.status || "published").trim().toLowerCase(),
    pinned: Boolean(payload.pinned),
    expiresAt: String(payload.expiresAt || "").trim(),
    authorUid: String(payload.authorUid || "").trim(),
    authorName: String(payload.authorName || "").trim()
  };
}

function byCreatedAtDesc(a, b) {
  const aTime = a?.createdAt?.seconds || 0;
  const bTime = b?.createdAt?.seconds || 0;
  return bTime - aTime;
}

export async function listAnnouncements(filter = {}) {
  const status = String(filter.status || "").trim().toLowerCase();
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_ANNOUNCEMENTS_LIMIT;
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));

  try {
    const snap = await getDocs(query(announcementsRef, ...constraints));
    const remote = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return mergeById(remote, readLocalAnnouncements());
  } catch (_) {
    try {
      const q = status ? query(announcementsRef, where("status", "==", status), limit(limitCount)) : query(announcementsRef, limit(limitCount));
      const snap = await getDocs(q);
      const remote = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).sort(byCreatedAtDesc);
      return mergeById(remote, readLocalAnnouncements());
    } catch (_) {
      const local = readLocalAnnouncements();
      return status ? local.filter((item) => String(item.status || "").toLowerCase() === status) : local;
    }
  }
}

export function watchAnnouncements(onChange, onError, filter = {}) {
  const status = String(filter.status || "").trim().toLowerCase();
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_ANNOUNCEMENTS_LIMIT;
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));
  const q = query(announcementsRef, ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      const remote = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onChange(mergeById(remote, readLocalAnnouncements()));
    },
    onError
  );
}

export async function getAnnouncement(id) {
  try {
    const snap = await getDoc(doc(db, "announcements", id));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch (_) {
    // Fallback to local cache.
  }
  return readLocalAnnouncements().find((item) => item.id === id) || null;
}

export async function createAnnouncement(payload) {
  const data = {
    ...normalizeAnnouncementPayload(payload),
    createdAt: ts(),
    updatedAt: ts()
  };
  try {
    const ref = await addDoc(announcementsRef, data);
    upsertLocalAnnouncement({ ...data, id: ref.id });
    return ref.id;
  } catch (_) {
    const id = localId();
    const localData = {
      ...normalizeAnnouncementPayload(payload),
      id,
      createdAt: nowTs(),
      updatedAt: nowTs()
    };
    upsertLocalAnnouncement(localData);
    return id;
  }
}

export async function updateAnnouncement(id, payload) {
  const normalized = normalizeAnnouncementPayload(payload);
  try {
    await updateDoc(doc(db, "announcements", id), {
      ...normalized,
      updatedAt: ts()
    });
    upsertLocalAnnouncement({
      ...payload,
      ...normalized,
      id,
      updatedAt: nowTs()
    });
  } catch (_) {
    const current = readLocalAnnouncements().find((item) => item.id === id) || {};
    upsertLocalAnnouncement({
      ...current,
      ...payload,
      ...normalized,
      id,
      updatedAt: nowTs(),
      createdAt: current.createdAt || payload.createdAt || nowTs()
    });
  }
}

export async function deleteAnnouncement(id) {
  try {
    await deleteDoc(doc(db, "announcements", id));
  } catch (_) {
    // Fall through to local cleanup.
  }
  const current = readLocalAnnouncements();
  writeLocalAnnouncements(current.filter((item) => item.id !== id));
}

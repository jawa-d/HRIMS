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
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const announcementsRef = collection(db, "announcements");
const LOCAL_ANNOUNCEMENTS_KEY = "hrms_announcements_local";

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
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));

  try {
    const q = constraints.length
      ? query(announcementsRef, ...constraints, orderBy("createdAt", "desc"))
      : query(announcementsRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    try {
      const q = constraints.length ? query(announcementsRef, ...constraints) : announcementsRef;
      const snap = await getDocs(q);
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).sort(byCreatedAtDesc);
    } catch (_) {
      const local = readLocalAnnouncements();
      return status ? local.filter((item) => String(item.status || "").toLowerCase() === status) : local;
    }
  }
}

export function watchAnnouncements(onChange, onError, filter = {}) {
  const status = String(filter.status || "").trim().toLowerCase();
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));
  const q = constraints.length
    ? query(announcementsRef, ...constraints, orderBy("createdAt", "desc"))
    : query(announcementsRef, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
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
    return ref.id;
  } catch (_) {
    const id = localId();
    const localData = {
      ...normalizeAnnouncementPayload(payload),
      id,
      createdAt: nowTs(),
      updatedAt: nowTs()
    };
    writeLocalAnnouncements([localData, ...readLocalAnnouncements()].sort(byCreatedAtDesc));
    return id;
  }
}

export async function updateAnnouncement(id, payload) {
  try {
    await updateDoc(doc(db, "announcements", id), {
      ...normalizeAnnouncementPayload(payload),
      updatedAt: ts()
    });
  } catch (_) {
    const current = readLocalAnnouncements();
    const next = current.map((item) =>
      item.id === id
        ? {
          ...item,
          ...normalizeAnnouncementPayload(payload),
          updatedAt: nowTs()
        }
        : item
    );
    writeLocalAnnouncements(next.sort(byCreatedAtDesc));
  }
}

export async function deleteAnnouncement(id) {
  try {
    await deleteDoc(doc(db, "announcements", id));
  } catch (_) {
    const current = readLocalAnnouncements();
    writeLocalAnnouncements(current.filter((item) => item.id !== id));
  }
}

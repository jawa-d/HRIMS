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
      return [];
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
  const snap = await getDoc(doc(db, "announcements", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createAnnouncement(payload) {
  const data = {
    ...normalizeAnnouncementPayload(payload),
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(announcementsRef, data);
  return ref.id;
}

export async function updateAnnouncement(id, payload) {
  await updateDoc(doc(db, "announcements", id), {
    ...normalizeAnnouncementPayload(payload),
    updatedAt: ts()
  });
}

export async function deleteAnnouncement(id) {
  await deleteDoc(doc(db, "announcements", id));
}

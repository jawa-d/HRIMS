import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  onSnapshot,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStoredProfile } from "../Aman/auth.js";

const notificationsRef = collection(db, "notifications");
const DEFAULT_NOTIFICATIONS_LIMIT = 100;
const BATCH_CHUNK_SIZE = 400;

function normalizeLimit(value, fallback = DEFAULT_NOTIFICATIONS_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, Math.floor(parsed));
}

function currentUid() {
  return getStoredProfile()?.uid || null;
}

function byCreatedAtDesc(a, b) {
  const aTime = a?.createdAt?.seconds || 0;
  const bTime = b?.createdAt?.seconds || 0;
  return bTime - aTime;
}

function normalizeNotifications(items = [], { includeArchived = false } = {}) {
  if (includeArchived) return items;
  return items.filter((item) => item?.isArchived !== true);
}

export async function createNotification(payload) {
  const data = {
    ...payload,
    priority: payload?.priority || "medium",
    actionHref: payload?.actionHref || "",
    isRead: false,
    isArchived: false,
    createdAt: ts()
  };
  const ref = await addDoc(notificationsRef, data);
  return ref.id;
}

export async function listNotifications(options = {}) {
  const { includeArchived = false, limitCount = DEFAULT_NOTIFICATIONS_LIMIT } = options;
  const safeLimit = normalizeLimit(limitCount);
  const uid = currentUid();
  if (!uid) return [];
  try {
    const q = query(
      notificationsRef,
      where("toUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(safeLimit)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return normalizeNotifications(items, { includeArchived });
  } catch (_) {
    try {
      const snap = await getDocs(query(notificationsRef, where("toUid", "==", uid)));
      const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).sort(byCreatedAtDesc);
      return normalizeNotifications(items, { includeArchived });
    } catch (_) {
      return [];
    }
  }
}

export async function getUnreadCount() {
  const uid = currentUid();
  if (!uid) return 0;
  try {
    const q = query(
      notificationsRef,
      where("toUid", "==", uid),
      where("isRead", "==", false),
      limit(DEFAULT_NOTIFICATIONS_LIMIT)
    );
    const snap = await getDocs(q);
    return snap.docs.filter((docSnap) => docSnap.data()?.isArchived !== true).length;
  } catch (_) {
    try {
      const snap = await getDocs(query(notificationsRef, where("toUid", "==", uid)));
      return snap.docs.filter((docSnap) => {
        const data = docSnap.data() || {};
        return data.isRead === false && data.isArchived !== true;
      }).length;
    } catch (_) {
      return 0;
    }
  }
}

export function watchUnreadCount(callback) {
  const uid = currentUid();
  if (!uid) {
    callback(0);
    return () => {};
  }
  const q = query(
    notificationsRef,
    where("toUid", "==", uid),
    where("isRead", "==", false),
    limit(DEFAULT_NOTIFICATIONS_LIMIT)
  );
  return onSnapshot(
    q,
    (snap) => {
      const count = snap.docs.filter((docSnap) => docSnap.data()?.isArchived !== true).length;
      callback(count);
    },
    async () => {
      try {
        const fallback = await getDocs(query(notificationsRef, where("toUid", "==", uid)));
        const unread = fallback.docs.filter((docSnap) => {
          const data = docSnap.data() || {};
          return data.isRead === false && data.isArchived !== true;
        }).length;
        callback(unread);
      } catch (_) {
        callback(0);
      }
    }
  );
}

export function watchNotifications(callback, options = {}) {
  const { includeArchived = false, limitCount = DEFAULT_NOTIFICATIONS_LIMIT } = options;
  const safeLimit = normalizeLimit(limitCount);
  const uid = currentUid();
  if (!uid) {
    callback([]);
    return () => {};
  }
  const q = query(
    notificationsRef,
    where("toUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(safeLimit)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      callback(normalizeNotifications(items, { includeArchived }));
    },
    async () => {
      try {
        const fallback = await getDocs(query(notificationsRef, where("toUid", "==", uid)));
        const items = fallback.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).sort(byCreatedAtDesc);
        callback(normalizeNotifications(items, { includeArchived }));
      } catch (_) {
        callback([]);
      }
    }
  );
}

export async function markNotificationRead(id) {
  await updateDoc(doc(db, "notifications", id), { isRead: true });
}

export async function markAllNotificationsRead() {
  const items = await listNotifications({ includeArchived: false, limitCount: DEFAULT_NOTIFICATIONS_LIMIT });
  const pending = items.filter((item) => item.isRead !== true);
  for (let i = 0; i < pending.length; i += BATCH_CHUNK_SIZE) {
    const slice = pending.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    slice.forEach((item) => {
      batch.update(doc(db, "notifications", item.id), { isRead: true });
    });
    await batch.commit();
  }
}

export async function archiveNotification(id) {
  await updateDoc(doc(db, "notifications", id), { isArchived: true });
}

export async function unarchiveNotification(id) {
  await updateDoc(doc(db, "notifications", id), { isArchived: false });
}

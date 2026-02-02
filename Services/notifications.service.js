import { db, ts } from "../Aman/firebase.js";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStoredProfile } from "../Aman/auth.js";

const notificationsRef = collection(db, "notifications");

function currentUid() {
  return getStoredProfile()?.uid || null;
}

export async function createNotification(payload) {
  const data = {
    ...payload,
    isRead: false,
    createdAt: ts()
  };
  const ref = await addDoc(notificationsRef, data);
  return ref.id;
}

export async function listNotifications() {
  const uid = currentUid();
  if (!uid) return [];
  const q = query(
    notificationsRef,
    where("toUid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getUnreadCount() {
  const uid = currentUid();
  if (!uid) return 0;
  const q = query(
    notificationsRef,
    where("toUid", "==", uid),
    where("isRead", "==", false)
  );
  const snap = await getDocs(q);
  return snap.size || 0;
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
    where("isRead", "==", false)
  );
  return onSnapshot(q, (snap) => callback(snap.size || 0));
}

export function watchNotifications(callback) {
  const uid = currentUid();
  if (!uid) {
    callback([]);
    return () => {};
  }
  const q = query(
    notificationsRef,
    where("toUid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(items);
  });
}

export async function markNotificationRead(id) {
  await updateDoc(doc(db, "notifications", id), { isRead: true });
}

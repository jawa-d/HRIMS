import { db, ts } from "../Aman/firebase.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const BACKUPS_COLLECTION = "system_backups";
const DAILY_BACKUP_KEY = "hrms_daily_backup_last_date";

export const BACKUP_COLLECTIONS = [
  "employees",
  "departments",
  "positions",
  "leaves",
  "attendance",
  "payroll",
  "assets",
  "timeoff_balances",
  "tickets",
  "announcements",
  "users",
  "secure_vault_entries"
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function chunk(items = [], size = 400) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function toPlain(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    if (typeof value.toDate === "function" && typeof value.seconds === "number") {
      return {
        seconds: value.seconds,
        nanoseconds: value.nanoseconds || 0
      };
    }
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = toPlain(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function summarize(collections = {}) {
  const summary = {};
  Object.keys(collections).forEach((key) => {
    summary[key] = Array.isArray(collections[key]) ? collections[key].length : 0;
  });
  return summary;
}

async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...toPlain(docSnap.data())
  }));
}

export async function collectSystemBackup() {
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    collections[name] = await readCollection(name);
  }
  return {
    version: 1,
    createdAtIso: new Date().toISOString(),
    collections,
    summary: summarize(collections)
  };
}

export async function createBackupSnapshot(actor = {}) {
  const snapshot = await collectSystemBackup();
  const ref = await addDoc(collection(db, BACKUPS_COLLECTION), {
    createdAt: ts(),
    createdAtIso: snapshot.createdAtIso,
    createdBy: {
      uid: actor.uid || "",
      name: actor.name || "",
      role: actor.role || ""
    },
    summary: snapshot.summary,
    payload: snapshot
  });
  return {
    id: ref.id,
    snapshot
  };
}

export async function listBackupSnapshots(maxItems = 10) {
  const q = query(collection(db, BACKUPS_COLLECTION), orderBy("createdAt", "desc"), limit(Math.max(1, maxItems)));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function runDailyBackup(actor = {}) {
  const today = todayKey();
  if (localStorage.getItem(DAILY_BACKUP_KEY) === today) {
    return { skipped: true };
  }
  const result = await createBackupSnapshot(actor);
  localStorage.setItem(DAILY_BACKUP_KEY, today);
  return { skipped: false, ...result };
}

async function clearCollection(name) {
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs.map((item) => item.id);
  for (const ids of chunk(docs, 400)) {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, name, id)));
    await batch.commit();
  }
}

async function restoreCollection(name, records = []) {
  for (const items of chunk(records, 250)) {
    const batch = writeBatch(db);
    items.forEach((record) => {
      const id = String(record.id || "").trim();
      if (!id) return;
      const { id: _id, ...data } = record;
      batch.set(doc(db, name, id), data);
    });
    await batch.commit();
  }
}

export async function restoreBackupPayload(payload) {
  const collections = payload?.collections || {};
  for (const name of BACKUP_COLLECTIONS) {
    await clearCollection(name);
    await restoreCollection(name, collections[name] || []);
  }
  return true;
}

export async function restoreBackupById(backupId) {
  const snap = await getDoc(doc(db, BACKUPS_COLLECTION, backupId));
  if (!snap.exists()) throw new Error("Backup not found");
  const payload = snap.data()?.payload;
  if (!payload?.collections) throw new Error("Backup payload invalid");
  await restoreBackupPayload(payload);
  return true;
}

export function downloadBackupJson(snapshot, filename = "hrms-backup.json") {
  const text = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

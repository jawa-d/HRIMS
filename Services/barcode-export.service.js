import { db, storage, ts } from "../Aman/firebase.js";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const barcodeExportsRef = collection(db, "barcode_exports");
const DEFAULT_LIMIT = 120;

function safeString(value = "") {
  return String(value || "").trim();
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function uploadBarcodeAttachment(file, actorUid = "unknown") {
  if (!file) return { url: "", name: "" };
  const extension = String(file.name || "").split(".").pop() || "bin";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const objectPath = `barcode_exports/${safeString(actorUid) || "unknown"}/${fileName}`;

  const projectId = safeString(storage?.app?.options?.projectId);
  const configuredBucket = safeString(storage?.app?.options?.storageBucket);
  const candidateBuckets = Array.from(
    new Set(
      [
        configuredBucket,
        projectId ? `${projectId}.firebasestorage.app` : "",
        projectId ? `${projectId}.appspot.com` : ""
      ].filter(Boolean)
    )
  );

  let lastError = null;
  for (const bucket of candidateBuckets) {
    try {
      const bucketStorage = getStorage(storage.app, `gs://${bucket}`);
      const fileRef = ref(bucketStorage, objectPath);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      return {
        url,
        name: safeString(file.name || fileName)
      };
    } catch (error) {
      lastError = error;
    }
  }

  const fail = new Error("Failed to upload attachment for barcode export.");
  fail.cause = lastError;
  throw fail;
}

export async function createBarcodeExport(payload = {}) {
  const data = {
    companyName: safeString(payload.companyName),
    companyLogoUrl: safeString(payload.companyLogoUrl),
    issueNo: safeString(payload.issueNo),
    issueDate: safeString(payload.issueDate),
    qrPayload: safeString(payload.qrPayload),
    attachmentUrl: safeString(payload.attachmentUrl),
    attachmentName: safeString(payload.attachmentName),
    createdByUid: safeString(payload.createdByUid),
    createdByEmail: safeString(payload.createdByEmail),
    createdByName: safeString(payload.createdByName),
    createdAtEpoch: Date.now(),
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(barcodeExportsRef, data);
  return ref.id;
}

export async function listBarcodeExports(options = {}) {
  const parsedLimit = safeNumber(options.limitCount, DEFAULT_LIMIT);
  const limitCount = Math.max(1, Math.min(300, Math.floor(parsedLimit)));
  try {
    const snap = await getDocs(query(barcodeExportsRef, orderBy("createdAt", "desc"), limit(limitCount)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

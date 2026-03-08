import { db, storage, ts } from "../Aman/firebase.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const barcodeExportsRef = collection(db, "barcode_exports");
const barcodeInlineFilesRef = collection(db, "barcode_inline_files");
const barcodeInlineFileChunksRef = collection(db, "barcode_inline_file_chunks");
const DEFAULT_LIMIT = 120;
const INLINE_CHUNK_SIZE = 700000;

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

export async function createBarcodeInlineFile(payload = {}) {
  const fileName = safeString(payload.fileName);
  const mimeType = safeString(payload.mimeType);
  const dataUrl = safeString(payload.dataUrl);
  const createdByUid = safeString(payload.createdByUid);
  const createdByEmail = safeString(payload.createdByEmail);

  if (!dataUrl) {
    throw new Error("Inline file payload is empty.");
  }

  // Small payload: keep single-document mode for faster reads.
  if (dataUrl.length <= INLINE_CHUNK_SIZE) {
    const data = {
      fileName,
      mimeType,
      dataUrl,
      inlineMode: "single",
      chunkCount: 1,
      isPublic: true,
      createdByUid,
      createdByEmail,
      createdAtEpoch: Date.now(),
      createdAt: ts()
    };
    const ref = await addDoc(barcodeInlineFilesRef, data);
    return ref.id;
  }

  // Large payload: store metadata + chunk documents.
  const chunks = [];
  for (let i = 0; i < dataUrl.length; i += INLINE_CHUNK_SIZE) {
    chunks.push(dataUrl.slice(i, i + INLINE_CHUNK_SIZE));
  }

  const metaRef = await addDoc(barcodeInlineFilesRef, {
    fileName,
    mimeType,
    dataUrl: "",
    inlineMode: "chunked",
    chunkCount: chunks.length,
    isPublic: true,
    createdByUid,
    createdByEmail,
    createdAtEpoch: Date.now(),
    createdAt: ts()
  });

  await Promise.all(
    chunks.map((chunk, index) =>
      addDoc(barcodeInlineFileChunksRef, {
        fileId: metaRef.id,
        index,
        chunk,
        createdAtEpoch: Date.now(),
        createdAt: ts()
      })
    )
  );

  return metaRef.id;
}

export async function getBarcodeInlineFileDataUrl(fileId) {
  const id = safeString(fileId);
  if (!id) return "";
  const metaSnap = await getDoc(doc(db, "barcode_inline_files", id));
  if (!metaSnap.exists()) return "";
  const meta = metaSnap.data() || {};

  if (safeString(meta.inlineMode) !== "chunked") {
    return safeString(meta.dataUrl);
  }

  const chunkSnap = await getDocs(
    query(
      barcodeInlineFileChunksRef,
      where("fileId", "==", id),
      orderBy("index", "asc"),
      limit(Math.max(1, Number(meta.chunkCount || 1)))
    )
  );
  if (chunkSnap.empty) return "";
  return chunkSnap.docs.map((docSnap) => safeString(docSnap.data()?.chunk)).join("");
}

export async function createBarcodeInlineFileLegacy(payload = {}) {
  const data = {
    fileName: safeString(payload.fileName),
    mimeType: safeString(payload.mimeType),
    dataUrl: safeString(payload.dataUrl),
    isPublic: true,
    createdByUid: safeString(payload.createdByUid),
    createdByEmail: safeString(payload.createdByEmail),
    createdAtEpoch: Date.now(),
    createdAt: ts()
  };
  const ref = await addDoc(barcodeInlineFilesRef, data);
  return ref.id;
}

import { db, storage, ts } from "../Aman/firebase.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const accountingRef = collection(db, "accounting_entries");
const cashboxConfigRef = doc(db, "app_config", "cashbox_settings");
const chartAccountsRef = collection(db, "accounting_chart_accounts");
const obligationsRef = collection(db, "accounting_obligations");
const obligationMovementsRef = collection(db, "accounting_obligation_movements");
const accountingClosuresRef = doc(db, "app_config", "accounting_closures");
const accountingSequenceRef = doc(db, "app_config", "accounting_sequence");

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function safeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function normalizeType(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "in" || normalized === "out" || normalized === "expense") return normalized;
  return "out";
}

function normalizeObligationKind(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["custody", "advance", "receivable", "payable"].includes(normalized)) return normalized;
  return "receivable";
}

function monthFromDate(dateValue = "") {
  const value = String(dateValue || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return "";
}

function yearFromDate(dateValue = "") {
  const value = String(dateValue || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 4);
  return "";
}

function normalizeClosureMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((acc, [key, val]) => {
    if (!val) return acc;
    acc[String(key)] = true;
    return acc;
  }, {});
}

function isDateClosed(dateValue = "", closures = { months: {}, years: {} }) {
  const month = monthFromDate(dateValue);
  const year = yearFromDate(dateValue);
  if (!month || !year) return false;
  return Boolean(closures.months?.[month] || closures.years?.[year]);
}

async function nextJournalNumber(dateValue = "") {
  const month = monthFromDate(dateValue) || new Date().toISOString().slice(0, 7);
  const monthToken = month.replace("-", "");
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(accountingSequenceRef);
    const current = Number(snap.exists() ? snap.data()?.lastNumber || 0 : 0);
    const next = current + 1;
    tx.set(accountingSequenceRef, { lastNumber: next, updatedAt: ts() }, { merge: true });
    return `JV-${monthToken}-${String(next).padStart(6, "0")}`;
  });
}

function nextJournalNumberInTx(tx, dateValue = "") {
  const month = monthFromDate(dateValue) || new Date().toISOString().slice(0, 7);
  const monthToken = month.replace("-", "");
  return tx.get(accountingSequenceRef).then((snap) => {
    const current = Number(snap.exists() ? snap.data()?.lastNumber || 0 : 0);
    const next = current + 1;
    tx.set(accountingSequenceRef, { lastNumber: next, updatedAt: ts() }, { merge: true });
    return `JV-${monthToken}-${String(next).padStart(6, "0")}`;
  });
}

async function getClosuresInternal() {
  try {
    const snap = await getDoc(accountingClosuresRef);
    if (!snap.exists()) return { months: {}, years: {} };
    const data = snap.data() || {};
    return {
      months: normalizeClosureMap(data.months),
      years: normalizeClosureMap(data.years)
    };
  } catch (_) {
    return { months: {}, years: {} };
  }
}

async function assertDateOpen(dateValue = "") {
  const closures = await getClosuresInternal();
  if (isDateClosed(dateValue, closures)) {
    const err = new Error("PERIOD_CLOSED");
    err.code = "PERIOD_CLOSED";
    throw err;
  }
}

export async function getCashboxConfig() {
  try {
    const snap = await getDoc(cashboxConfigRef);
    if (!snap.exists()) {
      return { openingBalance: 0 };
    }
    const data = snap.data() || {};
    return {
      openingBalance: safeNumber(data.openingBalance)
    };
  } catch (_) {
    return { openingBalance: 0 };
  }
}

export async function upsertCashboxConfig(payload = {}) {
  await setDoc(
    cashboxConfigRef,
    {
      openingBalance: safeNumber(payload.openingBalance),
      updatedAt: ts()
    },
    { merge: true }
  );
}

export async function listAccountingEntries() {
  try {
    const snap = await getDocs(accountingRef);
    return snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const dateSort = String(b.date || "").localeCompare(String(a.date || ""));
        if (dateSort !== 0) return dateSort;
        return toMillis(b.createdAt) - toMillis(a.createdAt);
      });
  } catch (_) {
    return [];
  }
}

export async function createAccountingEntry(payload = {}) {
  const date = String(payload.date || "").trim();
  await assertDateOpen(date);
  const journalNo = await nextJournalNumber(date);
  const data = {
    journalNo,
    type: normalizeType(payload.type),
    amount: safeNumber(payload.amount),
    date,
    category: String(payload.category || "").trim(),
    receiptNo: String(payload.receiptNo || "").trim(),
    externalReceiptNo: String(payload.externalReceiptNo || "").trim(),
    notes: String(payload.notes || "").trim(),
    attachmentUrl: String(payload.attachmentUrl || "").trim(),
    attachmentName: String(payload.attachmentName || "").trim(),
    source: String(payload.source || "").trim(),
    createdByUid: String(payload.createdByUid || "").trim(),
    createdByName: String(payload.createdByName || "").trim(),
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(accountingRef, data);
  return ref.id;
}

export async function updateAccountingEntry(id, payload = {}) {
  const entryRef = doc(db, "accounting_entries", id);
  const existing = await getDoc(entryRef);
  if (!existing.exists()) {
    const err = new Error("ENTRY_NOT_FOUND");
    err.code = "ENTRY_NOT_FOUND";
    throw err;
  }
  const oldData = existing.data() || {};
  const oldDate = String(oldData.date || "").trim();
  const nextDate = String(payload.date || oldDate).trim();
  await assertDateOpen(oldDate);
  await assertDateOpen(nextDate);

  const data = {
    type: normalizeType(payload.type),
    amount: safeNumber(payload.amount),
    date: nextDate,
    category: String(payload.category || "").trim(),
    receiptNo: String(payload.receiptNo || "").trim(),
    externalReceiptNo: String(payload.externalReceiptNo || "").trim(),
    notes: String(payload.notes || "").trim(),
    attachmentUrl: String(payload.attachmentUrl || "").trim(),
    attachmentName: String(payload.attachmentName || "").trim(),
    source: String(payload.source || "").trim(),
    updatedAt: ts()
  };
  await updateDoc(entryRef, data);
}

export async function deleteAccountingEntry(id) {
  const entryRef = doc(db, "accounting_entries", id);
  const existing = await getDoc(entryRef);
  if (!existing.exists()) return;
  const oldDate = String(existing.data()?.date || "").trim();
  await assertDateOpen(oldDate);
  await deleteDoc(entryRef);
}

export async function uploadAccountingAttachment(file, scope = "general", actorUid = "unknown") {
  if (!file) return { url: "", name: "" };
  const extension = String(file.name || "").split(".").pop() || "bin";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const objectPath = `accounting_attachments/${scope}/${actorUid}/${fileName}`;
  const projectId = String(storage?.app?.options?.projectId || "").trim();
  const configuredBucket = String(storage?.app?.options?.storageBucket || "").trim();
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
        name: String(file.name || fileName)
      };
    } catch (error) {
      lastError = error;
    }
  }

  const fail = new Error("Storage upload failed for all configured buckets.");
  fail.cause = lastError;
  throw fail;
}

export async function listChartAccounts() {
  try {
    const snap = await getDocs(chartAccountsRef);
    return snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
  } catch (_) {
    return [];
  }
}

export async function createChartAccount(payload = {}) {
  const data = {
    code: String(payload.code || "").trim().toUpperCase(),
    name: String(payload.name || "").trim(),
    type: String(payload.type || "asset").trim().toLowerCase(),
    parentCode: String(payload.parentCode || "").trim().toUpperCase(),
    status: String(payload.status || "active").trim().toLowerCase(),
    notes: String(payload.notes || "").trim(),
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(chartAccountsRef, data);
  return ref.id;
}

export async function updateChartAccount(id, payload = {}) {
  await updateDoc(doc(db, "accounting_chart_accounts", id), {
    code: String(payload.code || "").trim().toUpperCase(),
    name: String(payload.name || "").trim(),
    type: String(payload.type || "asset").trim().toLowerCase(),
    parentCode: String(payload.parentCode || "").trim().toUpperCase(),
    status: String(payload.status || "active").trim().toLowerCase(),
    notes: String(payload.notes || "").trim(),
    updatedAt: ts()
  });
}

export async function deleteChartAccount(id) {
  await deleteDoc(doc(db, "accounting_chart_accounts", id));
}

export async function listAccountingObligations() {
  try {
    const snap = await getDocs(obligationsRef);
    return snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => String(a.partyName || "").localeCompare(String(b.partyName || "")));
  } catch (_) {
    return [];
  }
}

export async function createAccountingObligation(payload = {}) {
  const data = {
    kind: normalizeObligationKind(payload.kind),
    partyName: String(payload.partyName || "").trim(),
    partyRef: String(payload.partyRef || "").trim(),
    balance: safeNumber(payload.balance),
    status: String(payload.status || "open").trim().toLowerCase(),
    notes: String(payload.notes || "").trim(),
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(obligationsRef, data);
  return ref.id;
}

export async function updateAccountingObligation(id, payload = {}) {
  await updateDoc(doc(db, "accounting_obligations", id), {
    kind: normalizeObligationKind(payload.kind),
    partyName: String(payload.partyName || "").trim(),
    partyRef: String(payload.partyRef || "").trim(),
    balance: safeNumber(payload.balance),
    status: String(payload.status || "open").trim().toLowerCase(),
    notes: String(payload.notes || "").trim(),
    updatedAt: ts()
  });
}

export async function deleteAccountingObligation(id) {
  await deleteDoc(doc(db, "accounting_obligations", id));
}

export async function getAccountingClosures() {
  const closures = await getClosuresInternal();
  return {
    months: { ...closures.months },
    years: { ...closures.years }
  };
}

export async function closeAccountingMonth(monthKey) {
  const key = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error("INVALID_MONTH");
  const closures = await getClosuresInternal();
  closures.months[key] = true;
  await setDoc(accountingClosuresRef, { months: closures.months, years: closures.years, updatedAt: ts() }, { merge: true });
}

export async function reopenAccountingMonth(monthKey) {
  const key = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error("INVALID_MONTH");
  const closures = await getClosuresInternal();
  delete closures.months[key];
  await setDoc(accountingClosuresRef, { months: closures.months, years: closures.years, updatedAt: ts() }, { merge: true });
}

export async function closeAccountingYear(yearKey) {
  const key = String(yearKey || "").trim();
  if (!/^\d{4}$/.test(key)) throw new Error("INVALID_YEAR");
  const closures = await getClosuresInternal();
  closures.years[key] = true;
  await setDoc(accountingClosuresRef, { months: closures.months, years: closures.years, updatedAt: ts() }, { merge: true });
}

export async function reopenAccountingYear(yearKey) {
  const key = String(yearKey || "").trim();
  if (!/^\d{4}$/.test(key)) throw new Error("INVALID_YEAR");
  const closures = await getClosuresInternal();
  delete closures.years[key];
  await setDoc(accountingClosuresRef, { months: closures.months, years: closures.years, updatedAt: ts() }, { merge: true });
}

function movementDefinition(kind = "", operation = "") {
  const k = normalizeObligationKind(kind);
  const op = String(operation || "").trim().toLowerCase();

  if (k === "custody") {
    if (op === "issue_out") return { type: "out", balanceDelta: 1, category: "Custody Issued" };
    if (op === "settle_in") return { type: "in", balanceDelta: -1, category: "Custody Settlement" };
  }
  if (k === "advance") {
    if (op === "issue_out") return { type: "out", balanceDelta: 1, category: "Advance Issued" };
    if (op === "settle_in") return { type: "in", balanceDelta: -1, category: "Advance Settlement" };
  }
  if (k === "receivable") {
    if (op === "collect_in") return { type: "in", balanceDelta: -1, category: "Receivable Collection" };
  }
  if (k === "payable") {
    if (op === "pay_out") return { type: "out", balanceDelta: -1, category: "Payable Payment" };
  }
  return null;
}

export async function postAccountingObligationMovement(payload = {}) {
  const obligationId = String(payload.obligationId || "").trim();
  const operation = String(payload.operation || "").trim().toLowerCase();
  const amount = safeNumber(payload.amount);
  const date = String(payload.date || "").trim();
  const notes = String(payload.notes || "").trim();
  const actorUid = String(payload.actorUid || "").trim();
  const actorName = String(payload.actorName || "").trim();
  const receiptNo = String(payload.receiptNo || "").trim();
  const externalReceiptNo = String(payload.externalReceiptNo || "").trim();

  if (!obligationId) throw new Error("OBLIGATION_REQUIRED");
  if (amount <= 0) throw new Error("AMOUNT_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("DATE_REQUIRED");

  await assertDateOpen(date);

  const obligationDoc = doc(db, "accounting_obligations", obligationId);
  const entryDoc = doc(accountingRef);
  const movementDoc = doc(obligationMovementsRef);

  return runTransaction(db, async (tx) => {
    const obligationSnap = await tx.get(obligationDoc);
    if (!obligationSnap.exists()) {
      const err = new Error("OBLIGATION_NOT_FOUND");
      err.code = "OBLIGATION_NOT_FOUND";
      throw err;
    }
    const obligation = obligationSnap.data() || {};
    const definition = movementDefinition(obligation.kind, operation);
    if (!definition) {
      const err = new Error("INVALID_OPERATION");
      err.code = "INVALID_OPERATION";
      throw err;
    }

    const currentBalance = safeNumber(obligation.balance);
    const signedDelta = definition.balanceDelta * amount;
    const nextBalance = currentBalance + signedDelta;
    if (nextBalance < 0) {
      const err = new Error("INSUFFICIENT_BALANCE");
      err.code = "INSUFFICIENT_BALANCE";
      throw err;
    }

    const journalNo = await nextJournalNumberInTx(tx, date);
    const obligationKind = normalizeObligationKind(obligation.kind);
    const partyName = String(obligation.partyName || "");
    const partyRef = String(obligation.partyRef || "");
    const movementText = `${obligationKind.toUpperCase()} ${operation.toUpperCase()}${partyName ? ` - ${partyName}` : ""}${partyRef ? ` (${partyRef})` : ""}`;
    const mergedNotes = notes ? `${movementText} | ${notes}` : movementText;

    tx.set(entryDoc, {
      journalNo,
      type: definition.type,
      amount,
      date,
      category: definition.category,
      receiptNo,
      externalReceiptNo,
      notes: mergedNotes,
      attachmentUrl: "",
      attachmentName: "",
      source: "obligations",
      createdByUid: actorUid,
      createdByName: actorName,
      createdAt: ts(),
      updatedAt: ts()
    });

    tx.update(obligationDoc, {
      balance: nextBalance,
      status: nextBalance <= 0 ? "settled" : "open",
      updatedAt: ts()
    });

    tx.set(movementDoc, {
      obligationId,
      obligationKind,
      operation,
      amount,
      date,
      notes,
      receiptNo,
      externalReceiptNo,
      journalNo,
      entryId: entryDoc.id,
      actorUid,
      actorName,
      createdAt: ts()
    });

    return { entryId: entryDoc.id, journalNo, balance: nextBalance };
  });
}

export async function closeAdvanceObligation(payload = {}) {
  const obligationId = String(payload.obligationId || "").trim();
  const date = String(payload.date || "").trim();
  const notes = String(payload.notes || "").trim();
  const actorUid = String(payload.actorUid || "").trim();
  const actorName = String(payload.actorName || "").trim();

  if (!obligationId) throw new Error("OBLIGATION_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("DATE_REQUIRED");

  await assertDateOpen(date);

  const obligationDoc = doc(db, "accounting_obligations", obligationId);
  const entryDoc = doc(accountingRef);
  const movementDoc = doc(obligationMovementsRef);

  return runTransaction(db, async (tx) => {
    const obligationSnap = await tx.get(obligationDoc);
    if (!obligationSnap.exists()) {
      const err = new Error("OBLIGATION_NOT_FOUND");
      err.code = "OBLIGATION_NOT_FOUND";
      throw err;
    }

    const obligation = obligationSnap.data() || {};
    const kind = normalizeObligationKind(obligation.kind);
    if (kind !== "advance") {
      const err = new Error("INVALID_KIND");
      err.code = "INVALID_KIND";
      throw err;
    }

    const amount = safeNumber(obligation.balance);
    if (amount <= 0 || String(obligation.status || "").toLowerCase() === "settled") {
      const err = new Error("ALREADY_SETTLED");
      err.code = "ALREADY_SETTLED";
      throw err;
    }

    const journalNo = await nextJournalNumberInTx(tx, date);
    const partyName = String(obligation.partyName || "");
    const partyRef = String(obligation.partyRef || "");
    const baseNote = `ADVANCE CLOSE${partyName ? ` - ${partyName}` : ""}${partyRef ? ` (${partyRef})` : ""}`;
    const mergedNotes = notes ? `${baseNote} | ${notes}` : baseNote;

    tx.set(entryDoc, {
      journalNo,
      type: "out",
      amount,
      date,
      category: "Advance Close",
      receiptNo: "",
      externalReceiptNo: "",
      notes: mergedNotes,
      attachmentUrl: "",
      attachmentName: "",
      source: "obligations_close",
      createdByUid: actorUid,
      createdByName: actorName,
      createdAt: ts(),
      updatedAt: ts()
    });

    tx.update(obligationDoc, {
      balance: 0,
      status: "settled",
      updatedAt: ts()
    });

    tx.set(movementDoc, {
      obligationId,
      obligationKind: "advance",
      operation: "close_out",
      amount,
      date,
      notes,
      receiptNo: "",
      externalReceiptNo: "",
      journalNo,
      entryId: entryDoc.id,
      actorUid,
      actorName,
      createdAt: ts()
    });

    return { entryId: entryDoc.id, journalNo, balance: 0, amount };
  });
}

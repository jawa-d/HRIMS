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

const ticketsRef = collection(db, "tickets");
const DEFAULT_TICKETS_LIMIT = 200;

function normalizeTicketPayload(payload = {}) {
  return {
    subject: String(payload.subject || "").trim(),
    description: String(payload.description || "").trim(),
    category: String(payload.category || "general").trim().toLowerCase(),
    priority: String(payload.priority || "medium").trim().toLowerCase(),
    status: String(payload.status || "open").trim().toLowerCase(),
    assigneeUid: String(payload.assigneeUid || "").trim(),
    assigneeName: String(payload.assigneeName || "").trim(),
    requesterUid: String(payload.requesterUid || "").trim(),
    requesterName: String(payload.requesterName || "").trim(),
    requesterEmail: String(payload.requesterEmail || "").trim().toLowerCase(),
    resolutionNote: String(payload.resolutionNote || "").trim(),
    slaAlertSent: Boolean(payload.slaAlertSent)
  };
}

export async function listTickets(filter = {}) {
  const scopeUid = String(filter.scopeUid || "").trim();
  const status = String(filter.status || "").trim().toLowerCase();
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_TICKETS_LIMIT;
  const constraints = [];
  if (scopeUid) constraints.push(where("requesterUid", "==", scopeUid));
  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));

  try {
    const snap = await getDocs(query(ticketsRef, ...constraints));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

export function watchTickets(onChange, onError, filter = {}) {
  const scopeUid = String(filter.scopeUid || "").trim();
  const status = String(filter.status || "").trim().toLowerCase();
  const parsedLimit = Number(filter.limitCount);
  const limitCount = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(500, Math.floor(parsedLimit)) : DEFAULT_TICKETS_LIMIT;
  const constraints = [];
  if (scopeUid) constraints.push(where("requesterUid", "==", scopeUid));
  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));
  const q = query(ticketsRef, ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    },
    onError
  );
}

export async function getTicket(id) {
  const snap = await getDoc(doc(db, "tickets", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTicket(payload) {
  const data = {
    ...normalizeTicketPayload(payload),
    createdAt: ts(),
    updatedAt: ts()
  };
  const ref = await addDoc(ticketsRef, data);
  return ref.id;
}

export async function updateTicket(id, payload) {
  await updateDoc(doc(db, "tickets", id), {
    ...normalizeTicketPayload(payload),
    updatedAt: ts()
  });
}

export async function deleteTicket(id) {
  await deleteDoc(doc(db, "tickets", id));
}

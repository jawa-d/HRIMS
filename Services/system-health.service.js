import { db } from "../Aman/firebase.js";
import { listUiErrors } from "./telemetry.service.js";
import { listSecurityEvents } from "./security-audit.service.js";
import { listPageAvailability } from "./page-availability.service.js";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const PAGE_ACTION_PREFIX = "page_availability_";

function withTimeout(promise, timeoutMs = 4500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    })
  ]);
}

function normalizeHealthState(error, latencyMs) {
  if (!error) {
    return {
      state: "online",
      label: "Online",
      detail: ""
    };
  }

  const code = String(error?.code || error?.message || "").toLowerCase();
  if (code.includes("permission-denied")) {
    return {
      state: "online_limited",
      label: "Online (limited permission)",
      detail: `Read blocked by rules (${Math.round(latencyMs)}ms)`
    };
  }
  if (code.includes("timeout")) {
    return {
      state: "degraded",
      label: "Degraded",
      detail: "Response timeout"
    };
  }
  return {
    state: "offline",
    label: "Offline",
    detail: error?.message || "Connection failed"
  };
}

export async function probeFirebaseHealth() {
  const started = performance.now();
  let failure = null;

  try {
    const snap = await withTimeout(
      getDocs(query(collection(db, "security_audit"), orderBy("createdAt", "desc"), limit(1))),
      4500
    );
    const finished = performance.now();
    return {
      ...normalizeHealthState(null, finished - started),
      latencyMs: Math.max(1, Math.round(finished - started)),
      sampleCount: snap.size
    };
  } catch (error) {
    failure = error;
  }

  const finished = performance.now();
  const status = normalizeHealthState(failure, finished - started);
  return {
    ...status,
    latencyMs: Math.max(1, Math.round(finished - started)),
    sampleCount: 0
  };
}

export async function loadSystemHealthData() {
  const [firebase, auditEvents] = await Promise.all([
    probeFirebaseHealth(),
    listSecurityEvents()
  ]);
  const uiErrors = listUiErrors(12);
  const pageStates = listPageAvailability();
  const pageOps = auditEvents
    .filter((item) => String(item?.action || "").startsWith(PAGE_ACTION_PREFIX))
    .slice(0, 12);

  return {
    firebase,
    uiErrors,
    pageOps,
    pageStates,
    refreshedAt: Date.now()
  };
}

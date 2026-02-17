import { db, ts } from "../Aman/firebase.js";
import { STORAGE_KEYS } from "../app.config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const auditRef = collection(db, "security_audit");
const MAX_LOCAL_EVENTS = 250;
const GEO_CACHE_KEY = "hrms_geo_cache";
const GEO_CACHE_TTL_MS = 30 * 60 * 1000;

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.securityAudit);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocal(items) {
  localStorage.setItem(STORAGE_KEYS.securityAudit, JSON.stringify(items.slice(0, MAX_LOCAL_EVENTS)));
}

function normalizeEvent(payload = {}) {
  return {
    actorUid: payload.actorUid || "",
    actorEmail: payload.actorEmail || "",
    actorRole: payload.actorRole || "",
    action: payload.action || "unknown_action",
    severity: payload.severity || "info",
    status: payload.status || "success",
    entity: payload.entity || "",
    entityId: payload.entityId || "",
    ip: payload.ip || "",
    userAgent: payload.userAgent || navigator.userAgent || "",
    message: payload.message || "",
    metadata: payload.metadata || {}
  };
}

function readGeoCache() {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.coords || !parsed?.savedAt) return null;
    if (Date.now() - Number(parsed.savedAt) > GEO_CACHE_TTL_MS) return null;
    return parsed.coords;
  } catch (_) {
    return null;
  }
}

function saveGeoCache(coords) {
  try {
    localStorage.setItem(
      GEO_CACHE_KEY,
      JSON.stringify({
        coords,
        savedAt: Date.now()
      })
    );
  } catch (_) {
    // ignore cache write errors
  }
}

function getGeoFromBrowser() {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: Number(pos.coords.latitude),
          lng: Number(pos.coords.longitude),
          accuracy: Number(pos.coords.accuracy || 0),
          source: "gps"
        });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 120000 }
    );
  });
}

async function resolveClientGeo() {
  const cached = readGeoCache();
  if (cached) return cached;
  const fresh = await getGeoFromBrowser();
  if (fresh) saveGeoCache(fresh);
  return fresh;
}

export async function logSecurityEvent(payload = {}) {
  const normalized = normalizeEvent(payload);
  const existingGeo = normalized?.metadata?.geo;
  const geo = existingGeo || (await resolveClientGeo());
  const metadata = {
    ...(normalized.metadata || {}),
    geo: geo || null
  };
  const eventData = { ...normalized, metadata };
  const localEvent = {
    ...eventData,
    createdAt: Date.now()
  };
  writeLocal([localEvent, ...readLocal()]);

  try {
    await addDoc(auditRef, {
      ...eventData,
      createdAt: ts()
    });
  } catch (_) {
    // Keep local fallback only when remote logging is unavailable.
  }
}

function remoteToLocalShape(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
    createdAt: data?.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0
  };
}

export async function listSecurityEvents() {
  const localEvents = readLocal();
  try {
    const snap = await getDocs(query(auditRef, orderBy("createdAt", "desc")));
    const remoteEvents = snap.docs.map(remoteToLocalShape);
    const merged = [...remoteEvents, ...localEvents];
    merged.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return merged.slice(0, MAX_LOCAL_EVENTS);
  } catch (_) {
    return localEvents;
  }
}

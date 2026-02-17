import { STORAGE_KEYS } from "../app.config.js";
import { logSecurityEvent } from "./security-audit.service.js";

const AI_REPORT_LIMIT = 40;

function parseJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function hashString(value = "") {
  let hash = 0;
  const input = String(value);
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pseudoGeo(seed) {
  const h = hashString(seed || "unknown");
  const lat = ((h % 13000) / 100) - 60;
  const lng = (((h / 13000) % 36000) / 100) - 180;
  return [Math.max(-58, Math.min(75, lat)), Math.max(-179, Math.min(179, lng))];
}

function realGeoFromEvent(event = {}) {
  const geo = event?.metadata?.geo;
  if (!geo) return null;
  const lat = Number(geo.lat);
  const lng = Number(geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    coords: [Math.max(-90, Math.min(90, lat)), Math.max(-180, Math.min(180, lng))],
    source: geo.source || "gps",
    accuracy: Number(geo.accuracy || 0)
  };
}

function severityWeight(level = "") {
  if (level === "critical") return 35;
  if (level === "warning") return 22;
  return 10;
}

function classifyAction(action = "") {
  const a = String(action).toLowerCase();
  if (a.includes("login_failed")) return "Brute Force / Credential Attack";
  if (a.includes("permissions") || a.includes("role_template")) return "Privilege Escalation Attempt";
  if (a.includes("user_deleted")) return "Destructive Account Operation";
  if (a.includes("logout")) return "Session Activity";
  if (a.includes("login_success")) return "Authentication Success";
  return "Suspicious Activity";
}

function statusLabel(event) {
  if (event?.status === "failed") return "failed";
  if (event?.status === "success") return "success";
  return "unknown";
}

function formatTime(ms) {
  if (!ms) return "Unknown time";
  return new Date(ms).toLocaleString();
}

function getActorKey(event) {
  return event.actorUid || event.actorEmail || event.ip || "unknown-actor";
}

function getBlockedState() {
  const raw = parseJson(STORAGE_KEYS.aiDefenseBlocks, {});
  return raw && typeof raw === "object" ? raw : {};
}

function setBlockedState(state) {
  localStorage.setItem(STORAGE_KEYS.aiDefenseBlocks, JSON.stringify(state));
}

function saveAIReport(report) {
  const all = parseJson(STORAGE_KEYS.aiDefenseReports, []);
  const next = [report, ...(Array.isArray(all) ? all : [])].slice(0, AI_REPORT_LIMIT);
  localStorage.setItem(STORAGE_KEYS.aiDefenseReports, JSON.stringify(next));
}

export function buildThreatMap(events = []) {
  const blockedMap = getBlockedState();
  const actorFailures = new Map();
  events.forEach((event) => {
    const actor = getActorKey(event);
    const failures = actorFailures.get(actor) || 0;
    if (String(event.action || "").toLowerCase().includes("login_failed") || event.status === "failed") {
      actorFailures.set(actor, failures + 1);
    }
  });

  return events.map((event, index) => {
    const actor = getActorKey(event);
    const failures = actorFailures.get(actor) || 0;
    const attackType = classifyAction(event.action);
    const riskBase = severityWeight(event.severity) + (event.status === "failed" ? 20 : 0);
    const risk = Math.min(99, riskBase + Math.min(30, failures * 8));
    const realGeo = realGeoFromEvent(event);
    const [lat, lng] = realGeo?.coords || pseudoGeo(`${actor}-${event.action}-${index}`);
    return {
      id: event.id || `${event.action || "event"}-${index}`,
      actor,
      actorEmail: event.actorEmail || "",
      action: event.action || "unknown_action",
      attackType,
      risk,
      status: statusLabel(event),
      severity: event.severity || "info",
      failures,
      createdAt: Number(event.createdAt || 0),
      timeLabel: formatTime(Number(event.createdAt || 0)),
      message: event.message || "",
      coords: [lat, lng],
      coordsSource: realGeo ? "real" : "estimated",
      coordsAccuracy: realGeo?.accuracy || 0,
      isBlocked: Boolean(blockedMap[actor]),
      explanation: `${attackType} | severity=${event.severity || "info"} | failures=${failures}`
    };
  });
}

export async function runAIDefense(events = [], actor = {}) {
  const incidents = buildThreatMap(events);
  const blockedMap = getBlockedState();
  const newlyBlocked = [];

  incidents.forEach((incident) => {
    const mustBlock =
      incident.risk >= 78 ||
      (incident.attackType.includes("Brute Force") && incident.failures >= 3) ||
      incident.attackType.includes("Privilege Escalation");
    if (mustBlock && !blockedMap[incident.actor]) {
      blockedMap[incident.actor] = {
        blockedAt: Date.now(),
        reason: incident.explanation
      };
      newlyBlocked.push(incident);
    }
  });

  if (newlyBlocked.length) {
    setBlockedState(blockedMap);
    await Promise.all(
      newlyBlocked.map((incident) =>
        logSecurityEvent({
          action: "ai_block_applied",
          severity: "critical",
          status: "success",
          actorUid: actor.uid || "",
          actorEmail: actor.email || "",
          actorRole: actor.role || "",
          entity: "security_defense",
          entityId: incident.actor,
          message: `AI blocked actor ${incident.actor} due to ${incident.explanation}`
        })
      )
    );
  }

  const total = incidents.length;
  const highRisk = incidents.filter((item) => item.risk >= 70).length;
  const blocked = Object.keys(blockedMap).length;
  const report = {
    generatedAt: Date.now(),
    totalIncidents: total,
    highRiskIncidents: highRisk,
    blockedActors: blocked,
    newlyBlocked: newlyBlocked.length,
    summary: `AI Defense analyzed ${total} incidents, flagged ${highRisk} high-risk cases, and blocked ${newlyBlocked.length} new actors.`,
    details: newlyBlocked.map((item) => `${item.actor} -> ${item.explanation}`)
  };

  saveAIReport(report);
  await logSecurityEvent({
    action: "ai_report_generated",
    severity: "info",
    status: "success",
    actorUid: actor.uid || "",
    actorEmail: actor.email || "",
    actorRole: actor.role || "",
    entity: "security_defense",
    message: report.summary
  });

  return report;
}

export function listAIReports() {
  const reports = parseJson(STORAGE_KEYS.aiDefenseReports, []);
  return Array.isArray(reports) ? reports : [];
}

export function countBlockedActors() {
  return Object.keys(getBlockedState()).length;
}

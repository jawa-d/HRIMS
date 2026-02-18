import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { listSecurityEvents } from "../Services/security-audit.service.js";
import { buildThreatMap, runAIDefense, listAIReports, countBlockedActors } from "../Services/security-defense.service.js";

if (!enforceAuth("security_map")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("security_map");

const DEFENSE_HQ = [33.3152, 44.3661];

const runAiBtn = document.getElementById("run-ai-defense-btn");
const exportBtn = document.getElementById("export-ai-report-btn");
const simulateBtn = document.getElementById("simulate-attack-btn");
const toggleLanesBtn = document.getElementById("toggle-lanes-btn");
const searchInput = document.getElementById("threat-search");
const riskFilter = document.getElementById("risk-filter");
const statusFilter = document.getElementById("status-filter");
const intensityInput = document.getElementById("attack-intensity");
const intensityLabel = document.getElementById("attack-intensity-label");
const patrolToggle = document.getElementById("patrol-toggle");
const quickActionButtons = [...document.querySelectorAll("button[data-quick-action]")];
const attemptsEl = document.getElementById("threat-attempts");
const highRiskEl = document.getElementById("threat-high-risk");
const blockedEl = document.getElementById("threat-blocked");
const confidenceEl = document.getElementById("threat-confidence");
const mapCountEl = document.getElementById("map-incidents-count");
const reportBoxEl = document.getElementById("ai-report-box");
const incidentListEl = document.getElementById("incident-list");
const responseListEl = document.getElementById("response-list");
const feedListEl = document.getElementById("feed-list");

let map;
let markerLayer;
let laneLayer;
let incidents = [];
let filteredIncidents = [];
let lanesEnabled = true;
let simulationTimer = null;
let patrolTimer = null;
const kpiState = {
  attempts: 0,
  highRisk: 0,
  blocked: 0,
  confidence: 0
};
const markersByIncidentId = new Map();

function animateMetric(el, from, to, suffix = "", duration = 380) {
  if (!el) return;
  const start = performance.now();
  const delta = to - from;
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + delta * eased);
    el.textContent = `${value}${suffix}`;
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function getRiskTier(incident) {
  if (incident.isBlocked || incident.risk >= 85) return "critical";
  if (incident.risk >= 70) return "high";
  if (incident.risk >= 50) return "medium";
  return "low";
}

function getMarkerColor(incident) {
  const tier = getRiskTier(incident);
  if (tier === "critical") return "#ef4444";
  if (tier === "high") return "#f97316";
  if (tier === "medium") return "#eab308";
  return "#3b82f6";
}

function getLaneClassName(incident) {
  const tier = getRiskTier(incident);
  return `attack-lane lane-risk-${tier}`;
}

function createThreatIcon(incident) {
  const tier = getRiskTier(incident);
  return window.L.divIcon({
    className: "threat-marker-wrap",
    html: `<span class="threat-marker risk-${tier}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function ensureMap() {
  if (map) return;
  map = window.L.map("threat-map", { zoomControl: true }).setView([20, 0], 2);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  markerLayer = window.L.layerGroup().addTo(map);
  laneLayer = window.L.layerGroup().addTo(map);
}

function renderMap(items) {
  ensureMap();
  markerLayer.clearLayers();
  laneLayer.clearLayers();
  markersByIncidentId.clear();
  if (!items.length) return;

  const bounds = [];
  items.forEach((incident) => {
    const marker = window.L.marker(incident.coords, { icon: createThreatIcon(incident) });
    marker.bindPopup(`
      <strong>${incident.attackType}</strong><br/>
      Actor: ${incident.actorEmail || incident.actor}<br/>
      Risk: ${incident.risk}<br/>
      Coordinates: ${incident.coords[0].toFixed(5)}, ${incident.coords[1].toFixed(5)} (${incident.coordsSource})<br/>
      Status: ${incident.status}${incident.isBlocked ? " (blocked)" : ""}<br/>
      Time: ${incident.timeLabel}<br/>
      Details: ${incident.message || incident.explanation}
    `);
    marker.addTo(markerLayer);
    markersByIncidentId.set(incident.id, marker);

    if (lanesEnabled) {
      window.L.polyline([incident.coords, DEFENSE_HQ], {
        color: getMarkerColor(incident),
        weight: 2,
        opacity: 0.8,
        className: getLaneClassName(incident)
      }).addTo(laneLayer);
    }
    bounds.push(incident.coords);
  });

  window.L.circleMarker(DEFENSE_HQ, {
    radius: 8,
    color: "#22c55e",
    fillColor: "#16a34a",
    fillOpacity: 0.75,
    weight: 2
  }).bindTooltip("Defense HQ").addTo(markerLayer);

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [30, 30] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 4);
  }
}

function focusIncidentOnMap(incidentId) {
  const marker = markersByIncidentId.get(incidentId);
  if (!marker || !map) return;
  const latLng = marker.getLatLng();
  map.setView(latLng, Math.max(map.getZoom(), 5), { animate: true });
  marker.openPopup();
}

function proceduresForIncident(incident) {
  if (!incident) {
    return ["Select an incident to see recommended actions."];
  }
  const base = [
    `Validate actor identity: ${incident.actorEmail || incident.actor}.`,
    "Correlate with authentication logs and endpoint telemetry.",
    "Open ticket in security queue and assign owner."
  ];
  if (incident.attackType.includes("Brute Force")) {
    base.push("Enforce password reset and activate temporary IP throttling.");
  }
  if (incident.attackType.includes("Privilege")) {
    base.push("Lock elevated role changes and force manager approval.");
  }
  if (incident.isBlocked || incident.risk >= 85) {
    base.push("Keep actor blocked for 24h and request manual SOC review.");
  } else if (incident.risk >= 70) {
    base.push("Apply challenge flow (MFA) and monitor for 2h.");
  } else {
    base.push("Continue passive monitoring and auto-close if clean for 1h.");
  }
  return base;
}

function renderProcedures(incident) {
  const steps = proceduresForIncident(incident);
  responseListEl.innerHTML = steps.map((step) => `<li>${step}</li>`).join("");
}

function renderFeed(items) {
  const feedItems = items.slice(0, 10);
  feedListEl.innerHTML = feedItems.length
    ? feedItems
      .map((incident) => `<div class="feed-item">[${getRiskTier(incident).toUpperCase()}] ${incident.attackType} :: ${incident.actorEmail || incident.actor}</div>`)
      .join("")
    : '<div class="feed-item">No live threats in current filter.</div>';
}

function renderIncidents(items) {
  incidentListEl.innerHTML = items
    .slice(0, 35)
    .map(
      (incident) => `
        <article class="incident-item ${incident.isBlocked ? "is-blocked" : ""}">
          <div class="incident-head">
            <strong>${incident.attackType}</strong>
            <div class="incident-meta">
              <span class="badge">${incident.severity}</span>
              <span class="badge">${getRiskTier(incident)}</span>
              <span class="incident-risk">${incident.risk}</span>
            </div>
          </div>
          <div class="text-muted">${incident.actorEmail || incident.actor}</div>
          <div class="text-muted">${incident.timeLabel}</div>
          <div class="text-muted">Coords: ${incident.coords[0].toFixed(5)}, ${incident.coords[1].toFixed(5)} (${incident.coordsSource})</div>
          <div>${incident.message || incident.explanation}</div>
          <div class="incident-actions">
            <button class="btn btn-ghost btn-xs" data-action="focus-map" data-id="${incident.id}">Show on Map</button>
            <button class="btn btn-ghost btn-xs" data-action="procedure" data-id="${incident.id}">Run Procedure</button>
          </div>
          ${incident.isBlocked ? `<span class="badge">Blocked by AI</span>` : ""}
        </article>
      `
    )
    .join("");

  incidentListEl.querySelectorAll('button[data-action="focus-map"]').forEach((button) => {
    button.addEventListener("click", () => focusIncidentOnMap(button.dataset.id));
  });
  incidentListEl.querySelectorAll('button[data-action="procedure"]').forEach((button) => {
    button.addEventListener("click", () => {
      const incident = filteredIncidents.find((item) => item.id === button.dataset.id);
      renderProcedures(incident);
      focusIncidentOnMap(button.dataset.id);
    });
  });
}

function renderKpis(items) {
  const highRisk = items.filter((item) => item.risk >= 70).length;
  const blockedCount = items.filter((item) => item.isBlocked).length;
  const confidence = items.length ? Math.min(99, Math.round((highRisk / items.length) * 65 + 30)) : 0;
  const attempts = items.length;
  const blocked = Math.max(blockedCount, countBlockedActors());

  animateMetric(attemptsEl, kpiState.attempts, attempts);
  animateMetric(highRiskEl, kpiState.highRisk, highRisk);
  animateMetric(blockedEl, kpiState.blocked, blocked);
  animateMetric(confidenceEl, kpiState.confidence, confidence, "%");
  mapCountEl.textContent = String(attempts);

  kpiState.attempts = attempts;
  kpiState.highRisk = highRisk;
  kpiState.blocked = blocked;
  kpiState.confidence = confidence;
}

function renderLatestReport() {
  const reports = listAIReports();
  const latest = reports[0];
  if (!latest) {
    reportBoxEl.innerHTML = `
      <strong>Waiting for AI analysis</strong>
      <p class="text-muted">No report generated yet. Run AI Defense to create the first report.</p>
    `;
    return;
  }

  const details = (latest.details || []).slice(0, 6).map((line) => `<li>${line}</li>`).join("");
  reportBoxEl.innerHTML = `
    <strong>Latest AI Report</strong>
    <p class="text-muted">${new Date(latest.generatedAt).toLocaleString()}</p>
    <p>${latest.summary}</p>
    ${details ? `<ul>${details}</ul>` : "<p class='text-muted'>No new actors were blocked in this run.</p>"}
  `;
}

function passesFilter(incident) {
  const q = (searchInput.value || "").trim().toLowerCase();
  const risk = riskFilter.value || "";
  const status = statusFilter.value || "";

  const hitQuery =
    !q ||
    `${incident.actorEmail || ""} ${incident.actor || ""} ${incident.attackType || ""} ${incident.message || ""}`
      .toLowerCase()
      .includes(q);

  const tier = getRiskTier(incident);
  const hitRisk = !risk || tier === risk;
  const hitStatus =
    !status ||
    (status === "blocked" && incident.isBlocked) ||
    (status !== "blocked" && incident.status === status);

  return hitQuery && hitRisk && hitStatus;
}

function stopPatrol() {
  if (patrolTimer) {
    window.clearInterval(patrolTimer);
    patrolTimer = null;
  }
}

function startPatrol() {
  stopPatrol();
  if (patrolToggle.value !== "on") return;
  if (!filteredIncidents.length) return;
  let i = 0;
  patrolTimer = window.setInterval(() => {
    const incident = filteredIncidents[i % filteredIncidents.length];
    focusIncidentOnMap(incident.id);
    renderProcedures(incident);
    i += 1;
  }, 2600);
}

function rerenderThreatView() {
  filteredIncidents = incidents.filter(passesFilter);
  renderKpis(filteredIncidents);
  renderMap(filteredIncidents);
  renderFeed(filteredIncidents);
  renderIncidents(filteredIncidents);
  if (!filteredIncidents.length) renderProcedures(null);
  startPatrol();
}

async function loadThreatData() {
  const events = await listSecurityEvents();
  incidents = buildThreatMap(events).sort((a, b) => b.risk - a.risk || b.createdAt - a.createdAt);
  rerenderThreatView();
  renderLatestReport();
}

function stopSimulation() {
  if (simulationTimer) {
    window.clearInterval(simulationTimer);
    simulationTimer = null;
  }
}

function simulateAttackWave() {
  stopSimulation();
  const wave = filteredIncidents.slice(0, 8);
  if (!wave.length) {
    showToast("info", "No incidents available for simulation.");
    return;
  }
  let i = 0;
  const intensity = Number(intensityInput.value || 3);
  const interval = Math.max(420, 900 - intensity * 110);
  showToast("info", "Attack wave simulation started.");
  simulationTimer = window.setInterval(() => {
    const incident = wave[i % wave.length];
    focusIncidentOnMap(incident.id);
    renderProcedures(incident);
    i += 1;
    if (i >= wave.length * 2) {
      stopSimulation();
      showToast("success", "Attack wave simulation complete.");
    }
  }, interval);
}

function applyIntensityLevel() {
  const level = Number(intensityInput.value || 3);
  intensityLabel.textContent = `Level ${level}`;
  const speed = Math.max(0.75, 2.3 - level * 0.3);
  document.documentElement.style.setProperty("--lane-speed", `${speed.toFixed(2)}s`);
}

function runQuickAction(action) {
  if (action === "mfa") {
    showToast("success", "MFA challenge forced for high-risk actors.");
    renderProcedures({
      attackType: "Privilege Escalation Attempt",
      actorEmail: "high-risk actors",
      risk: 78,
      isBlocked: false
    });
    return;
  }
  if (action === "quarantine") {
    showToast("success", "Quarantine policy applied to selected actor range.");
    renderProcedures({
      attackType: "Brute Force / Credential Attack",
      actorEmail: "suspicious segment",
      risk: 88,
      isBlocked: true
    });
    return;
  }
  if (action === "lock_roles") {
    showToast("success", "Role change guard activated for 15 minutes.");
    renderProcedures({
      attackType: "Privilege Escalation Attempt",
      actorEmail: "role management endpoints",
      risk: 84,
      isBlocked: false
    });
  }
}

runAiBtn.addEventListener("click", async () => {
  const events = await listSecurityEvents();
  const report = await runAIDefense(events, {
    uid: user?.uid || "",
    email: user?.email || "",
    role: role || ""
  });
  showToast("success", `AI defense finished. ${report.newlyBlocked} new actor(s) blocked.`);
  await loadThreatData();
});

simulateBtn.addEventListener("click", simulateAttackWave);

toggleLanesBtn.addEventListener("click", () => {
  lanesEnabled = !lanesEnabled;
  document.body.classList.toggle("lanes-paused", !lanesEnabled);
  toggleLanesBtn.textContent = lanesEnabled ? "Pause Lanes" : "Resume Lanes";
  rerenderThreatView();
});

searchInput.addEventListener("input", rerenderThreatView);
riskFilter.addEventListener("change", rerenderThreatView);
statusFilter.addEventListener("change", rerenderThreatView);
intensityInput.addEventListener("input", applyIntensityLevel);
patrolToggle.addEventListener("change", startPatrol);
quickActionButtons.forEach((btn) => {
  btn.addEventListener("click", () => runQuickAction(btn.dataset.quickAction));
});

window.addEventListener("load", async () => {
  if (!navigator?.geolocation) return;
  try {
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          showToast(
            "info",
            `Location detected: ${Number(pos.coords.latitude).toFixed(5)}, ${Number(pos.coords.longitude).toFixed(5)}`
          );
          resolve(true);
        },
        () => resolve(false),
        { enableHighAccuracy: false, timeout: 2500, maximumAge: 120000 }
      );
    });
  } catch (_) {
    // ignore geolocation prompt issues
  }
});

exportBtn.addEventListener("click", () => {
  const reports = listAIReports();
  const latest = reports[0];
  if (!latest) {
    showToast("info", "No AI report available yet.");
    return;
  }
  const lines = [
    `Generated: ${new Date(latest.generatedAt).toLocaleString()}`,
    `Total incidents: ${latest.totalIncidents}`,
    `High risk: ${latest.highRiskIncidents}`,
    `Blocked actors: ${latest.blockedActors}`,
    `Newly blocked: ${latest.newlyBlocked}`,
    "",
    latest.summary,
    "",
    ...(latest.details || [])
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `security-ai-report-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

applyIntensityLevel();
loadThreatData();
renderProcedures(null);

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

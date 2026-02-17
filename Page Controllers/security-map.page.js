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

const runAiBtn = document.getElementById("run-ai-defense-btn");
const exportBtn = document.getElementById("export-ai-report-btn");
const attemptsEl = document.getElementById("threat-attempts");
const highRiskEl = document.getElementById("threat-high-risk");
const blockedEl = document.getElementById("threat-blocked");
const confidenceEl = document.getElementById("threat-confidence");
const mapCountEl = document.getElementById("map-incidents-count");
const reportBoxEl = document.getElementById("ai-report-box");
const incidentListEl = document.getElementById("incident-list");

let map;
let markerLayer;
let incidents = [];
const markersByIncidentId = new Map();

function getMarkerColor(incident) {
  if (incident.isBlocked) return "#ef4444";
  if (incident.risk >= 75) return "#f97316";
  if (incident.risk >= 50) return "#eab308";
  return "#3b82f6";
}

function ensureMap() {
  if (map) return;
  map = window.L.map("threat-map", { zoomControl: true }).setView([20, 0], 2);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  markerLayer = window.L.layerGroup().addTo(map);
}

function renderMap(items) {
  ensureMap();
  markerLayer.clearLayers();
  markersByIncidentId.clear();
  if (!items.length) return;

  const bounds = [];
  items.forEach((incident) => {
    const color = getMarkerColor(incident);
    const marker = window.L.circleMarker(incident.coords, {
      radius: Math.max(6, Math.min(13, Math.round(incident.risk / 10))),
      color,
      fillColor: color,
      fillOpacity: 0.55,
      weight: 2
    });
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
    bounds.push(incident.coords);
  });

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

function renderIncidents(items) {
  incidentListEl.innerHTML = items
    .slice(0, 30)
    .map(
      (incident) => `
        <article class="incident-item ${incident.isBlocked ? "is-blocked" : ""}">
          <div class="incident-head">
            <strong>${incident.attackType}</strong>
            <div class="incident-meta">
              <span class="badge">${incident.severity}</span>
              <span class="incident-risk">${incident.risk}</span>
            </div>
          </div>
          <div class="text-muted">${incident.actorEmail || incident.actor}</div>
          <div class="text-muted">${incident.timeLabel}</div>
          <div class="text-muted">Coords: ${incident.coords[0].toFixed(5)}, ${incident.coords[1].toFixed(5)} (${incident.coordsSource})</div>
          <div>${incident.message || incident.explanation}</div>
          <div class="incident-actions">
            <button class="btn btn-ghost btn-xs" data-action="focus-map" data-id="${incident.id}">Show on Map</button>
          </div>
          ${incident.isBlocked ? `<span class="badge">Blocked by AI</span>` : ""}
        </article>
      `
    )
    .join("");

  incidentListEl.querySelectorAll('button[data-action="focus-map"]').forEach((button) => {
    button.addEventListener("click", () => {
      focusIncidentOnMap(button.dataset.id);
    });
  });
}

function renderKpis(items) {
  const highRisk = items.filter((item) => item.risk >= 70).length;
  const blockedCount = items.filter((item) => item.isBlocked).length;
  const confidence = items.length ? Math.min(99, Math.round((highRisk / items.length) * 65 + 30)) : 0;

  attemptsEl.textContent = String(items.length);
  highRiskEl.textContent = String(highRisk);
  blockedEl.textContent = String(Math.max(blockedCount, countBlockedActors()));
  confidenceEl.textContent = `${confidence}%`;
  mapCountEl.textContent = String(items.length);
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

async function loadThreatData() {
  const events = await listSecurityEvents();
  incidents = buildThreatMap(events).sort((a, b) => b.risk - a.risk || b.createdAt - a.createdAt);
  renderKpis(incidents);
  renderMap(incidents);
  renderIncidents(incidents);
  renderLatestReport();
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

window.addEventListener("load", async () => {
  if (!navigator?.geolocation) return;
  try {
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
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

loadThreatData();

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

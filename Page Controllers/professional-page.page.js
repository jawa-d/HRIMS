import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { buildPageData, PROFESSIONAL_PAGES } from "./professional-catalog.js";

if (!enforceAuth("workspace")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("workspace");

const params = new URLSearchParams(window.location.search);
const key = params.get("view") || "my_requests";
const data = buildPageData(key);

const titleEl = document.getElementById("pro-page-title");
const subtitleEl = document.getElementById("pro-page-subtitle");
const kpiEl = document.getElementById("pro-kpis");
const highlightsEl = document.getElementById("pro-highlights");
const activityEl = document.getElementById("pro-activities");
const tableBodyEl = document.getElementById("pro-table-body");
const navEl = document.getElementById("pro-page-nav");
const searchEl = document.getElementById("pro-table-search");

titleEl.textContent = data.title;
subtitleEl.textContent = data.desc;

kpiEl.innerHTML = data.kpis
  .map(
    (kpi) => `
    <div class="pro-kpi">
      <div class="text-muted">${kpi.label}</div>
      <div class="pro-kpi-value">${kpi.value}</div>
    </div>
  `
  )
  .join("");

highlightsEl.innerHTML = data.highlights
  .map((line) => `<li class="pro-list-item"><strong>Insight</strong><span class="text-muted">${line}</span></li>`)
  .join("");

activityEl.innerHTML = data.activities
  .map(
    (item) => `
      <div class="pro-note">
        <strong>${item.title}</strong>
        <div class="text-muted">${item.subtitle}</div>
      </div>
    `
  )
  .join("");

function renderTableRows(query = "") {
  const q = query.trim().toLowerCase();
  const rows = data.table.filter((row) => {
    if (!q) return true;
    return `${row.name} ${row.owner} ${row.status} ${row.updated}`.toLowerCase().includes(q);
  });
  tableBodyEl.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.name}</td>
        <td>${row.owner}</td>
        <td><span class="badge">${row.status}</span></td>
        <td>${row.updated}</td>
      </tr>
    `
    )
    .join("");
}

navEl.innerHTML = PROFESSIONAL_PAGES.map((item) => {
  const active = item.key === key ? "btn-primary" : "btn-outline";
  return `<a class="btn ${active}" href="professional-page.html?view=${encodeURIComponent(item.key)}">${item.title}</a>`;
}).join("");

searchEl.addEventListener("input", () => renderTableRows(searchEl.value));
renderTableRows();

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

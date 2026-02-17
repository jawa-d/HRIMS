import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { PROFESSIONAL_PAGES } from "./professional-catalog.js";

if (!enforceAuth("workspace")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("workspace");

const grid = document.getElementById("workspace-grid");
const searchInput = document.getElementById("workspace-search");
const countEl = document.getElementById("workspace-count");

function render(list) {
  countEl.textContent = `${list.length} pages`;
  if (!list.length) {
    grid.innerHTML = `<div class="card workspace-empty"><div class="text-muted">No pages match your search.</div></div>`;
    return;
  }
  grid.innerHTML = list
    .map(
      (item) => `
      <article class="workspace-card">
        <div class="workspace-card-head">
          <h3 class="section-title">${item.title}</h3>
          <span class="workspace-chip">${item.area}</span>
        </div>
        <p class="text-muted">${item.desc}</p>
        <a class="btn btn-outline workspace-link" href="professional-page.html?view=${encodeURIComponent(item.key)}">Open Page</a>
      </article>
    `
    )
    .join("");
}

function filterCards() {
  const query = (searchInput.value || "").trim().toLowerCase();
  const filtered = PROFESSIONAL_PAGES.filter((item) => {
    if (!query) return true;
    return `${item.title} ${item.area} ${item.desc}`.toLowerCase().includes(query);
  });
  render(filtered);
}

searchInput.addEventListener("input", filterCards);
render(PROFESSIONAL_PAGES);

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

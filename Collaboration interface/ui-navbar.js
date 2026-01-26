import { t, toggleLanguage, toggleTheme, translateDom, getLanguage, getTheme } from "../Languages/i18n.js";
import { ROLE_LABELS, APP_NAME } from "../app.config.js";
import { logout } from "../Aman/auth.js";
import { getUnreadCount, watchUnreadCount } from "../Services/notifications.service.js";

export function renderNavbar({ user, role }) {
  const root = document.getElementById("navbar-root");
  if (!root) return;

  root.innerHTML = `
    <nav class="navbar">
      <div class="navbar-left">
        <button class="navbar-icon-btn" id="sidebar-toggle" aria-label="Toggle sidebar">
          <i data-lucide="menu"></i>
        </button>
        <div class="navbar-brand" data-i18n="app.name">${APP_NAME}</div>
        <div class="navbar-search">
          <input class="input" type="search" data-i18n-placeholder="nav.search" placeholder="${t("nav.search")}" />
        </div>
      </div>
      <div class="navbar-actions">
        <button class="navbar-icon-btn" id="notifications-btn" aria-label="Notifications">
          <i data-lucide="bell"></i>
          <span class="notification-count" id="notification-count">0</span>
        </button>
        <button class="navbar-icon-btn" id="lang-toggle" aria-label="Language toggle">
          <span id="lang-label">${getLanguage() === "ar" ? "EN" : "AR"}</span>
        </button>
        <button class="navbar-icon-btn" id="theme-toggle" aria-label="Theme toggle">
          <i data-lucide="${getTheme() === "dark" ? "sun" : "moon"}"></i>
        </button>
        <div class="navbar-user">
          <strong>${user?.name || "User"}</strong>
          <span>${ROLE_LABELS[role] || role}</span>
        </div>
        <button class="btn btn-outline" id="logout-btn" data-i18n="nav.logout">${t("nav.logout")}</button>
      </div>
    </nav>
  `;

  translateDom(root);

  const countEl = root.querySelector("#notification-count");
  const updateCount = async () => {
    const count = await getUnreadCount();
    countEl.textContent = String(count);
    countEl.style.display = count > 0 ? "grid" : "none";
  };

  updateCount();
  watchUnreadCount(updateCount);

  root.querySelector("#lang-toggle").addEventListener("click", () => {
    toggleLanguage();
    root.querySelector("#lang-label").textContent = getLanguage() === "ar" ? "EN" : "AR";
    translateDom();
  });

  root.querySelector("#theme-toggle").addEventListener("click", () => {
    toggleTheme();
    const icon = root.querySelector("#theme-toggle i");
    icon.setAttribute("data-lucide", getTheme() === "dark" ? "sun" : "moon");
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  root.querySelector("#logout-btn").addEventListener("click", () => logout());

  root.querySelector("#sidebar-toggle").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

import { t, toggleLanguage, toggleTheme, translateDom, getLanguage, getTheme } from "../Languages/i18n.js";
import { ROLE_LABELS, APP_NAME } from "../app.config.js";
import { logout } from "../Aman/auth.js";
import {
  getUnreadCount,
  watchUnreadCount,
  listNotifications,
  markNotificationRead,
  watchNotifications
} from "../Services/notifications.service.js";

export function renderNavbar({ user, role }) {
  const root = document.getElementById("navbar-root");
  if (!root) return;

  root.innerHTML = `
    <nav class="navbar">
      <div class="navbar-left">
        <button class="navbar-icon-btn" id="sidebar-toggle" aria-label="Toggle sidebar">
          <i data-lucide="menu"></i>
        </button>
        <div class="navbar-brand">
          <img src="../HRMS%20Html/assets/logo.jpg" alt="${APP_NAME} logo" class="navbar-logo" />
          <span data-i18n="app.name">${APP_NAME}</span>
        </div>
        <div class="navbar-search">
          <input class="input" id="global-search" type="search" data-i18n-placeholder="nav.search" placeholder="${t("nav.search")}" />
        </div>
      </div>
      <div class="navbar-actions">
        <div class="navbar-notifications" id="navbar-notifications">
          <button class="navbar-icon-btn" id="notifications-btn" aria-label="Notifications">
            <i data-lucide="bell"></i>
            <span class="notification-count" id="notification-count">0</span>
          </button>
          <div class="notifications-dropdown" id="notifications-dropdown" aria-hidden="true">
            <div class="notifications-header">
              <strong data-i18n="nav.notifications">${t("nav.notifications")}</strong>
              <span class="text-muted" id="notifications-count-label"></span>
            </div>
            <div class="notifications-list" id="notifications-list"></div>
          </div>
        </div>
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
  const dropdown = root.querySelector("#notifications-dropdown");
  const listEl = root.querySelector("#notifications-list");
  const countLabel = root.querySelector("#notifications-count-label");
  let dropdownOpen = false;
  let notificationItems = [];

  const renderNotifications = (items) => {
    notificationItems = items;
    if (countLabel) {
      countLabel.textContent = items.length ? `${items.length}` : "";
    }
    if (!listEl) return;
    if (!items.length) {
      listEl.innerHTML = `<div class="empty-state">${t("notifications.empty")}</div>`;
      return;
    }
    listEl.innerHTML = items
      .map(
        (item) => `
        <div class="notification-item ${item.isRead ? "is-read" : ""}">
          <div>
            <strong>${item.title || t("nav.notifications")}</strong>
            <div class="text-muted">${item.body || ""}</div>
          </div>
          <button class="btn btn-ghost btn-xs" data-id="${item.id}">
            ${t("notifications.mark_read")}
          </button>
        </div>
      `
      )
      .join("");

    listEl.querySelectorAll("button[data-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await markNotificationRead(button.dataset.id);
        button.closest(".notification-item")?.classList.add("is-read");
      });
    });
  };
  const updateCount = async () => {
    const count = await getUnreadCount();
    countEl.textContent = String(count);
    countEl.style.display = count > 0 ? "grid" : "none";
  };

  updateCount();
  watchUnreadCount(updateCount);

  const openNotifications = async () => {
    dropdownOpen = !dropdownOpen;
    if (dropdown) {
      dropdown.classList.toggle("open", dropdownOpen);
      dropdown.setAttribute("aria-hidden", dropdownOpen ? "false" : "true");
    }
    if (dropdownOpen && !notificationItems.length) {
      const items = await listNotifications();
      renderNotifications(items);
    }
  };

  watchNotifications((items) => {
    renderNotifications(items);
  });

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

  root.querySelector("#notifications-btn").addEventListener("click", openNotifications);

  document.addEventListener("click", (event) => {
    if (!dropdownOpen) return;
    const wrapper = root.querySelector("#navbar-notifications");
    if (!wrapper || wrapper.contains(event.target)) return;
    dropdownOpen = false;
    dropdown?.classList.remove("open");
    dropdown?.setAttribute("aria-hidden", "true");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !dropdownOpen) return;
    dropdownOpen = false;
    dropdown?.classList.remove("open");
    dropdown?.setAttribute("aria-hidden", "true");
  });

  root.querySelector("#sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth <= 1100) {
      document.body.classList.toggle("sidebar-open");
      document.body.classList.remove("sidebar-collapsed");
      return;
    }
    document.body.classList.toggle("sidebar-collapsed");
  });

  const globalSearch = root.querySelector("#global-search");
  if (globalSearch) {
    let searchTimer;
    globalSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const value = globalSearch.value.trim();
      searchTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("global-search", { detail: value }));
      }, 120);
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

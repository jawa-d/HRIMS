import { t, toggleLanguage, toggleTheme, translateDom, getLanguage, getTheme } from "../Languages/i18n.js";
import { ROLE_LABELS, APP_NAME } from "../app.config.js";
import { logout } from "../Aman/auth.js";
import { showToast } from "./ui-toast.js";
import { initNavigationEnhancements } from "./ui-navigation.js";
import { trackActivity, listRecentActivities, formatActivityTime } from "../Services/activity.service.js";
import { searchGlobal } from "../Services/global-search.service.js";
import {
  getUnreadCount,
  watchUnreadCount,
  listNotifications,
  markNotificationRead,
  watchNotifications
} from "../Services/notifications.service.js";

export function renderNavbar({ user, role }) {
  initNavigationEnhancements();

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
        <div class="navbar-search" id="navbar-search-wrap">
          <input class="input" id="global-search" type="search" data-i18n-placeholder="nav.search" placeholder="${t("nav.search")}" />
          <div class="global-search-results" id="global-search-results" aria-hidden="true"></div>
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
    <div class="recent-activity-bar" id="recent-activity-bar"></div>
  `;

  translateDom(root);

  const countEl = root.querySelector("#notification-count");
  const dropdown = root.querySelector("#notifications-dropdown");
  const listEl = root.querySelector("#notifications-list");
  const countLabel = root.querySelector("#notifications-count-label");
  const searchResultsEl = root.querySelector("#global-search-results");
  const activityBarEl = root.querySelector("#recent-activity-bar");
  const sidebarToggleBtn = root.querySelector("#sidebar-toggle");
  let dropdownOpen = false;
  let notificationItems = [];
  let searchResults = [];

  const renderNotifications = (items) => {
    notificationItems = items;
    if (countLabel) countLabel.textContent = items.length ? `${items.length}` : "";
    if (!listEl) return;
    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty-state">${t("notifications.empty")}</div>
        <a class="btn btn-ghost btn-xs" href="notifications-center.html">Open Notification Center</a>
      `;
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
      .join("") + `<a class="btn btn-ghost btn-xs" href="notifications-center.html">Open Notification Center</a>`;

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

  const renderRecentActivityBar = () => {
    if (!activityBarEl) return;
    const items = listRecentActivities(6);
    if (!items.length) {
      activityBarEl.innerHTML = `<span class="activity-pill is-empty">No recent activity yet</span>`;
      return;
    }
    const pills = items
      .map(
        (item) => `
        <a class="activity-pill" href="${item.href || "#"}" title="${item.subtitle || ""}">
          <span>${item.title}</span>
          <small>${formatActivityTime(item.at)}</small>
        </a>
      `
      )
      .join("");
    activityBarEl.innerHTML = `
      <div class="recent-activity-marquee">
        <div class="recent-activity-track">${pills}</div>
        <div class="recent-activity-track" aria-hidden="true">${pills}</div>
      </div>
    `;
  };

  const trackPageVisit = () => {
    const pageKey = document.body?.dataset?.page;
    if (!pageKey) return;
    const guardKey = `__page_activity_${pageKey}`;
    if (window[guardKey]) return;
    window[guardKey] = true;
    const navLabel = t(`nav.${pageKey}`);
    const pageLabel = navLabel !== `nav.${pageKey}` ? navLabel : pageKey;
    trackActivity({
      title: `Visited ${pageLabel}`,
      subtitle: window.location.pathname.split("/").pop() || "",
      pageKey,
      href: window.location.pathname.split("/").pop() || ""
    });
  };

  const showWelcomeToast = () => {
    const pageKey = document.body?.dataset?.page;
    if (!pageKey) return;
    const welcomeGuardKey = `__welcome_toast_${pageKey}`;
    if (window[welcomeGuardKey]) return;
    window[welcomeGuardKey] = true;

    const navLabel = t(`nav.${pageKey}`);
    const pageLabel = navLabel !== `nav.${pageKey}` ? navLabel : t(`${pageKey}.title`);
    const firstName = (user?.name || "").trim().split(/\s+/)[0];
    const displayName = firstName || "there";

    setTimeout(() => {
      showToast("info", `Glad to have you on the ${pageLabel} page.`, `Welcome ${displayName}`, {
        trackActivity: false
      });
    }, 280);
  };

  const renderGlobalResults = (items) => {
    if (!searchResultsEl) return;
    searchResults = items;
    if (!items.length) {
      searchResultsEl.classList.remove("open");
      searchResultsEl.setAttribute("aria-hidden", "true");
      searchResultsEl.innerHTML = "";
      return;
    }
    searchResultsEl.innerHTML = items
      .map(
        (item) => `
        <a class="global-result-item" href="${item.href}">
          <strong>${item.title}</strong>
          <span>${item.subtitle || item.type}</span>
        </a>
      `
      )
      .join("");
    searchResultsEl.classList.add("open");
    searchResultsEl.setAttribute("aria-hidden", "false");
  };

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

  updateCount();
  watchUnreadCount(updateCount);
  watchNotifications((items) => renderNotifications(items));

  root.querySelector("#lang-toggle").addEventListener("click", () => {
    toggleLanguage();
    root.querySelector("#lang-label").textContent = getLanguage() === "ar" ? "EN" : "AR";
    translateDom();
    renderRecentActivityBar();
  });

  root.querySelector("#theme-toggle").addEventListener("click", () => {
    toggleTheme();
    const icon = root.querySelector("#theme-toggle [data-lucide], #theme-toggle i, #theme-toggle svg");
    if (icon) icon.setAttribute("data-lucide", getTheme() === "dark" ? "sun" : "moon");
    if (window.lucide) window.lucide.createIcons();
  });

  root.querySelector("#logout-btn").addEventListener("click", () => logout());
  root.querySelector("#notifications-btn").addEventListener("click", openNotifications);

  document.addEventListener("click", (event) => {
    if (dropdownOpen) {
      const wrapper = root.querySelector("#navbar-notifications");
      if (wrapper && !wrapper.contains(event.target)) {
        dropdownOpen = false;
        dropdown?.classList.remove("open");
        dropdown?.setAttribute("aria-hidden", "true");
      }
    }

    const searchWrap = root.querySelector("#navbar-search-wrap");
    if (!searchWrap || searchWrap.contains(event.target)) return;
    renderGlobalResults([]);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dropdownOpen) {
      dropdownOpen = false;
      dropdown?.classList.remove("open");
      dropdown?.setAttribute("aria-hidden", "true");
    }
  });

  const syncSidebarToggleState = () => {
    if (!sidebarToggleBtn) return;
    const isMobile = window.innerWidth <= 1100;
    const isOpen = isMobile
      ? document.body.classList.contains("sidebar-open")
      : !document.body.classList.contains("sidebar-collapsed");
    sidebarToggleBtn.classList.toggle("is-active", isOpen);
    sidebarToggleBtn.setAttribute("aria-expanded", String(isOpen));
    const icon = sidebarToggleBtn.querySelector("i, svg");
    if (icon) icon.setAttribute("data-lucide", isOpen ? "x" : "menu");
    if (window.lucide) window.lucide.createIcons();
  };

  sidebarToggleBtn?.addEventListener("click", () => {
    if (window.innerWidth <= 1100) {
      document.body.classList.toggle("sidebar-open");
      document.body.classList.remove("sidebar-collapsed");
      syncSidebarToggleState();
      return;
    }
    document.body.classList.toggle("sidebar-collapsed");
    syncSidebarToggleState();
  });

  window.addEventListener("resize", syncSidebarToggleState);

  if (window.__hrmsSidebarObserver) {
    window.__hrmsSidebarObserver.disconnect();
  }
  const sidebarObserver = new MutationObserver(syncSidebarToggleState);
  sidebarObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.__hrmsSidebarObserver = sidebarObserver;

  const globalSearch = root.querySelector("#global-search");
  if (globalSearch) {
    let filterTimer;
    let searchTimer;

    globalSearch.addEventListener("input", async () => {
      clearTimeout(filterTimer);
      clearTimeout(searchTimer);
      const value = globalSearch.value.trim();

      filterTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("global-search", { detail: value }));
      }, 120);

      if (!value) {
        renderGlobalResults([]);
        return;
      }

      if (searchResultsEl) {
        searchResultsEl.innerHTML = `<div class="global-result-item muted">Searching...</div>`;
        searchResultsEl.classList.add("open");
        searchResultsEl.setAttribute("aria-hidden", "false");
      }

      searchTimer = setTimeout(async () => {
        const results = await searchGlobal(value, 7);
        renderGlobalResults(results);
      }, 200);
    });

    globalSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && searchResults.length) {
        event.preventDefault();
        window.location.href = searchResults[0].href;
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();
  syncSidebarToggleState();

  trackPageVisit();
  renderRecentActivityBar();
  showWelcomeToast();
}

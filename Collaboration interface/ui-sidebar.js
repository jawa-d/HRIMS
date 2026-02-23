import { MENU_ITEMS, APP_NAME } from "../app.config.js";
import { t, translateDom } from "../Languages/i18n.js";
import { getRole, getUserProfile, getAllowedPages } from "../Aman/guard.js";

const SECTION_DEFS = [
  { key: "main", en: "Main", ar: "\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629", items: ["dashboard", "profile"] },
  { key: "people", en: "People Ops", ar: "\u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0627\u0644\u0628\u0634\u0631\u064a\u0629", items: ["employees", "my_leaves", "leaves", "attendance", "timeoff", "payroll", "assets", "tickets", "announcements"] },
  { key: "org", en: "Organization", ar: "\u0627\u0644\u062a\u0646\u0638\u064a\u0645", items: ["orgchart", "departments", "positions", "reports"] },
  { key: "admin", en: "Administration", ar: "\u0627\u0644\u0625\u062f\u0627\u0631\u0629", items: ["notifications_center", "security_center", "security_map", "system_health", "page_admin", "settings"] }
];

let lastRole = null;
let lastItemsKey = null;
let lastActiveKey = null;
let hasRendered = false;
let sidebarEnhancementsPromise = null;

function isArabic() {
  const lang = document.documentElement.getAttribute("lang") || "en";
  return lang.startsWith("ar");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function loadStyle(href) {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function ensureSidebarEnhancements() {
  if (sidebarEnhancementsPromise) return sidebarEnhancementsPromise;

  sidebarEnhancementsPromise = Promise.all([
    loadStyle("https://cdn.jsdelivr.net/npm/simplebar@6.2.7/dist/simplebar.min.css"),
    loadScript("https://cdn.jsdelivr.net/npm/simplebar@6.2.7/dist/simplebar.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js")
  ]).catch(() => null);

  return sidebarEnhancementsPromise;
}

function setupSimpleBar(root) {
  const nav = root.querySelector(".sidebar-nav");
  if (!nav || !window.SimpleBar) return;
  if (nav.dataset.simplebarReady === "true") return;

  nav.dataset.simplebarReady = "true";
  new window.SimpleBar(nav, { autoHide: false });
}

function animateSidebar(root, activeKey) {
  if (!window.anime) return;

  const dir = isArabic() ? 10 : -10;
  const links = Array.from(root.querySelectorAll(".sidebar-link"));
  const sections = Array.from(root.querySelectorAll(".sidebar-section"));
  const panel = root.querySelector(".sidebar-panel");
  const active = root.querySelector(`.sidebar-link[data-key="${activeKey}"]`);

  window.anime.remove(links);
  window.anime.remove(sections);
  if (panel) window.anime.remove(panel);
  if (active) window.anime.remove(active);

  if (panel) {
    window.anime({
      targets: panel,
      translateX: [dir * 1.4, 0],
      opacity: [0, 1],
      duration: 420,
      easing: "easeOutCubic"
    });
  }

  window.anime({
    targets: sections,
    translateY: [8, 0],
    opacity: [0, 1],
    duration: 360,
    delay: window.anime.stagger(38),
    easing: "easeOutQuad"
  });

  window.anime({
    targets: links,
    translateX: [dir, 0],
    opacity: [0, 1],
    duration: 460,
    delay: window.anime.stagger(20),
    easing: "easeOutCubic"
  });

  if (active) {
    window.anime({
      targets: active,
      scale: [0.97, 1],
      duration: 340,
      easing: "easeOutBack"
    });
  }
}

function enhanceSidebar(root, activeKey) {
  ensureSidebarEnhancements().then(() => {
    setupSimpleBar(root);
    animateSidebar(root, activeKey);
  });
}

function getSectionLabel(section) {
  return isArabic() ? section.ar : section.en;
}

function buildSidebarSections(items, activeKey) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const consumed = new Set();
  let animationIndex = 0;

  const sections = SECTION_DEFS.map((section, sectionIndex) => {
    const sectionItems = section.items.map((key) => byKey.get(key)).filter(Boolean);
    if (!sectionItems.length) return "";
    sectionItems.forEach((item) => consumed.add(item.key));

    const hasActive = sectionItems.some((item) => item.key === activeKey);
    const openAttr = hasActive || sectionIndex < 2 ? "open" : "";

    const links = sectionItems
      .map((item) => {
        const delayIndex = Math.min(animationIndex, 20);
        const markup = `
          <a class="sidebar-link ${activeKey === item.key ? "active" : ""}" data-key="${item.key}" href="${item.href}" style="--i:${delayIndex}">
            <i data-lucide="${item.icon}"></i>
            <span data-i18n="${item.labelKey}">${t(item.labelKey)}</span>
          </a>
        `;
        animationIndex += 1;
        return markup;
      })
      .join("");

    const sectionCount = sectionItems.length;
    return `
      <details class="sidebar-section" ${openAttr}>
        <summary class="sidebar-section-title">
          <span>${getSectionLabel(section)}</span>
          <span class="sidebar-section-count">${sectionCount}</span>
        </summary>
        <div class="sidebar-section-items">${links}</div>
      </details>
    `;
  }).join("");

  const rest = items.filter((item) => !consumed.has(item.key));
  if (!rest.length) return sections;

  const restLinks = rest
    .map((item) => {
      const delayIndex = Math.min(animationIndex, 20);
      const markup = `
        <a class="sidebar-link ${activeKey === item.key ? "active" : ""}" data-key="${item.key}" href="${item.href}" style="--i:${delayIndex}">
          <i data-lucide="${item.icon}"></i>
          <span data-i18n="${item.labelKey}">${t(item.labelKey)}</span>
        </a>
      `;
      animationIndex += 1;
      return markup;
    })
    .join("");

  const moreLabel = isArabic() ? "\u0623\u062e\u0631\u0649" : "More";
  return `${sections}
    <details class="sidebar-section">
      <summary class="sidebar-section-title">
        <span>${moreLabel}</span>
        <span class="sidebar-section-count">${rest.length}</span>
      </summary>
      <div class="sidebar-section-items">${restLinks}</div>
    </details>
  `;
}

export function renderSidebar(activeKey) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;

  const role = getRole();
  const profile = getUserProfile();
  const roleLabel = String(role || "employee").replace(/_/g, " ");
  const allowed = getAllowedPages(role, profile);
  const items = MENU_ITEMS.filter((item) => allowed.includes(item.key));
  const itemsKey = items.map((item) => item.key).join("|");

  if (hasRendered && lastRole === role && lastItemsKey === itemsKey) {
    if (lastActiveKey !== activeKey) {
      const links = root.querySelectorAll(".sidebar-link");
      links.forEach((link) => {
        const isActive = link.dataset.key === activeKey;
        link.classList.toggle("active", isActive);
      });

      const sections = root.querySelectorAll(".sidebar-section");
      sections.forEach((section) => {
        const hasActive = section.querySelector(`.sidebar-link[data-key="${activeKey}"]`);
        if (hasActive) section.setAttribute("open", "");
      });

      enhanceSidebar(root, activeKey);
      lastActiveKey = activeKey;
    }
    return;
  }

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-panel">
        <div class="sidebar-head">
          <div class="sidebar-brand">
            <div class="sidebar-logo">${APP_NAME}</div>
            <div class="sidebar-role">${roleLabel}</div>
          </div>
          <button class="sidebar-close-btn" id="sidebar-close-btn" aria-label="Close sidebar">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="sidebar-panel-title">
          <i data-lucide="sparkles"></i>
          <span>${isArabic() ? "\u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "Menu"}</span>
        </div>
        <nav class="sidebar-nav">
          ${buildSidebarSections(items, activeKey)}
        </nav>
        <div class="sidebar-footer">Developed by Jawad Kadhim © 2025</div>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;

  translateDom(root);

  const overlay = root.querySelector("#sidebar-overlay");
  if (overlay) {
    overlay.addEventListener("click", () => {
      document.body.classList.remove("sidebar-open");
    });
  }

  const closeBtn = root.querySelector("#sidebar-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.body.classList.remove("sidebar-open");
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  enhanceSidebar(root, activeKey);

  lastRole = role;
  lastItemsKey = itemsKey;
  lastActiveKey = activeKey;
  hasRendered = true;
}

import { MENU_ITEMS } from "../app.config.js";
import { t, translateDom } from "../Languages/i18n.js";
import { getRole, getUserProfile, getAllowedPages } from "../Aman/guard.js";

const SECTION_DEFS = [
  { key: "main", en: "Main", ar: "\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629", items: ["dashboard", "profile"] },
  { key: "people", en: "People Ops", ar: "\u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0627\u0644\u0628\u0634\u0631\u064a\u0629", items: ["employees", "my_leaves", "leaves", "attendance", "timeoff", "payroll", "assets", "tickets", "announcements"] },
  { key: "org", en: "Organization", ar: "\u0627\u0644\u062a\u0646\u0638\u064a\u0645", items: ["orgchart", "departments", "positions", "reports"] },
  { key: "admin", en: "Administration", ar: "\u0627\u0644\u0625\u062f\u0627\u0631\u0629", items: ["notifications_center", "security_center", "security_map", "system_health", "page_admin", "secure_vault", "settings"] }
];

let lastRole = null;
let lastItemsKey = null;
let lastActiveKey = null;
let hasRendered = false;

function isPerformanceMode() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const saveData = Boolean(nav.connection && nav.connection.saveData);
  const bodyOptIn = typeof document !== "undefined" && document.body?.classList.contains("performance-mode");
  return Boolean(prefersReduced || lowCpu || lowMemory || saveData || bodyOptIn);
}

function isArabic() {
  const lang = document.documentElement.getAttribute("lang") || "en";
  return lang.startsWith("ar");
}

function stopAnimations(element) {
  if (!element || typeof element.getAnimations !== "function") return;
  element.getAnimations().forEach((animation) => animation.cancel());
}

function animateElement(element, keyframes, options) {
  if (!element || typeof element.animate !== "function") return;
  stopAnimations(element);
  element.animate(keyframes, {
    fill: "both",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    ...options
  });
}

function animateSidebar(root, activeKey, options = {}) {
  if (typeof Element === "undefined") return;
  if (isPerformanceMode()) return;

  const dir = isArabic() ? 1 : -1;
  const full = options.full !== false;
  const links = Array.from(root.querySelectorAll(".sidebar-link"));
  const sections = Array.from(root.querySelectorAll(".sidebar-section"));
  const counts = Array.from(root.querySelectorAll(".sidebar-section-count"));
  const titles = Array.from(root.querySelectorAll(".sidebar-section-title"));
  const panel = root.querySelector(".sidebar-panel");
  const header = root.querySelector(".sidebar-head");
  const panelTitle = root.querySelector(".sidebar-panel-title");
  const footer = root.querySelector(".sidebar-footer");
  const active = root.querySelector(`.sidebar-link[data-key="${activeKey}"]`);
  const activeIcon = active ? active.querySelector("i") : null;
  const activeLabel = active ? active.querySelector("span") : null;

  if (full) {
    animateElement(panel, [
      { transform: `translateX(${18 * dir}px) scale(0.985)`, opacity: 0 },
      { transform: "translateX(0) scale(1)", opacity: 1 }
    ], { duration: 540, delay: 0 });

    [header, panelTitle].filter(Boolean).forEach((element, index) => {
      animateElement(element, [
        { transform: "translateY(-10px)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 }
      ], { duration: 380, delay: 120 + index * 90 });
    });

    sections.forEach((section, index) => {
      animateElement(section, [
        { transform: "translateY(14px)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 }
      ], { duration: 440, delay: 170 + index * 55 });
    });

    [...titles, ...counts].forEach((element, index) => {
      animateElement(element, [
        { transform: `translateX(${8 * dir}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 }
      ], { duration: 320, delay: 260 + index * 18 });
    });

    links.forEach((link, index) => {
      animateElement(link, [
        { transform: `translateX(${16 * dir}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 }
      ], { duration: 420, delay: 250 + index * 18 });
    });

    animateElement(footer, [
      { transform: "translateY(10px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 }
    ], { duration: 360, delay: 420 });
  }

  animateElement(active, [
    { transform: `translateX(${6 * dir}px) scale(0.975)` },
    { transform: "translateX(0) scale(1)" }
  ], { duration: 460, delay: 0 });

  animateElement(activeIcon, [
    { transform: `rotate(${-10 * dir}deg) scale(0.82)` },
    { transform: "rotate(0deg) scale(1.06)", offset: 0.65 },
    { transform: "rotate(0deg) scale(1)" }
  ], { duration: 560, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });

  animateElement(activeLabel, [
    { letterSpacing: "0em" },
    { letterSpacing: ".02em", offset: 0.5 },
    { letterSpacing: "0em" }
  ], { duration: 520, easing: "ease-out" });
}

function enhanceSidebar(root, activeKey, options) {
  animateSidebar(root, activeKey, options);
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

      enhanceSidebar(root, activeKey, { full: false });
      lastActiveKey = activeKey;
    }
    return;
  }

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-panel">
        <div class="sidebar-head">
          <div class="sidebar-brand">
            <div class="sidebar-logo">${t("app.name")}</div>
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
        <div class="sidebar-footer" data-i18n="sidebar.footer">${t("sidebar.footer")}</div>
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

  enhanceSidebar(root, activeKey, { full: true });

  lastRole = role;
  lastItemsKey = itemsKey;
  lastActiveKey = activeKey;
  hasRendered = true;
}






import { MENU_ITEMS, APP_NAME } from "../app.config.js";
import { t, translateDom } from "../Languages/i18n.js";
import { getRole, getUserProfile, getAllowedPages } from "../Aman/guard.js";

const SECTION_DEFS = [
  { key: "main", en: "Main", ar: "\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629", items: ["dashboard", "profile"] },
  { key: "people", en: "People Ops", ar: "\u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0627\u0644\u0628\u0634\u0631\u064a\u0629", items: ["employees", "employee_360", "my_leaves", "leaves", "attendance", "timeoff", "excel_sheet", "assets", "tickets", "help_desk", "announcements"] },
  { key: "accounting_suite", en: "Accounting Suite", ar: "\u0645\u0646\u0638\u0648\u0645\u0629 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629", items: ["accounting", "payroll", "accounting_flow", "cashbox", "accounting_admin", "advances_report"] },
  { key: "finance", en: "Finance", ar: "\u0627\u0644\u0645\u0627\u0644\u064a\u0629", items: ["official_books", "barcode_export", "insurance_parties", "insurance_docs"] },
  { key: "org", en: "Organization", ar: "\u0627\u0644\u062a\u0646\u0638\u064a\u0645", items: ["orgchart", "departments", "positions", "reports"] },
  { key: "admin", en: "Administration", ar: "\u0627\u0644\u0625\u062f\u0627\u0631\u0629", items: ["notifications_center", "security_center", "security_map", "system_health", "page_admin", "secure_vault", "settings"] }
];

let lastRole = null;
let lastItemsKey = null;
let lastActiveKey = null;
let hasRendered = false;
let gsapLib = null;
let gsapLoadPromise = null;

async function ensureGsap() {
  if (gsapLib) return gsapLib;
  if (!gsapLoadPromise) {
    gsapLoadPromise = import("https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm")
      .then((mod) => {
        gsapLib = mod.gsap || mod.default || null;
        return gsapLib;
      })
      .catch(() => null);
  }
  return gsapLoadPromise;
}

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

    titles.forEach((element, index) => {
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
  positionActiveIndicator(root, activeKey, false);
  void enhanceSidebarWithGsap(root, activeKey, options);
}

function positionActiveIndicator(root, activeKey, animate = true) {
  const indicator = root.querySelector(".sidebar-active-indicator");
  const nav = root.querySelector(".sidebar-nav");
  const active = root.querySelector(`.sidebar-link[data-key="${activeKey}"]`);
  if (!indicator || !nav || !active) return;

  const navRect = nav.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const top = activeRect.top - navRect.top + nav.scrollTop;
  const height = activeRect.height;

  if (!gsapLib || !animate || isPerformanceMode()) {
    indicator.style.opacity = "1";
    indicator.style.transform = `translateY(${Math.round(top)}px)`;
    indicator.style.height = `${Math.round(height)}px`;
    return;
  }

  gsapLib.to(indicator, {
    y: Math.round(top),
    height: Math.max(36, Math.round(height)),
    opacity: 1,
    duration: 0.42,
    ease: "power3.out"
  });
}

function bindSidebarAccordion(root) {
  if (!gsapLib || isPerformanceMode()) return;

  root.querySelectorAll(".sidebar-section").forEach((section) => {
    if (section.dataset.motionBound === "1") return;
    section.dataset.motionBound = "1";

    const summary = section.querySelector(".sidebar-section-title");
    const content = section.querySelector(".sidebar-section-items");
    if (!summary || !content) return;

    if (section.hasAttribute("open")) {
      content.style.height = "auto";
      content.style.opacity = "1";
    } else {
      content.style.height = "0px";
      content.style.opacity = "0";
    }

    summary.addEventListener("click", (event) => {
      event.preventDefault();

      const isOpen = section.hasAttribute("open");
      if (isOpen) {
        const currentHeight = content.scrollHeight;
        content.style.height = `${currentHeight}px`;
        gsapLib.to(content, {
          height: 0,
          opacity: 0,
          duration: 0.32,
          ease: "power2.inOut",
          onComplete: () => {
            section.removeAttribute("open");
          }
        });
        return;
      }

      section.setAttribute("open", "");
      content.style.height = "0px";
      content.style.opacity = "0";
      const targetHeight = content.scrollHeight;
      gsapLib.to(content, {
        height: targetHeight,
        opacity: 1,
        duration: 0.36,
        ease: "power2.out",
        onComplete: () => {
          content.style.height = "auto";
        }
      });
    });
  });
}

function bindSidebarLinkInteractions(root, activeKey) {
  if (!gsapLib || isPerformanceMode()) return;

  const links = Array.from(root.querySelectorAll(".sidebar-link"));
  links.forEach((link) => {
    if (link.dataset.interactiveBound === "1") return;
    link.dataset.interactiveBound = "1";

    link.addEventListener("mouseenter", () => {
      gsapLib.to(link, { x: isArabic() ? -4 : 4, duration: 0.18, ease: "power2.out" });
    });
    link.addEventListener("mouseleave", () => {
      if (link.classList.contains("active")) return;
      gsapLib.to(link, { x: 0, duration: 0.22, ease: "power2.out" });
    });
  });
}

async function enhanceSidebarWithGsap(root, activeKey, options = {}) {
  const gsap = await ensureGsap();
  if (!gsap || isPerformanceMode()) return;

  bindSidebarLinkInteractions(root, activeKey);

  const full = options.full !== false;
  const panel = root.querySelector(".sidebar-panel");
  const title = root.querySelector(".sidebar-panel-title");
  const sections = root.querySelectorAll(".sidebar-section");
  const links = root.querySelectorAll(".sidebar-link");

  if (full) {
    const dir = isArabic() ? 1 : -1;
    gsap.fromTo(panel, { x: 24 * dir, opacity: 0.2 }, { x: 0, opacity: 1, duration: 0.52, ease: "power3.out" });
    gsap.fromTo(title, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out", delay: 0.12 });
    gsap.fromTo(sections, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: "power2.out", delay: 0.15 });
    gsap.fromTo(links, { x: 8 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, stagger: 0.02, ease: "power2.out", delay: 0.2 });
  }

  positionActiveIndicator(root, activeKey, true);
  const nav = root.querySelector(".sidebar-nav");
  if (nav && !nav.dataset.indicatorBound) {
    nav.dataset.indicatorBound = "1";
    nav.addEventListener("scroll", () => positionActiveIndicator(root, lastActiveKey || activeKey, false), { passive: true });
  }
}

function getSectionLabel(section) {
  if (section.key === "main") return isArabic() ? "\u0627\u0644\u0645\u0646\u0635\u0629" : "Platform";
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

    return `
      <section class="sidebar-section">
        <div class="sidebar-section-title">
          <span>${getSectionLabel(section)}</span>
        </div>
        <div class="sidebar-section-items">${links}</div>
      </section>
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
    <section class="sidebar-section">
      <div class="sidebar-section-title">
        <span>${moreLabel}</span>
      </div>
      <div class="sidebar-section-items">${restLinks}</div>
    </section>
  `;
}

export function renderSidebar(activeKey) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;

  const role = getRole();
  const profile = getUserProfile();
  const roleLabel = String(role || "employee").replace(/_/g, " ");
  const userName = String(profile?.name || "shadcn");
  const userEmail = String(profile?.email || "m@example.com");
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "HR";
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

      enhanceSidebar(root, activeKey, { full: false });
      lastActiveKey = activeKey;
    }
    return;
  }

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-panel">
        <div class="sidebar-head">
          <div class="sidebar-brand-card">
            <div class="sidebar-brand-icon">
              <i data-lucide="briefcase-business"></i>
            </div>
            <div class="sidebar-brand">
              <div class="sidebar-logo">${APP_NAME}</div>
              <div class="sidebar-role">${roleLabel}</div>
            </div>
          </div>
          <button class="sidebar-close-btn" id="sidebar-close-btn" aria-label="Close sidebar">
            <i data-lucide="x"></i>
          </button>
      </div>
      <div class="sidebar-panel-title">
        <i data-lucide="panel-left-open"></i>
        <span>${isArabic() ? "\u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "Navigation"}</span>
      </div>
        <nav class="sidebar-nav">
          <div class="sidebar-active-indicator" aria-hidden="true"></div>
          ${buildSidebarSections(items, activeKey)}
        </nav>
        <div class="sidebar-user-card">
          <div class="sidebar-user-avatar">${initials}</div>
          <div class="sidebar-user-meta">
            <strong>${userName}</strong>
            <span>${userEmail}</span>
          </div>
          <button class="sidebar-user-action" aria-label="Profile menu">
            <i data-lucide="chevrons-up-down"></i>
          </button>
        </div>
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

  root.querySelectorAll(".sidebar-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 1100) {
        document.body.classList.remove("sidebar-open");
      }
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  enhanceSidebar(root, activeKey, { full: true });

  lastRole = role;
  lastItemsKey = itemsKey;
  lastActiveKey = activeKey;
  hasRendered = true;
}






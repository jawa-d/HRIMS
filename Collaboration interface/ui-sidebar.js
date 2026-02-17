import { MENU_ITEMS, APP_NAME } from "../app.config.js";
import { t, translateDom } from "../Languages/i18n.js";
import { getRole, getUserProfile, getAllowedPages } from "../Aman/guard.js";

const SECTION_DEFS = [
  { key: "main", en: "Main", ar: "الرئيسية", items: ["dashboard", "profile"] },
  { key: "people", en: "People Ops", ar: "الموارد البشرية", items: ["employees", "my_leaves", "leaves", "attendance", "timeoff", "payroll", "assets"] },
  { key: "org", en: "Organization", ar: "التنظيم", items: ["orgchart", "departments", "positions", "reports"] },
  { key: "workspace", en: "Workspace", ar: "مساحة العمل", items: ["workspace", "my_requests", "manager_inbox", "approval_timeline", "team_calendar", "employee_360", "document_center", "recruitment_pipeline", "onboarding_tracker", "offboarding_checklist", "performance_reviews", "compensation_history", "attendance_anomalies", "policy_center", "announcements", "hr_tickets", "org_insights", "asset_lifecycle", "training_certifications", "role_permission_matrix", "executive_dashboard"] },
  { key: "admin", en: "Administration", ar: "الإدارة", items: ["notifications_center", "security_center", "security_map", "settings"] }
];

let lastRole = null;
let lastItemsKey = null;
let lastActiveKey = null;
let hasRendered = false;

function isArabic() {
  const lang = document.documentElement.getAttribute("lang") || "en";
  return lang.startsWith("ar");
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
        const delayIndex = Math.min(animationIndex, 10);
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
      <details class="sidebar-section" ${openAttr}>
        <summary class="sidebar-section-title">${getSectionLabel(section)}</summary>
        <div class="sidebar-section-items">${links}</div>
      </details>
    `;
  }).join("");

  const rest = items.filter((item) => !consumed.has(item.key));
  if (!rest.length) return sections;

  const restLinks = rest
    .map((item) => {
      const delayIndex = Math.min(animationIndex, 10);
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

  const moreLabel = isArabic() ? "أخرى" : "More";
  return `${sections}
    <details class="sidebar-section">
      <summary class="sidebar-section-title">${moreLabel}</summary>
      <div class="sidebar-section-items">${restLinks}</div>
    </details>
  `;
}

export function renderSidebar(activeKey) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;

  const role = getRole();
  const profile = getUserProfile();
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

      lastActiveKey = activeKey;
    }
    return;
  }

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">${APP_NAME}</div>
      <nav class="sidebar-nav">
        ${buildSidebarSections(items, activeKey)}
      </nav>
      <div class="sidebar-footer">Developed by Jawad Kadhim © 2025</div>
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

  if (window.lucide) {
    window.lucide.createIcons();
  }

  lastRole = role;
  lastItemsKey = itemsKey;
  lastActiveKey = activeKey;
  hasRendered = true;
}

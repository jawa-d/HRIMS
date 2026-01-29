import { MENU_ITEMS, ROLE_PERMISSIONS, APP_NAME } from "../app.config.js";
import { t, translateDom } from "../Languages/i18n.js";
import { getRole } from "../Aman/guard.js";

export function renderSidebar(activeKey) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;

  const role = getRole();
  const allowed = ROLE_PERMISSIONS[role] || [];
  const items = MENU_ITEMS.filter((item) => allowed.includes(item.key));

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">${APP_NAME}</div>
      <nav class="sidebar-nav">
        ${items
          .map(
            (item, index) => `
          <a class="sidebar-link ${activeKey === item.key ? "active" : ""}" href="${item.href}" style="--i:${index}">
            <i data-lucide="${item.icon}"></i>
            <span data-i18n="${item.labelKey}">${t(item.labelKey)}</span>
          </a>
        `
          )
          .join("")}
      </nav>
      <div class="sidebar-footer">Developed by Jawad Kadhim © 2025 جميع الحقوق محفوظة لدى شركة وادي الرافدين للتأمين</div>
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
}

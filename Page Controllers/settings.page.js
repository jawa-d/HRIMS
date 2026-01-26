import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, toggleTheme, toggleLanguage } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { ROLES, ROLE_PERMISSIONS, MENU_ITEMS } from "../app.config.js";
import { showToast } from "../Collaboration interface/ui-toast.js";

if (!enforceAuth("settings")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("settings");

const themeBtn = document.getElementById("settings-theme-toggle");
const langBtn = document.getElementById("settings-lang-toggle");
const rolesTable = document.getElementById("roles-table");

const visibility = JSON.parse(localStorage.getItem("hrms_role_visibility") || "{}");

function renderRoleTable() {
  rolesTable.innerHTML = `
    <thead>
      <tr>
        <th>Role</th>
        ${MENU_ITEMS.map((item) => `<th>${item.key}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${ROLES.map(
        (roleKey) => `
        <tr>
          <td>${roleKey}</td>
          ${MENU_ITEMS.map((item) => {
            const checked = visibility[roleKey]?.includes(item.key) ?? ROLE_PERMISSIONS[roleKey].includes(item.key);
            return `<td><input type="checkbox" data-role="${roleKey}" data-key="${item.key}" ${checked ? "checked" : ""} /></td>`;
          }).join("")}
        </tr>
      `
      ).join("")}
    </tbody>
  `;
}

rolesTable.addEventListener("change", (event) => {
  if (event.target.matches("input[type=checkbox]")) {
    const roleKey = event.target.dataset.role;
    const key = event.target.dataset.key;
    const current = new Set(visibility[roleKey] || ROLE_PERMISSIONS[roleKey]);
    if (event.target.checked) {
      current.add(key);
    } else {
      current.delete(key);
    }
    visibility[roleKey] = Array.from(current);
    localStorage.setItem("hrms_role_visibility", JSON.stringify(visibility));
    showToast("info", "Role visibility updated locally");
  }
});

themeBtn.addEventListener("click", () => {
  toggleTheme();
  showToast("success", "Theme updated");
});

langBtn.addEventListener("click", () => {
  toggleLanguage();
  showToast("success", "Language updated");
});

renderRoleTable();

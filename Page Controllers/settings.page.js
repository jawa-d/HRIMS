import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n, toggleTheme, toggleLanguage } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { ROLES, ROLE_PERMISSIONS, MENU_ITEMS, STORAGE_KEYS } from "../app.config.js";
import { listUsers, upsertUser, deleteUser } from "../Services/users.service.js";
import { getSettingsRbacConfig, upsertSettingsRbacConfig } from "../Services/settings-config.service.js";
import { logSecurityEvent } from "../Services/security-audit.service.js";
import { enforceAdminPagesCode } from "../Services/admin-lock.service.js";
import { trackUxEvent } from "../Services/telemetry.service.js";

if (!enforceAuth("settings")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();

if (!enforceAdminPagesCode({ role, user, pageLabel: "Settings" })) {
  throw new Error("Admin pages code required");
}

renderNavbar({ user, role });
renderSidebar("settings");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManageUsers = ["super_admin", "hr_admin", "manager"].includes(role);
const isManager = role === "manager";
const themeBtn = document.getElementById("settings-theme-toggle");
const langBtn = document.getElementById("settings-lang-toggle");
const rolesTable = document.getElementById("roles-table");
const usersTable = document.getElementById("users-table");
const userSearch = document.getElementById("settings-user-search");
const addUserBtn = document.getElementById("settings-add-user-btn");

let roleVisibility = parseStorage(STORAGE_KEYS.roleVisibility, {});
let users = [];

if (!canManageUsers) {
  addUserBtn.classList.add("hidden");
}

function parseStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function persistUsersDraft() {
  localStorage.setItem(STORAGE_KEYS.usersDraft, JSON.stringify(users));
}

function persistRbacLocal() {
  localStorage.setItem(STORAGE_KEYS.roleVisibility, JSON.stringify(roleVisibility));
  localStorage.removeItem(STORAGE_KEYS.userPermissions);
}

async function syncRbacRemote() {
  await upsertSettingsRbacConfig({ roleVisibility, userPermissions: {} });
}

let rbacSyncTimer = null;
let rbacSyncInFlight = false;
let lastRbacSyncToastAt = 0;

function syncRbacRemoteSafe() {
  if (rbacSyncTimer) clearTimeout(rbacSyncTimer);
  rbacSyncTimer = setTimeout(async () => {
    if (rbacSyncInFlight) return;
    rbacSyncInFlight = true;
    try {
      await syncRbacRemote();
    } catch (error) {
      console.error("RBAC remote sync failed:", error);
      const now = Date.now();
      if (now - lastRbacSyncToastAt > 12000) {
        showToast("info", "RBAC saved locally. Firebase sync will retry later.");
        lastRbacSyncToastAt = now;
      }
    } finally {
      rbacSyncInFlight = false;
    }
  }, 350);
}

function defaultPagesForRole(roleKey) {
  return roleVisibility[roleKey] || ROLE_PERMISSIONS[roleKey] || [];
}

function getAssignableRoles() {
  if (!isManager) return ROLES;
  return ["employee"];
}

function canManageTargetUser(item) {
  if (!canManageUsers || !item) return false;
  if (!isManager) return true;
  return item.role === "employee";
}

function uidFromEmail(email) {
  if (!email) return `user-${Date.now()}`;
  return email.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function settingsAccent(input = "") {
  return `hsl(${hashSeed(input) % 360} 72% 44%)`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusTone(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "inactive") return "inactive";
  if (normalized === "suspended" || normalized === "archived") return "suspended";
  return "active";
}

async function safeLogSecurityEvent(payload) {
  try {
    await logSecurityEvent(payload);
  } catch (error) {
    console.warn("Security audit log failed:", error);
  }
}

function normalizeUser(raw = {}) {
  const uid = raw.uid || raw.id || uidFromEmail(raw.email);
  return {
    uid,
    id: uid,
    name: raw.name || "",
    email: raw.email || "",
    role: raw.role || "employee",
    status: raw.status || "active",
    departmentId: raw.departmentId || "",
    managerId: raw.managerId || "",
    title: raw.title || "",
    phone: raw.phone || ""
  };
}

function userAllowedPages(item) {
  return defaultPagesForRole(item.role);
}

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
        (roleKey, index) => `
        <tr class="settings-role-row" style="--settings-accent:${settingsAccent(`role-${roleKey}`)};--row-index:${index};">
          <td><span class="badge settings-role-badge">${escapeHtml(roleKey)}</span></td>
          ${MENU_ITEMS.map((item) => {
            const checked = defaultPagesForRole(roleKey).includes(item.key);
            return `<td><input type="checkbox" data-role="${escapeHtml(roleKey)}" data-key="${escapeHtml(item.key)}" ${checked ? "checked" : ""} ${!canManageUsers || isManager ? "disabled" : ""} /></td>`;
          }).join("")}
        </tr>
      `
      ).join("")}
    </tbody>
  `;
}

function renderUsersTable() {
  const query = (userSearch?.value || "").trim().toLowerCase();
  const filtered = users.filter((item) => {
    if (!query) return true;
    return [item.name, item.email, item.uid, item.role, item.departmentId]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(query));
  });

  usersTable.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>UID</th>
        <th>Role</th>
        <th>Status</th>
        <th>Pages</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${
        filtered.length
          ? filtered
              .map((item, index) => {
                const pages = userAllowedPages(item).length;
                const accent = settingsAccent(item.uid || item.email || item.name || item.role);
                const tone = statusTone(item.status);
                return `
                  <tr class="settings-user-row status-${tone}" style="--settings-accent:${accent};--row-index:${index};">
                    <td>
                      <span class="settings-user-name">
                        <span class="settings-user-dot"></span>
                        <span>${escapeHtml(item.name || "-")}</span>
                      </span>
                    </td>
                    <td>${escapeHtml(item.email || "-")}</td>
                    <td>${escapeHtml(item.uid)}</td>
                    <td><span class="badge settings-role-badge">${escapeHtml(item.role)}</span></td>
                    <td><span class="badge settings-status-badge">${escapeHtml(item.status || "active")}</span></td>
                    <td>${pages}</td>
                    <td>
                      ${
                        canManageTargetUser(item)
                          ? `
                          <button class="btn btn-ghost" data-action="edit" data-id="${escapeHtml(item.uid)}">Edit</button>
                          <button class="btn btn-ghost" data-action="delete" data-id="${escapeHtml(item.uid)}" ${item.uid === user.uid ? "disabled" : ""}>Delete</button>
                        `
                          : "<span class=\"text-muted\">View only</span>"
                      }
                    </td>
                  </tr>
                `;
              })
              .join("")
          : `<tr><td colspan="7" class="text-muted">No users found</td></tr>`
      }
    </tbody>
  `;

  usersTable.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleUserAction(button.dataset.action, button.dataset.id));
  });
}

function openUserModal(existing = null) {
  const record = normalizeUser(existing || {});
  const isEdit = Boolean(existing);
  const assignableRoles = getAssignableRoles();
  const selectedRole = assignableRoles.includes(record.role) ? record.role : assignableRoles[0];
  openModal({
    title: isEdit ? "Edit User Definition" : "Add User Definition",
    content: `
      <label>Name<input class="input" id="set-user-name" value="${record.name}" /></label>
      <label>Email<input class="input" id="set-user-email" value="${record.email}" ${isEdit ? "disabled" : ""} /></label>
      <label>UID<input class="input" id="set-user-uid" value="${record.uid}" ${isEdit ? "disabled" : ""} /></label>
      <label>Role
        <select class="select" id="set-user-role">
          ${assignableRoles.map((roleKey) => `<option value="${roleKey}" ${selectedRole === roleKey ? "selected" : ""}>${roleKey}</option>`).join("")}
        </select>
      </label>
      <label>Status
        <select class="select" id="set-user-status">
          <option value="active" ${record.status === "active" ? "selected" : ""}>Active</option>
          <option value="inactive" ${record.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </label>
      <label>Department ID<input class="input" id="set-user-dept" value="${record.departmentId}" /></label>
      <label>Manager ID<input class="input" id="set-user-manager" value="${record.managerId}" /></label>
      <label>Job Title<input class="input" id="set-user-title" value="${record.title}" /></label>
      <label>Phone<input class="input" id="set-user-phone" value="${record.phone}" /></label>
    `,
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const uid = (document.getElementById("set-user-uid").value || "").trim() || uidFromEmail(document.getElementById("set-user-email").value.trim());
          if (!uid) {
            showToast("error", "UID is required");
            return;
          }

          const payload = normalizeUser({
            uid,
            name: document.getElementById("set-user-name").value.trim(),
            email: document.getElementById("set-user-email").value.trim(),
            role: document.getElementById("set-user-role").value,
            status: document.getElementById("set-user-status").value,
            departmentId: document.getElementById("set-user-dept").value.trim(),
            managerId: document.getElementById("set-user-manager").value.trim(),
            title: document.getElementById("set-user-title").value.trim(),
            phone: document.getElementById("set-user-phone").value.trim()
          });

          users = users.filter((item) => item.uid !== uid);
          users.unshift(payload);
          persistUsersDraft();
          persistRbacLocal();
          syncRbacRemoteSafe();

          try {
            await upsertUser(uid, {
              ...payload,
              permissions: null
            });
          } catch (_) {
            showToast("info", "Saved locally. Firebase sync can be completed later.");
          }

          if (uid === user.uid) {
            const updatedSelf = { ...user, ...payload };
            updatedSelf.permissions = null;
            localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updatedSelf));
            localStorage.setItem(STORAGE_KEYS.role, payload.role);
          }

          renderUsersTable();
          renderSidebar("settings");
          await safeLogSecurityEvent({
            action: isEdit ? "user_updated" : "user_created",
            severity: "info",
            status: "success",
            actorUid: user?.uid || "",
            actorEmail: user?.email || "",
            actorRole: role || "",
            entity: "users",
            entityId: uid,
            message: isEdit ? "User definition updated from settings." : "User definition created from settings."
          });
          showToast("success", "User definition saved");
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleUserAction(action, uid) {
  const item = users.find((entry) => entry.uid === uid);
  if (!item || !canManageTargetUser(item)) return;

  if (action === "edit") {
    openUserModal(item);
    return;
  }

  if (action === "delete") {
    users = users.filter((entry) => entry.uid !== uid);
    persistUsersDraft();
    persistRbacLocal();
    syncRbacRemoteSafe();
    try {
      await deleteUser(uid);
    } catch (_) {
      showToast("info", "Deleted locally. Firebase sync can be completed later.");
    }
    renderUsersTable();
    await safeLogSecurityEvent({
      action: "user_deleted",
      severity: "critical",
      status: "success",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      entity: "users",
      entityId: uid,
      message: "User definition deleted from settings."
    });
    showToast("success", "User definition deleted");
  }
}

async function loadUsers() {
  const draftUsers = parseStorage(STORAGE_KEYS.usersDraft, []);
  try {
    const remote = await listUsers();
    const merged = new Map();
    remote.map(normalizeUser).forEach((item) => merged.set(item.uid, item));
    draftUsers.map(normalizeUser).forEach((item) => merged.set(item.uid, item));
    merged.set(user.uid, normalizeUser(user));
    users = Array.from(merged.values());
  } catch (_) {
    users = Array.from(new Map(draftUsers.map((item) => [item.uid, normalizeUser(item)])).values());
    if (!users.find((item) => item.uid === user.uid)) {
      users.unshift(normalizeUser(user));
    }
    showToast("info", "Running in local mode. Firebase sync can be enabled later.");
  }

  persistUsersDraft();
  persistRbacLocal();
  syncRbacRemoteSafe();
  renderUsersTable();
}

async function loadRbacConfig() {
  try {
    const remote = await getSettingsRbacConfig();
    roleVisibility = { ...roleVisibility, ...(remote.roleVisibility || {}) };
    persistRbacLocal();
  } catch (_) {
    showToast("info", "Using local RBAC settings. Firebase sync can be enabled later.");
  }
}

if (rolesTable) {
  rolesTable.addEventListener("change", (event) => {
    if (!canManageUsers || isManager) return;
    if (!event.target.matches("input[type=checkbox]")) return;
    const roleKey = event.target.dataset.role;
    const key = event.target.dataset.key;
    if (!roleKey || !key) return;

    const current = new Set(defaultPagesForRole(roleKey));
    if (event.target.checked) current.add(key);
    else current.delete(key);
    roleVisibility[roleKey] = Array.from(current);
    persistRbacLocal();
    syncRbacRemoteSafe();
    renderUsersTable();
    renderSidebar("settings");
    void safeLogSecurityEvent({
      action: "role_template_updated",
      severity: "warning",
      status: "success",
      actorUid: user?.uid || "",
      actorEmail: user?.email || "",
      actorRole: role || "",
      entity: "roles",
      entityId: roleKey,
      message: `Role template changed for ${roleKey}.`
    });
    showToast("info", "Role template updated");
  });
}

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    toggleTheme();
    showToast("success", "Theme updated");
  });
}

if (langBtn) {
  langBtn.addEventListener("click", () => {
    toggleLanguage();
    showToast("success", "Language updated");
  });
}

if (userSearch) {
  userSearch.addEventListener("input", renderUsersTable);
}

if (addUserBtn) {
  addUserBtn.addEventListener("click", () => {
    if (!canManageUsers) return;
    openUserModal();
  });
}

(async () => {
  try {
    await loadRbacConfig();
    renderRoleTable();
    await loadUsers();
  } catch (error) {
    console.error("Settings page bootstrap failed:", error);
    showToast("error", "Settings page failed to load completely.");
    if (rolesTable) renderRoleTable();
    if (usersTable) renderUsersTable();
  }
})();

trackUxEvent({ event: "page_open", module: "settings" });

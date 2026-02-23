import { enforceAuth, getDefaultPage, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import {
  listVaultEntries,
  watchVaultEntries,
  createVaultEntry,
  updateVaultEntry,
  deleteVaultEntry
} from "../Services/secure-vault.service.js";
import { enforceVaultAccessCode, getVaultPassphrase } from "../Services/vault-lock.service.js";

if (!enforceAuth("secure_vault")) {
  throw new Error("Unauthorized");
}

const user = getUserProfile();
const role = getRole();

if (!["super_admin", "hr_admin"].includes(role)) {
  initI18n();
  showToast("error", "Secure vault is restricted to admins");
  window.location.href = getDefaultPage(role, user);
  throw new Error("Forbidden");
}

if (!enforceVaultAccessCode({ role, user, pageLabel: "Secure Vault" })) {
  throw new Error("Secure vault code required");
}

initI18n();
renderNavbar({ user, role });
renderSidebar("secure_vault");
if (window.lucide?.createIcons) window.lucide.createIcons();

const addBtn = document.getElementById("vault-add-btn");
const searchInput = document.getElementById("vault-search");
const bodyEl = document.getElementById("vault-body");
const emptyEl = document.getElementById("vault-empty");
const totalEl = document.getElementById("vault-kpi-total");
const updatedEl = document.getElementById("vault-kpi-updated");

let entries = [];
let revealed = new Set();
let unsubscribe = null;

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(plain, passphrase) {
  const text = String(plain || "");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return {
    v: 1,
    s: toBase64(salt),
    iv: toBase64(iv),
    c: toBase64(new Uint8Array(cipher))
  };
}

async function decryptText(payload, passphrase) {
  if (!payload || !payload.s || !payload.iv || !payload.c) return "";
  const salt = fromBase64(payload.s);
  const iv = fromBase64(payload.iv);
  const cipher = fromBase64(payload.c);
  const key = await deriveKey(passphrase, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const dec = new TextDecoder();
  return dec.decode(plainBuffer);
}

function formatTime(value) {
  const seconds = value?.seconds || 0;
  if (!seconds) return "-";
  return new Date(seconds * 1000).toLocaleString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mask(value) {
  if (!value) return "-";
  return "•".repeat(Math.max(8, Math.min(18, String(value).length)));
}

async function hydrateEntries(items) {
  const passphrase = getVaultPassphrase();
  return Promise.all(
    items.map(async (item) => {
      try {
        const username = await decryptText(item.usernameCipher, passphrase);
        const password = await decryptText(item.passwordCipher, passphrase);
        return { ...item, _username: username, _password: password, _locked: false };
      } catch (_) {
        return { ...item, _username: "", _password: "", _locked: true };
      }
    })
  );
}

function filteredEntries() {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((item) => {
    const haystack = `${item.siteName || ""} ${item.siteUrl || ""} ${item._username || ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderStats(items) {
  if (totalEl) totalEl.textContent = String(items.length);
  if (updatedEl) updatedEl.textContent = items.length ? formatTime(items[0].updatedAt || items[0].createdAt) : "-";
}

function renderTable() {
  const items = filteredEntries();
  bodyEl.innerHTML = items
    .map((item) => {
      const isShown = revealed.has(item.id);
      const pwd = isShown ? (item._password || "-") : mask(item._password);
      const link = item.siteUrl ? `<a href="${escapeHtml(item.siteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.siteUrl)}</a>` : "-";
      return `
        <tr>
          <td>${escapeHtml(item.siteName || "-")}</td>
          <td>${link}</td>
          <td>${item._locked ? "<span class='text-muted'>Locked</span>" : escapeHtml(item._username || "-")}</td>
          <td>
            <div class="vault-value">
              <span class="vault-secret">${item._locked ? "Locked" : escapeHtml(pwd)}</span>
              ${item._locked ? "" : `<button class="btn btn-ghost btn-xs" data-action="reveal" data-id="${item.id}">${isShown ? "Hide" : "Reveal"}</button>`}
            </div>
          </td>
          <td>${escapeHtml(item.ownerName || "-")}</td>
          <td>${formatTime(item.updatedAt || item.createdAt)}</td>
          <td>
            <div class="vault-actions">
              <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${item.id}">Edit</button>
              <button class="btn btn-ghost btn-xs" data-action="copy" data-id="${item.id}">Copy</button>
              <button class="btn btn-ghost btn-xs" data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  emptyEl.classList.toggle("hidden", items.length > 0);
  renderStats(entries);

  bodyEl.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      void handleAction(action, id);
    });
  });
}

function formTemplate(entry = {}) {
  return `
    <label>Site Name<input class="input" id="vault-site-name" value="${escapeHtml(entry.siteName || "")}" /></label>
    <label>Site URL<input class="input" id="vault-site-url" value="${escapeHtml(entry.siteUrl || "")}" placeholder="https://example.com" /></label>
    <label>Username<input class="input" id="vault-username" value="${escapeHtml(entry._username || "")}" /></label>
    <label>Password<input class="input" id="vault-password" value="${escapeHtml(entry._password || "")}" /></label>
    <label>Notes<textarea class="textarea" id="vault-notes" rows="3">${escapeHtml(entry.notes || "")}</textarea></label>
  `;
}

function openEntryModal(entry = null) {
  const isEdit = Boolean(entry);
  openModal({
    title: isEdit ? "Edit Credential" : "Add Credential",
    content: formTemplate(entry || {}),
    actions: [
      {
        label: t("common.save"),
        className: "btn btn-primary",
        onClick: async () => {
          const siteName = String(document.getElementById("vault-site-name")?.value || "").trim();
          const siteUrl = String(document.getElementById("vault-site-url")?.value || "").trim();
          const username = String(document.getElementById("vault-username")?.value || "").trim();
          const password = String(document.getElementById("vault-password")?.value || "").trim();
          const notes = String(document.getElementById("vault-notes")?.value || "").trim();

          if (!siteName) {
            showToast("error", "Site name is required");
            return;
          }
          if (!username || !password) {
            showToast("error", "Username and password are required");
            return;
          }

          const passphrase = getVaultPassphrase();
          const usernameCipher = await encryptText(username, passphrase);
          const passwordCipher = await encryptText(password, passphrase);
          const payload = {
            siteName,
            siteUrl,
            usernameCipher,
            passwordCipher,
            notes,
            ownerUid: user?.uid || "",
            ownerName: user?.name || "",
            ownerRole: role || ""
          };

          if (isEdit) {
            await updateVaultEntry(entry.id, payload);
            showToast("success", "Credential updated");
          } else {
            await createVaultEntry(payload);
            showToast("success", "Credential saved");
          }
          await loadEntries();
        }
      },
      { label: t("common.cancel"), className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const item = entries.find((entry) => entry.id === id);
  if (!item) return;

  if (action === "reveal") {
    if (revealed.has(id)) revealed.delete(id);
    else revealed.add(id);
    renderTable();
    return;
  }

  if (action === "edit") {
    openEntryModal(item);
    return;
  }

  if (action === "copy") {
    if (!item._username && !item._password) {
      showToast("error", "Cannot copy locked entry");
      return;
    }
    const packed = `Site: ${item.siteName}\nURL: ${item.siteUrl}\nUsername: ${item._username}\nPassword: ${item._password}\nNotes: ${item.notes || ""}`;
    await navigator.clipboard.writeText(packed);
    showToast("success", "Credential copied");
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm("Delete this credential permanently?");
    if (!confirmed) return;
    await deleteVaultEntry(item.id);
    showToast("success", "Credential deleted");
    await loadEntries();
  }
}

async function loadEntries() {
  showTableSkeleton(bodyEl, { rows: 6, cols: 7 });
  const raw = await listVaultEntries();
  entries = await hydrateEntries(raw);
  renderTable();
}

function startRealtime() {
  unsubscribe = watchVaultEntries(
    async (items) => {
      entries = await hydrateEntries(items);
      renderTable();
    },
    () => {
      void loadEntries();
    }
  );
}

if (addBtn) addBtn.addEventListener("click", () => openEntryModal());
if (searchInput) searchInput.addEventListener("input", renderTable);

window.addEventListener("beforeunload", () => {
  if (typeof unsubscribe === "function") unsubscribe();
});

(async () => {
  startRealtime();
  if (!entries.length) await loadEntries();
})();

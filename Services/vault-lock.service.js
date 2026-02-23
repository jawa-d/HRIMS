import { getDefaultPage } from "../Aman/guard.js";

export const VAULT_ACCESS_CODE = "WadiVault-2026";
const VAULT_UNLOCK_KEY = "hrms_secure_vault_unlocked";
const VAULT_PASS_KEY = "hrms_secure_vault_passphrase";
const LOCK_ID = "secure-vault-lock-overlay";

function removeOverlay() {
  const existing = document.getElementById(LOCK_ID);
  if (existing) existing.remove();
}

function lockHtml(pageLabel = "Secure Vault") {
  return `
    <div id="${LOCK_ID}" style="position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.58);backdrop-filter:blur(4px);display:grid;place-items:center;padding:16px;">
      <div style="width:min(460px,100%);background:#ffffff;border:1px solid rgba(15,118,110,.2);border-radius:18px;box-shadow:0 24px 60px rgba(2,6,23,.3);padding:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong style="font-size:1.1rem;color:#0f172a;">${pageLabel}</strong>
          <span style="font-size:.78rem;padding:4px 9px;border-radius:999px;background:#ecfeff;color:#155e75;border:1px solid rgba(14,116,144,.2);">Private Lock</span>
        </div>
        <p style="margin:10px 0;color:#334155;font-size:.92rem;">This vault holds sensitive accounts. Enter the private code to continue.</p>
        <label for="vault-lock-input" style="display:block;font-size:.82rem;color:#475569;margin-bottom:6px;">Access code</label>
        <input id="vault-lock-input" type="password" placeholder="Enter vault code" style="width:100%;height:42px;border-radius:10px;border:1px solid #cbd5e1;padding:0 12px;font-size:1rem;outline:none;" />
        <div id="vault-lock-error" style="min-height:18px;color:#b91c1c;font-size:.82rem;margin-top:6px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <button id="vault-lock-cancel" style="height:38px;padding:0 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;">Back</button>
          <button id="vault-lock-open" style="height:38px;padding:0 14px;border-radius:10px;border:1px solid #0f766e;background:#0f766e;color:#fff;cursor:pointer;">Unlock Vault</button>
        </div>
      </div>
    </div>
  `;
}

export function enforceVaultAccessCode({ role, user, pageLabel = "Secure Vault" } = {}) {
  if (sessionStorage.getItem(VAULT_UNLOCK_KEY) === "1") return true;

  removeOverlay();
  document.body.insertAdjacentHTML("beforeend", lockHtml(pageLabel));

  const input = document.getElementById("vault-lock-input");
  const openBtn = document.getElementById("vault-lock-open");
  const cancelBtn = document.getElementById("vault-lock-cancel");
  const errorEl = document.getElementById("vault-lock-error");

  const tryOpen = () => {
    const value = String(input?.value || "").trim();
    if (value === VAULT_ACCESS_CODE) {
      sessionStorage.setItem(VAULT_UNLOCK_KEY, "1");
      sessionStorage.setItem(VAULT_PASS_KEY, value);
      removeOverlay();
      window.location.reload();
      return;
    }
    if (errorEl) errorEl.textContent = "Wrong code. Vault stays locked.";
    input?.focus();
  };

  openBtn?.addEventListener("click", tryOpen);
  cancelBtn?.addEventListener("click", () => {
    window.location.href = getDefaultPage(role, user);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") tryOpen();
  });
  input?.focus();

  return true;
}

export function getVaultPassphrase() {
  return sessionStorage.getItem(VAULT_PASS_KEY) || "";
}

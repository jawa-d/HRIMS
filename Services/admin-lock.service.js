import { getDefaultPage } from "../Aman/guard.js";

const ADMIN_CODE = "jawad";
const ADMIN_UNLOCK_KEY = "hrms_admin_pages_unlocked";
const LOCK_ID = "admin-lock-overlay";

function removeOverlay() {
  const existing = document.getElementById(LOCK_ID);
  if (existing) existing.remove();
}

function lockHtml(pageLabel = "Admin") {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <rect width="320" height="180" rx="18" fill="#f0fdfa"/>
      <circle cx="160" cy="88" r="50" fill="#ffffff" stroke="#14b8a6" stroke-width="4"/>
      <circle cx="142" cy="78" r="6" fill="#0f172a"/>
      <circle cx="178" cy="78" r="6" fill="#0f172a"/>
      <path d="M136 104c11 17 37 17 48 0" fill="none" stroke="#0f766e" stroke-width="6" stroke-linecap="round"/>
      <rect x="136" y="30" width="48" height="22" rx="8" fill="#14b8a6"/>
      <text x="160" y="45" text-anchor="middle" font-size="12" font-family="Arial" fill="#fff">LOCK</text>
      <text x="160" y="160" text-anchor="middle" font-size="14" font-family="Arial" fill="#0f172a">No code? No entry :D</text>
    </svg>
  `);

  return `
    <div id="${LOCK_ID}" style="position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,.55);backdrop-filter:blur(4px);display:grid;place-items:center;padding:18px;">
      <div style="width:min(460px,100%);background:linear-gradient(180deg,#ffffff,#f8fafc);border:1px solid rgba(20,184,166,.28);border-radius:18px;box-shadow:0 24px 60px rgba(2,6,23,.3);padding:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <strong style="font-size:1.1rem;color:#0f172a;">${pageLabel} Locked</strong>
          <span style="font-size:.8rem;padding:4px 9px;border-radius:999px;background:#ccfbf1;color:#0f766e;border:1px solid rgba(15,118,110,.25);">Code Required</span>
        </div>
        <img alt="Funny lock" src="data:image/svg+xml;utf8,${svg}" style="width:100%;border-radius:12px;border:1px solid rgba(15,118,110,.2);margin-bottom:10px;" />
        <p style="margin:0 0 10px;color:#334155;font-size:.95rem;">حتى السايدبار قال: بدون كلمة السر ماكو VIP. لا تخلي القفل يزعل منك 😂</p>
        <label for="admin-lock-input" style="display:block;font-size:.85rem;color:#475569;margin-bottom:6px;">اكتب الرمز</label>
        <input id="admin-lock-input" type="password" placeholder="jawad" style="width:100%;height:42px;border-radius:10px;border:1px solid #cbd5e1;padding:0 12px;font-size:1rem;outline:none;" />
        <div id="admin-lock-error" style="min-height:18px;color:#b91c1c;font-size:.82rem;margin-top:6px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <button id="admin-lock-cancel" style="height:38px;padding:0 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;">رجوع</button>
          <button id="admin-lock-open" style="height:38px;padding:0 14px;border-radius:10px;border:1px solid #0f766e;background:#0f766e;color:#fff;cursor:pointer;">فتح الصفحة</button>
        </div>
      </div>
    </div>
  `;
}

export function enforceAdminPagesCode({ role, user, pageLabel = "Admin Page" } = {}) {
  if (sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1") return true;

  removeOverlay();
  document.body.insertAdjacentHTML("beforeend", lockHtml(pageLabel));

  const overlay = document.getElementById(LOCK_ID);
  const input = document.getElementById("admin-lock-input");
  const openBtn = document.getElementById("admin-lock-open");
  const cancelBtn = document.getElementById("admin-lock-cancel");
  const errorEl = document.getElementById("admin-lock-error");

  const tryOpen = () => {
    const value = String(input?.value || "").trim();
    if (value === ADMIN_CODE) {
      sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
      removeOverlay();
      window.location.reload();
      return;
    }
    if (errorEl) errorEl.textContent = "رمز غلط. حتى القفل يضحك عليك هسه 😅";
    if (input) input.focus();
  };

  openBtn?.addEventListener("click", tryOpen);
  cancelBtn?.addEventListener("click", () => {
    window.location.href = getDefaultPage(role, user);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") tryOpen();
  });
  input?.focus();

  return false;
}


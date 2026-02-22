import { MENU_ITEMS } from "../app.config.js";
import { initI18n, t } from "../Languages/i18n.js";
import { getPageControl } from "../Services/page-availability.service.js";

initI18n();

const params = new URLSearchParams(window.location.search);
const pageKey = params.get("page") || "";
const pageNameEl = document.getElementById("maintenance-page-name");
const backBtn = document.getElementById("maintenance-back-btn");
const reasonWrap = document.getElementById("maintenance-reason-wrap");
const reasonEl = document.getElementById("maintenance-reason");
const etaWrap = document.getElementById("maintenance-eta-wrap");
const etaEl = document.getElementById("maintenance-eta");

const pageDef = MENU_ITEMS.find((item) => item.key === pageKey);
if (pageNameEl) {
  pageNameEl.textContent = pageDef ? t(pageDef.labelKey) : pageKey || "-";
}

const control = getPageControl(pageKey);
if (control?.reason && reasonWrap && reasonEl) {
  reasonEl.textContent = control.reason;
  reasonWrap.classList.remove("hidden");
}

if (control?.resumeAt && etaWrap && etaEl) {
  const date = new Date(control.resumeAt);
  etaEl.textContent = Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
  etaWrap.classList.remove("hidden");
}

backBtn?.addEventListener("click", () => {
  window.history.length > 1 ? window.history.back() : (window.location.href = "dashboard.html");
});

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

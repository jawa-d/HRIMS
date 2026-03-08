import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { APP_NAME } from "../app.config.js";
import {
  createBarcodeExport,
  listBarcodeExports,
  uploadBarcodeAttachment
} from "../Services/barcode-export.service.js";

if (!enforceAuth("barcode_export")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("barcode_export");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);

const companyNameInput = document.getElementById("barcode-company-name");
const issueNoInput = document.getElementById("barcode-issue-no");
const issueDateInput = document.getElementById("barcode-issue-date");
const attachmentInput = document.getElementById("barcode-attachment");
const logoInput = document.getElementById("barcode-logo");

const generateBtn = document.getElementById("barcode-generate-btn");
const printBtn = document.getElementById("barcode-print-btn");

const sheetCompanyName = document.getElementById("sheet-company-name");
const sheetLogo = document.getElementById("sheet-logo");
const sheetIssueNo = document.getElementById("sheet-issue-no");
const sheetIssueDate = document.getElementById("sheet-issue-date");
const sheetCreatedAt = document.getElementById("sheet-created-at");
const sheetAttachmentLink = document.getElementById("sheet-attachment-link");
const sheetPreparedBy = document.getElementById("sheet-prepared-by");
const qrCanvas = document.getElementById("sheet-qr-canvas");

const historyBody = document.getElementById("barcode-history-body");
const historyEmpty = document.getElementById("barcode-history-empty");

let historyRows = [];
let currentLogoPreview = sheetLogo?.src || "";
let qrLib = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function generateIssueNo() {
  const now = new Date();
  const dateToken = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `OUT-${dateToken}-${seq}`;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return Number(value) || 0;
}

function humanDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function humanDateTimeFromRecord(row = {}) {
  const millis = toMillis(row.createdAt) || Number(row.createdAtEpoch || 0);
  if (!millis) return "-";
  return new Date(millis).toLocaleString();
}

function absoluteAssetUrl(path) {
  try {
    return new URL(path, window.location.href).href;
  } catch (_) {
    return path;
  }
}

function drawQrPlaceholder(message = "Upload attachment then click Generate Sheet") {
  const ctx = qrCanvas.getContext("2d");
  ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
  ctx.strokeStyle = "#d1d5db";
  ctx.strokeRect(1, 1, qrCanvas.width - 2, qrCanvas.height - 2);
  ctx.fillStyle = "#475569";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, qrCanvas.width / 2, qrCanvas.height / 2);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read local file."));
    reader.readAsDataURL(file);
  });
}

function renderSheet(row = {}) {
  const companyName = String(row.companyName || "").trim() || "-";
  const issueNo = String(row.issueNo || "").trim() || "-";
  const issueDate = String(row.issueDate || "").trim() || "-";
  const attachmentUrl = String(row.attachmentUrl || "").trim();
  const attachmentName = String(row.attachmentName || "").trim() || "Attachment";
  const createdAt = row.createdAtLabel || humanDateTimeFromRecord(row);
  const preparedBy = String(row.createdByName || user?.name || user?.email || user?.uid || "-").trim();
  const logoUrl = String(row.companyLogoUrl || currentLogoPreview || absoluteAssetUrl("../HRMS%20Html/assets/logo.jpg")).trim();

  sheetCompanyName.textContent = companyName;
  sheetIssueNo.textContent = issueNo;
  sheetIssueDate.textContent = humanDate(issueDate);
  sheetCreatedAt.textContent = createdAt;
  sheetPreparedBy.textContent = preparedBy;
  sheetLogo.src = logoUrl;
  sheetAttachmentLink.textContent = attachmentName;
  sheetAttachmentLink.href = attachmentUrl || "#";
}

async function renderQr(payload) {
  const content = String(payload || "").trim();
  if (!content) {
    drawQrPlaceholder("Upload file first");
    return;
  }

  // Primary source: global CDN script. Fallback: dynamic ESM import.
  if (!qrLib) {
    qrLib = window.QRCode?.toCanvas ? window.QRCode : null;
    if (!qrLib) {
      try {
        const mod = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
        qrLib = mod?.default || mod?.QRCode || mod || null;
      } catch (_) {
        qrLib = null;
      }
    }
  }

  if (!qrLib?.toCanvas) {
    // Fallback via remote QR image generation when JS QR library is blocked.
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(content)}`;
    await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = qrCanvas.getContext("2d");
        ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
        ctx.drawImage(img, 0, 0, qrCanvas.width, qrCanvas.height);
        resolve();
      };
      img.onerror = () => {
        drawQrPlaceholder("QR generation failed");
        showToast("error", "QR generation failed. Check internet access and try again.");
        resolve();
      };
      img.src = apiUrl;
    });
    return;
  }

  await qrLib.toCanvas(qrCanvas, content, {
    width: 320,
    margin: 1,
    color: {
      dark: "#111827",
      light: "#ffffff"
    }
  });
}

function renderHistory() {
  historyBody.innerHTML = historyRows
    .map((item) => `
      <tr>
        <td>${item.issueNo || "-"}</td>
        <td>${humanDate(item.issueDate)}</td>
        <td>${item.companyName || "-"}</td>
        <td>${item.attachmentUrl ? `<a href="${item.attachmentUrl}" target="_blank" rel="noopener noreferrer">${item.attachmentName || "Open"}</a>` : "-"}</td>
        <td>
          <button class="btn btn-ghost" data-action="view" data-id="${item.id}">Load</button>
        </td>
      </tr>
    `)
    .join("");

  historyEmpty.classList.toggle("hidden", historyRows.length > 0);
  historyBody.querySelectorAll("button[data-action='view']").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = historyRows.find((entry) => entry.id === button.dataset.id);
      if (!row) return;
      renderSheet(row);
      await renderQr(row.qrPayload || row.attachmentUrl || "");
      showToast("success", "Barcode sheet loaded");
    });
  });
}

async function loadHistory() {
  historyRows = await listBarcodeExports({ limitCount: 80 });
  renderHistory();
}

async function readCompanyLogoUrl() {
  const logoFile = logoInput?.files?.[0] || null;
  if (!logoFile) return currentLogoPreview || absoluteAssetUrl("../HRMS%20Html/assets/logo.jpg");
  const localPreview = await readFileAsDataUrl(logoFile);
  currentLogoPreview = localPreview;
  try {
    const uploaded = await uploadBarcodeAttachment(logoFile, user?.uid || "unknown");
    return uploaded.url || localPreview;
  } catch (_) {
    return localPreview;
  }
}

async function generateSheet() {
  if (!canManage) return;
  const file = attachmentInput?.files?.[0] || null;
  if (!file) {
    showToast("error", "Please upload an attachment first.");
    return;
  }

  const companyName = String(companyNameInput.value || "").trim();
  const issueNo = String(issueNoInput.value || "").trim();
  const issueDate = String(issueDateInput.value || "").trim();
  if (!companyName || !issueNo || !issueDate) {
    showToast("error", "Company name, issue number, and issue date are required.");
    return;
  }

  generateBtn.disabled = true;
  try {
    const uploaded = await uploadBarcodeAttachment(file, user?.uid || "unknown");
    const logoUrl = await readCompanyLogoUrl();
    const payload = {
      companyName,
      companyLogoUrl: logoUrl,
      issueNo,
      issueDate,
      qrPayload: uploaded.url,
      attachmentUrl: uploaded.url,
      attachmentName: uploaded.name || file.name || "attachment",
      createdByUid: user?.uid || "",
      createdByEmail: user?.email || "",
      createdByName: user?.name || user?.email || user?.uid || ""
    };
    const id = await createBarcodeExport(payload);
    const displayRow = {
      id,
      ...payload,
      createdAtLabel: new Date().toLocaleString()
    };
    renderSheet(displayRow);
    await renderQr(payload.qrPayload);
    showToast("success", "Barcode export sheet generated.");
    await loadHistory();
  } catch (error) {
    console.error("Barcode generation failed:", error);
    showToast("error", "Failed to generate barcode sheet.");
  } finally {
    generateBtn.disabled = false;
  }
}

function initDefaults() {
  companyNameInput.value = String(user?.companyName || APP_NAME || "").trim();
  issueNoInput.value = generateIssueNo();
  issueDateInput.value = todayKey();
  sheetLogo.src = absoluteAssetUrl("../HRMS%20Html/assets/logo.jpg");
  currentLogoPreview = sheetLogo.src;
  renderSheet({
    companyName: companyNameInput.value,
    issueNo: issueNoInput.value,
    issueDate: issueDateInput.value,
    attachmentName: "-",
    attachmentUrl: "#",
    createdByName: user?.name || user?.email || user?.uid || "-",
    createdAtLabel: new Date().toLocaleString(),
    companyLogoUrl: currentLogoPreview
  });
  void renderQr("");
}

if (!canManage) {
  generateBtn.classList.add("hidden");
  attachmentInput.disabled = true;
  logoInput.disabled = true;
}

printBtn?.addEventListener("click", () => {
  window.print();
});

logoInput?.addEventListener("change", async () => {
  const file = logoInput.files?.[0] || null;
  if (!file) return;
  try {
    currentLogoPreview = await readFileAsDataUrl(file);
    sheetLogo.src = currentLogoPreview;
  } catch (_) {
    showToast("error", "Failed to load logo preview.");
  }
});

generateBtn?.addEventListener("click", () => {
  void generateSheet();
});

(async () => {
  initDefaults();
  await loadHistory();
})();

trackUxEvent({ event: "page_open", module: "barcode_export" });

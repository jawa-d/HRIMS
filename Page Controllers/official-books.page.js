import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { APP_NAME } from "../app.config.js";

if (!enforceAuth("official_books")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("official_books");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canUse = ["super_admin", "hr_admin", "manager"].includes(role);

const templateSelect = document.getElementById("ob-template-select");
const letterNoInput = document.getElementById("ob-letter-no");
const letterDateInput = document.getElementById("ob-letter-date");
const recipientInput = document.getElementById("ob-recipient");
const subjectInput = document.getElementById("ob-subject");
const bodyInput = document.getElementById("ob-body");
const closingInput = document.getElementById("ob-closing");
const ccInput = document.getElementById("ob-cc");
const managerNameInput = document.getElementById("ob-manager-name");
const printBtn = document.getElementById("ob-print-btn");
const newBtn = document.getElementById("ob-new-btn");

const companyNameEl = document.getElementById("ob-company-name");
const previewNoEl = document.getElementById("ob-preview-no");
const previewDateEl = document.getElementById("ob-preview-date");
const previewRecipientEl = document.getElementById("ob-preview-recipient");
const previewSubjectEl = document.getElementById("ob-preview-subject");
const previewBodyEl = document.getElementById("ob-preview-body");
const previewClosingEl = document.getElementById("ob-preview-closing");
const previewCcWrapEl = document.getElementById("ob-preview-cc-wrap");
const previewCcEl = document.getElementById("ob-preview-cc");
const previewManagerEl = document.getElementById("ob-preview-manager");
const logoEl = document.getElementById("ob-logo");
const watermarkEl = document.getElementById("ob-watermark");

const TEMPLATES = {
  general: {
    subject: "كتاب إداري",
    recipient: "إلى / الجهة المعنية",
    body: "استنادًا إلى الصلاحيات المخولة لنا، يرجى التفضل باتخاذ ما يلزم وفقًا لمقتضيات العمل.\n\nيعمل بهذا الكتاب من تاريخ صدوره.",
    closing: "وتفضلوا بقبول فائق الاحترام والتقدير."
  },
  assignment: {
    subject: "كتاب إحالة",
    recipient: "إلى / قسم ....",
    body: "نحيل إليكم الموضوع المدرج أعلاه لغرض المتابعة واتخاذ الإجراءات الأصولية، وإعلامنا بما يتم.\n\nيرجى إنجاز المطلوب بالسرعة الممكنة.",
    closing: "مع التقدير."
  },
  warning: {
    subject: "إنذار إداري",
    recipient: "إلى / السيد ....",
    body: "نظرًا لوجود مخالفة إدارية مثبتة، نوجه لكم هذا الإنذار بضرورة الالتزام بالتعليمات والضوابط المعتمدة.\n\nيعد هذا الإنذار أصوليًا ويحفظ في الإضبارة الوظيفية.",
    closing: "يرجى الالتزام تجنبًا لاتخاذ الإجراءات القانونية."
  },
  memo: {
    subject: "مذكرة داخلية",
    recipient: "إلى / جميع الأقسام",
    body: "يرجى الاطلاع والعمل بمضمون هذه المذكرة اعتبارًا من تاريخها، وتعميمها على الجهات ذات العلاقة داخل القسم.",
    closing: "للعلم والعمل."
  }
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function generateLetterNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seq = Math.floor(100 + Math.random() * 900);
  return `${yyyy}/${mm}${dd}/${seq}`;
}

function absoluteAssetUrl(path) {
  try {
    return new URL(path, window.location.href).href;
  } catch (_) {
    return path;
  }
}

function textOrDash(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function humanDate(dateInput) {
  if (!dateInput) return "-";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function applyTemplate(templateKey) {
  const tpl = TEMPLATES[templateKey] || TEMPLATES.general;
  subjectInput.value = tpl.subject;
  recipientInput.value = tpl.recipient;
  bodyInput.value = tpl.body;
  closingInput.value = tpl.closing;
  renderPreview();
}

function renderPreview() {
  previewNoEl.textContent = textOrDash(letterNoInput.value);
  previewDateEl.textContent = humanDate(letterDateInput.value);
  previewRecipientEl.textContent = textOrDash(recipientInput.value);
  previewSubjectEl.textContent = textOrDash(subjectInput.value);
  previewBodyEl.textContent = textOrDash(bodyInput.value);
  previewClosingEl.textContent = textOrDash(closingInput.value);
  previewManagerEl.textContent = textOrDash(managerNameInput.value);

  const cc = String(ccInput.value || "").trim();
  previewCcEl.textContent = cc || "-";
  previewCcWrapEl.style.display = cc ? "block" : "none";
}

function resetForNewLetter() {
  letterNoInput.value = generateLetterNo();
  letterDateInput.value = todayKey();
  ccInput.value = "";
  applyTemplate(String(templateSelect.value || "general"));
  renderPreview();
}

function bindInput(input) {
  input?.addEventListener("input", renderPreview);
}

function initPageDefaults() {
  companyNameEl.textContent = user?.companyName || "شركة وادي الرافدين";
  managerNameInput.value = String(user?.name || "المدير المفوض").trim();
  letterNoInput.value = generateLetterNo();
  letterDateInput.value = todayKey();
  templateSelect.value = "general";
  ccInput.value = "";

  const defaultCompanySubtitle = APP_NAME ? `${APP_NAME} - الشؤون الإدارية` : "الشؤون الإدارية";
  const subtitleEl = document.getElementById("ob-company-subtitle");
  if (subtitleEl) subtitleEl.textContent = defaultCompanySubtitle;

  logoEl.src = absoluteAssetUrl("../HRMS%20Html/assets/logo.jpg");
  if (watermarkEl) watermarkEl.src = logoEl.src;

  applyTemplate("general");
  renderPreview();
}

if (!canUse) {
  showToast("error", "ليس لديك صلاحية لاستخدام صفحة الكتب الرسمية.");
}

[
  letterNoInput,
  letterDateInput,
  recipientInput,
  subjectInput,
  bodyInput,
  closingInput,
  ccInput,
  managerNameInput
].forEach(bindInput);

templateSelect?.addEventListener("change", () => {
  applyTemplate(templateSelect.value);
});

newBtn?.addEventListener("click", () => {
  resetForNewLetter();
  showToast("success", "تم تجهيز قالب كتاب جديد.");
});

printBtn?.addEventListener("click", () => {
  renderPreview();
  window.print();
});

initPageDefaults();
trackUxEvent({ event: "page_open", module: "official_books" });

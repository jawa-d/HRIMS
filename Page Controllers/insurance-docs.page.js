import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import {
  listInsuranceDocs,
  createInsuranceDoc,
  updateInsuranceDoc,
  deleteInsuranceDoc
} from "../Services/insurance-docs.service.js";
import { listInsuranceParties } from "../Services/insurance-parties.service.js";

if (!enforceAuth("insurance_docs")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("insurance_docs");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const canDelete = ["super_admin", "hr_admin"].includes(role);

const typeSelect = document.getElementById("insurance-type");
const typeFilter = document.getElementById("insurance-type-filter");
const policyNoInput = document.getElementById("insurance-policy-no");
const insuredPartySelect = document.getElementById("insurance-insured-party");
const amountInput = document.getElementById("insurance-amount");
const startDateInput = document.getElementById("insurance-start-date");
const endDateInput = document.getElementById("insurance-end-date");
const premiumInput = document.getElementById("insurance-premium");
const riskRateInput = document.getElementById("insurance-risk-rate");
const commissionInput = document.getElementById("insurance-commission");
const stampFeeInput = document.getElementById("insurance-stamp-fee");
const fileInput = document.getElementById("insurance-file");
const notesInput = document.getElementById("insurance-notes");
const extraFieldsRoot = document.getElementById("insurance-extra-fields");
const saveBtn = document.getElementById("insurance-save-btn");
const exportExcelBtn = document.getElementById("insurance-export-excel-btn");
const exportPdfBtn = document.getElementById("insurance-export-pdf-btn");
const newBtn = document.getElementById("insurance-new-btn");
const printListBtn = document.getElementById("insurance-print-list-btn");
const searchInput = document.getElementById("insurance-search");
const tbody = document.getElementById("insurance-body");
const emptyState = document.getElementById("insurance-empty");
const totalCountEl = document.getElementById("insurance-total-count");
const totalAmountEl = document.getElementById("insurance-total-amount");
const totalPremiumEl = document.getElementById("insurance-total-premium");
const filteredCountEl = document.getElementById("insurance-filtered-count");
const totalCommissionEl = document.getElementById("insurance-total-commission");
const totalStampEl = document.getElementById("insurance-total-stamp");
const avgRiskEl = document.getElementById("insurance-avg-risk");
const expiringSoonEl = document.getElementById("insurance-expiring-soon");

const numberFmt = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const INSURANCE_TYPES = [
  { key: "motor", label: "تأمين المركبات" },
  { key: "health", label: "التأمين الصحي" },
  { key: "life", label: "تأمين الحياة" },
  { key: "fire", label: "تأمين الحريق" },
  { key: "marine", label: "التأمين البحري" },
  { key: "engineering", label: "التأمين الهندسي" },
  { key: "travel", label: "تأمين السفر" },
  { key: "liability", label: "تأمين المسؤولية المدنية" },
  { key: "workers_comp", label: "تأمين إصابات العمل" },
  { key: "accident", label: "تأمين الحوادث الشخصية" },
  { key: "burglary", label: "تأمين السرقة" },
  { key: "other", label: "أنواع أخرى" }
];

const EXTRA_FIELDS_BY_TYPE = {
  motor: [
    { key: "coverageType", label: "نوع التغطية", type: "select", required: true, options: ["إلزامي", "شامل", "ضد الغير"] },
    { key: "plateNo", label: "رقم المركبة", type: "text", required: true },
    { key: "chassisNo", label: "رقم الشاصي", type: "text", required: true },
    { key: "modelYear", label: "سنة الصنع", type: "number", required: true },
    { key: "vehicleUse", label: "استخدام المركبة", type: "select", required: true, options: ["خصوصي", "تجاري", "أجرة", "حكومي"] },
    { key: "deductible", label: "التحمل", type: "number", required: false }
  ],
  health: [
    { key: "planType", label: "نوع الخطة", type: "select", required: true, options: ["فردي", "عائلي", "جماعي"] },
    { key: "beneficiaries", label: "عدد المستفيدين", type: "number", required: true },
    { key: "networkType", label: "نوع الشبكة الطبية", type: "select", required: true, options: ["داخل العراق", "إقليمي", "دولي"] },
    { key: "hospitalGrade", label: "درجة المستشفى", type: "text", required: false },
    { key: "chronicCoverage", label: "تغطية الأمراض المزمنة", type: "select", required: true, options: ["نعم", "لا"] }
  ],
  life: [
    { key: "beneficiaryName", label: "اسم المستفيد", type: "text", required: true },
    { key: "beneficiaryRelation", label: "صلة القرابة", type: "text", required: false },
    { key: "sumAssured", label: "مبلغ التعويض", type: "number", required: true },
    { key: "policyTerm", label: "مدة الوثيقة (سنة)", type: "number", required: true },
    { key: "paymentFrequency", label: "تكرار السداد", type: "select", required: true, options: ["شهري", "ربع سنوي", "نصف سنوي", "سنوي"] }
  ],
  fire: [
    { key: "propertyAddress", label: "عنوان العقار", type: "text", required: true },
    { key: "propertyUse", label: "استخدام العقار", type: "select", required: true, options: ["سكني", "تجاري", "صناعي", "مخزن"] },
    { key: "constructionType", label: "نوع الإنشاء", type: "text", required: true },
    { key: "fireSystem", label: "نظام الإطفاء", type: "select", required: true, options: ["متوفر", "غير متوفر"] },
    { key: "contentsValue", label: "قيمة المحتويات", type: "number", required: false }
  ],
  marine: [
    { key: "cargoType", label: "نوع البضاعة", type: "text", required: true },
    { key: "vesselName", label: "اسم السفينة/الناقلة", type: "text", required: false },
    { key: "portFrom", label: "ميناء/منشأ الشحن", type: "text", required: true },
    { key: "portTo", label: "ميناء/وجهة الوصول", type: "text", required: true },
    { key: "shipmentDate", label: "تاريخ الشحن", type: "date", required: true }
  ],
  engineering: [
    { key: "engineeringType", label: "نوع الهندسي", type: "select", required: true, options: ["CAR", "EAR", "معدات", "أعطال ميكانيكية"] },
    { key: "projectName", label: "اسم المشروع", type: "text", required: true },
    { key: "siteLocation", label: "موقع المشروع", type: "text", required: true },
    { key: "contractor", label: "اسم المقاول", type: "text", required: true },
    { key: "projectDuration", label: "مدة التنفيذ (أشهر)", type: "number", required: false }
  ],
  travel: [
    { key: "destination", label: "جهة السفر", type: "text", required: true },
    { key: "tripPurpose", label: "غرض السفر", type: "select", required: true, options: ["سياحة", "عمل", "دراسة", "علاج"] },
    { key: "travelerCount", label: "عدد المسافرين", type: "number", required: true },
    { key: "covidCoverage", label: "تغطية COVID-19", type: "select", required: false, options: ["نعم", "لا"] }
  ],
  liability: [
    { key: "activityType", label: "نوع النشاط", type: "text", required: true },
    { key: "liabilityLimit", label: "حد المسؤولية", type: "number", required: true },
    { key: "thirdPartyScope", label: "نطاق الطرف الثالث", type: "text", required: true },
    { key: "claimHistory", label: "سجل المطالبات", type: "text", required: false }
  ],
  workers_comp: [
    { key: "employeeCount", label: "عدد العاملين", type: "number", required: true },
    { key: "workNature", label: "طبيعة العمل", type: "text", required: true },
    { key: "safetyLevel", label: "مستوى السلامة", type: "select", required: true, options: ["عالي", "متوسط", "منخفض"] },
    { key: "highRiskJobs", label: "وظائف عالية الخطورة", type: "text", required: false }
  ],
  accident: [
    { key: "coveredPersons", label: "الأشخاص المشمولون", type: "number", required: true },
    { key: "accidentScope", label: "نطاق الحوادث", type: "text", required: true },
    { key: "medicalLimit", label: "حد المصاريف الطبية", type: "number", required: true }
  ],
  burglary: [
    { key: "insuredLocation", label: "موقع التأمين", type: "text", required: true },
    { key: "securitySystem", label: "أنظمة الحماية", type: "text", required: true },
    { key: "nightGuard", label: "حراسة ليلية", type: "select", required: true, options: ["نعم", "لا"] },
    { key: "previousIncidents", label: "حوادث سابقة", type: "text", required: false }
  ],
  other: [
    { key: "customField1", label: "تفصيل 1", type: "text", required: true },
    { key: "customField2", label: "تفصيل 2", type: "text", required: false },
    { key: "customField3", label: "تفصيل 3", type: "text", required: false }
  ]
};

let insuranceDocs = [];
let insuranceParties = [];
let editingId = "";

function safeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function typeLabel(typeKey) {
  return INSURANCE_TYPES.find((item) => item.key === typeKey)?.label || typeKey || "-";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function absoluteAssetUrl(path) {
  try {
    return new URL(path, window.location.href).href;
  } catch (_) {
    return path;
  }
}

function buildTypeOptions() {
  typeSelect.innerHTML = INSURANCE_TYPES.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
  typeFilter.innerHTML = `<option value="">كل الأنواع</option>${INSURANCE_TYPES.map((item) => `<option value="${item.key}">${item.label}</option>`).join("")}`;
}

function buildPartyOptions(selectedId = "") {
  const options = insuranceParties
    .slice()
    .sort((a, b) => String(a.partyName || "").localeCompare(String(b.partyName || ""), "ar"))
    .map((party) => {
      const partyId = String(party.id || "").trim();
      const partyType = String(party.partyType || "client").trim() === "company" ? "شركة" : "عميل";
      const label = `${party.partyName || "-"} (${partyType})`;
      return `<option value="${partyId}" ${selectedId === partyId ? "selected" : ""}>${label}</option>`;
    })
    .join("");
  insuredPartySelect.innerHTML = `<option value="">اختر شركة/عميل</option>${options}`;
}

function renderExtraFields(typeKey = typeSelect.value, values = {}) {
  const fields = EXTRA_FIELDS_BY_TYPE[typeKey] || EXTRA_FIELDS_BY_TYPE.other;
  extraFieldsRoot.innerHTML = fields
    .map((field) => {
      const requiredMark = field.required ? " *" : "";
      const requiredAttr = field.required ? "required" : "";
      const isSelect = field.type === "select";
      if (isSelect) {
        const options = (field.options || [])
          .map((opt) => `<option value="${opt}" ${String(values?.[field.key] || "") === String(opt) ? "selected" : ""}>${opt}</option>`)
          .join("");
        return `
          <label>${field.label}${requiredMark}
            <select class="select insurance-extra-input" data-extra-key="${field.key}" data-extra-label="${field.label}" data-required="${field.required ? "1" : "0"}">
              <option value="">اختر</option>
              ${options}
            </select>
          </label>
        `;
      }
      const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
      const step = inputType === "number" ? " step=\"0.01\" min=\"0\"" : "";
      return `
        <label>${field.label}${requiredMark}
          <input class="input insurance-extra-input" data-extra-key="${field.key}" data-extra-label="${field.label}" data-required="${field.required ? "1" : "0"}" type="${inputType}"${step} value="${String(values?.[field.key] || "").replaceAll("\"", "&quot;")}" ${requiredAttr} />
        </label>
      `;
    })
    .join("");
}

function readExtraFieldsStrict() {
  const extraDetails = {};
  let missingLabel = "";
  extraFieldsRoot.querySelectorAll(".insurance-extra-input").forEach((input) => {
    const key = String(input.dataset.extraKey || "").trim();
    if (!key) return;
    const label = String(input.dataset.extraLabel || key).trim();
    const required = String(input.dataset.required || "0") === "1";
    const value = String(input.value || "").trim();
    if (required && !value && !missingLabel) {
      missingLabel = label;
    }
    if (!value) return;
    extraDetails[key] = value;
  });
  return { extraDetails, missingLabel };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadFileViaServer(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch("/api/public-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name || "insurance-file",
      mimeType: file.type || "",
      dataUrl
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok || !result?.data?.url) {
    throw new Error(result?.error || "File upload failed");
  }
  return {
    fileUrl: String(result.data.url || "").trim(),
    fileName: String(result.data.fileName || file.name || "attachment").trim()
  };
}

async function collectPayload() {
  const policyNo = String(policyNoInput.value || "").trim();
  const partyId = String(insuredPartySelect.value || "").trim();
  if (!policyNo || !partyId) {
    throw new Error("policy-party-required");
  }

  const party = insuranceParties.find((item) => String(item.id || "") === partyId);
  if (!party) throw new Error("party-not-found");

  const { extraDetails, missingLabel } = readExtraFieldsStrict();
  if (missingLabel) {
    throw new Error(`missing-extra:${missingLabel}`);
  }

  const payload = {
    insuranceType: String(typeSelect.value || "other"),
    policyNo,
    insuredPartyId: partyId,
    insuredName: String(party.partyName || "").trim(),
    insuredEntityType: String(party.partyType || "client").trim(),
    insuredAmount: safeNumber(amountInput.value),
    startDate: String(startDateInput.value || "").trim(),
    endDate: String(endDateInput.value || "").trim(),
    premium: safeNumber(premiumInput.value),
    riskRate: safeNumber(riskRateInput.value),
    commission: safeNumber(commissionInput.value),
    stampFee: safeNumber(stampFeeInput.value),
    notes: String(notesInput.value || "").trim(),
    extraDetails,
    createdByUid: String(user?.uid || "").trim(),
    createdByName: String(user?.name || user?.email || user?.uid || "").trim()
  };

  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
    throw new Error("invalid-date-range");
  }

  const file = fileInput.files?.[0] || null;
  if (file) {
    const uploaded = await uploadFileViaServer(file);
    payload.fileUrl = uploaded.fileUrl;
    payload.fileName = uploaded.fileName;
  } else if (editingId) {
    const current = insuranceDocs.find((item) => item.id === editingId) || {};
    payload.fileUrl = String(current.fileUrl || "").trim();
    payload.fileName = String(current.fileName || "").trim();
  } else {
    payload.fileUrl = "";
    payload.fileName = "";
  }

  return payload;
}

function resetForm() {
  editingId = "";
  typeSelect.value = "motor";
  policyNoInput.value = "";
  insuredPartySelect.value = "";
  amountInput.value = "";
  startDateInput.value = todayKey();
  endDateInput.value = todayKey();
  premiumInput.value = "";
  riskRateInput.value = "";
  commissionInput.value = "";
  stampFeeInput.value = "";
  notesInput.value = "";
  fileInput.value = "";
  renderExtraFields("motor");
  saveBtn.textContent = "حفظ الوثيقة";
}

function fillFormFromDoc(item) {
  editingId = item.id;
  typeSelect.value = item.insuranceType || "other";
  policyNoInput.value = item.policyNo || "";
  const partyId = String(item.insuredPartyId || "").trim();
  if (partyId && insuranceParties.some((p) => String(p.id) === partyId)) {
    insuredPartySelect.value = partyId;
  } else {
    const match = insuranceParties.find((p) => String(p.partyName || "").trim() === String(item.insuredName || "").trim());
    insuredPartySelect.value = match?.id || "";
  }
  amountInput.value = String(item.insuredAmount ?? "");
  startDateInput.value = item.startDate || "";
  endDateInput.value = item.endDate || "";
  premiumInput.value = String(item.premium ?? "");
  riskRateInput.value = String(item.riskRate ?? "");
  commissionInput.value = String(item.commission ?? "");
  stampFeeInput.value = String(item.stampFee ?? "");
  notesInput.value = item.notes || "";
  fileInput.value = "";
  renderExtraFields(typeSelect.value, item.extraDetails || {});
  saveBtn.textContent = "تحديث الوثيقة";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function rowPeriod(item) {
  const from = item.startDate || "-";
  const to = item.endDate || "-";
  return `${from} إلى ${to}`;
}

function rowSearchText(item) {
  const extras = Object.entries(item.extraDetails || {})
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
  return [
    typeLabel(item.insuranceType),
    item.policyNo,
    item.insuredName,
    item.insuredAmount,
    item.premium,
    item.riskRate,
    item.commission,
    item.stampFee,
    item.startDate,
    item.endDate,
    item.notes,
    item.fileName,
    extras
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function formatMoney(value) {
  return numberFmt.format(safeNumber(value));
}

function daysUntil(dateStr) {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const end = new Date(dateStr);
  if (Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function exportRows(items) {
  return items.map((item) => {
    const extraText = Object.entries(item.extraDetails || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
    return {
      "Insurance Type": typeLabel(item.insuranceType),
      "نوع التأمين": typeLabel(item.insuranceType),
      "Policy No": item.policyNo || "-",
      "رقم الوثيقة": item.policyNo || "-",
      "Insured Party": item.insuredName || "-",
      "اسم المؤمن/الشركة": item.insuredName || "-",
      "Insured Amount": safeNumber(item.insuredAmount),
      "مبلغ التأمين": safeNumber(item.insuredAmount),
      "Premium": safeNumber(item.premium),
      "قسط التأمين": safeNumber(item.premium),
      "Risk Rate %": safeNumber(item.riskRate),
      "نسبة الخطر %": safeNumber(item.riskRate),
      "Commission": safeNumber(item.commission),
      "العمولة": safeNumber(item.commission),
      "Stamp Fee": safeNumber(item.stampFee),
      "رسم الطابع": safeNumber(item.stampFee),
      "From": item.startDate || "-",
      "من": item.startDate || "-",
      "To": item.endDate || "-",
      "إلى": item.endDate || "-",
      "Attachment": item.fileName || "-",
      "المرفق": item.fileName || "-",
      "Notes": item.notes || "-",
      "ملاحظات": item.notes || "-",
      "Details": extraText || "-",
      "تفاصيل إضافية": extraText || "-"
    };
  });
}

function reportMetrics(items) {
  const count = items.length;
  const amountTotal = items.reduce((sum, item) => sum + safeNumber(item.insuredAmount), 0);
  const premiumTotal = items.reduce((sum, item) => sum + safeNumber(item.premium), 0);
  const commissionTotal = items.reduce((sum, item) => sum + safeNumber(item.commission), 0);
  const stampTotal = items.reduce((sum, item) => sum + safeNumber(item.stampFee), 0);
  const riskAvg = count ? items.reduce((sum, item) => sum + safeNumber(item.riskRate), 0) / count : 0;
  const expiringSoon = items.filter((item) => {
    const d = daysUntil(item.endDate);
    return d >= 0 && d <= 30;
  }).length;
  return { count, amountTotal, premiumTotal, commissionTotal, stampTotal, riskAvg, expiringSoon };
}

function exportToExcel(items) {
  if (!window.XLSX) {
    showToast("error", "Excel library not available");
    return;
  }
  const rows = exportRows(items);
  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.json_to_sheet(rows);
  window.XLSX.utils.book_append_sheet(wb, ws, "InsuranceDocs");
  window.XLSX.writeFile(wb, `insurance-docs-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function buildReportHtml(items, title = "تقرير وثائق التأمين") {
  const logoUrl = absoluteAssetUrl("../HRMS%20Html/assets/logo.jpg");
  const metrics = reportMetrics(items);
  const printedAt = new Date().toLocaleString();
  const rows = items
    .map((item) => {
      const extra = Object.entries(item.extraDetails || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
      return `
        <tr>
          <td>${typeLabel(item.insuranceType)}</td>
          <td>${item.policyNo || "-"}</td>
          <td>${item.insuredName || "-"}</td>
          <td>${formatMoney(item.insuredAmount)}</td>
          <td>${formatMoney(item.premium)}</td>
          <td>${formatMoney(item.riskRate)}</td>
          <td>${formatMoney(item.commission)}</td>
          <td>${formatMoney(item.stampFee)}</td>
          <td>${item.startDate || "-"} - ${item.endDate || "-"}</td>
          <td>${extra || item.notes || "-"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <html>
      <head>
        <title>Insurance Documents Report</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; font-size: 12px; }
          .sheet { border: 1px solid #d5dde8; border-radius: 10px; padding: 12px; }
          .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 10px; }
          .brand { display: flex; align-items: center; gap: 10px; }
          .brand img { width: 44px; height: 44px; border-radius: 8px; border: 1px solid #cbd5e1; }
          .title-ar { font-weight: 700; direction: rtl; text-align: right; }
          .title-en { color: #334155; }
          .meta { display: grid; gap: 2px; font-size: 11px; }
          .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
          .box { border: 1px solid #d6dee6; border-radius: 8px; padding: 6px 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #d6dee6; padding: 5px; text-align: left; vertical-align: top; }
          th { background: #e8f2f1; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            <div class="brand">
              <img src="${logoUrl}" alt="Company Logo" onerror="this.style.display='none'" />
              <div>
                <div class="title-ar">شركة وادي الرافدين - ${title}</div>
                <div class="title-en">Wadi Al-Rafidain Company - Insurance Documents Report</div>
              </div>
            </div>
            <div class="meta">
              <div><strong>Printed:</strong> ${printedAt}</div>
              <div><strong>Rows / عدد السجلات:</strong> ${metrics.count}</div>
            </div>
          </div>
          <div class="metrics">
            <div class="box"><strong>Total Amount</strong><div>إجمالي مبلغ التأمين: ${formatMoney(metrics.amountTotal)}</div></div>
            <div class="box"><strong>Total Premium</strong><div>إجمالي القسط: ${formatMoney(metrics.premiumTotal)}</div></div>
            <div class="box"><strong>Total Commission</strong><div>إجمالي العمولات: ${formatMoney(metrics.commissionTotal)}</div></div>
            <div class="box"><strong>Avg Risk / Expiring</strong><div>${numberFmt.format(metrics.riskAvg)}% | ${metrics.expiringSoon}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Insurance Type / نوع التأمين</th>
                <th>Policy No / رقم الوثيقة</th>
                <th>Insured / المؤمن</th>
                <th>Amount / مبلغ</th>
                <th>Premium / قسط</th>
                <th>Risk % / نسبة الخطر</th>
                <th>Commission / عمولة</th>
                <th>Stamp / رسم الطابع</th>
                <th>Period / الفترة</th>
                <th>Details / تفاصيل</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </body>
    </html>
  `;
}

function exportReportPdf(items) {
  const printable = window.open("", "_blank");
  if (!printable) return;
  printable.document.write(buildReportHtml(items, "تقرير وثائق التأمين"));
  printable.document.close();
  printable.focus();
  printable.print();
}

function getFilteredDocs() {
  const q = String(searchInput.value || "").trim().toLowerCase();
  const type = String(typeFilter.value || "").trim();
  return insuranceDocs.filter((item) => {
    const matchesType = !type || item.insuranceType === type;
    const matchesSearch = !q || rowSearchText(item).includes(q);
    return matchesType && matchesSearch;
  });
}

function printDocs(items, title = "وثائق التأمين") {
  const printable = window.open("", "_blank");
  if (!printable) return;
  printable.document.write(buildReportHtml(items, title));
  printable.document.close();
  printable.focus();
  printable.print();
}

function bindRowActions() {
  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = String(button.dataset.id || "").trim();
      const action = String(button.dataset.action || "").trim();
      const item = insuranceDocs.find((doc) => doc.id === id);
      if (!item) return;
      if (action === "edit" && canManage) {
        fillFormFromDoc(item);
      }
      if (action === "print") {
        printDocs([item], `وثيقة تأمين رقم ${item.policyNo || ""}`);
      }
      if (action === "delete" && canDelete) {
        if (!window.confirm("هل تريد حذف هذه الوثيقة؟")) return;
        try {
          await deleteInsuranceDoc(item.id);
          showToast("success", "تم حذف الوثيقة");
          await loadInsuranceDocs();
        } catch (error) {
          console.error("Delete insurance doc failed:", error);
          showToast("error", "فشل حذف الوثيقة");
        }
      }
    });
  });
}

function renderSummary(filtered) {
  const totals = reportMetrics(insuranceDocs);
  const filteredMetrics = reportMetrics(filtered);
  totalCountEl.textContent = String(totals.count);
  totalAmountEl.textContent = formatMoney(totals.amountTotal);
  totalPremiumEl.textContent = formatMoney(totals.premiumTotal);
  filteredCountEl.textContent = String(filtered.length);
  totalCommissionEl.textContent = formatMoney(totals.commissionTotal);
  totalStampEl.textContent = formatMoney(totals.stampTotal);
  avgRiskEl.textContent = `${numberFmt.format(filtered.length ? filteredMetrics.riskAvg : totals.riskAvg)}%`;
  expiringSoonEl.textContent = String(filtered.length ? filteredMetrics.expiringSoon : totals.expiringSoon);
}

function renderTable() {
  const filtered = getFilteredDocs();
  tbody.innerHTML = filtered
    .map(
      (item) => `
        <tr>
          <td><span class="insurance-chip">${typeLabel(item.insuranceType)}</span></td>
          <td>${item.policyNo || "-"}</td>
          <td>${item.insuredName || "-"}</td>
          <td>${formatMoney(item.insuredAmount)}</td>
          <td>${formatMoney(item.premium)}</td>
          <td>${rowPeriod(item)}</td>
          <td>
            ${canManage ? `<button class="btn btn-ghost" data-action="edit" data-id="${item.id}">تعديل</button>` : ""}
            <button class="btn btn-ghost" data-action="print" data-id="${item.id}">طباعة</button>
            ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${item.id}">حذف</button>` : ""}
          </td>
        </tr>
      `
    )
    .join("");
  emptyState.classList.toggle("hidden", filtered.length > 0);
  renderSummary(filtered);
  bindRowActions();
}

async function loadInsuranceDocs() {
  try {
    showTableSkeleton(tbody, { rows: 6, cols: 7 });
    insuranceDocs = await listInsuranceDocs({ limitCount: 700 });
    renderTable();
  } catch (error) {
    console.error("Load insurance docs failed:", error);
    insuranceDocs = [];
    renderTable();
    showToast("error", "تعذر تحميل وثائق التأمين");
  }
}

async function loadInsuranceParties() {
  try {
    insuranceParties = await listInsuranceParties({ limitCount: 1000 });
  } catch (error) {
    console.error("Load insurance parties failed:", error);
    insuranceParties = [];
  }
  buildPartyOptions();
}

async function handleSave() {
  if (!canManage) return;
  saveBtn.disabled = true;
  try {
    const payload = await collectPayload();
    if (editingId) {
      await updateInsuranceDoc(editingId, payload);
      showToast("success", "تم تحديث الوثيقة بنجاح");
    } else {
      await createInsuranceDoc(payload);
      showToast("success", "تم حفظ الوثيقة بنجاح");
    }
    resetForm();
    await loadInsuranceDocs();
  } catch (error) {
    const message = String(error?.message || "");
    if (message === "policy-party-required") {
      showToast("error", "رقم الوثيقة واسم المؤمن/الشركة مطلوبان");
    } else if (message === "party-not-found") {
      showToast("error", "الجهة المختارة غير موجودة، اختر من القائمة");
    } else if (error?.message === "invalid-date-range") {
      showToast("error", "تاريخ نهاية التأمين يجب أن يكون بعد تاريخ البداية");
    } else if (message.startsWith("missing-extra:")) {
      showToast("error", `الحقل الإلزامي ناقص: ${message.replace("missing-extra:", "")}`);
    } else {
      console.error("Save insurance doc failed:", error);
      showToast("error", error?.message || "فشل حفظ الوثيقة");
    }
  } finally {
    saveBtn.disabled = false;
  }
}

if (!canManage) {
  saveBtn.classList.add("hidden");
  newBtn.classList.add("hidden");
}

buildTypeOptions();
resetForm();

typeSelect.addEventListener("change", () => {
  renderExtraFields(typeSelect.value);
});
saveBtn.addEventListener("click", () => {
  void handleSave();
});
newBtn.addEventListener("click", resetForm);
searchInput.addEventListener("input", renderTable);
typeFilter.addEventListener("change", renderTable);
printListBtn.addEventListener("click", () => {
  const filtered = getFilteredDocs();
  if (!filtered.length) {
    showToast("error", "لا توجد نتائج للطباعة");
    return;
  }
  printDocs(filtered, "تقرير وثائق التأمين");
});
exportExcelBtn?.addEventListener("click", () => {
  const filtered = getFilteredDocs();
  if (!filtered.length) {
    showToast("error", "لا توجد نتائج للتصدير");
    return;
  }
  exportToExcel(filtered);
});
exportPdfBtn?.addEventListener("click", () => {
  const filtered = getFilteredDocs();
  if (!filtered.length) {
    showToast("error", "لا توجد نتائج للتصدير");
    return;
  }
  void exportReportPdf(filtered);
});
window.addEventListener("global-search", (event) => {
  searchInput.value = event.detail || "";
  renderTable();
});

trackUxEvent({ event: "page_open", module: "insurance_docs" });

(async () => {
  await loadInsuranceParties();
  await loadInsuranceDocs();
})();

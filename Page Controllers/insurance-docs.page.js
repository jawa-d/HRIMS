import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { APP_NAME } from "../app.config.js";
import { logSecurityEvent } from "../Services/security-audit.service.js";
import { createNotification } from "../Services/notifications.service.js";
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
if (window.lucide?.createIcons) window.lucide.createIcons();

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
const formSection = document.getElementById("insurance-form-section");
const summarySection = document.getElementById("insurance-summary-section");
const listSection = document.getElementById("insurance-list-section");
const pageMode = String(document.body.dataset.insuranceMode || "library").toLowerCase() === "entry" ? "entry" : "library";
const isEntryMode = pageMode === "entry";
const isLibraryMode = pageMode === "library";

const numFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INSURANCE_TYPES = [
  ["motor", "المركبات / Motor"], ["health", "الصحي / Health"], ["life", "الحياة / Life"], ["fire", "الحريق / Fire"],
  ["marine", "البحري / Marine"], ["engineering", "الهندسي / Engineering"], ["travel", "السفر / Travel"], ["liability", "المسؤولية / Liability"],
  ["workers_comp", "إصابات العمل / Workers Comp"], ["accident", "الحوادث / Accident"], ["burglary", "السرقة / Burglary"], ["other", "أخرى / Other"]
];

let insuranceDocs = [];
let insuranceParties = [];
let editingId = "";
let stagedFiles = [];

const pro = {};

const updateSummaryValue = (el, nextValue) => {
  if (!el) return;
  const current = txt(el.textContent);
  if (current === nextValue) return;
  el.textContent = nextValue;
  el.classList.remove("is-updated");
  requestAnimationFrame(() => el.classList.add("is-updated"));
};

const txt = (v) => String(v || "").trim();
const money = (v) => numFmt.format(Math.max(0, Number(v) || 0));
const today = () => new Date().toISOString().slice(0, 10);
const esc = (v) => txt(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
const byType = (k) => INSURANCE_TYPES.find((t) => t[0] === k)?.[1] || k || "-";
const COMPANY_NAME_AR = "شركة وادي الرافدين";
const COMPANY_NAME_EN = APP_NAME || "Wadi Al-Rafidain";
const COMPANY_LOGO_PATH = "assets/logo.jpg";
let companyLogoDataUrlPromise = null;
let pdfArabicFontBase64Promise = null;
const PDF_ARABIC_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/aliftype/amiri@master/fonts/ttf/Amiri-Regular.ttf",
  "https://raw.githubusercontent.com/aliftype/amiri/master/fonts/ttf/Amiri-Regular.ttf"
];
const PDF_ARABIC_FONT_FILE = "Amiri-Regular.ttf";
const PDF_ARABIC_FONT_NAME = "Amiri";
const AR_LABELS = {
  "Coverage Type": "نوع التغطية",
  "Plate Number": "رقم اللوحة",
  "Chassis Number": "رقم الشاصي",
  "Engine Number": "رقم المحرك",
  "Model Year": "سنة الصنع",
  "Vehicle Brand": "ماركة المركبة",
  "Vehicle Model": "موديل المركبة",
  "Vehicle Use": "استخدام المركبة",
  "Seat Count": "عدد المقاعد",
  "Deductible": "التحمل",
  "Plan Type": "نوع الخطة",
  "Beneficiaries Count": "عدد المستفيدين",
  "Network Scope": "نطاق الشبكة",
  "Hospital Room Class": "درجة الغرفة",
  "Annual Limit": "الحد السنوي",
  "Co-pay %": "نسبة التحمل",
  "Pre-existing Conditions": "الحالات السابقة",
  "Maternity Coverage": "تغطية الولادة",
  "Beneficiary Name": "اسم المستفيد",
  "Beneficiary Relation": "صلة القرابة",
  "Insured DOB": "تاريخ الميلاد",
  "Smoker Status": "حالة التدخين",
  "Sum Assured": "مبلغ التأمين",
  "Policy Term (Years)": "مدة الوثيقة (سنة)",
  "Premium Mode": "نمط الدفع",
  "Occupation Risk Class": "تصنيف المخاطر",
  "Property Address": "عنوان العقار",
  "Property Use": "استخدام العقار",
  "Construction Type": "نوع الإنشاء",
  "Fire Protection": "حماية الحريق",
  "Building Value": "قيمة المبنى",
  "Content Value": "قيمة المحتويات",
  "Occupancy": "الإشغال",
  "Cargo Type": "نوع البضاعة",
  "Packing Type": "نوع التغليف",
  "Conveyance": "وسيلة النقل",
  "Vessel/Carrier Name": "اسم الناقلة",
  "Port of Loading": "ميناء الشحن",
  "Port of Discharge": "ميناء التفريغ",
  "Shipment Date": "تاريخ الشحن",
  "Incoterm": "شرط الشحن",
  "Declared Value": "القيمة المعلنة",
  "Policy Form": "شكل الوثيقة",
  "Project Name": "اسم المشروع",
  "Project Owner": "مالك المشروع",
  "Project Location": "موقع المشروع",
  "Main Contractor": "المقاول الرئيسي",
  "Sum Insured": "المبلغ المؤمن",
  "Maintenance Months": "أشهر الصيانة",
  "TPL Limit": "حد الطرف الثالث",
  "Destination": "الوجهة",
  "Trip Purpose": "غرض السفر",
  "Travelers Count": "عدد المسافرين",
  "Trip Duration (Days)": "مدة الرحلة (يوم)",
  "Passport Number": "رقم الجواز",
  "Coverage Plan": "خطة التغطية",
  "Winter Sports Cover": "تغطية الرياضات الشتوية",
  "COVID Cover": "تغطية كوفيد",
  "Business Activity": "النشاط التجاري",
  "Annual Turnover": "الدوران السنوي",
  "Employee Count": "عدد الموظفين",
  "Liability Limit": "حد المسؤولية",
  "Third Party Scope": "نطاق الطرف الثالث",
  "Geographical Scope": "النطاق الجغرافي",
  "Previous Claims": "المطالبات السابقة",
  "Employees Count": "عدد العاملين",
  "Nature of Work": "طبيعة العمل",
  "Estimated Payroll": "الرواتب التقديرية",
  "Safety Level": "مستوى السلامة",
  "High Risk Roles": "الوظائف عالية الخطورة",
  "Prior Claims Count": "عدد المطالبات السابقة",
  "Medical Network": "الشبكة الطبية",
  "Covered Persons": "الأشخاص المشمولون",
  "Accident Scope": "نطاق الحوادث",
  "Occupation Class": "فئة المهنة",
  "Medical Expense Limit": "حد المصاريف الطبية",
  "Disability Benefit Limit": "حد العجز",
  "Death Benefit": "تعويض الوفاة",
  "Sports Risk Cover": "تغطية مخاطر الرياضة",
  "Insured Location": "موقع التأمين",
  "Building Type": "نوع المبنى",
  "Security System": "نظام الحماية",
  "Alarm Monitoring": "مراقبة الإنذار",
  "Safe Type": "نوع الخزنة",
  "Stock Value": "قيمة المخزون",
  "Cash in Safe Limit": "حد النقد بالخزنة",
  "Night Guard": "حراسة ليلية",
  "Prior Incidents": "الحوادث السابقة",
  "Line of Business": "نوع النشاط",
  "Risk Description": "وصف المخاطر",
  "Key Conditions": "الشروط الرئيسية",
  "Underwriting Notes": "ملاحظات الاكتتاب"
};
const biLabel = (label) => (AR_LABELS[label] ? `${AR_LABELS[label]} / ${label}` : label);
const EXTRA_FIELDS_BY_TYPE = {
  motor: [
    { key: "coverageType", label: "Coverage Type", type: "select", required: true, options: ["Comprehensive", "Third Party", "Mandatory"] },
    { key: "plateNo", label: "Plate Number", type: "text", required: true, placeholder: "Baghdad-12345" },
    { key: "chassisNo", label: "Chassis Number", type: "text", required: true },
    { key: "engineNo", label: "Engine Number", type: "text", required: true },
    { key: "modelYear", label: "Model Year", type: "number", required: true, min: 1950, step: 1 },
    { key: "vehicleBrand", label: "Vehicle Brand", type: "text", required: true },
    { key: "vehicleModel", label: "Vehicle Model", type: "text", required: true },
    { key: "vehicleUse", label: "Vehicle Use", type: "select", required: true, options: ["Private", "Commercial", "Taxi", "Government"] },
    { key: "seatCount", label: "Seat Count", type: "number", required: false, min: 1, step: 1 },
    { key: "deductible", label: "Deductible", type: "number", required: false, min: 0, step: 0.01 }
  ],
  health: [
    { key: "planType", label: "Plan Type", type: "select", required: true, options: ["Individual", "Family", "Corporate"] },
    { key: "beneficiaries", label: "Beneficiaries Count", type: "number", required: true, min: 1, step: 1 },
    { key: "networkType", label: "Network Scope", type: "select", required: true, options: ["Local", "Regional", "International"] },
    { key: "roomClass", label: "Hospital Room Class", type: "select", required: false, options: ["Shared", "Private", "VIP"] },
    { key: "annualLimit", label: "Annual Limit", type: "number", required: true, min: 0, step: 0.01 },
    { key: "coPayRate", label: "Co-pay %", type: "number", required: false, min: 0, step: 0.01 },
    { key: "preExisting", label: "Pre-existing Conditions", type: "select", required: false, options: ["Covered", "Excluded", "Conditional"] },
    { key: "maternityCoverage", label: "Maternity Coverage", type: "select", required: false, options: ["Yes", "No"] }
  ],
  life: [
    { key: "beneficiaryName", label: "Beneficiary Name", type: "text", required: true },
    { key: "beneficiaryRelation", label: "Beneficiary Relation", type: "text", required: false },
    { key: "insuredDob", label: "Insured DOB", type: "date", required: true },
    { key: "smokerStatus", label: "Smoker Status", type: "select", required: true, options: ["Smoker", "Non-smoker"] },
    { key: "sumAssured", label: "Sum Assured", type: "number", required: true, min: 0, step: 0.01 },
    { key: "policyTermYears", label: "Policy Term (Years)", type: "number", required: true, min: 1, step: 1 },
    { key: "premiumMode", label: "Premium Mode", type: "select", required: true, options: ["Monthly", "Quarterly", "Semi-Annual", "Annual"] },
    { key: "occupationRisk", label: "Occupation Risk Class", type: "select", required: false, options: ["Low", "Medium", "High"] }
  ],
  fire: [
    { key: "propertyAddress", label: "Property Address", type: "text", required: true },
    { key: "propertyUse", label: "Property Use", type: "select", required: true, options: ["Residential", "Commercial", "Industrial", "Warehouse"] },
    { key: "constructionType", label: "Construction Type", type: "text", required: true },
    { key: "fireProtection", label: "Fire Protection", type: "select", required: true, options: ["Sprinkler", "Hydrant", "Extinguisher", "None"] },
    { key: "buildingValue", label: "Building Value", type: "number", required: true, min: 0, step: 0.01 },
    { key: "contentValue", label: "Content Value", type: "number", required: false, min: 0, step: 0.01 },
    { key: "occupancy", label: "Occupancy", type: "select", required: false, options: ["Owner Occupied", "Rented", "Vacant"] }
  ],
  marine: [
    { key: "cargoType", label: "Cargo Type", type: "text", required: true },
    { key: "packingType", label: "Packing Type", type: "text", required: false },
    { key: "conveyanceType", label: "Conveyance", type: "select", required: true, options: ["Sea", "Air", "Land", "Multi-Modal"] },
    { key: "vesselName", label: "Vessel/Carrier Name", type: "text", required: false },
    { key: "portFrom", label: "Port of Loading", type: "text", required: true },
    { key: "portTo", label: "Port of Discharge", type: "text", required: true },
    { key: "shipmentDate", label: "Shipment Date", type: "date", required: true },
    { key: "incoterm", label: "Incoterm", type: "select", required: false, options: ["FOB", "CIF", "CFR", "EXW", "DAP"] },
    { key: "declaredValue", label: "Declared Value", type: "number", required: true, min: 0, step: 0.01 }
  ],
  engineering: [
    { key: "engineeringType", label: "Policy Form", type: "select", required: true, options: ["CAR", "EAR", "CPM", "Machinery Breakdown"] },
    { key: "projectName", label: "Project Name", type: "text", required: true },
    { key: "projectOwner", label: "Project Owner", type: "text", required: true },
    { key: "siteLocation", label: "Project Location", type: "text", required: true },
    { key: "contractor", label: "Main Contractor", type: "text", required: true },
    { key: "sumInsured", label: "Sum Insured", type: "number", required: true, min: 0, step: 0.01 },
    { key: "maintenanceMonths", label: "Maintenance Months", type: "number", required: false, min: 0, step: 1 },
    { key: "thirdPartyLimit", label: "TPL Limit", type: "number", required: false, min: 0, step: 0.01 }
  ],
  travel: [
    { key: "destination", label: "Destination", type: "text", required: true },
    { key: "tripPurpose", label: "Trip Purpose", type: "select", required: true, options: ["Tourism", "Business", "Study", "Medical"] },
    { key: "travelerCount", label: "Travelers Count", type: "number", required: true, min: 1, step: 1 },
    { key: "tripDays", label: "Trip Duration (Days)", type: "number", required: true, min: 1, step: 1 },
    { key: "passportNo", label: "Passport Number", type: "text", required: true },
    { key: "coveragePlan", label: "Coverage Plan", type: "select", required: true, options: ["Economy", "Standard", "Premium"] },
    { key: "winterSports", label: "Winter Sports Cover", type: "select", required: false, options: ["Yes", "No"] },
    { key: "covidCoverage", label: "COVID Cover", type: "select", required: false, options: ["Yes", "No"] }
  ],
  liability: [
    { key: "activityType", label: "Business Activity", type: "text", required: true },
    { key: "annualTurnover", label: "Annual Turnover", type: "number", required: true, min: 0, step: 0.01 },
    { key: "employeeCount", label: "Employee Count", type: "number", required: true, min: 1, step: 1 },
    { key: "liabilityLimit", label: "Liability Limit", type: "number", required: true, min: 0, step: 0.01 },
    { key: "thirdPartyScope", label: "Third Party Scope", type: "text", required: true },
    { key: "geoScope", label: "Geographical Scope", type: "select", required: false, options: ["Iraq", "Regional", "Worldwide"] },
    { key: "claimHistory", label: "Previous Claims", type: "text", required: false },
    { key: "deductible", label: "Deductible", type: "number", required: false, min: 0, step: 0.01 }
  ],
  workers_comp: [
    { key: "employeeCount", label: "Employees Count", type: "number", required: true, min: 1, step: 1 },
    { key: "workNature", label: "Nature of Work", type: "text", required: true },
    { key: "payrollEstimate", label: "Estimated Payroll", type: "number", required: true, min: 0, step: 0.01 },
    { key: "safetyLevel", label: "Safety Level", type: "select", required: true, options: ["High", "Medium", "Low"] },
    { key: "highRiskRoles", label: "High Risk Roles", type: "text", required: false },
    { key: "priorClaimsCount", label: "Prior Claims Count", type: "number", required: false, min: 0, step: 1 },
    { key: "medicalNetwork", label: "Medical Network", type: "select", required: false, options: ["Basic", "Standard", "Premium"] }
  ],
  accident: [
    { key: "coveredPersons", label: "Covered Persons", type: "number", required: true, min: 1, step: 1 },
    { key: "accidentScope", label: "Accident Scope", type: "text", required: true },
    { key: "occupationClass", label: "Occupation Class", type: "select", required: true, options: ["Office", "Field", "Industrial"] },
    { key: "medicalLimit", label: "Medical Expense Limit", type: "number", required: true, min: 0, step: 0.01 },
    { key: "disabilityLimit", label: "Disability Benefit Limit", type: "number", required: false, min: 0, step: 0.01 },
    { key: "deathBenefit", label: "Death Benefit", type: "number", required: false, min: 0, step: 0.01 },
    { key: "sportsRisk", label: "Sports Risk Cover", type: "select", required: false, options: ["Yes", "No"] }
  ],
  burglary: [
    { key: "insuredLocation", label: "Insured Location", type: "text", required: true },
    { key: "buildingType", label: "Building Type", type: "select", required: true, options: ["Shop", "Office", "Warehouse", "Home"] },
    { key: "securitySystem", label: "Security System", type: "text", required: true },
    { key: "alarmMonitoring", label: "Alarm Monitoring", type: "select", required: false, options: ["24/7", "Business Hours", "None"] },
    { key: "safeType", label: "Safe Type", type: "text", required: false },
    { key: "stockValue", label: "Stock Value", type: "number", required: true, min: 0, step: 0.01 },
    { key: "cashLimit", label: "Cash in Safe Limit", type: "number", required: false, min: 0, step: 0.01 },
    { key: "nightGuard", label: "Night Guard", type: "select", required: false, options: ["Yes", "No"] },
    { key: "priorIncidents", label: "Prior Incidents", type: "text", required: false }
  ],
  other: [
    { key: "lineOfBusiness", label: "Line of Business", type: "text", required: true },
    { key: "riskDescription", label: "Risk Description", type: "textarea", required: true, rows: 2 },
    { key: "keyConditions", label: "Key Conditions", type: "textarea", required: false, rows: 2 },
    { key: "underwritingNotes", label: "Underwriting Notes", type: "textarea", required: false, rows: 2 }
  ]
};

function normalizeAttachments(item) {
  if (Array.isArray(item.attachments) && item.attachments.length) {
    return item.attachments.map((a) => ({
      fileUrl: txt(a.fileUrl || a.url),
      fileName: txt(a.fileName || a.name) || "attachment",
      mimeType: txt(a.mimeType),
      sizeBytes: Number(a.sizeBytes || 0) || 0
    })).filter((a) => a.fileUrl);
  }
  if (item.fileUrl) return [{ fileUrl: txt(item.fileUrl), fileName: txt(item.fileName) || "attachment", mimeType: "", sizeBytes: 0 }];
  return [];
}

function normalizeDoc(item) {
  const issueDate = txt(item.issueDate || item.startDate);
  const expiryDate = txt(item.expiryDate || item.endDate);
  const status = txt(item.status) || (expiryDate && expiryDate < today() ? "expired" : "active");
  return {
    ...item,
    issueDate,
    expiryDate,
    startDate: issueDate,
    endDate: expiryDate,
    customerName: txt(item.customerName || item.insuredName),
    uploadedBy: txt(item.uploadedBy || item.createdByName || item.createdByUid),
    idNumber: txt(item.idNumber),
    folder: txt(item.folder),
    category: txt(item.category),
    tags: Array.isArray(item.tags) ? item.tags.map((t) => txt(t)).filter(Boolean) : [],
    status,
    attachments: normalizeAttachments(item)
  };
}

function renderExtraFields(typeKey = typeSelect.value, values = {}) {
  const fields = EXTRA_FIELDS_BY_TYPE[typeKey] || EXTRA_FIELDS_BY_TYPE.other;
  const requiredCount = fields.filter((field) => field.required).length;
  extraFieldsRoot.innerHTML = `
    <div class="insurance-extra-meta">النوع / Type: ${esc(byType(typeKey))} | الحقول / Fields: ${fields.length} | الإلزامي / Required: ${requiredCount}</div>
    ${fields.map((field) => {
      const requiredMark = field.required ? " *" : "";
      const requiredAttr = field.required ? " required" : "";
      const placeholderAttr = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : "";
      const labelText = biLabel(field.label);
      if (field.type === "select") {
        const optionsHtml = (field.options || [])
          .map((option) => {
            const selected = txt(values[field.key]) === txt(option) ? " selected" : "";
            return `<option value="${esc(option)}"${selected}>${esc(option)}</option>`;
          })
          .join("");
        return `
          <label>${labelText}${requiredMark}
            <select class="select insurance-extra-input" data-extra-key="${field.key}" data-extra-label="${labelText}" data-required="${field.required ? "1" : "0"}"${requiredAttr}>
              <option value="">اختر / Select</option>
              ${optionsHtml}
            </select>
          </label>`;
      }
      if (field.type === "textarea") {
        const rowsAttr = Number(field.rows || 2);
        return `
        <label>${labelText}${requiredMark}
          <textarea class="input insurance-extra-input" data-extra-key="${field.key}" data-extra-label="${labelText}" data-required="${field.required ? "1" : "0"}" rows="${rowsAttr}"${requiredAttr}${placeholderAttr}>${esc(values[field.key])}</textarea>
        </label>`;
      }
      const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
      const minAttr = typeof field.min === "number" ? ` min="${field.min}"` : (inputType === "number" ? " min=\"0\"" : "");
      const stepAttr = typeof field.step === "number" ? ` step="${field.step}"` : (inputType === "number" ? " step=\"0.01\"" : "");
      return `
        <label>${labelText}${requiredMark}
          <input class="input insurance-extra-input" data-extra-key="${field.key}" data-extra-label="${labelText}" data-required="${field.required ? "1" : "0"}" type="${inputType}"${minAttr}${stepAttr}${placeholderAttr} value="${esc(values[field.key])}"${requiredAttr} />
        </label>`;
    }).join("")}
  `;
}

function readExtraFieldsStrict() {
  const extraDetails = {};
  let missingLabel = "";
  extraFieldsRoot.querySelectorAll(".insurance-extra-input").forEach((input) => {
    const key = txt(input.dataset.extraKey);
    const label = txt(input.dataset.extraLabel || key);
    const required = txt(input.dataset.required) === "1";
    const value = txt(input.value);
    if (required && !value && !missingLabel) missingLabel = label;
    if (value) extraDetails[key] = value;
  });
  return { extraDetails, missingLabel };
}

function buildTypeOptions() {
  typeSelect.innerHTML = INSURANCE_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  typeFilter.innerHTML = `<option value="">كل الأنواع / All Types</option>${INSURANCE_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}`;
}

function buildPartyOptions(selectedId = "") {
  const opts = insuranceParties
    .slice()
    .sort((a, b) => txt(a.partyName).localeCompare(txt(b.partyName)))
    .map((party) => `<option value="${esc(party.id)}" ${txt(party.id) === selectedId ? "selected" : ""}>${esc(party.partyName)}</option>`)
    .join("");
  insuredPartySelect.innerHTML = `<option value="">اختر / Select</option>${opts}`;
}

function applyModeLayout() {
  document.body.classList.toggle("insurance-mode-entry", isEntryMode);
  document.body.classList.toggle("insurance-mode-library", isLibraryMode);
  const titleEl = document.querySelector(".page-title");
  const subtitleEl = document.querySelector(".page-header .text-muted");
  if (titleEl) {
    titleEl.textContent = isEntryMode
      ? "إدخال وثائق التأمين / Insurance Document Entry"
      : "مكتبة وثائق التأمين / Insurance Documents Library";
  }
  if (subtitleEl) {
    subtitleEl.textContent = isEntryMode
      ? "شاشة إدخال وعملية تحديث منفصلة بالكامل مع حقول ديناميكية حسب نوع التأمين."
      : "شاشة أرشفة وبحث وتحليل الوثائق مع إجراءات العرض والطباعة والتصدير.";
  }
  const headerActions = document.querySelector(".insurance-header-actions");
  if (headerActions && !headerActions.querySelector("[data-mode-nav]")) {
    const nav = document.createElement("div");
    nav.className = "insurance-mode-nav";
    nav.innerHTML = `
      <a class="btn ${isLibraryMode ? "btn-primary" : "btn-outline"}" data-mode-nav href="insurance-docs.html">مكتبة الوثائق / Library</a>
      <a class="btn ${isEntryMode ? "btn-primary" : "btn-outline"}" data-mode-nav href="insurance-docs-entry.html">إدخال الوثائق / Entry</a>
    `;
    headerActions.prepend(nav);
  }

  if (isLibraryMode) {
    if (formSection) formSection.classList.add("hidden");
    if (summarySection) summarySection.classList.remove("hidden");
    if (listSection) listSection.classList.remove("hidden");
    if (saveBtn) saveBtn.classList.add("hidden");
    if (newBtn) newBtn.classList.add("hidden");
  }

  if (isEntryMode) {
    if (formSection) formSection.classList.remove("hidden");
    if (summarySection) summarySection.classList.add("hidden");
    if (listSection) listSection.classList.add("hidden");
    if (exportExcelBtn) exportExcelBtn.classList.add("hidden");
    if (exportPdfBtn) exportPdfBtn.classList.add("hidden");
    if (printListBtn) printListBtn.classList.add("hidden");
  }
}

function addEnhancements() {
  const formCard = document.querySelector(".insurance-form-card");
  const inlineActions = document.querySelector(".insurance-inline-actions");
  const listHead = document.querySelector(".insurance-list-head");
  if (!formCard || !inlineActions || !listHead) return;

  const fields = document.createElement("div");
  fields.className = "insurance-grid insurance-grid-4 insurance-pro-grid";
  fields.innerHTML = `
    <label>اسم الزبون / Customer Name<input class="input" id="insurance-customer-name" /></label>
    <label>رقم الهوية / ID Number<input class="input" id="insurance-id-number" /></label>
    <label>تاريخ الإصدار / Issue Date<input class="input" id="insurance-issue-date" type="date" /></label>
    <label>تاريخ الانتهاء / Expiry Date<input class="input" id="insurance-expiry-date" type="date" /></label>
    <label>من رفع الوثيقة / Uploaded By<input class="input" id="insurance-uploaded-by" readonly /></label>
    <label>الحالة / Status<select class="select" id="insurance-status"><option value="active">فعال / Active</option><option value="expired">منتهي / Expired</option></select></label>
    <label>المجلد / Folder<input class="input" id="insurance-folder" placeholder="مثال / e.g. 2026/Q1" /></label>
    <label>التصنيف / الوسوم - Category / Tags<input class="input" id="insurance-category" placeholder="تصنيف / Category" /><input class="input" id="insurance-tags" placeholder="وسم1, وسم2 / tag1, tag2" style="margin-top:6px" /></label>
  `;
  formCard.insertBefore(fields, inlineActions);

  const filters = document.createElement("div");
  filters.className = "insurance-advanced-filters";
  filters.innerHTML = `
    <label>الزبون / Customer<input class="input" id="insurance-filter-customer" /></label>
    <label>رقم الوثيقة / Policy No<input class="input" id="insurance-filter-policy" /></label>
    <label>من تاريخ / Date From<input class="input" id="insurance-filter-date-from" type="date" /></label>
    <label>إلى تاريخ / Date To<input class="input" id="insurance-filter-date-to" type="date" /></label>
    <label>المجلد / Folder<input class="input" id="insurance-filter-folder" /></label>
    <label>التصنيف / Category<input class="input" id="insurance-filter-category" /></label>
  `;
  listHead.after(filters);

  const fileLabel = fileInput.closest("label");
  const uploadBox = document.createElement("div");
  uploadBox.className = "insurance-upload-extras";
  uploadBox.innerHTML = `
    <div class="insurance-dropzone" id="insurance-dropzone" tabindex="0">اسحب الملفات هنا أو اضغط للاختيار / Drag & drop files here or click</div>
    <div class="insurance-file-lists">
      <div><small class="text-muted">ملفات جديدة / New files</small><ul id="insurance-staged-files" class="insurance-file-list"></ul></div>
      <div><small class="text-muted">ملفات محفوظة / Saved files</small><ul id="insurance-existing-files" class="insurance-file-list"></ul></div>
    </div>`;
  fileLabel.after(uploadBox);
  fileInput.multiple = true;

  pro.customerNameInput = document.getElementById("insurance-customer-name");
  pro.idNumberInput = document.getElementById("insurance-id-number");
  pro.issueDateInput = document.getElementById("insurance-issue-date");
  pro.expiryDateInput = document.getElementById("insurance-expiry-date");
  pro.uploadedByInput = document.getElementById("insurance-uploaded-by");
  pro.statusSelect = document.getElementById("insurance-status");
  pro.folderInput = document.getElementById("insurance-folder");
  pro.categoryInput = document.getElementById("insurance-category");
  pro.tagsInput = document.getElementById("insurance-tags");
  pro.filterCustomerInput = document.getElementById("insurance-filter-customer");
  pro.filterPolicyInput = document.getElementById("insurance-filter-policy");
  pro.filterDateFromInput = document.getElementById("insurance-filter-date-from");
  pro.filterDateToInput = document.getElementById("insurance-filter-date-to");
  pro.filterFolderInput = document.getElementById("insurance-filter-folder");
  pro.filterCategoryInput = document.getElementById("insurance-filter-category");
  pro.stagedList = document.getElementById("insurance-staged-files");
  pro.existingList = document.getElementById("insurance-existing-files");
  pro.dropzone = document.getElementById("insurance-dropzone");

  pro.uploadedByInput.value = txt(user?.name || user?.email || user?.uid || "system");
  [pro.filterCustomerInput, pro.filterPolicyInput, pro.filterDateFromInput, pro.filterDateToInput, pro.filterFolderInput, pro.filterCategoryInput]
    .forEach((el) => el.addEventListener("input", renderTable));

  const addFiles = (list) => {
    const current = new Set(stagedFiles.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
    Array.from(list || []).forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (current.has(key)) return;
      current.add(key);
      stagedFiles.push(file);
    });
    fileInput.value = "";
    renderStagedFiles();
  };
  fileInput.addEventListener("change", () => addFiles(fileInput.files));
  pro.dropzone.addEventListener("click", () => fileInput.click());
  pro.dropzone.addEventListener("dragover", (e) => { e.preventDefault(); pro.dropzone.classList.add("is-drag"); });
  pro.dropzone.addEventListener("dragleave", (e) => { e.preventDefault(); pro.dropzone.classList.remove("is-drag"); });
  pro.dropzone.addEventListener("drop", (e) => { e.preventDefault(); pro.dropzone.classList.remove("is-drag"); addFiles(e.dataTransfer?.files); });

  insuredPartySelect.addEventListener("change", () => {
    if (txt(pro.customerNameInput.value)) return;
    const party = insuranceParties.find((p) => txt(p.id) === txt(insuredPartySelect.value));
    if (party) pro.customerNameInput.value = txt(party.partyName);
  });
}

function renderStagedFiles(doc = null) {
  if (!pro.stagedList || !pro.existingList) return;
  pro.stagedList.innerHTML = stagedFiles.map((f, idx) => `<li><span>${esc(f.name)}</span><button class="btn btn-ghost" data-remove="${idx}" type="button">حذف / Remove</button></li>`).join("");
  pro.stagedList.querySelectorAll("button[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
    stagedFiles = stagedFiles.filter((_, i) => i !== Number(btn.dataset.remove));
    renderStagedFiles(doc);
  }));

  const current = doc ? normalizeAttachments(doc) : (editingId ? normalizeAttachments(insuranceDocs.find((d) => d.id === editingId) || {}) : []);
  pro.existingList.innerHTML = current.length ? current.map((f) => `<li><a target="_blank" rel="noopener" href="${encodeURI(f.fileUrl)}">${esc(f.fileName)}</a></li>`).join("") : "<li>لا توجد ملفات محفوظة / No saved files</li>";
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
  const response = await fetch("/api/public-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name || "insurance-file", mimeType: file.type || "", dataUrl: await readFileAsDataUrl(file) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok || !result?.data?.url) throw new Error(result?.error || "File upload failed");
  return { fileUrl: txt(result.data.url), fileName: txt(result.data.fileName || file.name), mimeType: txt(result.data.mimeType || file.type), sizeBytes: Number(file.size || 0) || 0 };
}

async function collectPayload() {
  const policyNo = txt(policyNoInput.value);
  const customerName = txt(pro.customerNameInput?.value);
  const issueDate = txt(pro.issueDateInput?.value || startDateInput.value);
  const expiryDate = txt(pro.expiryDateInput?.value || endDateInput.value);
  if (!policyNo || !customerName) throw new Error("policy-customer-required");
  if (issueDate && expiryDate && expiryDate < issueDate) throw new Error("invalid-date-range");

  const { extraDetails, missingLabel } = readExtraFieldsStrict();
  if (missingLabel) throw new Error(`missing-extra:${missingLabel}`);

  const base = editingId ? normalizeAttachments(insuranceDocs.find((d) => d.id === editingId) || {}) : [];
  const uploaded = [];
  for (const file of stagedFiles) uploaded.push(await uploadFileViaServer(file));
  const attachments = uploaded.length ? [...base, ...uploaded] : base;

  const payload = {
    insuranceType: txt(typeSelect.value || "other"),
    policyNo,
    customerName,
    idNumber: txt(pro.idNumberInput?.value),
    issueDate, expiryDate, startDate: issueDate, endDate: expiryDate,
    uploadedBy: txt(pro.uploadedByInput?.value || user?.name || user?.email || user?.uid),
    status: txt(pro.statusSelect?.value || (expiryDate < today() ? "expired" : "active")),
    folder: txt(pro.folderInput?.value),
    category: txt(pro.categoryInput?.value),
    tags: txt(pro.tagsInput?.value).split(",").map((t) => txt(t)).filter(Boolean),
    insuredPartyId: txt(insuredPartySelect.value),
    insuredName: customerName,
    insuredAmount: Math.max(0, Number(amountInput.value) || 0),
    premium: Math.max(0, Number(premiumInput.value) || 0),
    riskRate: Math.max(0, Number(riskRateInput.value) || 0),
    commission: Math.max(0, Number(commissionInput.value) || 0),
    stampFee: Math.max(0, Number(stampFeeInput.value) || 0),
    notes: txt(notesInput.value),
    extraDetails,
    attachments,
    createdByUid: txt(user?.uid),
    createdByName: txt(user?.name || user?.email || user?.uid)
  };
  payload.fileUrl = attachments[0]?.fileUrl || "";
  payload.fileName = attachments[0]?.fileName || "";
  return payload;
}

function resetForm() {
  editingId = "";
  stagedFiles = [];
  typeSelect.value = "motor";
  policyNoInput.value = "";
  insuredPartySelect.value = "";
  amountInput.value = "";
  startDateInput.value = today();
  endDateInput.value = today();
  premiumInput.value = "";
  riskRateInput.value = "";
  commissionInput.value = "";
  stampFeeInput.value = "";
  notesInput.value = "";
  fileInput.value = "";
  pro.customerNameInput.value = "";
  pro.idNumberInput.value = "";
  pro.issueDateInput.value = today();
  pro.expiryDateInput.value = today();
  pro.uploadedByInput.value = txt(user?.name || user?.email || user?.uid || "system");
  pro.statusSelect.value = "active";
  pro.folderInput.value = "";
  pro.categoryInput.value = "";
  pro.tagsInput.value = "";
  saveBtn.textContent = "حفظ الوثيقة / Save Document";
  renderExtraFields("motor");
  renderStagedFiles();
}

function fillFormFromDoc(item) {
  editingId = item.id;
  stagedFiles = [];
  typeSelect.value = item.insuranceType || "other";
  policyNoInput.value = item.policyNo || "";
  insuredPartySelect.value = txt(item.insuredPartyId);
  amountInput.value = String(item.insuredAmount ?? "");
  startDateInput.value = item.issueDate || "";
  endDateInput.value = item.expiryDate || "";
  premiumInput.value = String(item.premium ?? "");
  riskRateInput.value = String(item.riskRate ?? "");
  commissionInput.value = String(item.commission ?? "");
  stampFeeInput.value = String(item.stampFee ?? "");
  notesInput.value = item.notes || "";
  fileInput.value = "";
  pro.customerNameInput.value = item.customerName || "";
  pro.idNumberInput.value = item.idNumber || "";
  pro.issueDateInput.value = item.issueDate || "";
  pro.expiryDateInput.value = item.expiryDate || "";
  pro.uploadedByInput.value = item.uploadedBy || txt(user?.name || user?.email || user?.uid || "system");
  pro.statusSelect.value = item.status || "active";
  pro.folderInput.value = item.folder || "";
  pro.categoryInput.value = item.category || "";
  pro.tagsInput.value = (item.tags || []).join(", ");
  saveBtn.textContent = "تحديث الوثيقة / Update Document";
  renderExtraFields(typeSelect.value, item.extraDetails || {});
  renderStagedFiles(item);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function rowSearchText(item) {
  const extras = Object.entries(item.extraDetails || {}).map(([k, v]) => `${k} ${v}`).join(" ");
  return [item.policyNo, item.customerName, item.idNumber, item.insuranceType, item.issueDate, item.expiryDate, item.uploadedBy, item.status, item.folder, item.category, (item.tags || []).join(" "), item.notes, extras].map((v) => txt(v).toLowerCase()).join(" ");
}

function getFilteredDocs() {
  const q = txt(searchInput.value).toLowerCase();
  const type = txt(typeFilter.value);
  const customer = txt(pro.filterCustomerInput?.value).toLowerCase();
  const policy = txt(pro.filterPolicyInput?.value).toLowerCase();
  const from = txt(pro.filterDateFromInput?.value);
  const to = txt(pro.filterDateToInput?.value);
  const folder = txt(pro.filterFolderInput?.value).toLowerCase();
  const category = txt(pro.filterCategoryInput?.value).toLowerCase();
  return insuranceDocs.filter((item) => {
    if (type && item.insuranceType !== type) return false;
    if (customer && !txt(item.customerName).toLowerCase().includes(customer)) return false;
    if (policy && !txt(item.policyNo).toLowerCase().includes(policy)) return false;
    if (folder && !txt(item.folder).toLowerCase().includes(folder)) return false;
    if (category && !txt(item.category).toLowerCase().includes(category)) return false;
    if (from && item.issueDate && item.issueDate < from) return false;
    if (to && item.issueDate && item.issueDate > to) return false;
    if (q && !rowSearchText(item).includes(q)) return false;
    return true;
  });
}

function reportMetrics(items) {
  const count = items.length;
  const amountTotal = items.reduce((s, i) => s + (Number(i.insuredAmount) || 0), 0);
  const premiumTotal = items.reduce((s, i) => s + (Number(i.premium) || 0), 0);
  const commissionTotal = items.reduce((s, i) => s + (Number(i.commission) || 0), 0);
  const stampTotal = items.reduce((s, i) => s + (Number(i.stampFee) || 0), 0);
  const riskAvg = count ? items.reduce((s, i) => s + (Number(i.riskRate) || 0), 0) / count : 0;
  const expiringSoon = items.filter((i) => i.expiryDate && i.expiryDate >= today() && i.expiryDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length;
  return { count, amountTotal, premiumTotal, commissionTotal, stampTotal, riskAvg, expiringSoon };
}

function toAuditMeta(item = {}) {
  return {
    policyNo: txt(item.policyNo),
    customerName: txt(item.customerName),
    issueDate: txt(item.issueDate),
    expiryDate: txt(item.expiryDate),
    status: txt(item.status),
    folder: txt(item.folder),
    category: txt(item.category)
  };
}

function logInsuranceAudit(action, item = {}, status = "success", message = "") {
  return logSecurityEvent({
    actorUid: txt(user?.uid),
    actorEmail: txt(user?.email),
    actorRole: txt(role),
    action,
    severity: status === "failed" ? "high" : "info",
    status,
    entity: "insurance_documents",
    entityId: txt(item.id),
    message,
    metadata: toAuditMeta(item)
  });
}

async function notifyExpiry(item, daysLeft) {
  const uid = txt(user?.uid);
  if (!uid) return;
  const dayKey = today();
  const localKey = `insurance-expiry-alert:${txt(item.id)}:${dayKey}`;
  try {
    if (localStorage.getItem(localKey)) return;
  } catch (_) {
    // no-op
  }

  const isExpired = daysLeft < 0;
  const title = isExpired ? "Policy expired" : "Policy expiring soon";
  const body = isExpired
    ? `Policy ${txt(item.policyNo)} for ${txt(item.customerName)} expired on ${txt(item.expiryDate)}.`
    : `Policy ${txt(item.policyNo)} for ${txt(item.customerName)} expires in ${daysLeft} day(s) on ${txt(item.expiryDate)}.`;

  try {
    await createNotification({
      toUid: uid,
      title,
      body,
      type: "insurance",
      priority: isExpired ? "high" : "medium",
      actionHref: "insurance-docs.html"
    });
    try {
      localStorage.setItem(localKey, "1");
    } catch (_) {
      // no-op
    }
  } catch (_) {
    // skip notification failures; UI toast still informs user
  }
}

async function pushExpiryAlerts(items) {
  const nowKey = today();
  const urgent = items.filter((item) => item.expiryDate && item.expiryDate >= nowKey && item.expiryDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const expired = items.filter((item) => item.expiryDate && item.expiryDate < nowKey);

  if (urgent.length) {
    showToast("info", `تنبيه: ${urgent.length} وثيقة تنتهي خلال 30 يوم`);
  }
  if (expired.length) {
    showToast("error", `تنبيه: ${expired.length} وثيقة منتهية بالفعل`);
  }

  const candidates = [...expired, ...urgent].slice(0, 25);
  for (const item of candidates) {
    if (!item.expiryDate) continue;
    const diffMs = new Date(item.expiryDate).getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / 86400000);
    await notifyExpiry(item, daysLeft);
  }
}

function detectPdfImageFormat(dataUrl = "") {
  const value = txt(dataUrl).toLowerCase();
  if (value.startsWith("data:image/png")) return "PNG";
  if (value.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read logo"));
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function safePdfText(doc, value) {
  let text = txt(value);
  if (!text) return "";
  // Recover UTF-8 text that was decoded as Latin-1 (common mojibake pattern: Ø, Ù, Ã, Â).
  if (/[ØÙÃÂþ]/.test(text)) {
    try {
      const bytes = Uint8Array.from(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (decoded && !/[ØÙÃÂþ]/.test(decoded)) text = decoded;
    } catch (_) {
      // Keep original text if decoding fails.
    }
  }
  if (typeof doc.processArabic === "function") {
    return doc.processArabic(text);
  }
  return text;
}

function pickPdfLabel(ar, en, arabicFontReady) {
  return arabicFontReady ? `${ar} / ${en}` : en;
}

function toPdfEnglishLabel(value) {
  const text = txt(value);
  if (!text) return "-";
  const parts = text.split("/");
  return txt(parts[parts.length - 1]) || text;
}

function safePdfCellText(doc, value, arabicFontReady) {
  const text = txt(value);
  if (!text) return "-";
  return arabicFontReady ? safePdfText(doc, text) : text;
}

async function loadArabicPdfFontBase64() {
  if (!pdfArabicFontBase64Promise) {
    pdfArabicFontBase64Promise = (async () => {
      for (const url of PDF_ARABIC_FONT_URLS) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          if (base64) return base64;
        } catch (_) {
          // Try next source.
        }
      }
      return "";
    })();
  }
  return pdfArabicFontBase64Promise;
}

async function ensureArabicPdfFont(doc) {
  const base64 = await loadArabicPdfFontBase64();
  if (!base64) return false;

  try {
    doc.addFileToVFS(PDF_ARABIC_FONT_FILE, base64);
  } catch (_) {
    // VFS may already have the font.
  }

  try {
    doc.addFont(PDF_ARABIC_FONT_FILE, PDF_ARABIC_FONT_NAME, "normal");
  } catch (_) {
    // Font may already be registered for this instance.
  }

  try {
    doc.setFont(PDF_ARABIC_FONT_NAME, "normal");
    return true;
  } catch (_) {
    return false;
  }
}

async function getCompanyLogoDataUrl() {
  if (!companyLogoDataUrlPromise) {
    companyLogoDataUrlPromise = (async () => {
      try {
        const response = await fetch(COMPANY_LOGO_PATH, { cache: "force-cache" });
        if (!response.ok) return "";
        const blob = await response.blob();
        return await readBlobAsDataUrl(blob);
      } catch (_) {
        return "";
      }
    })();
  }
  return companyLogoDataUrlPromise;
}

async function drawCompanyPdfHeader(doc, options = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoDataUrl = await getCompanyLogoDataUrl();
  const titleAr = txt(options.titleAr || "تقرير التأمين");
  const titleEn = txt(options.titleEn || "Insurance Report");
  const generatedAt = txt(options.generatedAt || new Date().toLocaleString());

  doc.setDrawColor(15, 118, 110);
  doc.setTextColor(15, 23, 42);
  const arabicFontReady = await ensureArabicPdfFont(doc);

  if (logoDataUrl) {
    const format = detectPdfImageFormat(logoDataUrl);
    doc.addImage(logoDataUrl, format, 14, 10, 18, 18);
  }

  doc.setFont(arabicFontReady ? PDF_ARABIC_FONT_NAME : "helvetica", "normal");
  doc.setFontSize(13);
  doc.text(safePdfCellText(doc, pickPdfLabel(COMPANY_NAME_AR, COMPANY_NAME_EN, arabicFontReady), arabicFontReady), 36, 16);
  doc.setFontSize(11);
  doc.text(safePdfCellText(doc, pickPdfLabel(titleAr, titleEn, arabicFontReady), arabicFontReady), 36, 22);
  doc.setFontSize(9);
  doc.text(`Generated: ${generatedAt}`, 36, 27);

  const rightX = pageWidth - 14;
  doc.setFontSize(9);
  doc.text("Insurance Module", rightX, 16, { align: "right" });
  doc.text(`Date: ${today()}`, rightX, 21, { align: "right" });

  doc.setLineWidth(0.6);
  doc.line(14, 31, pageWidth - 14, 31);

  return 35;
}

async function generatePolicyPdf(item) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) {
    showToast("error", "مكتبة PDF غير متاحة / PDF library not available");
    return;
  }

  const doc = new JsPdf({ orientation: "p", unit: "mm", format: "a4" });
  const arabicFontReady = await ensureArabicPdfFont(doc);
  const startY = await drawCompanyPdfHeader(doc, {
    titleAr: "وثيقة تأمين",
    titleEn: "Insurance Policy Document",
    generatedAt: new Date().toLocaleString()
  });

  const rows = [
    ["رقم الوثيقة / Policy Number", safePdfText(doc, txt(item.policyNo) || "-")],
    ["اسم الزبون / Customer Name", safePdfText(doc, txt(item.customerName) || "-")],
    ["رقم الهوية / ID Number", safePdfText(doc, txt(item.idNumber) || "-")],
    ["نوع التأمين / Policy Type", safePdfText(doc, byType(item.insuranceType))],
    ["تاريخ الإصدار / Issue Date", safePdfText(doc, txt(item.issueDate) || "-")],
    ["تاريخ الانتهاء / Expiry Date", safePdfText(doc, txt(item.expiryDate) || "-")],
    ["من رفع الوثيقة / Uploaded By", safePdfText(doc, txt(item.uploadedBy) || "-")],
    ["الحالة / Status", safePdfText(doc, txt(item.status) || "-")],
    ["المجلد / Folder", safePdfText(doc, txt(item.folder) || "-")],
    ["التصنيف / Category", safePdfText(doc, txt(item.category) || "-")],
    ["الوسوم / Tags", safePdfText(doc, (item.tags || []).join(", ") || "-")],
    ["مبلغ التأمين / Insured Amount", money(item.insuredAmount)],
    ["القسط / Premium", money(item.premium)],
    ["العمولة / Commission", money(item.commission)],
    ["رسم الطابع / Stamp Fee", money(item.stampFee)],
    ["ملاحظات / Notes", safePdfText(doc, txt(item.notes) || "-")]
  ];

  if (!arabicFontReady) {
    rows.forEach((row) => {
      const label = txt(row[0]);
      const parts = label.split("/");
      row[0] = txt(parts[parts.length - 1]) || label;
      row[1] = txt(row[1]) || "-";
    });
  }

  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY,
      head: [[safePdfText(doc, "الحقل / Field"), safePdfText(doc, "القيمة / Value")]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 2, font: arabicFontReady ? PDF_ARABIC_FONT_NAME : "helvetica" },
      headStyles: { fillColor: [15, 118, 110] }
    });
  } else {
    rows.forEach((row, idx) => {
      doc.text(`${row[0]}: ${row[1]}`, 14, startY + 5 + idx * 6);
    });
  }

  const filename = `policy-${txt(item.policyNo || item.id || "document")}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
  doc.save(filename);
}

async function generatePoliciesReportPdf(items) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) {
    showToast("error", "مكتبة PDF غير متاحة / PDF library not available");
    return;
  }
  const doc = new JsPdf({ orientation: "l", unit: "mm", format: "a4" });
  const arabicFontReady = await ensureArabicPdfFont(doc);
  const startY = await drawCompanyPdfHeader(doc, {
    titleAr: "تقرير وثائق التأمين",
    titleEn: "Insurance Policies Report",
    generatedAt: new Date().toLocaleString()
  });

  const body = items.map((item) => [
    safePdfCellText(doc, txt(item.policyNo) || "-", arabicFontReady),
    safePdfCellText(doc, txt(item.customerName) || "-", arabicFontReady),
    safePdfCellText(doc, txt(item.idNumber) || "-", arabicFontReady),
    safePdfCellText(doc, arabicFontReady ? byType(item.insuranceType) : toPdfEnglishLabel(byType(item.insuranceType)), arabicFontReady),
    safePdfCellText(doc, txt(item.issueDate) || "-", arabicFontReady),
    safePdfCellText(doc, txt(item.expiryDate) || "-", arabicFontReady),
    safePdfCellText(doc, txt(item.status) || "-", arabicFontReady),
    money(item.insuredAmount),
    money(item.premium)
  ]);

  if (typeof doc.autoTable === "function") {
    const reportHead = [
      safePdfCellText(doc, pickPdfLabel("رقم الوثيقة", "Policy", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("الزبون", "Customer", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("الهوية", "ID", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("النوع", "Type", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("الإصدار", "Issue", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("الانتهاء", "Expiry", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("الحالة", "Status", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("المبلغ", "Amount", arabicFontReady), arabicFontReady),
      safePdfCellText(doc, pickPdfLabel("القسط", "Premium", arabicFontReady), arabicFontReady)
    ];

    doc.autoTable({
      startY,
      head: [reportHead],
      body,
      styles: { fontSize: 8, cellPadding: 2, font: arabicFontReady ? PDF_ARABIC_FONT_NAME : "helvetica" },
      headStyles: { fillColor: [15, 118, 110] }
    });
    doc.save(`insurance-report-${today()}.pdf`);
    return;
  }

  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY,
      head: [[
        safePdfText(doc, "رقم الوثيقة / Policy"),
        safePdfText(doc, "الزبون / Customer"),
        safePdfText(doc, "الهوية / ID"),
        safePdfText(doc, "النوع / Type"),
        safePdfText(doc, "الإصدار / Issue"),
        safePdfText(doc, "الانتهاء / Expiry"),
        safePdfText(doc, "الحالة / Status"),
        safePdfText(doc, "المبلغ / Amount"),
        safePdfText(doc, "القسط / Premium")
      ]],
      body,
      styles: { fontSize: 8, cellPadding: 2, font: arabicFontReady ? PDF_ARABIC_FONT_NAME : "helvetica" },
      headStyles: { fillColor: [15, 118, 110] }
    });
  }
  const filename = `insurance-report-${today()}.pdf`;
  doc.save(filename);
}

function showViewer(item) {
  const attachments = normalizeAttachments(item);
  if (!attachments.length) return showToast("error", "لا توجد ملفات مرفقة / No files attached");
  const content = document.createElement("div");
  content.className = "insurance-viewer-modal";
  content.innerHTML = `
    <div class="insurance-viewer-toolbar">
      <select id="viewer-file" class="select">${attachments.map((f, i) => `<option value="${i}">${esc(f.fileName)}</option>`).join("")}</select>
      <label class="viewer-zoom-label">Zoom <input id="viewer-zoom" type="range" min="0.5" max="2" step="0.1" value="1"></label>
      <a id="viewer-download" class="btn btn-outline" target="_blank" rel="noopener">Download</a>
    </div>
    <div id="viewer-stage" class="insurance-viewer-stage"></div>`;
  openModal({ title: `Policy ${txt(item.policyNo)}`, content, actions: [{ label: "Close", className: "btn btn-ghost" }] });

  const sel = content.querySelector("#viewer-file");
  const zoom = content.querySelector("#viewer-zoom");
  const stage = content.querySelector("#viewer-stage");
  const dl = content.querySelector("#viewer-download");
  const render = () => {
    const file = attachments[Number(sel.value) || 0] || attachments[0];
    const scale = Number(zoom.value || 1);
    const lower = txt(file.fileName).toLowerCase();
    const isPdf = lower.endsWith(".pdf") || txt(file.mimeType).includes("pdf");
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(lower) || txt(file.mimeType).startsWith("image/");
    dl.href = file.fileUrl;
    if (isPdf) stage.innerHTML = `<div class="viewer-frame-wrap" style="transform:scale(${scale});transform-origin:top left;width:${100 / scale}%"><iframe class="viewer-frame" src="${file.fileUrl}#toolbar=1"></iframe></div>`;
    else if (isImage) stage.innerHTML = `<img class="viewer-image" src="${file.fileUrl}" style="transform:scale(${scale});transform-origin:top left" />`;
    else stage.innerHTML = `<div class="viewer-fallback"><p>Preview unavailable.</p><a class="btn btn-primary" target="_blank" rel="noopener" href="${file.fileUrl}">Open File</a></div>`;
  };
  sel.addEventListener("change", render);
  zoom.addEventListener("input", render);
  render();
}

function renderSummary(filtered) {
  const totals = reportMetrics(insuranceDocs);
  const f = reportMetrics(filtered);
  updateSummaryValue(totalCountEl, String(totals.count));
  updateSummaryValue(totalAmountEl, money(totals.amountTotal));
  updateSummaryValue(totalPremiumEl, money(totals.premiumTotal));
  updateSummaryValue(filteredCountEl, String(filtered.length));
  updateSummaryValue(totalCommissionEl, money(totals.commissionTotal));
  updateSummaryValue(totalStampEl, money(totals.stampTotal));
  updateSummaryValue(avgRiskEl, `${numFmt.format(filtered.length ? f.riskAvg : totals.riskAvg)}%`);
  updateSummaryValue(expiringSoonEl, String(filtered.length ? f.expiringSoon : totals.expiringSoon));
}

function renderTable() {
  const filtered = getFilteredDocs();
  tbody.innerHTML = filtered.map((item) => `
    <tr>
      <td><span class="insurance-chip">${esc(byType(item.insuranceType))}</span><small class="insurance-status ${item.status === "expired" ? "status-expired" : "status-active"}">${esc(item.status)}</small></td>
      <td><strong>${esc(item.policyNo)}</strong><br><small>${esc(item.idNumber)}</small></td>
      <td>${esc(item.customerName)}<br><small>${esc(item.uploadedBy)}</small></td>
      <td>${money(item.insuredAmount)}</td>
      <td>${money(item.premium)}</td>
      <td>${esc(item.issueDate)} to ${esc(item.expiryDate)}<br><small>${esc(item.folder)} / ${esc(item.category)}</small></td>
      <td>
        <button class="btn btn-ghost" data-action="view" data-id="${item.id}">عرض / View</button>
        ${canManage ? `<button class="btn btn-ghost" data-action="edit" data-id="${item.id}">تعديل / Edit</button>` : ""}
        <button class="btn btn-ghost" data-action="pdf" data-id="${item.id}">PDF</button>
        <button class="btn btn-ghost" data-action="print" data-id="${item.id}">طباعة / Print</button>
        ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${item.id}">حذف / Delete</button>` : ""}
      </td>
    </tr>`).join("");
  emptyState.classList.toggle("hidden", filtered.length > 0);
  renderSummary(filtered);

  tbody.querySelectorAll("button[data-action]").forEach((button) => button.addEventListener("click", async () => {
    const id = txt(button.dataset.id);
    const action = txt(button.dataset.action);
    const item = insuranceDocs.find((d) => d.id === id);
    if (!item) return;
    if (action === "view") {
      showViewer(item);
      void logInsuranceAudit("insurance_doc_viewed", item, "success", "Document opened in viewer.");
    }
    if (action === "edit" && canManage) {
      if (isLibraryMode) {
        window.location.href = `insurance-docs-entry.html?edit=${encodeURIComponent(item.id)}`;
      } else {
        fillFormFromDoc(item);
      }
    }
    if (action === "pdf") {
      void generatePolicyPdf(item);
      void logInsuranceAudit("insurance_doc_pdf_generated", item, "success", "Single policy PDF generated.");
    }
    if (action === "print") window.print();
    if (action === "delete" && canDelete) {
      if (!window.confirm("حذف هذه الوثيقة؟ / Delete this policy?")) return;
      try {
        await deleteInsuranceDoc(item.id);
        showToast("success", "Deleted");
        void logInsuranceAudit("insurance_doc_deleted", item, "success", "Policy deleted.");
        await loadInsuranceDocs();
      }
      catch (error) {
        console.error(error);
        showToast("error", "Delete failed");
        void logInsuranceAudit("insurance_doc_deleted", item, "failed", error?.message || "Delete failed");
      }
    }
  }));
}

async function loadInsuranceDocs() {
  try {
    showTableSkeleton(tbody, { rows: 6, cols: 7 });
    insuranceDocs = (await listInsuranceDocs({ limitCount: 700 })).map(normalizeDoc);
    renderTable();
    renderStagedFiles();
    await pushExpiryAlerts(insuranceDocs);
  } catch (error) {
    console.error(error);
    insuranceDocs = [];
    renderTable();
    showToast("error", "Failed to load docs");
  }
}

async function loadInsuranceParties() {
  try { insuranceParties = await listInsuranceParties({ limitCount: 1000 }); }
  catch (error) { console.error(error); insuranceParties = []; }
  buildPartyOptions();
}

async function handleSave() {
  if (!canManage) return;
  saveBtn.disabled = true;
  try {
    const payload = await collectPayload();
    if (editingId) {
      await updateInsuranceDoc(editingId, payload);
      showToast("success", "Updated");
      void logInsuranceAudit("insurance_doc_updated", { ...payload, id: editingId }, "success", "Policy updated.");
    }
    else {
      const newId = await createInsuranceDoc(payload);
      showToast("success", "Saved");
      void logInsuranceAudit("insurance_doc_created", { ...payload, id: newId }, "success", "Policy created.");
    }
    if (isEntryMode) {
      window.location.href = "insurance-docs.html?saved=1";
      return;
    }
    resetForm();
    await loadInsuranceDocs();
  } catch (error) {
    const message = txt(error?.message);
    if (message === "policy-customer-required") showToast("error", "Policy number and customer name are required");
    else if (message === "invalid-date-range") showToast("error", "Expiry date must be after issue date");
    else if (message.startsWith("missing-extra:")) showToast("error", `Missing field: ${message.replace("missing-extra:", "")}`);
    else { console.error(error); showToast("error", message || "Save failed"); }
    void logInsuranceAudit(editingId ? "insurance_doc_updated" : "insurance_doc_created", { id: editingId || "" }, "failed", message || "Save failed");
  } finally {
    saveBtn.disabled = false;
  }
}

if (!canManage) { saveBtn.classList.add("hidden"); newBtn.classList.add("hidden"); }
applyModeLayout();
addEnhancements();
buildTypeOptions();
resetForm();
renderExtraFields("motor");

typeSelect.addEventListener("change", () => renderExtraFields(typeSelect.value));
saveBtn.addEventListener("click", () => void handleSave());
newBtn.addEventListener("click", resetForm);
searchInput.addEventListener("input", renderTable);
typeFilter.addEventListener("change", renderTable);
printListBtn.addEventListener("click", () => { if (!getFilteredDocs().length) return showToast("error", "لا توجد نتائج / No results"); window.print(); });
exportExcelBtn.addEventListener("click", () => {
  const rows = getFilteredDocs().map((item) => ({
    policyNo: item.policyNo, customerName: item.customerName, idNumber: item.idNumber, policyType: byType(item.insuranceType),
    issueDate: item.issueDate, expiryDate: item.expiryDate, uploadedBy: item.uploadedBy, status: item.status,
    folder: item.folder, category: item.category, tags: item.tags.join(", "), notes: item.notes
  }));
  if (!rows.length) return showToast("error", "لا توجد نتائج / No results");
  if (!window.XLSX) return showToast("error", "مكتبة Excel غير متاحة / Excel library not available");
  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.json_to_sheet(rows);
  window.XLSX.utils.book_append_sheet(wb, ws, "InsuranceDocs");
  window.XLSX.writeFile(wb, `insurance-docs-${today()}.xlsx`);
});
exportPdfBtn.addEventListener("click", () => {
  const filtered = getFilteredDocs();
  if (!filtered.length) return showToast("error", "لا توجد نتائج / No results");
  void generatePoliciesReportPdf(filtered);
  void logInsuranceAudit("insurance_docs_report_pdf_generated", { id: "list" }, "success", `Generated report PDF for ${filtered.length} policy(s).`);
});
window.addEventListener("global-search", (event) => { searchInput.value = event.detail || ""; renderTable(); });

trackUxEvent({ event: "page_open", module: "insurance_docs" });
(async () => {
  await loadInsuranceParties();
  if (isLibraryMode) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("saved") === "1") {
      showToast("success", "تم حفظ الوثيقة بنجاح / Document saved successfully");
    }
    await loadInsuranceDocs();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const editId = txt(params.get("edit"));
  if (editId) {
    await loadInsuranceDocs();
    const item = insuranceDocs.find((doc) => txt(doc.id) === editId);
    if (item) {
      fillFormFromDoc(item);
    } else {
      showToast("error", "الوثيقة غير موجودة / Document not found");
    }
  }
})();


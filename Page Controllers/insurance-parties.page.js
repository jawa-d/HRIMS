import { enforceAuth, getRole, getUserProfile } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import {
  listInsuranceParties,
  createInsuranceParty,
  updateInsuranceParty,
  deleteInsuranceParty
} from "../Services/insurance-parties.service.js";

if (!enforceAuth("insurance_parties")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("insurance_parties");
if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const canDelete = ["super_admin", "hr_admin"].includes(role);

const typeInput = document.getElementById("party-type");
const nameInput = document.getElementById("party-name");
const phoneInput = document.getElementById("party-phone");
const emailInput = document.getElementById("party-email");
const refNoInput = document.getElementById("party-ref-no");
const cityInput = document.getElementById("party-city");
const addressInput = document.getElementById("party-address");
const notesInput = document.getElementById("party-notes");
const saveBtn = document.getElementById("party-save-btn");
const resetBtn = document.getElementById("party-reset-btn");
const searchInput = document.getElementById("parties-search");
const typeFilter = document.getElementById("parties-type-filter");
const tbody = document.getElementById("parties-body");
const emptyState = document.getElementById("parties-empty");
const totalEl = document.getElementById("parties-total");
const companiesEl = document.getElementById("parties-companies");
const clientsEl = document.getElementById("parties-clients");

let parties = [];
let editingId = "";

function normalizeType(value = "") {
  return String(value || "").trim().toLowerCase();
}

function partyTypeLabel(type) {
  return normalizeType(type) === "company" ? "شركة" : "عميل";
}

function collectPayload() {
  const name = String(nameInput.value || "").trim();
  if (!name) throw new Error("name-required");
  return {
    partyType: normalizeType(typeInput.value) || "company",
    partyName: name,
    phone: String(phoneInput.value || "").trim(),
    email: String(emailInput.value || "").trim(),
    refNo: String(refNoInput.value || "").trim(),
    city: String(cityInput.value || "").trim(),
    address: String(addressInput.value || "").trim(),
    notes: String(notesInput.value || "").trim(),
    createdByUid: String(user?.uid || "").trim(),
    createdByName: String(user?.name || user?.email || user?.uid || "").trim()
  };
}

function resetForm() {
  editingId = "";
  typeInput.value = "company";
  nameInput.value = "";
  phoneInput.value = "";
  emailInput.value = "";
  refNoInput.value = "";
  cityInput.value = "";
  addressInput.value = "";
  notesInput.value = "";
  saveBtn.textContent = "حفظ الجهة";
}

function fillForm(item) {
  editingId = item.id;
  typeInput.value = normalizeType(item.partyType) || "company";
  nameInput.value = item.partyName || "";
  phoneInput.value = item.phone || "";
  emailInput.value = item.email || "";
  refNoInput.value = item.refNo || "";
  cityInput.value = item.city || "";
  addressInput.value = item.address || "";
  notesInput.value = item.notes || "";
  saveBtn.textContent = "تحديث الجهة";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function filteredParties() {
  const q = String(searchInput.value || "").trim().toLowerCase();
  const t = normalizeType(typeFilter.value);
  return parties.filter((item) => {
    const matchesType = !t || normalizeType(item.partyType) === t;
    const haystack = [
      item.partyName,
      item.phone,
      item.email,
      item.refNo,
      item.city,
      item.address,
      item.notes
    ].join(" ").toLowerCase();
    const matchesQuery = !q || haystack.includes(q);
    return matchesType && matchesQuery;
  });
}

function bindRowActions() {
  tbody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = String(button.dataset.id || "").trim();
      const action = String(button.dataset.action || "").trim();
      const item = parties.find((row) => row.id === id);
      if (!item) return;
      if (action === "edit" && canManage) {
        fillForm(item);
        return;
      }
      if (action === "delete" && canDelete) {
        if (!window.confirm("هل تريد حذف هذه الجهة؟")) return;
        try {
          await deleteInsuranceParty(item.id);
          showToast("success", "تم حذف الجهة");
          await loadParties();
        } catch (error) {
          console.error("Delete insurance party failed:", error);
          showToast("error", "فشل حذف الجهة");
        }
      }
    });
  });
}

function renderSummary() {
  const companies = parties.filter((item) => normalizeType(item.partyType) === "company").length;
  const clients = parties.filter((item) => normalizeType(item.partyType) === "client").length;
  totalEl.textContent = String(parties.length);
  companiesEl.textContent = String(companies);
  clientsEl.textContent = String(clients);
}

function renderTable() {
  const rows = filteredParties();
  tbody.innerHTML = rows
    .map(
      (item) => `
        <tr>
          <td><span class="party-chip ${normalizeType(item.partyType)}">${partyTypeLabel(item.partyType)}</span></td>
          <td>${item.partyName || "-"}</td>
          <td>${item.phone || "-"}</td>
          <td>${item.email || "-"}</td>
          <td>${item.refNo || "-"}</td>
          <td>${item.city || "-"}</td>
          <td>
            ${canManage ? `<button class="btn btn-ghost" data-action="edit" data-id="${item.id}">تعديل</button>` : ""}
            ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${item.id}">حذف</button>` : ""}
          </td>
        </tr>
      `
    )
    .join("");
  emptyState.classList.toggle("hidden", rows.length > 0);
  renderSummary();
  bindRowActions();
}

async function loadParties() {
  try {
    showTableSkeleton(tbody, { rows: 5, cols: 7 });
    parties = await listInsuranceParties({ limitCount: 800 });
    renderTable();
  } catch (error) {
    console.error("Load insurance parties failed:", error);
    parties = [];
    renderTable();
    showToast("error", "تعذر تحميل بيانات الجهات");
  }
}

async function handleSave() {
  if (!canManage) return;
  saveBtn.disabled = true;
  try {
    const payload = collectPayload();
    if (editingId) {
      await updateInsuranceParty(editingId, payload);
      showToast("success", "تم تحديث الجهة");
    } else {
      await createInsuranceParty(payload);
      showToast("success", "تم حفظ الجهة");
    }
    resetForm();
    await loadParties();
  } catch (error) {
    if (error?.message === "name-required") {
      showToast("error", "اسم الجهة مطلوب");
    } else {
      console.error("Save insurance party failed:", error);
      showToast("error", "فشل حفظ الجهة");
    }
  } finally {
    saveBtn.disabled = false;
  }
}

if (!canManage) {
  saveBtn.classList.add("hidden");
  resetBtn.classList.add("hidden");
}

saveBtn.addEventListener("click", () => {
  void handleSave();
});
resetBtn.addEventListener("click", resetForm);
searchInput.addEventListener("input", renderTable);
typeFilter.addEventListener("change", renderTable);
window.addEventListener("global-search", (event) => {
  searchInput.value = event.detail || "";
  renderTable();
});

trackUxEvent({ event: "page_open", module: "insurance_parties" });
resetForm();
void loadParties();

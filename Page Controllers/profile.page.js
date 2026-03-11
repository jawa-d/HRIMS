import { enforceAuth, getUserProfile, getRole, getAllowedPages } from "../Aman/guard.js";
import { initI18n, t } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { getUser, upsertUser } from "../Services/users.service.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { STORAGE_KEYS, MENU_ITEMS } from "../app.config.js";

if (!enforceAuth("profile")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("profile");

const profileCard = document.getElementById("profile-card");
const accessList = document.getElementById("profile-access-list");
const form = document.getElementById("profile-form");
const photoInput = document.getElementById("profile-photo-input");
let profile = { ...user };

function normalizeUid(value = "") {
  return String(value || "").trim();
}

function ensureProfileUid() {
  const uid = normalizeUid(profile.uid || user.uid);
  if (uid) return uid;
  const fallback = normalizeUid(profile.email || user.email || "guest-profile");
  return fallback.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSafePhotoUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("data:image/")) return raw;
  if (lower.startsWith("https://") || lower.startsWith("http://")) return raw;
  if (lower.startsWith("blob:")) return raw;
  return "";
}

async function saveProfileToFirebase(nextProfile) {
  const uid = ensureProfileUid();
  const payload = { ...nextProfile, uid };
  await upsertUser(uid, payload);
  profile = payload;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(payload));
  if (payload.role) localStorage.setItem(STORAGE_KEYS.role, payload.role);
  return payload;
}

function getInitials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "HR";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function fieldValue(id, fallback = "") {
  return (document.getElementById(id)?.value || fallback).trim();
}

function renderAccessSnapshot() {
  if (!accessList) return;
  const allowed = getAllowedPages(profile.role || role, profile);
  const labels = MENU_ITEMS.filter((item) => allowed.includes(item.key));
  accessList.innerHTML = `
    <div class="profile-access-item">
      <span class="text-muted">${t("auto.role")}</span>
      <span class="badge">${escapeHtml(profile.role || role)}</span>
    </div>
    <div class="profile-access-item">
      <span class="text-muted">${t("profile.accessible_pages")}</span>
      <span class="chip">${labels.length}</span>
    </div>
    ${labels
      .map(
        (item) => `
          <div class="profile-access-item">
            <span>${escapeHtml(item.key)}</span>
            <span class="chip">${escapeHtml(item.href)}</span>
          </div>
        `
      )
      .join("")}
  `;
}

function renderProfile() {
  if (!profileCard) return;
  const initials = getInitials(profile.name || profile.email || "");
  const photoUrl = getSafePhotoUrl(profile.photoUrl || "");
  profileCard.innerHTML = `
    <h3 class="section-title">
      <i data-lucide="user-circle"></i>
      ${t("profile.overview")}
    </h3>
    <div class="profile-hero">
      <div class="profile-avatar">
        ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(t("auto.profile_photo"))}" />` : `<span>${escapeHtml(initials)}</span>`}
      </div>
      <div class="profile-actions">
        <button class="btn btn-outline" id="profile-upload-btn">${t("profile.change_photo")}</button>
        <button class="btn btn-ghost" id="profile-remove-btn" ${photoUrl ? "" : "disabled"}>${t("profile.remove_photo")}</button>
      </div>
    </div>
    <div class="profile-stat-grid">
      <div class="profile-stat-row"><strong>${t("auto.full_name")}</strong><span>${escapeHtml(profile.name || "-")}</span></div>
      <div class="profile-stat-row"><strong>${t("common.email")}</strong><span>${escapeHtml(profile.email || "-")}</span></div>
      <div class="profile-stat-row"><strong>${t("auto.role")}</strong><span>${escapeHtml(profile.role || role)}</span></div>
      <div class="profile-stat-row"><strong>${t("auto.department_id")}</strong><span>${escapeHtml(profile.departmentId || "-")}</span></div>
      <div class="profile-stat-row"><strong>${t("auto.manager_id")}</strong><span>${escapeHtml(profile.managerId || "-")}</span></div>
    </div>
  `;

  document.getElementById("profile-name").value = profile.name || "";
  document.getElementById("profile-email").value = profile.email || "";
  document.getElementById("profile-phone").value = profile.phone || "";
  document.getElementById("profile-title").value = profile.title || "";
  document.getElementById("profile-dept").value = profile.departmentId || "";
  document.getElementById("profile-manager").value = profile.managerId || "";
  document.getElementById("profile-position").value = profile.positionId || "";
  document.getElementById("profile-role").value = profile.role || role;
  document.getElementById("profile-bio").value = profile.bio || "";

  const uploadBtn = document.getElementById("profile-upload-btn");
  const removeBtn = document.getElementById("profile-remove-btn");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => photoInput?.click());
  }
  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      try {
        await saveProfileToFirebase({ ...profile, photoUrl: "" });
        showToast("success", t("profile.photo_removed"));
        renderProfile();
        renderAccessSnapshot();
      } catch (error) {
        console.error("Profile photo remove failed:", error);
        showToast("error", t("profile.photo_remove_failed"));
      }
    });
  }

  renderAccessSnapshot();
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

photoInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("error", t("profile.image_only"));
    return;
  }
  // Keep below Firestore document limits when stored as base64 text.
  const maxSize = 700 * 1024;
  if (file.size > maxSize) {
    showToast("error", t("profile.image_limit_700kb"));
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await saveProfileToFirebase({ ...profile, photoUrl: String(reader.result || "") });
      showToast("success", t("profile.photo_updated"));
      renderProfile();
    } catch (error) {
      console.error("Profile photo update failed:", error);
      showToast("error", t("profile.photo_update_failed"));
    }
  };
  reader.onerror = () => {
    showToast("error", t("profile.photo_read_failed"));
  };
  reader.readAsDataURL(file);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const updated = {
    ...profile,
    name: fieldValue("profile-name"),
    email: profile.email || user.email || "",
    phone: fieldValue("profile-phone"),
    title: fieldValue("profile-title"),
    departmentId: fieldValue("profile-dept"),
    managerId: fieldValue("profile-manager"),
    positionId: fieldValue("profile-position"),
    bio: fieldValue("profile-bio")
  };

  try {
    await saveProfileToFirebase(updated);
    showToast("success", t("profile.updated"));
    renderProfile();
    renderSidebar("profile");
  } catch (error) {
    console.error("Profile update failed:", error);
    showToast("error", t("profile.update_failed"));
  }
});

async function hydrateProfile() {
  try {
    const remote = await getUser(ensureProfileUid());
    if (remote) {
      profile = { ...profile, ...remote };
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
      if (profile.role) localStorage.setItem(STORAGE_KEYS.role, profile.role);
    } else {
      await saveProfileToFirebase(profile);
    }
  } catch (error) {
    console.error("Profile hydrate failed:", error);
    showToast("info", t("profile.local_session_fallback"));
  }
  renderProfile();
}

hydrateProfile();

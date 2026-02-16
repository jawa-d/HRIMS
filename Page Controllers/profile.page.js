import { enforceAuth, getUserProfile, getRole, getAllowedPages } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
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
  const allowed = getAllowedPages(profile.role || role, profile);
  const labels = MENU_ITEMS.filter((item) => allowed.includes(item.key));
  accessList.innerHTML = `
    <div class="profile-access-item">
      <span class="text-muted">Role</span>
      <span class="badge">${profile.role || role}</span>
    </div>
    <div class="profile-access-item">
      <span class="text-muted">Accessible Pages</span>
      <span class="chip">${labels.length}</span>
    </div>
    ${labels
      .map(
        (item) => `
          <div class="profile-access-item">
            <span>${item.key}</span>
            <span class="chip">${item.href}</span>
          </div>
        `
      )
      .join("")}
  `;
}

function renderProfile() {
  const initials = getInitials(profile.name || profile.email || "");
  const photoUrl = profile.photoUrl || "";
  profileCard.innerHTML = `
    <h3 class="section-title">
      <i data-lucide="user-circle"></i>
      Profile Overview
    </h3>
    <div class="profile-hero">
      <div class="profile-avatar">
        ${photoUrl ? `<img src="${photoUrl}" alt="Profile photo" />` : `<span>${initials}</span>`}
      </div>
      <div class="profile-actions">
        <button class="btn btn-outline" id="profile-upload-btn">Change Photo</button>
        <button class="btn btn-ghost" id="profile-remove-btn" ${photoUrl ? "" : "disabled"}>Remove</button>
      </div>
    </div>
    <div class="profile-stat-grid">
      <div class="profile-stat-row"><strong>Name</strong><span>${profile.name || "-"}</span></div>
      <div class="profile-stat-row"><strong>Email</strong><span>${profile.email || "-"}</span></div>
      <div class="profile-stat-row"><strong>Role</strong><span>${profile.role || role}</span></div>
      <div class="profile-stat-row"><strong>Department</strong><span>${profile.departmentId || "-"}</span></div>
      <div class="profile-stat-row"><strong>Manager</strong><span>${profile.managerId || "-"}</span></div>
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
      profile = { ...profile, photoUrl: "" };
      await upsertUser(profile.uid, profile);
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
      showToast("success", "Photo removed");
      renderProfile();
      renderAccessSnapshot();
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
    showToast("error", "Please upload an image file");
    return;
  }
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast("error", "Image must be under 2MB");
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    profile = { ...profile, photoUrl: reader.result };
    await upsertUser(profile.uid, profile);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
    showToast("success", "Photo updated");
    renderProfile();
  };
  reader.readAsDataURL(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const updated = {
    ...profile,
    name: fieldValue("profile-name"),
    email: profile.email,
    phone: fieldValue("profile-phone"),
    title: fieldValue("profile-title"),
    departmentId: fieldValue("profile-dept"),
    managerId: fieldValue("profile-manager"),
    positionId: fieldValue("profile-position"),
    bio: fieldValue("profile-bio")
  };

  await upsertUser(profile.uid, updated);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updated));
  profile = { ...updated };
  showToast("success", "Profile updated");
  renderProfile();
  renderSidebar("profile");
});

async function hydrateProfile() {
  try {
    const remote = await getUser(user.uid);
    if (remote) {
      profile = { ...profile, ...remote };
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
      if (profile.role) localStorage.setItem(STORAGE_KEYS.role, profile.role);
    }
  } catch (_) {
    showToast("info", "Profile loaded from local session");
  }
  renderProfile();
}

hydrateProfile();

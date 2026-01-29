import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { upsertUser } from "../Services/users.service.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { STORAGE_KEYS } from "../app.config.js";

if (!enforceAuth("profile")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("profile");

const profileCard = document.getElementById("profile-card");
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
    <div class="stack">
      <div><strong>Name:</strong> ${profile.name || "-"}</div>
      <div><strong>Email:</strong> ${profile.email || "-"}</div>
      <div><strong>Role:</strong> ${profile.role || role}</div>
      <div><strong>Department:</strong> ${profile.departmentId || "-"}</div>
      <div><strong>Manager:</strong> ${profile.managerId || "-"}</div>
    </div>
  `;

  document.getElementById("profile-name").value = profile.name || "";
  document.getElementById("profile-dept").value = profile.departmentId || "";
  document.getElementById("profile-manager").value = profile.managerId || "";

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
    });
  }

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
    name: document.getElementById("profile-name").value.trim(),
    departmentId: document.getElementById("profile-dept").value.trim(),
    managerId: document.getElementById("profile-manager").value.trim()
  };
  await upsertUser(profile.uid, updated);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updated));
  profile = { ...updated };
  showToast("success", "Profile updated");
  renderProfile();
});

renderProfile();

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

function renderProfile() {
  profileCard.innerHTML = `
    <h3 class="section-title">Profile Overview</h3>
    <div class="stack">
      <div><strong>Name:</strong> ${user.name || "-"}</div>
      <div><strong>Email:</strong> ${user.email || "-"}</div>
      <div><strong>Role:</strong> ${user.role || role}</div>
      <div><strong>Department:</strong> ${user.departmentId || "-"}</div>
      <div><strong>Manager:</strong> ${user.managerId || "-"}</div>
    </div>
  `;

  document.getElementById("profile-name").value = user.name || "";
  document.getElementById("profile-dept").value = user.departmentId || "";
  document.getElementById("profile-manager").value = user.managerId || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const updated = {
    ...user,
    name: document.getElementById("profile-name").value.trim(),
    departmentId: document.getElementById("profile-dept").value.trim(),
    managerId: document.getElementById("profile-manager").value.trim()
  };
  await upsertUser(user.uid, updated);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updated));
  showToast("success", "Profile updated");
  renderProfile();
});

renderProfile();

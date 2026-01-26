import { initI18n } from "../Languages/i18n.js";
import { login } from "../Aman/auth.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { STORAGE_KEYS } from "../app.config.js";

initI18n();

/* ===============================
   DIRECT LOGIN (BUTTON)
================================ */
const demoProfile = {
  uid: "demo-user",
  name: "Demo User",
  email: "demo@company.com",
  role: "super_admin",
  departmentId: "",
  managerId: "",
  createdAt: new Date().toISOString()
};

function directLogin() {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(demoProfile));
  localStorage.setItem(STORAGE_KEYS.role, demoProfile.role);
  localStorage.setItem(STORAGE_KEYS.session, "1");
  window.location.replace("dashboard.html");
}

/* ===============================
   NORMAL LOGIN (OPTIONAL)
================================ */
const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const directLoginBtn = document.getElementById("direct-login-btn");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showToast("error", "Please enter email and password.");
      return;
    }

    try {
      await login(email, password);
      window.location.href = "dashboard.html";
    } catch (error) {
      showToast("error", error.message || "Login failed");
    }
  });
}

if (directLoginBtn) {
  directLoginBtn.addEventListener("click", () => {
    directLogin();
  });
}

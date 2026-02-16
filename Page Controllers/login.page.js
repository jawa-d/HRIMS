import { initI18n } from "../Languages/i18n.js";
import { loginWithEmailOnly, getStoredProfile } from "../Aman/auth.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { isAuthenticated, canAccess, getDefaultPage } from "../Aman/guard.js";
import { MENU_ITEMS } from "../app.config.js";

initI18n();

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const submitBtn = form?.querySelector('button[type="submit"]');
const submitDefaultText = submitBtn?.textContent || "Sign In";

const params = new URLSearchParams(window.location.search);
const nextPage = (params.get("next") || "").trim();

function mapLoginError(error) {
  const code = error?.code || "";
  if (code === "auth/configuration-not-found") {
    return "Firebase Auth is not configured for this project. Enable Authentication and Email/Password in Firebase Console.";
  }
  if (code === "auth/email-not-enabled") return "هذا الايميل غير مفعل في النظام.";
  if (code === "auth/invalid-email") return "Invalid email format.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") return "Invalid email or password.";
  if (code === "auth/user-disabled") return "Your account is inactive. Contact HR administrator.";
  if (code === "auth/profile-not-found") return "User exists in Firebase Auth, but no HR profile was found.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again.";
  if (code === "auth/network-request-failed") return "Network error. Check internet connection and retry.";
  return error?.message || "Login failed.";
}

function getPostLoginTarget() {
  const profile = getStoredProfile();
  const nextKey = MENU_ITEMS.find((item) => item.href === nextPage)?.key;
  if (nextPage && nextKey && canAccess(nextKey, profile?.role, profile)) {
    return nextPage;
  }
  return getDefaultPage(profile?.role, profile);
}

if (isAuthenticated()) {
  window.location.replace(getPostLoginTarget());
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
      showToast("error", "Please enter email.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing in...";
    }

    try {
      await loginWithEmailOnly(email);
      window.location.replace(getPostLoginTarget());
    } catch (error) {
      showToast("error", mapLoginError(error));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitDefaultText;
      }
    }
  });
}

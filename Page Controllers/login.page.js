import { initI18n } from "../Languages/i18n.js";
import { loginWithEmailOnly, getStoredProfile } from "../Aman/auth.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { isAuthenticated, canAccess, getDefaultPage } from "../Aman/guard.js";
import { MENU_ITEMS } from "../app.config.js";
import { logSecurityEvent } from "../Services/security-audit.service.js";

initI18n();
initNetworkBackground();

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
      await logSecurityEvent({
        action: "login_failed",
        severity: "warning",
        status: "failed",
        actorEmail: email,
        entity: "auth",
        message: mapLoginError(error),
        metadata: { code: error?.code || "" }
      });
      showToast("error", mapLoginError(error));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitDefaultText;
      }
    }
  });
}

function initNetworkBackground() {
  const canvas = document.getElementById("network-bg");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let rafId = 0;
  const points = [];
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const MAX_DISTANCE = 130;
  const SPEED = 0.22;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildPoints();
  }

  function buildPoints() {
    points.length = 0;
    const area = width * height;
    const count = Math.max(26, Math.min(70, Math.floor(area / 24000)));
    for (let i = 0; i < count; i += 1) {
      points.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const p of points) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -10 || p.x > width + 10) p.vx *= -1;
      if (p.y < -10 || p.y > height + 10) p.vy *= -1;
    }

    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      for (let j = i + 1; j < points.length; j += 1) {
        const b = points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_DISTANCE) continue;
        const alpha = 1 - dist / MAX_DISTANCE;
        ctx.strokeStyle = `rgba(99, 102, 168, ${0.22 * alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (const p of points) {
      ctx.fillStyle = "rgba(99, 102, 168, 0.65)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = window.requestAnimationFrame(draw);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (!rafId) draw();
  }

  resize();
  draw();

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
}

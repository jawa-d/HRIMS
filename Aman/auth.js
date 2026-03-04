import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { STORAGE_KEYS, MENU_ITEMS, DIRECT_SYSTEM_ADMIN } from "../app.config.js";
import { logSecurityEvent } from "../Services/security-audit.service.js";
import { getSettingsRbacConfig } from "../Services/settings-config.service.js";

const session = {
  profile: null
};

function buildAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function syncSessionPermissions(profile) {
  const uid = profile?.uid;
  if (!uid) return;
  const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.userPermissions) || "{}");
  if (Array.isArray(profile.permissions)) {
    current[uid] = profile.permissions;
  } else if (Object.prototype.hasOwnProperty.call(current, uid)) {
    delete current[uid];
  }
  localStorage.setItem(STORAGE_KEYS.userPermissions, JSON.stringify(current));
}

function setSession(profile) {
  session.profile = profile;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
  localStorage.setItem(STORAGE_KEYS.role, profile.role || "employee");
  localStorage.setItem(STORAGE_KEYS.session, "1");
  syncSessionPermissions(profile);
}

async function syncRoleVisibilityFromRemote() {
  try {
    const remote = await getSettingsRbacConfig();
    const roleVisibility = remote?.roleVisibility && typeof remote.roleVisibility === "object"
      ? remote.roleVisibility
      : {};
    localStorage.setItem(STORAGE_KEYS.roleVisibility, JSON.stringify(roleVisibility));
  } catch (_) {
    // Keep local defaults when remote config cannot be loaded.
  }
}

function clearSession() {
  session.profile = null;
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.role);
  localStorage.removeItem(STORAGE_KEYS.session);
}

export function getStoredProfile() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  return raw ? JSON.parse(raw) : null;
}

export async function hydrateUser(user) {
  if (!user) {
    clearSession();
    return null;
  }
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw buildAuthError("auth/profile-not-found", "User profile is not configured in HRMS.");
  }
  const raw = snap.data() || {};
  if (String(raw.status || "active").toLowerCase() === "inactive") {
    throw buildAuthError("auth/user-disabled", "Your account is inactive. Contact HR administrator.");
  }
  const profile = {
    ...raw,
    uid: user.uid,
    email: raw.email || user.email || "",
    role: raw.role || "employee"
  };
  setSession(profile);
  await syncRoleVisibilityFromRemote();
  await logSecurityEvent({
    action: "login_success",
    severity: "info",
    status: "success",
    actorUid: profile.uid,
    actorEmail: profile.email,
    actorRole: profile.role,
    entity: "auth",
    message: "User authenticated successfully."
  });
  return profile;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  try {
    return await hydrateUser(cred.user);
  } catch (error) {
    await signOut(auth);
    clearSession();
    throw error;
  }
}

export async function loginWithEmailOnly(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw buildAuthError("auth/invalid-email", "Invalid email format.");
  }

  if (normalizedEmail === String(DIRECT_SYSTEM_ADMIN.email || "").toLowerCase()) {
    const profile = {
      ...DIRECT_SYSTEM_ADMIN,
      email: normalizedEmail,
      permissions: MENU_ITEMS.map((item) => item.key)
    };
    setSession(profile);
    await syncRoleVisibilityFromRemote();
    await logSecurityEvent({
      action: "login_success",
      severity: "info",
      status: "success",
      actorUid: profile.uid,
      actorEmail: profile.email,
      actorRole: profile.role,
      entity: "auth",
      message: "Direct system admin login succeeded."
    });
    return profile;
  }

  const usersRef = collection(db, "users");
  const snap = await getDocs(query(usersRef, where("email", "==", normalizedEmail), limit(1)));
  if (snap.empty) {
    await logSecurityEvent({
      action: "login_failed",
      severity: "warning",
      status: "failed",
      actorEmail: normalizedEmail,
      entity: "auth",
      message: "Email is not enabled in the system."
    });
    throw buildAuthError("auth/email-not-enabled", "This email is not enabled in the system.");
  }

  const docSnap = snap.docs[0];
  const raw = docSnap.data() || {};
  if (String(raw.status || "active").toLowerCase() === "inactive") {
    await logSecurityEvent({
      action: "login_failed",
      severity: "warning",
      status: "failed",
      actorEmail: normalizedEmail,
      entity: "auth",
      message: "Inactive account login attempt."
    });
    throw buildAuthError("auth/user-disabled", "Your account is inactive. Contact HR administrator.");
  }

  const profile = {
    ...raw,
    uid: raw.uid || docSnap.id,
    email: raw.email || normalizedEmail,
    role: raw.role || "employee"
  };

  setSession(profile);
  await syncRoleVisibilityFromRemote();
  await logSecurityEvent({
    action: "login_success",
    severity: "info",
    status: "success",
    actorUid: profile.uid,
    actorEmail: profile.email,
    actorRole: profile.role,
    entity: "auth",
    message: "Direct email login succeeded."
  });
  return profile;
}

export async function logout(redirect = true) {
  const profile = getStoredProfile();
  await logSecurityEvent({
    action: "logout",
    severity: "info",
    status: "success",
    actorUid: profile?.uid || "",
    actorEmail: profile?.email || "",
    actorRole: profile?.role || "",
    entity: "auth",
    message: "User logged out."
  });
  await signOut(auth);
  clearSession();
  if (redirect) {
    window.location.href = "login.html";
  }
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const profile = await hydrateUser(user);
        callback(profile);
      } catch (_) {
        clearSession();
        callback(null);
      }
    } else {
      clearSession();
      callback(null);
    }
  });
}

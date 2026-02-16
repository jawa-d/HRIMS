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
import { STORAGE_KEYS } from "../app.config.js";

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

  const usersRef = collection(db, "users");
  const snap = await getDocs(query(usersRef, where("email", "==", normalizedEmail), limit(1)));
  if (snap.empty) {
    throw buildAuthError("auth/email-not-enabled", "هذا الايميل غير مفعل في النظام.");
  }

  const docSnap = snap.docs[0];
  const raw = docSnap.data() || {};
  if (String(raw.status || "active").toLowerCase() === "inactive") {
    throw buildAuthError("auth/user-disabled", "هذا الايميل غير مفعل في النظام.");
  }

  const profile = {
    ...raw,
    uid: raw.uid || docSnap.id,
    email: raw.email || normalizedEmail,
    role: raw.role || "employee"
  };

  setSession(profile);
  return profile;
}

export async function logout(redirect = true) {
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

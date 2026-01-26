import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { STORAGE_KEYS } from "../app.config.js";

const session = {
  profile: null
};

function setSession(profile) {
  session.profile = profile;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
  localStorage.setItem(STORAGE_KEYS.role, profile.role || "employee");
  localStorage.setItem(STORAGE_KEYS.session, "1");
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
  const profile = snap.exists()
    ? snap.data()
    : {
        uid: user.uid,
        name: user.email || "User",
        email: user.email || "",
        role: "employee",
        departmentId: "",
        managerId: "",
        createdAt: new Date().toISOString()
      };
  setSession(profile);
  return profile;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return hydrateUser(cred.user);
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
      const profile = await hydrateUser(user);
      callback(profile);
    } else {
      clearSession();
      callback(null);
    }
  });
}

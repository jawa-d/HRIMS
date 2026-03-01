import { db, ts } from "../Aman/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const configDocRef = doc(db, "app_config", "settings_rbac");

function normalizeMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((acc, [key, val]) => {
    if (!Array.isArray(val)) return acc;
    acc[String(key)] = Array.from(new Set(val.map((item) => String(item))));
    return acc;
  }, {});
}

export async function getSettingsRbacConfig() {
  const snap = await getDoc(configDocRef);
  if (!snap.exists()) {
    return { roleVisibility: {}, userPermissions: {} };
  }
  const data = snap.data() || {};
  return {
    roleVisibility: normalizeMap(data.roleVisibility),
    userPermissions: normalizeMap(data.userPermissions)
  };
}

export async function upsertSettingsRbacConfig({ roleVisibility, userPermissions }) {
  await setDoc(
    configDocRef,
    {
      roleVisibility: normalizeMap(roleVisibility),
      userPermissions: normalizeMap(userPermissions),
      updatedAt: ts()
    },
    { merge: true }
  );
}

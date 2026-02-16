const ERROR_STORAGE_KEY = "hrms_last_error";

function currentPageName() {
  const path = window.location.pathname || "";
  return path.split("/").pop().toLowerCase();
}

function isSystemPage() {
  const page = currentPageName();
  return page === "offline.html" || page === "error.html";
}

function safeRedirect(pathWithQuery) {
  if (isSystemPage()) return;
  if (window.__hrmsErrorRedirecting) return;
  window.__hrmsErrorRedirecting = true;
  window.location.replace(pathWithQuery);
}

function toSerializableError(payload = {}) {
  return {
    type: payload.type || "runtime",
    code: payload.code || "unknown",
    message: payload.message || "Unexpected error",
    file: payload.file || "",
    line: payload.line || 0,
    col: payload.col || 0,
    at: new Date().toISOString(),
    page: currentPageName()
  };
}

function saveError(payload) {
  try {
    localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(toSerializableError(payload)));
  } catch (_) {
    // Ignore storage failures and still redirect.
  }
}

function openOfflinePage(reason = "network") {
  const from = encodeURIComponent(currentPageName() || "unknown");
  try {
    const returnTo = `${window.location.pathname.split("/").pop()}${window.location.search || ""}`;
    sessionStorage.setItem("hrms_offline_return_to", returnTo || "dashboard.html");
  } catch (_) {
    // Ignore storage failures.
  }
  safeRedirect(`offline.html?reason=${encodeURIComponent(reason)}&from=${from}`);
}

function openErrorPage(payload) {
  saveError(payload);
  const code = encodeURIComponent(payload?.code || "unknown");
  safeRedirect(`error.html?code=${code}`);
}

function isLikelyNetworkError(message = "") {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("offline") ||
    text.includes("internet") ||
    text.includes("failed to get document")
  );
}

export function initErrorRouter() {
  if (window.__hrmsErrorRouterReady) return;
  window.__hrmsErrorRouterReady = true;

  const page = currentPageName();
  if (page !== "offline.html" && !navigator.onLine) {
    openOfflinePage("startup_offline");
    return;
  }

  window.addEventListener("offline", () => {
    openOfflinePage("lost_connection");
  });

  window.addEventListener("online", () => {
    if (currentPageName() === "offline.html") {
      const target = sessionStorage.getItem("hrms_offline_return_to") || "dashboard.html";
      window.location.replace(target);
    }
  });

  window.addEventListener("error", (event) => {
    if (isSystemPage()) return;

    const target = event?.target;
    const targetTag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
    if (targetTag && targetTag !== "body" && targetTag !== "html" && targetTag !== "script") {
      openErrorPage({
        type: "resource",
        code: "resource_load_failure",
        message: `Failed to load resource: ${targetTag}`
      });
      return;
    }

    const message = event?.message || "Unhandled runtime error";
    if (!navigator.onLine || isLikelyNetworkError(message)) {
      openOfflinePage("runtime_network_failure");
      return;
    }

    openErrorPage({
      type: "runtime",
      code: "js_runtime_error",
      message,
      file: event?.filename || "",
      line: event?.lineno || 0,
      col: event?.colno || 0
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isSystemPage()) return;

    const reason = event?.reason;
    const message =
      (typeof reason === "string" && reason) ||
      reason?.message ||
      "Unhandled promise rejection";

    if (!navigator.onLine || isLikelyNetworkError(message)) {
      openOfflinePage("request_failure");
      return;
    }

    openErrorPage({
      type: "promise",
      code: "unhandled_promise_rejection",
      message
    });
  });
}

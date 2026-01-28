let toastRoot;

function ensureToastRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toast-container";
    document.body.appendChild(toastRoot);
  }
}

export function showToast(type, message, title = "") {
  ensureToastRoot();
  const icons = {
    success: "check-circle-2",
    error: "x-circle",
    warning: "alert-triangle",
    info: "info"
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${icons[type] || "info"}"></i>
    </div>
    <div class="toast-body">
      ${title ? `<strong>${title}</strong>` : ""}
      <div>${message}</div>
    </div>
    <button class="toast-close" aria-label="Close notification">
      <i data-lucide="x"></i>
    </button>
    <div class="toast-progress"></div>
  `;
  toastRoot.appendChild(toast);

  const removeToast = () => {
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 280);
  };

  toast.querySelector(".toast-close").addEventListener("click", removeToast);

  const timeout = setTimeout(removeToast, 4200);
  toast.addEventListener("mouseenter", () => clearTimeout(timeout));

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

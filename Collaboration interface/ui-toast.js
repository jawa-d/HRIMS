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
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div>
      <strong>${title}</strong>
      <div>${message}</div>
    </div>
  `;
  toastRoot.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4200);
}

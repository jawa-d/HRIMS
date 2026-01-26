let modalRoot;

function ensureModal() {
  if (!modalRoot) {
    modalRoot = document.createElement("div");
    modalRoot.className = "modal-backdrop";
    modalRoot.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 id="modal-title"></h3>
          <button class="btn btn-ghost" id="modal-close">Close</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-actions" id="modal-actions"></div>
      </div>
    `;
    document.body.appendChild(modalRoot);
    modalRoot.querySelector("#modal-close").addEventListener("click", closeModal);
    modalRoot.addEventListener("click", (event) => {
      if (event.target === modalRoot) closeModal();
    });
  }
}

export function openModal({ title, content, actions = [] }) {
  ensureModal();
  modalRoot.querySelector("#modal-title").textContent = title || "";
  const body = modalRoot.querySelector("#modal-body");
  body.innerHTML = "";
  if (typeof content === "string") {
    body.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    body.appendChild(content);
  }
  const actionsRoot = modalRoot.querySelector("#modal-actions");
  actionsRoot.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.className = action.className || "btn btn-primary";
    button.textContent = action.label || "OK";
    button.addEventListener("click", () => {
      if (action.onClick) action.onClick();
      if (!action.keepOpen) closeModal();
    });
    actionsRoot.appendChild(button);
  });
  modalRoot.classList.add("open");
}

export function closeModal() {
  if (modalRoot) {
    modalRoot.classList.remove("open");
  }
}

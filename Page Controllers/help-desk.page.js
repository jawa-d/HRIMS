import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { trackUxEvent } from "../Services/telemetry.service.js";
import { listUsers } from "../Services/users.service.js";
import { createNotification } from "../Services/notifications.service.js";
import { createTicket, updateTicket, watchTickets, listTickets } from "../Services/tickets.service.js";

if (!enforceAuth("help_desk")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("help_desk");

const canManage = ["super_admin", "hr_admin", "manager"].includes(role);

const form = document.getElementById("helpdesk-form");
const subjectEl = document.getElementById("helpdesk-subject");
const descriptionEl = document.getElementById("helpdesk-description");
const categoryEl = document.getElementById("helpdesk-category");
const priorityEl = document.getElementById("helpdesk-priority");
const submitBtn = document.getElementById("helpdesk-submit-btn");
const listEl = document.getElementById("helpdesk-list");
const emptyEl = document.getElementById("helpdesk-empty");
const searchEl = document.getElementById("helpdesk-search");
const statusFilterEl = document.getElementById("helpdesk-status-filter");
const priorityFilterEl = document.getElementById("helpdesk-priority-filter");
const myOnlyEl = document.getElementById("helpdesk-my-only");
const kpiOpenEl = document.getElementById("helpdesk-kpi-open");
const kpiProgressEl = document.getElementById("helpdesk-kpi-progress");
const kpiResolvedEl = document.getElementById("helpdesk-kpi-resolved");

let tickets = [];
let supportUsers = [];
let unsubscribeTickets = null;

function hashSeed(input = "") {
  let hash = 0;
  const value = String(input || "");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function ticketAccent(ticket = {}) {
  const source = ticket.id || ticket.subject || ticket.requesterUid || ticket.requesterEmail || "";
  const hue = hashSeed(source) % 360;
  return `hsl(${hue} 72% 44%)`;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function formatDate(value) {
  const time = toMillis(value);
  if (!time) return "-";
  return new Date(time).toLocaleString();
}

function shouldScopeToCurrentUser() {
  return !canManage || Boolean(myOnlyEl.checked);
}

function stopTicketsWatcher() {
  if (typeof unsubscribeTickets === "function") {
    unsubscribeTickets();
    unsubscribeTickets = null;
  }
}

function startTicketsWatcher() {
  stopTicketsWatcher();
  const scopeUid = shouldScopeToCurrentUser() ? (user?.uid || "") : "";
  unsubscribeTickets = watchTickets(
    (items) => {
      tickets = items;
      renderTickets();
    },
    async () => {
      showToast("error", "Failed to watch tickets");
      await loadTicketsOnce();
    },
    { scopeUid }
  );
}

async function loadTicketsOnce() {
  try {
    const scopeUid = shouldScopeToCurrentUser() ? (user?.uid || "") : "";
    tickets = await listTickets({ scopeUid });
    renderTickets();
  } catch (error) {
    console.error("Load helpdesk tickets failed:", error);
    tickets = [];
    renderTickets();
    showToast("error", "Could not load tickets");
  }
}

function createSupportNotificationPayload(ticketId, ticketPayload) {
  return {
    title: "New Help Desk Ticket",
    body: `${ticketPayload.subject} (${ticketPayload.priority})`,
    type: "ticket",
    priority: ticketPayload.priority === "critical" ? "high" : ticketPayload.priority,
    actionHref: `help-desk.html#${ticketId}`
  };
}

async function notifySupportTeam(ticketId, ticketPayload) {
  const targets = supportUsers.filter((item) => ["super_admin", "hr_admin", "manager"].includes(item.role || ""));
  if (!targets.length) return;

  const payload = createSupportNotificationPayload(ticketId, ticketPayload);
  try {
    await Promise.all(
      targets
        .map((item) => item.uid || item.id || "")
        .filter(Boolean)
        .map((toUid) => createNotification({ ...payload, toUid }))
    );
  } catch (error) {
    console.error("Helpdesk notify failed:", error);
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function filteredTickets() {
  const q = normalizeText(searchEl.value);
  const status = normalizeText(statusFilterEl.value);
  const priority = normalizeText(priorityFilterEl.value);

  return tickets.filter((item) => {
    const hitQuery =
      !q ||
      `${item.subject || ""} ${item.description || ""} ${item.requesterName || ""} ${item.assigneeName || ""}`
        .toLowerCase()
        .includes(q);
    const hitStatus = !status || normalizeText(item.status) === status;
    const hitPriority = !priority || normalizeText(item.priority) === priority;
    return hitQuery && hitStatus && hitPriority;
  });
}

function renderKpis(items) {
  const open = items.filter((item) => normalizeText(item.status) === "open").length;
  const inProgress = items.filter((item) => normalizeText(item.status) === "in_progress").length;
  const resolved = items.filter((item) => ["resolved", "closed"].includes(normalizeText(item.status))).length;
  kpiOpenEl.textContent = String(open);
  kpiProgressEl.textContent = String(inProgress);
  kpiResolvedEl.textContent = String(resolved);
}

function managerControls(ticket) {
  if (!canManage) return "";
  const assigneeOptions = [
    `<option value="">Unassigned</option>`,
    ...supportUsers
      .filter((item) => ["super_admin", "hr_admin", "manager"].includes(item.role || ""))
      .map((item) => {
        const uid = item.uid || item.id || "";
        const label = item.name || item.email || uid;
        return `<option value="${uid}" ${ticket.assigneeUid === uid ? "selected" : ""}>${label}</option>`;
      })
  ].join("");

  return `
    <div class="helpdesk-ticket-manage">
      <select class="select" data-manage-status="${ticket.id}">
        <option value="open" ${ticket.status === "open" ? "selected" : ""}>Open</option>
        <option value="in_progress" ${ticket.status === "in_progress" ? "selected" : ""}>In Progress</option>
        <option value="resolved" ${ticket.status === "resolved" ? "selected" : ""}>Resolved</option>
        <option value="closed" ${ticket.status === "closed" ? "selected" : ""}>Closed</option>
      </select>
      <select class="select" data-manage-assignee="${ticket.id}">
        ${assigneeOptions}
      </select>
      <button class="btn btn-outline" data-manage-save="${ticket.id}">Save</button>
    </div>
  `;
}

function renderTickets() {
  const items = filteredTickets();
  renderKpis(items);

  listEl.innerHTML = items
    .map(
      (ticket, index) => `
      <article class="helpdesk-ticket" style="--ticket-accent:${ticketAccent(ticket)};--row-index:${index};">
        <div class="helpdesk-ticket-head">
          <div>
            <div class="helpdesk-ticket-title"><span class="ticket-dot"></span><span>${ticket.subject || "-"}</span></div>
            <div class="helpdesk-ticket-meta">
              <span class="badge">${ticket.category || "general"}</span>
              <span class="badge">${ticket.priority || "medium"}</span>
              <span class="badge">${(ticket.status || "open").replace(/_/g, " ")}</span>
            </div>
          </div>
          <small class="text-muted">${formatDate(ticket.updatedAt || ticket.createdAt)}</small>
        </div>
        <p class="helpdesk-ticket-desc">${ticket.description || "-"}</p>
        <div class="helpdesk-ticket-foot">
          <small class="text-muted">
            Requester: ${ticket.requesterName || ticket.requesterEmail || "-"} | Assignee: ${ticket.assigneeName || "-"}
          </small>
          ${managerControls(ticket)}
        </div>
      </article>
    `
    )
    .join("");

  emptyEl.classList.toggle("hidden", items.length > 0);

  listEl.querySelectorAll("button[data-manage-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-manage-save");
      const ticket = tickets.find((item) => item.id === id);
      if (!ticket) return;

      const statusEl = listEl.querySelector(`[data-manage-status="${id}"]`);
      const assigneeEl = listEl.querySelector(`[data-manage-assignee="${id}"]`);
      const assigneeUid = String(assigneeEl?.value || "").trim();
      const assignee = supportUsers.find((item) => (item.uid || item.id || "") === assigneeUid);

      try {
        await updateTicket(id, {
          ...ticket,
          status: statusEl?.value || ticket.status || "open",
          assigneeUid,
          assigneeName: assignee ? assignee.name || assignee.email || assigneeUid : ""
        });
        showToast("success", "Ticket updated");
      } catch (error) {
        console.error("Update helpdesk ticket failed:", error);
        showToast("error", "Failed to update ticket");
      }
    });
  });
}

async function handleCreateTicket(event) {
  event.preventDefault();
  const subject = subjectEl.value.trim();
  const description = descriptionEl.value.trim();
  const category = categoryEl.value;
  const priority = priorityEl.value;

  if (!subject || !description) {
    showToast("error", "Subject and description are required");
    return;
  }

  submitBtn.disabled = true;
  try {
    const payload = {
      subject,
      description,
      category,
      priority,
      status: "open",
      requesterUid: user?.uid || "",
      requesterName: user?.name || "",
      requesterEmail: user?.email || ""
    };
    const ticketId = await createTicket(payload);
    await notifySupportTeam(ticketId, payload);
    form.reset();
    priorityEl.value = "medium";
    showToast("success", "Ticket submitted successfully");
  } catch (error) {
    console.error("Help desk ticket create failed:", error);
    showToast("error", "Failed to submit ticket");
  } finally {
    submitBtn.disabled = false;
  }
}

async function init() {
  if (!canManage) {
    myOnlyEl.checked = true;
    myOnlyEl.disabled = true;
  }
  try {
    supportUsers = await listUsers();
  } catch (_) {
    supportUsers = [];
  }
  startTicketsWatcher();
}

form.addEventListener("submit", (event) => {
  void handleCreateTicket(event);
});
searchEl.addEventListener("input", renderTickets);
statusFilterEl.addEventListener("change", renderTickets);
priorityFilterEl.addEventListener("change", renderTickets);
myOnlyEl.addEventListener("change", () => {
  startTicketsWatcher();
});
window.addEventListener("beforeunload", stopTicketsWatcher);
trackUxEvent({ event: "page_open", module: "help_desk" });

if (window.lucide?.createIcons) window.lucide.createIcons();
void init();

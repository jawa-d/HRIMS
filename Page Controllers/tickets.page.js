import { enforceAuth, getUserProfile, getRole } from "../Aman/guard.js";
import { initI18n } from "../Languages/i18n.js";
import { renderNavbar } from "../Collaboration interface/ui-navbar.js";
import { renderSidebar } from "../Collaboration interface/ui-sidebar.js";
import { openModal } from "../Collaboration interface/ui-modal.js";
import { showToast } from "../Collaboration interface/ui-toast.js";
import { showTableSkeleton } from "../Collaboration interface/ui-skeleton.js";
import { canDo } from "../Services/permissions.service.js";
import { listEmployees } from "../Services/employees.service.js";
import { createNotification } from "../Services/notifications.service.js";
import { listUsers } from "../Services/users.service.js";
import { listTickets, createTicket, updateTicket, deleteTicket, watchTickets } from "../Services/tickets.service.js";

if (!enforceAuth("tickets")) {
  throw new Error("Unauthorized");
}

initI18n();
const user = getUserProfile();
const role = getRole();
renderNavbar({ user, role });
renderSidebar("tickets");
if (window.lucide?.createIcons) window.lucide.createIcons();

const canCreate = canDo({ role, entity: "tickets", action: "create" }) || ["super_admin", "hr_admin", "manager", "employee"].includes(role);
const canManage = ["super_admin", "hr_admin", "manager"].includes(role);
const canDelete = canDo({ role, entity: "tickets", action: "delete" }) || ["super_admin", "hr_admin"].includes(role);

const addBtn = document.getElementById("tickets-add-btn");
const searchInput = document.getElementById("tickets-search");
const statusFilter = document.getElementById("tickets-status");
const categoryFilter = document.getElementById("tickets-category");
const priorityFilter = document.getElementById("tickets-priority");
const bodyEl = document.getElementById("tickets-body");
const emptyEl = document.getElementById("tickets-empty");
const kpiTotalEl = document.getElementById("tickets-kpi-total");
const kpiOpenEl = document.getElementById("tickets-kpi-open");
const kpiProgressEl = document.getElementById("tickets-kpi-progress");
const kpiResolvedEl = document.getElementById("tickets-kpi-resolved");
const analyticsSlaEl = document.getElementById("tickets-analytics-sla");
const analyticsAvgCloseEl = document.getElementById("tickets-analytics-avg-close");
const analyticsTopCategoryEl = document.getElementById("tickets-analytics-top-category");
const analyticsTopCategoryMetaEl = document.getElementById("tickets-analytics-top-category-meta");
const workloadBodyEl = document.getElementById("tickets-workload-body");
const workloadEmptyEl = document.getElementById("tickets-workload-empty");

if (!canCreate) addBtn.classList.add("hidden");

let tickets = [];
let employees = [];
let users = [];
let unsubscribeTickets = null;
const SLA_TARGET_HOURS = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 48
};

function formatTime(value) {
  const seconds = value?.seconds || 0;
  if (!seconds) return "-";
  return new Date(seconds * 1000).toLocaleString();
}

function labelCase(value = "") {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function canEditTicket(ticket) {
  if (canManage) return true;
  return ticket.requesterUid === user?.uid && ["open", "in_progress"].includes(ticket.status || "open");
}

function filteredTickets() {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "";
  const category = categoryFilter?.value || "";
  const priority = priorityFilter?.value || "";
  return tickets.filter((ticket) => {
    const hitQuery =
      !query ||
      `${ticket.subject || ""} ${ticket.requesterName || ""} ${ticket.assigneeName || ""}`.toLowerCase().includes(query);
    const hitStatus = !status || ticket.status === status;
    const hitCategory = !category || ticket.category === category;
    const hitPriority = !priority || ticket.priority === priority;
    return hitQuery && hitStatus && hitCategory && hitPriority;
  });
}

function renderKpis(items) {
  kpiTotalEl.textContent = String(items.length);
  kpiOpenEl.textContent = String(items.filter((item) => item.status === "open").length);
  kpiProgressEl.textContent = String(items.filter((item) => item.status === "in_progress").length);
  kpiResolvedEl.textContent = String(items.filter((item) => ["resolved", "closed"].includes(item.status)).length);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function renderAnalytics(items) {
  const closedItems = items.filter((item) => ["resolved", "closed"].includes(item.status || ""));
  let slaHits = 0;
  let avgCloseHours = 0;

  if (closedItems.length) {
    const closeDurations = closedItems
      .map((item) => {
        const createdAt = toMillis(item.createdAt);
        const closedAt = toMillis(item.updatedAt) || createdAt;
        if (!createdAt || !closedAt || closedAt < createdAt) return null;
        const hours = (closedAt - createdAt) / (1000 * 60 * 60);
        const target = SLA_TARGET_HOURS[item.priority] || SLA_TARGET_HOURS.medium;
        if (hours <= target) slaHits += 1;
        return hours;
      })
      .filter((value) => value !== null);

    if (closeDurations.length) {
      avgCloseHours = closeDurations.reduce((sum, value) => sum + value, 0) / closeDurations.length;
    }
  }

  const slaPct = closedItems.length ? Math.round((slaHits / closedItems.length) * 100) : 0;
  if (analyticsSlaEl) analyticsSlaEl.textContent = `${slaPct}%`;
  if (analyticsAvgCloseEl) analyticsAvgCloseEl.textContent = `${avgCloseHours.toFixed(1)}h`;

  const categoryCount = new Map();
  items.forEach((item) => {
    const key = item.category || "general";
    categoryCount.set(key, (categoryCount.get(key) || 0) + 1);
  });
  const topCategory = Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0];
  if (analyticsTopCategoryEl) analyticsTopCategoryEl.textContent = topCategory ? labelCase(topCategory[0]) : "-";
  if (analyticsTopCategoryMetaEl) analyticsTopCategoryMetaEl.textContent = topCategory ? `${topCategory[1]} tickets` : "No data";

  const workload = new Map();
  items
    .filter((item) => ["open", "in_progress"].includes(item.status || ""))
    .forEach((item) => {
      const assignee = String(item.assigneeName || "").trim() || "Unassigned";
      const row = workload.get(assignee) || { assignee, open: 0, inProgress: 0 };
      if (item.status === "open") row.open += 1;
      if (item.status === "in_progress") row.inProgress += 1;
      workload.set(assignee, row);
    });

  const rows = Array.from(workload.values())
    .map((row) => ({ ...row, total: row.open + row.inProgress }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  if (workloadBodyEl) {
    workloadBodyEl.innerHTML = rows
      .map(
        (row) => `
        <tr>
          <td>${row.assignee}</td>
          <td>${row.open}</td>
          <td>${row.inProgress}</td>
          <td><strong>${row.total}</strong></td>
        </tr>
      `
      )
      .join("");
  }
  if (workloadEmptyEl) workloadEmptyEl.classList.toggle("hidden", rows.length > 0);
}

function ticketFormContent(ticket = {}) {
  const assigneeOptions = [
    `<option value="">Unassigned</option>`,
    ...employees.map((emp) => {
      const label = emp.fullName || emp.email || emp.empId || emp.id;
      return `<option value="${emp.id}" ${ticket.assigneeUid === emp.id ? "selected" : ""}>${label}</option>`;
    })
  ].join("");

  return `
    <label>Subject<input class="input" id="ticket-subject" value="${ticket.subject || ""}" /></label>
    <label>Description<textarea class="textarea" id="ticket-description" rows="4">${ticket.description || ""}</textarea></label>
    <label>Category
      <select class="select" id="ticket-category">
        <option value="general" ${ticket.category === "general" ? "selected" : ""}>General</option>
        <option value="hr" ${ticket.category === "hr" ? "selected" : ""}>HR</option>
        <option value="it" ${ticket.category === "it" ? "selected" : ""}>IT</option>
      </select>
    </label>
    <label>Priority
      <select class="select" id="ticket-priority">
        <option value="low" ${ticket.priority === "low" ? "selected" : ""}>Low</option>
        <option value="medium" ${ticket.priority === "medium" || !ticket.priority ? "selected" : ""}>Medium</option>
        <option value="high" ${ticket.priority === "high" ? "selected" : ""}>High</option>
        <option value="critical" ${ticket.priority === "critical" ? "selected" : ""}>Critical</option>
      </select>
    </label>
    ${
      canManage
        ? `
      <label>Status
        <select class="select" id="ticket-status">
          <option value="open" ${ticket.status === "open" ? "selected" : ""}>Open</option>
          <option value="in_progress" ${ticket.status === "in_progress" ? "selected" : ""}>In Progress</option>
          <option value="resolved" ${ticket.status === "resolved" ? "selected" : ""}>Resolved</option>
          <option value="closed" ${ticket.status === "closed" ? "selected" : ""}>Closed</option>
        </select>
      </label>
      <label>Assignee
        <select class="select" id="ticket-assignee">${assigneeOptions}</select>
      </label>
      <label>Resolution Note<textarea class="textarea" id="ticket-resolution" rows="2">${ticket.resolutionNote || ""}</textarea></label>
    `
        : ""
    }
  `;
}

function collectTicketForm(existing = {}) {
  const assigneeUid = canManage ? String(document.getElementById("ticket-assignee")?.value || "").trim() : (existing.assigneeUid || "");
  const assignee = employees.find((emp) => emp.id === assigneeUid);
  return {
    ...existing,
    subject: document.getElementById("ticket-subject").value.trim(),
    description: document.getElementById("ticket-description").value.trim(),
    category: document.getElementById("ticket-category").value,
    priority: document.getElementById("ticket-priority").value,
    status: canManage ? document.getElementById("ticket-status").value : (existing.status || "open"),
    assigneeUid,
    assigneeName: assignee ? assignee.fullName || assignee.email || assignee.empId || assignee.id : "",
    resolutionNote: canManage ? document.getElementById("ticket-resolution").value.trim() : (existing.resolutionNote || "")
  };
}

function openTicketModal(ticket = null) {
  const isEdit = Boolean(ticket);
  openModal({
    title: isEdit ? "Update Ticket" : "New Ticket",
    content: ticketFormContent(ticket || {}),
    actions: [
      {
        label: "Save",
        className: "btn btn-primary",
        onClick: async () => {
          const payload = collectTicketForm(ticket || {});
          if (!payload.subject) {
            showToast("error", "Subject is required");
            return;
          }
          if (!payload.description) {
            showToast("error", "Description is required");
            return;
          }
          if (isEdit) {
            await updateTicket(ticket.id, payload);
            showToast("success", "Ticket updated");
          } else {
            const createdPayload = {
              ...payload,
              status: "open",
              requesterUid: user?.uid || "",
              requesterName: user?.name || "",
              requesterEmail: user?.email || ""
            };
            const ticketId = await createTicket(createdPayload);
            await notifyTicketCreated(ticketId, createdPayload);
            showToast("success", "Ticket created");
          }
          await loadTicketsData();
        }
      },
      { label: "Cancel", className: "btn btn-ghost" }
    ]
  });
}

async function handleAction(action, id) {
  const ticket = tickets.find((item) => item.id === id);
  if (!ticket) return;

  if (action === "edit" && canEditTicket(ticket)) {
    openTicketModal(ticket);
    return;
  }

  if (action === "close" && canManage) {
    await updateTicket(ticket.id, { ...ticket, status: "closed" });
    showToast("success", "Ticket closed");
    await loadTicketsData();
    return;
  }

  if (action === "delete" && canDelete) {
    const confirmed = window.confirm("Delete this ticket permanently?");
    if (!confirmed) return;
    await deleteTicket(ticket.id);
    showToast("success", "Ticket deleted");
    await loadTicketsData();
  }
}

function renderTickets() {
  const items = filteredTickets();
  bodyEl.innerHTML = items
    .map((ticket) => {
      const canEdit = canEditTicket(ticket);
      return `
      <tr>
        <td>
          <div class="tickets-subject">
            <span>${ticket.subject || "-"}</span>
            <small>${ticket.description || "-"}</small>
          </div>
        </td>
        <td><span class="badge">${labelCase(ticket.category || "general")}</span></td>
        <td><span class="badge ticket-priority-${ticket.priority || "medium"}">${labelCase(ticket.priority || "medium")}</span></td>
        <td><span class="badge ticket-status-${ticket.status || "open"}">${labelCase(ticket.status || "open")}</span></td>
        <td>${ticket.requesterName || ticket.requesterEmail || "-"}</td>
        <td>${ticket.assigneeName || "-"}</td>
        <td>${formatTime(ticket.updatedAt || ticket.createdAt)}</td>
        <td>
          <div class="tickets-actions">
            ${canEdit ? `<button class="btn btn-ghost" data-action="edit" data-id="${ticket.id}">Edit</button>` : ""}
            ${canManage && ticket.status !== "closed" ? `<button class="btn btn-ghost" data-action="close" data-id="${ticket.id}">Close</button>` : ""}
            ${canDelete ? `<button class="btn btn-ghost" data-action="delete" data-id="${ticket.id}">Delete</button>` : ""}
          </div>
        </td>
      </tr>
    `;
    })
    .join("");

  emptyEl.classList.toggle("hidden", items.length > 0);
  renderKpis(items);
  renderAnalytics(items);

  bodyEl.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
  });
}

async function loadTicketsData() {
  showTableSkeleton(bodyEl, { rows: 6, cols: 8 });
  const scopeUid = canManage ? "" : (user?.uid || "");
  tickets = await listTickets({ scopeUid });
  renderTickets();
}

function startRealtimeTickets() {
  const scopeUid = canManage ? "" : (user?.uid || "");
  unsubscribeTickets = watchTickets(
    (items) => {
      tickets = items;
      renderTickets();
    },
    () => {
      void loadTicketsData();
    },
    { scopeUid }
  );
}

async function loadEmployeesData() {
  if (!canManage) return;
  employees = await listEmployees();
}

async function loadUsersData() {
  users = await listUsers();
}

async function notifyTicketCreated(ticketId, payload) {
  const hrManagers = users.filter((u) => ["super_admin", "hr_admin", "manager"].includes(u.role || ""));
  const targets = new Map();
  hrManagers.forEach((u) => {
    const uid = u.uid || u.id || "";
    if (!uid) return;
    targets.set(uid, { ...u, uid });
  });
  if (payload.requesterUid && !targets.has(payload.requesterUid)) {
    targets.set(payload.requesterUid, {
      uid: payload.requesterUid,
      name: payload.requesterName || "",
      email: payload.requesterEmail || ""
    });
  }

  await Promise.all(
    Array.from(targets.values()).map((target) =>
      createNotification({
        toUid: target.uid || target.id,
        title: "New Ticket Created",
        body: `${payload.subject} (${payload.priority})`,
        type: "ticket",
        priority: payload.priority === "critical" ? "high" : "medium",
        actionHref: `tickets.html?id=${ticketId}`
      })
    )
  );
}

if (addBtn) addBtn.addEventListener("click", () => openTicketModal());
if (searchInput) searchInput.addEventListener("input", renderTickets);
if (statusFilter) statusFilter.addEventListener("change", renderTickets);
if (categoryFilter) categoryFilter.addEventListener("change", renderTickets);
if (priorityFilter) priorityFilter.addEventListener("change", renderTickets);

window.addEventListener("global-search", (event) => {
  if (searchInput) searchInput.value = event.detail || "";
  renderTickets();
});

window.addEventListener("beforeunload", () => {
  if (typeof unsubscribeTickets === "function") unsubscribeTickets();
});

(async () => {
  await loadUsersData();
  await loadEmployeesData();
  startRealtimeTickets();
  if (!tickets.length) await loadTicketsData();
})();

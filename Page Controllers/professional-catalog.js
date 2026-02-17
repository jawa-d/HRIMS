export const PROFESSIONAL_PAGES = [
  { key: "my_requests", title: "My Requests", area: "Employee Experience", desc: "Single hub for leave, assets, advances, and HR service requests." },
  { key: "manager_inbox", title: "Manager Inbox", area: "Approvals", desc: "Priority-based queue with SLA timers for all pending approvals." },
  { key: "approval_timeline", title: "Approval Timeline", area: "Governance", desc: "Chronological trail of every decision and handoff." },
  { key: "team_calendar", title: "Team Calendar", area: "Planning", desc: "Leave and availability calendar to avoid team conflicts." },
  { key: "employee_360", title: "Employee 360", area: "People Data", desc: "Unified profile with attendance, payroll, goals, and documents." },
  { key: "document_center", title: "Document Center", area: "Records", desc: "Secure employee document repository with expiry tracking." },
  { key: "recruitment_pipeline", title: "Recruitment Pipeline", area: "Talent", desc: "From sourcing to offer acceptance with stage analytics." },
  { key: "onboarding_tracker", title: "Onboarding Tracker", area: "Talent", desc: "Milestone checklist for new joiners across departments." },
  { key: "offboarding_checklist", title: "Offboarding Checklist", area: "Operations", desc: "Structured exit process with handover and access revocation." },
  { key: "performance_reviews", title: "Performance Reviews", area: "Performance", desc: "Review cycles, goals, calibrations, and manager feedback." },
  { key: "compensation_history", title: "Compensation History", area: "Compensation", desc: "Salary changes, increments, and bonus history by employee." },
  { key: "attendance_anomalies", title: "Attendance Anomalies", area: "Attendance", desc: "Auto-detected late patterns, absences, and irregular logs." },
  { key: "policy_center", title: "Policy Center", area: "Compliance", desc: "Versioned policies with read acknowledgment and reminders." },
  { key: "announcements", title: "Announcements", area: "Communication", desc: "Targeted internal updates with view/read tracking." },
  { key: "hr_tickets", title: "HR Help Desk", area: "Support", desc: "Ticketing for HR requests with owner and resolution SLA." },
  { key: "org_insights", title: "Org Insights", area: "Analytics", desc: "Org structure health, spans, layers, and team composition trends." },
  { key: "asset_lifecycle", title: "Asset Lifecycle", area: "Assets", desc: "Assign, transfer, maintain, and recover company assets." },
  { key: "training_certifications", title: "Training & Certifications", area: "Learning", desc: "Learning plans, completions, and certificate expiry monitoring." },
  { key: "role_permission_matrix", title: "Role Permission Matrix", area: "Security", desc: "Role and user permission mapping with exception controls." },
  { key: "executive_dashboard", title: "Executive Dashboard", area: "Leadership", desc: "C-level KPIs across headcount, attrition, cost, and productivity." }
];

export function buildPageData(key) {
  const item = PROFESSIONAL_PAGES.find((entry) => entry.key === key) || PROFESSIONAL_PAGES[0];
  const kpiBase = item.title.length;
  return {
    ...item,
    kpis: [
      { label: "Open Items", value: 12 + (kpiBase % 11) },
      { label: "In Progress", value: 4 + (kpiBase % 7) },
      { label: "Completed", value: 20 + (kpiBase % 13) },
      { label: "SLA Risk", value: 1 + (kpiBase % 5) }
    ],
    highlights: [
      `${item.title} is configured with role-aware visibility and audit-ready actions.`,
      "Designed for desktop and mobile with responsive cards and table layouts.",
      "Ready for live data binding from current services layer."
    ],
    activities: [
      { title: "Workflow Rule Updated", subtitle: "Approval chain adjusted for critical cases." },
      { title: "Automation Triggered", subtitle: "Reminder sent to overdue approver." },
      { title: "SLA Breach Prevented", subtitle: "Escalation executed within configured threshold." }
    ],
    table: [
      { name: "Record A", owner: "HR Team", status: "active", updated: "Today" },
      { name: "Record B", owner: "Manager", status: "pending", updated: "Yesterday" },
      { name: "Record C", owner: "System", status: "completed", updated: "2 days ago" }
    ]
  };
}

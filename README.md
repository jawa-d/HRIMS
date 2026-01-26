# HRMS - Human Resources Management System

Production-ready HRMS built with HTML, CSS, and Vanilla JS (ES Modules) on Firebase Authentication + Firestore.

## Key Features
- Role-based access control (super_admin, hr_admin, manager, employee)
- RTL/LTR language toggle (Arabic/English)
- Dark/Light theme toggle with persistence
- Firestore-backed CRUD for core HR data
- Notifications with unread count and mark-as-read
- Dashboard KPIs and charts (Chart.js)
- Responsive sidebar + navbar UI

## Pages
- Dashboard, Employees, Employee Details, Leaves, Payroll, Attendance
- Departments, Positions, Reports, Settings, Profile

## How to Run
Option A (recommended):
```powershell
cd "c:\Users\mohammed\Desktop\HR"
node server.js
```
Then open: `http://localhost:5500`

Option B (VS Code Live Server):
- Start Live Server from `HRMS Html/login.html`

## Checklist
- [x] Firebase config + auth/guard modules
- [x] Tokens-based design system (light/dark)
- [x] Navbar + sidebar rendered via JS
- [x] RBAC enforcement in UI and runtime
- [x] CRUD services for all collections
- [x] Notifications triggered on leave/payroll/attendance updates
- [x] All pages wired with controllers and styles

## Notes
- Firebase config is already set in `Aman/firebase.js`
- Security is enforced by Firestore rules and RBAC in the UI/guards

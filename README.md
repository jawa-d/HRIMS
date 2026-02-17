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
npm start
```
Then open: `http://localhost:3000`

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

## Deploy Online (Render)
1. Push this repository to GitHub (already configured).
2. Go to Render dashboard and click `New +` -> `Blueprint`.
3. Connect the GitHub repository and select this project.
4. Render will read `render.yaml` and deploy automatically.
5. Open the generated Render URL after build succeeds.

## Deploy Online (GitHub Domain)
1. Push to `main` branch (workflow already configured in `.github/workflows/deploy-pages.yml`).
2. In GitHub repo settings: `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Wait for workflow `Deploy to GitHub Pages` to finish.
5. Your domain will be:
   `https://jawa-d.github.io/HRIMS/`

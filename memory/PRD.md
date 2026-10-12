# SvaTWA — Psychiatric Hospital Management System (PRD)

## Original problem statement
Build SvaTWA, a complete production-oriented full-stack Psychiatric Hospital Management System (web/desktop/tablet/mobile-PWA) connecting all hospital roles on one secure, role-based, audit-ready platform. Strict Patient → Case → Visit/Encounter architecture; highly configurable via Masters; interconnected OPD/IPD/Pharmacy/Billing/Analytics/Communication modules.

## Architecture (as built)
- **Stack**: React 19 (CRA/craco) + FastAPI + MongoDB (platform standard; PostgreSQL requested but Mongo used).
- **Auth**: JWT email/password (Bearer token in localStorage `svatwa_token`), bcrypt hashing, server-side `require_module` authorization per module. Roles: super_admin, hospital_admin, doctor, psychologist, nurse, reception, pharmacist, inventory_manager, billing, lab, patient, caregiver.
- **Backend modules**: common.py (db/auth/audit/helpers), routes_auth, routes_masters, routes_clinical, routes_pharmacy, routes_ipd, routes_billing, routes_ops, seed.py.
- **Audit log** on all important actions; **AI summary** via Emergent LLM (Anthropic claude-sonnet-5-5).

## User personas
Super Admin/Hospital Admin (config + oversight), Psychiatrist/Doctor (clinical, prescriptions, rounds), Psychologist (therapy/assessment), Nurse (IPD vitals/meds), Reception (registration/queue), Pharmacist (dispensing), Billing (charges/payments), Patient (portal — not yet built).

## Core requirements (static)
Patient→Case→Visit integrity, no duplicate patients, role-based server-side permissions, configurable masters reflected across modules, auto-posted billing from source events, pharmacy stock deduction on dispense, IPD bed lifecycle, unique invoice/receipt numbers, immutable clinical/audit history.

## Implemented (2026-10-12) — verified by testing agent (30/30 backend, frontend smoke all green)
- Auth + 7 seeded role accounts; role-filtered navigation + API enforcement.
- Dashboard with live KPIs; role quick-access.
- Patients: full registration form, duplicate-aware search, 6-month new-case red flag, dues display, Patient 360 (timeline, cases, prescriptions, billing, info), AI summary + text export.
- Cases CRUD; OPD walk-in/visit creation with token, status board (checked-in→waiting→in-consultation→completed), dues-threshold 402 guard + override, tags, auto consultation charge.
- Digital prescription with previous-prescription auto-suggest, follow-up auto-calc (weekend-adjusted) → pharmacy queue.
- Pharmacy: queue, dispense with stock deduction, auto pharmacy charge, dispensing history, analytics.
- Inventory: medicine stock, low-stock flags, stock movements.
- IPD: room-wise bed console with occupancy stats, admit (IPD number + bed occupy + room charge), discharge (bed release).
- Appointments calendar (grouped by date, overlap guard).
- Clinical: psychiatric assessment form, MSE, risk & safety.
- Billing: manual + auto charges, payments (overpay guard), patient summary; auto-posting from OPD/IPD/pharmacy/diagnostics.
- Diagnostics, Expenses, Insurance/Claims, Referrals: functional CRUD.
- Notifications inbox + segment-based campaigns with survey attach.
- Analytics dashboards (age/disease/treatment/revenue charts).
- Masters: 49 generic master types CRUD + Diagnosis dedicated master with CSV bulk upload (preview/validate/import) + Medicines management.
- Users & Roles management, Settings, Audit log.

## Backlog / not yet built (deferred for next rounds)
- **P1**: Verbatim statutory forms (General Informed Consent EN/GU, Patient Assessment Form print, MHCA-2017 Form-C admission/discharge, ECT/BPT consent + 15-row relative table, Narcotic Forms 3D/3E/NDPS Form-7) as configurable immutable templates with PDF/print; Certificate templates (OPD/fitness/leave); Admission letter & Discharge summary PDF generation.
- **P1**: IPD depth — nursing vitals/med-admin UI, doctor daily rounds, shift handover UI, room transfer UI, behaviour/rowdy alert UI, protocol tags, physician day summary PDF.
- **P1**: Invoice PDF generation & professional print layouts with logo; refunds.
- **P2**: Patient portal/PWA, real WhatsApp/SMS/email channels, medicine refill/adherence reminder engine + scheduled jobs, notification rule engine, pre-approved discounts, OPD holidays calendar UI, previous-visits print/editable-copy, voice rounds (Plaud), multi-branch UI, document upload storage, consent/caregiver access, global search, reports export (PDF/CSV/Excel), emergency/casualty module.

## Next tasks
Harden PDF/print documents and statutory forms; build IPD clinical depth (rounds/nursing/handover UI); add invoice PDFs; then patient portal + reminder engine.

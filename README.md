# Ekatra (एकत्र) — one view of every case an institution has with AICTE

> Smart India Hackathon 2026, problem statement **26264** (AICTE, Smart Automation). **Prototype. All data is synthetic. Not an official AICTE system.**

## The problem we are solving

AICTE is made of many units: the Public Grievance Redressal Cell (PGRC), the Regulation Bureaus (one per region), the Regional Offices and Legal. Each keeps its cases in its own system, and many of those cases are about the **same institution**. Every unit decides correctly with what it can see, but none can see what the others are doing. The result:

1. Two units write to one institution in the same week and it receives **conflicting instructions**.
2. A time limit is noticed only **after it has passed**.
3. Nobody knows **which unit holds the next step** on a case.
4. Counts (pending, under process, transferred, escalated, disposed) take days to compile by hand and **cannot be checked**.

## What Ekatra does

It keeps an index of cases **keyed by institution** and, automatically, matches each case to its institution, flags possible overlaps between units with reasons, checks deadlines hourly, records the human decision with a follow-up, and reports counts that can be traced back to records. It warns **at the moment of action** (a green / amber / red check before a notice, closure or transfer, naming the unit to call) and gives every open case **one named owner of the next step**. It never merges, closes or transfers a case on its own; source units keep ownership.

## The five pillars

| Pillar | What it does | Where |
|---|---|---|
| 1. One institution view | Institution profile with the cases of every unit; automatic matching (Permanent ID, verified IDs, remembered names; name look-alikes are only suggestions) | `backend/app/engine/logic.py`, Institution page |
| 2. Early overlap detection | Five rules, one explained clash per institution with the basis of its priority, issue tagging, a one-line story, a calendar of every unit's dated steps | `logic.py`, `insights.py`, Clashes and Calendar pages |
| 3. Recorded coordination | The officer's decision, a reason, and an optional follow-up task with an owner and due date. Ekatra shows the facts and the basis of the priority and suggests nothing | `services.decide`, Review page |
| 4. Deadline monitoring | CPGRAMS 21-day rule (verified) and prototype limits for others, hourly check, escalation, no-next-step and stale-case alerts | `services.run_sweep`, Deadlines page |
| 5. Reliable reporting | Counts from the database with an independent recount, transfers kept apart from disposals, CSV export that is audited | `services.dashboard / build_report`, Reports page |

Import validation and a tamper-evident audit log run underneath all five.

## Run it on your computer (Windows PowerShell)

Needs Python 3.12 and Node 20+. No Docker or database server is needed: locally it uses a SQLite file.

```powershell
# 1. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m scripts.init_db            # creates the tables (Alembic) and loads the synthetic demo data
python -m uvicorn app.main:app --port 8000

# 2. Frontend (a second window)
cd frontend
npm install
$env:VITE_API_MODE = "http"          # use the real backend; leave unset for the offline mock
npm run dev                          # http://localhost:5173  (the dev server forwards /api to port 8000)
```

Sign in with a demo account on the first screen (password `demo`). Accounts: `arao` (PGRC nodal officer), `siyer` (RB-WR nodal officer),
`mkhan` (coordinator), `pnair` (PGRC dealing officer), `rdas` (senior management, view only), `kmenon` (data steward), `vjoshi` (administrator).

### Tests and the demo journey

```powershell
cd backend;  python -m pytest -q                                   # 51 tests: rules, permissions, idempotency, audit chain, imports, calendar
cd frontend; npm test; npm run build                               # 230 tests
cd backend;  python -m scripts.run_demo_scenario --base-url http://localhost:8000   # the judge journey, 17 checks
```

## Put it online for free

Three free services, no card needed for the core path: **Neon** (database), **Vercel** (two projects) and **GitHub Actions** (hourly check).

1. **Database (Neon).** Create a free project. Copy the *pooled* connection string (host contains `-pooler`) and the *direct* one.
2. **API (Vercel project 1).** Import the repository, set *Root Directory* to `backend`, name the project `ekatra-api`. Environment variables:
   `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL` (direct), `JWT_SECRET` and `CRON_SECRET` (long random strings), `DEMO_PASSWORD`, `COOKIE_SECURE=true`.
3. **Create the tables and demo data once**, from your computer, pointing at Neon:
   ```powershell
   cd backend
   $env:DATABASE_URL = "<pooled string>"; $env:DIRECT_DATABASE_URL = "<direct string>"
   python -m scripts.init_db
   ```
4. **Website (Vercel project 2).** Same repository, *Root Directory* `frontend`, environment variable `VITE_API_MODE=http`.
   In `frontend/vercel.json` the `/api` rewrite points at `https://ekatra-api.vercel.app`; change it if your API project has another address.
5. **Hourly check.** In the GitHub repository add secrets `EKATRA_API_URL` (the API address) and `CRON_SECRET` (same value as in step 2).
   `.github/workflows/hourly-check.yml` then runs every hour. (The app also runs the check itself when the dashboard opens and it is over an hour old.)
6. Verify: `python -m scripts.run_demo_scenario --base-url https://<your-website>` should print `All steps passed.`

**Reset the demo data** at any time: sign in as `vjoshi` and use *Reset demo data* in the automation panel, or `python -m scripts.init_db --reset`.

### Free-tier limits to know

| Service | Limit that matters (checked Oct 2026) |
|---|---|
| Vercel Hobby | personal and non-commercial use; functions up to 300 s; 4.5 MB request body (imports are capped at 2,000 rows); scheduled jobs only once a day, hence GitHub Actions |
| Neon Free | 1 GB storage, 100 compute-hours a month; the database sleeps after 5 minutes idle and wakes in under a second; data is kept |
| GitHub Actions | scheduled workflows pause after 60 days without repository activity; runs can start a few minutes late |

Render's free database expires after 30 days and Supabase pauses a free project after a week of no use, so neither is used.

## What is real and what is not

- Real: the database, sign-in (bcrypt, httpOnly cookie, lockout), role checks on every endpoint, matching, overlap rules, deadline checks, imports with row-level problems and fixes, reports, and a hash-chained audit log with a database trigger that blocks edits.
- Verified rule: CPGRAMS cases must be disposed within 21 days (DARPG, 23 Aug 2024). **Every other time limit and the reminder day are labelled prototype settings** until AICTE decides (open questions Q2, Q6, Q11).
- Not in the connected version: institution reply links, watch lists, the inbox, data-health and planted-test pages. They still work in the offline mock (`VITE_API_MODE` unset). See `documents/DECISIONS.md`.
- Complainant names and narratives are visible only to the owning unit, never in lists, dashboards, reports or exports, and each view is audited.

## Layout

```
README.md         this file
backend/          app/{engine,services,routes,models,store,audit,seed}.py  alembic/  scripts/  tests/
frontend/         src/{pages,components,hooks,lib}   lib/http.ts = real API client, lib/mock/ = offline demo
documents/        DEPLOYMENT.md, six numbered guides, DECISIONS.md, sample-data/ (CSV files)
.github/          the hourly deadline check (GitHub Actions)
```

## Documents

All in [`documents/`](documents/README.md). To put it online, follow **[documents/DEPLOYMENT.md](documents/DEPLOYMENT.md)**. The others explain the problem, every rule, how to use it, the API, testing, and the limits of the prototype.

## Source material

The project is built from the SIH 26264 problem research and PRD, its 4-page summary, the interface screens, and the original build brief. These PDF/Word files are not stored in this repository (they are git-ignored); the problem, rules and open questions for AICTE are written up in [`documents/01_problem_and_solution.md`](documents/01_problem_and_solution.md), [`02`](documents/02_how_it_works_and_rules.md) and [`06`](documents/06_limits_and_open_questions.md).

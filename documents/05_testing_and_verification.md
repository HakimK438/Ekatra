# Testing and verification

What has been tested, how to run it, and what has **not** been tested. Results below were measured on 26 October 2026 on the project's own machine.

## Automatic tests

| Suite | Count | Result | Run it |
|---|---|---|---|
| Backend (Python, pytest) | 51 | all passed | `cd backend; python -m pytest -q` |
| Frontend (TypeScript, Vitest) | 230 | all passed | `cd frontend; npm test` |
| Type check, backend | all source files | no issues | `cd backend; python -m mypy app` |
| Type check and lint, frontend | all source files | no issues | `cd frontend; npx tsc -b; npm run lint` |
| Code style, backend (ruff) | | 3 old line-length warnings in `app/engine/labels.py`, nothing else | `cd backend; python -m ruff check .` |

### What the backend tests cover

- The five overlap rules, the matching tiers, deadline states and escalation, issue tagging, and the one-line stories (`test_engines.py`, `test_rules.py`).
- Permissions on every kind of action: a person from another unit is refused; read-only roles are refused; a decision needs a reason and a lead unit from the units involved (`test_api.py`).
- Importing is idempotent: the same file twice makes no duplicates. Complainant details are visible only to the owning unit and each view is audited.
- The audit log is a hash chain and a database trigger refuses edits and deletions (`test_api.py`).
- One set of headline numbers (`/summary`) agrees with the dashboard, the clash list and the institution list (`test_summary.py`).
- The pre-action check and the calendar, with whom to contact in each unit (`test_check_calendar.py`).
- Booking a date, refusing a past date or a missing description or another unit's attempt; the next-step columns of an import; a reference repeated inside a file; a complaint number held by another unit (`test_schedule_import.py`).
- "Went ahead on a warning": an action that goes ahead while another unit has an open case is written on the audit entry and counted (`test_went_ahead.py`).
- The five sample CSV files in `sample-data/` behave exactly as their README says (`test_csv_files.py`).

### What the frontend tests cover

The same rules in the offline demonstration (so both give the same answers), plain-language search, import checks, the calendar's collision logic, the basis of a clash's priority, the proof trail, formal wording (no greetings, the page is called "Dashboard"), and a smoke test that every page renders for every role. A test also keeps the rules file identical to the backend's.

## Checks done by hand in a real browser, against the real backend

A headless browser (Microsoft Edge) was driven against the running API and website (not the offline mock):

1. Signing in with a username and password, and landing on the dashboard with "Live backend and database" shown.
2. Opening a case and booking a date; the dialog shows what is currently booked.
3. Uploading a four-row CSV with next-step columns. The check table showed: row 2 would join *Sahyadri Institute of Technology* by Permanent ID; row 3 *not yet* (date already passed); row 4 found by name only; row 5 *not yet* (same reference as row 4). Saving made two cases, rejected two, and the receipt read 4 = 2 + 0 + 2. A new clash was detected from the upload.
4. The calendar showing the months, clash days, a selected day with its explanation and links, and a timeline per institution.
5. The clash cards, a clash review page with the priority basis, and the "How Ekatra works" page with live numbers.

## The scripted journey

`python -m scripts.run_demo_scenario --base-url <address>` signs in as several roles and walks the story: a PGRC grievance arrives for an institution that a Regulation Bureau is already inspecting, is matched, a clash appears, a decision is recorded with a reason, a follow-up is created, and the dashboard and audit log update. It prints a line per step and ends with `All steps passed`. It was run on 26 October against the real API (SQLite) after the last changes: all 17 steps passed, including that the system suggests nothing, the officer chooses a decision and records a reason, a follow-up with an owner and date exists, running the hourly check twice raises nothing twice, every dashboard number matches an independent recount, and the audit chain is intact.

## What has NOT been tested

Be clear about these when presenting:

- **PostgreSQL / Neon.** Every test and check above used a SQLite file. The migrations and the audit trigger have a PostgreSQL version, but they have not been run on a real PostgreSQL server.
- **Vercel.** The deployment files are written but not deployed. Cold-start time (target under 2 seconds) is unmeasured.
- **The hourly GitHub Actions job** has not run against a live address.
- **Load.** The prototype is built for a few hundred cases. Alerts are computed from the records on each request; this should be revisited at tens of thousands of cases.
- **Accessibility audit.** Keyboard use, visible focus, colour-and-text status, and screen-reader summaries for every chart were designed in, and the tests check some of them, but a formal audit with assistive technology has not been done.
- **Different browsers and phones.** Checked in Edge at desktop and a narrow phone width only.
- **Real data.** Nothing has been tried with real AICTE data; the product has not been approved for it.

# API reference

All 56 endpoints of the Ekatra API, generated from the code (`backend/app/routes.py`). Paths start with `/api/v1`. The running API also serves interactive documentation with request and response shapes at `/api/docs`.

- **Sign in** with `POST /api/v1/auth/login`. The API sets an httpOnly cookie that every other call uses. Five wrong passwords lock the account for a while.
- **Errors** always look like `{ "code": "...", "message": "...", "details": ... }` and the message says what to do.
- **Who may call** is enforced on the server, not only in the screens. A person without the right role gets `403`.
- **Nothing here calls an outside service.** Matching, clash rules, deadlines and issue tagging all run inside the API.

## Sign-in and settings

| Method | Path | What it does | Who may call |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Sign in | Everyone |
| POST | `/api/v1/auth/logout` | Sign out | Everyone |
| GET | `/api/v1/auth/me` | Who is signed in (null when nobody) | Everyone |
| GET | `/api/v1/auth/demo-users` | The demonstration accounts shown on the sign-in screen | Everyone |
| GET | `/api/v1/meta` | Units, categories, regions, today's date and the rule values currently in force | Signed in |
| GET | `/api/v1/search-index` | Names and IDs for the search box | Signed in |
| PUT | `/api/v1/settings/rules` | Change an editable rule value (a reason is required and is audited) | Administrator |
| POST | `/api/v1/settings/rules/reset` | Put a rule back to its default (audited) | Administrator |
| GET | `/api/v1/settings` | The rules and settings, marking which are verified and which are prototype | Signed in |
| GET | `/api/v1/users` | The list of users and roles | Signed in |
| GET | `/api/v1/audit` | The audit log, with a tamper check of the fingerprint chain | Administrator, senior management, coordinator |

## Dashboard, checks and automation

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/dashboard` | Every dashboard figure and chart series, counted from the records | Signed in |
| GET | `/api/v1/summary` | One set of headline numbers that every screen reads, so no two screens can disagree | Signed in |
| POST | `/api/v1/check` | The pre-action check: which other units have open cases at an institution, and whether any handle the same issue | Signed in |
| GET | `/api/v1/calendar` | Dated steps of every unit by institution, and the weeks where two units collide | Signed in |
| GET | `/api/v1/worklist` | The signed-in person's pending actions | Signed in |
| GET | `/api/v1/automation` | What the automatic checks did and when they last ran | Signed in |
| GET | `/api/v1/job-runs` | History of the hourly check runs | Signed in |
| GET | `/api/v1/alerts` | Open case alerts for the person's unit (late, no next step, stale) | Signed in |
| POST | `/api/v1/ingest/{scenario}` | Run a demonstration case through the arrival steps (demo screen only) | Signed in |
| POST | `/api/v1/sweep/now` | Run the deadline and follow-up check now (safe to repeat) | Signed in |
| POST | `/api/v1/admin/sweep` | The hourly check, called by the scheduler with a secret | Scheduler secret or administrator |
| POST | `/api/v1/admin/reset` | Reload the synthetic demonstration data | Administrator |

## Cases

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/cases` | List cases with filters, sorting and paging | Signed in |
| GET | `/api/v1/cases/export` | Export the filtered list as CSV (audited; no complainant details) | Signed in |
| POST | `/api/v1/cases` | Add one case by hand | Officer of a unit |
| GET | `/api/v1/cases/check-new` | While typing a new case: is the institution or complaint number already known? | Signed in |
| GET | `/api/v1/cases/{cid}` | One case with its history, institution match, clashes and next step | Signed in |
| GET | `/api/v1/cases/{cid}/sensitive` | Complainant name and narrative (owning unit only; every view is audited) | Officer of the owning unit |
| POST | `/api/v1/cases/{cid}/assign` | Pick up an unassigned case | Officer of the owning unit |
| POST | `/api/v1/cases/{cid}/action` | Record what was done on a case | Officer of the owning unit |
| POST | `/api/v1/cases/{cid}/stage` | Move a case to another stage, with a reason | Officer of the owning unit |
| POST | `/api/v1/cases/{cid}/schedule` | Book or clear the next dated step (hearing, visit, reply date) | Officer of the owning unit |
| POST | `/api/v1/cases/{cid}/transfer` | Transfer a case to another unit, with a reason (counted as transferred, never disposed) | Officer of the owning unit |
| POST | `/api/v1/cases/{cid}/dispose` | Close a case with an outcome and a reason | Officer of the owning unit |

## Institutions

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/institutions` | List institutions with what each unit has open, and the next dated step | Signed in |
| GET | `/api/v1/institutions/{iid}` | One institution: every unit's cases, clashes and identifiers | Signed in |

## Clashes and decisions

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/overlaps` | All clashes (open and decided), with the rules behind each | Signed in |
| GET | `/api/v1/overlap` | One clash: cases, rules, timeline, shared issues and any decision | Signed in |
| POST | `/api/v1/overlaps/decide` | Record the officer's decision on a clash, with a reason and an optional follow-up | Nodal officer of an involved unit, or coordinator |
| GET | `/api/v1/tasks` | Follow-up tasks | Signed in |
| POST | `/api/v1/tasks/{tid}/complete` | Mark a follow-up task done | Officer of the task's unit, or coordinator |

## Institution matching

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/matching` | Cases waiting for an institution to be confirmed, with look-alike names and why | Signed in |
| POST | `/api/v1/matching/{cid}/accept` | Confirm an institution for a case (remembered for next time) | Coordinator or data steward |
| POST | `/api/v1/matching/{cid}/reject` | Rule out a suggested institution | Coordinator or data steward |
| POST | `/api/v1/matching/{cid}/unresolved` | Mark a case as having no known institution | Coordinator or data steward |

## Deadlines

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/deadlines` | Cases by time limit state, with stage time budgets and escalation | Signed in |

## Importing files

| Method | Path | What it does | Who may call |
|---|---|---|---|
| POST | `/api/v1/imports/check` | Check every row of an uploaded file; nothing is saved | Signed in |
| POST | `/api/v1/imports/status-meaning` | Say once what a unit's status word means | Signed in |
| POST | `/api/v1/imports/commit` | Save the valid rows (new cases, updates); keep the rest with their fixes | Officer of that unit (own unit only), data steward or coordinator |
| GET | `/api/v1/imports` | Past imports | Signed in |
| GET | `/api/v1/imports/{bid}` | One import receipt | Signed in |

## Reports and health

| Method | Path | What it does | Who may call |
|---|---|---|---|
| GET | `/api/v1/reports/check` | Recount every dashboard number independently | Signed in |
| GET | `/api/v1/reports` | Build a report (workload, ageing, outcomes and others) | Signed in |
| GET | `/api/v1/reports/export` | Export a report as CSV (audited) | Signed in |
| GET | `/api/v1/health` | Is the service and the audit chain healthy? | Anyone |

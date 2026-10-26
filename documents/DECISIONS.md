# Design decisions (Ekatra)

Short records of choices that matter. Newest first.

## 2026-10-26 - Facts, not suggestions
The review page no longer proposes a decision. Ekatra shows what the records say (the rules that apply, the dates that fall close together, how long units have been open together, whether a decision is overdue) and the officer chooses, writes the reason and may add a follow-up task. The pre-action check also states facts ("RB-WR already has an open case on the same issue") and does not tell anyone to talk first. Reason: a recommendation from the system is a judgement nobody has agreed to accept, and AICTE has set no lead-unit policy (Q2). The suggestion function and its API field were deleted, not hidden.

## 2026-10-26 - Priority shows its basis
High or Medium comes only from fixed rules (High when O1, O4 or O5 applies). Every clash lists the rules and the facts behind its level, and says how the level is set. The list is ordered by decision date, earliest first.

## 2026-10-26 - A date can be booked, and a file can carry one
The calendar was fed only by dates already in the data. `POST /cases/{id}/schedule` lets an officer of the owning unit book or clear the next dated step (audited), and an import may carry `next_step_on` and `next_step`. Without this a real user could not put anything on the calendar.

## 2026-10-26 - Import: repeats inside a file, and a preview of each row
A reference repeated inside one file is rejected (the second occurrence) and names the first row. Each accepted row says which institution it will join and how, or that the match is by name only, or that another unit already holds the same complaint number. The check and the save use one function so they cannot disagree.

## 2026-10-26 - Actions that go ahead against another unit are recorded on the server
When a stage change, transfer or closure goes ahead while another unit has an open case at the institution, the audit entry says so. The dashboard counts these ("went ahead on a warning") from the audit log.

## 2026-10-26 - Plain stage names, one coloured badge per unit
Stages are called New, With an officer, Waiting for the institution, Visit or hearing, Sent to senior authority, Disposed and Transferred, each with a one-line meaning. A unit is always one badge coloured by its kind (grievance cell, Regulation Bureau, Regional Office, other). Charts have a heading that says what they show and a "What this shows" sentence at the end.

## 2026-10-26 - Folder layout
Everything written lives in `documents/` (`DEPLOYMENT.md`, numbered guides 01-06, `DECISIONS.md`, `sample-data/`; `source-documents/` stays local and is git-ignored). The project root holds only `README.md`, `backend/`, `frontend/`, `.github/` and `.gitignore`. Local safety copies live in `.local-backups/` and are ignored by git.

## 2026-10-23 — Deployment: two Vercel projects, Neon, GitHub Actions
Website and API are separate Vercel Hobby projects. The website rewrites `/api/*` to the API project, so the sign-in cookie stays first-party and no CORS is needed. Vercel "Services" (one project for both) is still beta. Postgres is Neon Free (1 GB, no expiry). Render's free database expires after 30 days and Supabase pauses after a week, so neither is used. Redis (Upstash) is dropped: nothing needs it. The hourly check runs from GitHub Actions because Vercel Hobby allows one scheduled job per day; the app also runs the check on dashboard load when it is over an hour old.

## 2026-10-23 — Overlap alerts are computed on read; human decisions are stored
Alerts are derived from the case records each request (a few hundred cases), with the alert id = institution + sorted case ids. What is stored: decisions (with a snapshot of the alert they were about), follow-up tasks, who opened what, and the hourly-check alerts. This keeps one source of truth and makes "a new case joined, bring it back once" automatic. Revisit if volumes reach tens of thousands of cases.

## 2026-10-23 — Matching uses the tested in-house name score, not rapidfuzz or pg_trgm
The backend ports the frontend's name score exactly so both give the same suggestions, and tests can compare them. It needs no database extension and keeps the serverless bundle small. A confirmed name (T4) is stored as a verified alias and now resolves automatically next time (fixed: the earlier mock stored it but never used it).

## 2026-10-23 — The system suggests, a person decides (superseded on 2026-10-26: suggestions were removed)
Opening a review shows a suggested decision built from stated facts (same complaint number, same issue, a pending regulatory step), with a pre-filled reason and a follow-up task. Nothing is recorded until a person accepts it. The audit notes whether it was accepted or changed. A "lead unit" suggestion is marked as a prototype rule (open question Q2).

## 2026-10-23 — Issue tagging is a local keyword list
Each case summary is tagged with an issue (faculty, laboratory, fees, ragging, admission, buildings, approval, court) from a small editable word list. The matched words are shown as evidence. No AI service. It is used for the one-line story, the reasons, and the suggestion.

## 2026-10-23 — Follow-up tasks and extra deadline checks
A decision can carry a follow-up (action, owner unit, due date). The hourly check also flags cases with no next step recorded or no update for 14 days (prototype settings), follow-ups past due, and overlap decisions past due (escalating to the coordinator, then senior management).

## 2026-10-23 — CPGRAMS interim reply day is a prototype setting
The DARPG guideline (23 Aug 2024) sets 21 days and asks for an interim reply when more time is needed. It does not name a day. "Day 18" is therefore labelled a prototype reminder, not a verified rule (open question Q11).

## 2026-10-23 — Parked in the connected version
Institution reply links (needs AICTE approval for outside parties to upload, open question Q12), watch lists, the inbox, data-health and the planted-test page. They still run in the offline mock. The pending-actions list replaces the inbox.


## 2026-10-23 — Free hosting only (superseded by the deployment entry above)
No paid service may become a dependency. Vercel, Neon and GitHub Actions only.

## 2026-10-23 — One overlap alert per institution
Rules O1–O5 all feed a single alert for an institution, holding every case and every reason. Before, one institution could raise two or three separate alerts that each needed a decision. The alert's id is the institution plus the sorted case ids, so a new case joining brings it back once for review, with the earlier decision shown.

## 2026-10-23 — "Needs more review" keeps an overlap open
Only related / same complaint / not related / one unit leads settle an overlap. "Needs more review" is recorded in its history but the overlap stays on the board.

## 2026-10-23 — Institution reply link (not a portal)
An officer creates a one-time link for one case. The institution sees only that request, uploads documents, and gets a receipt with a SHA-256 fingerprint per file. A reply never changes the case stage by itself. Institutions never see other cases; there is no public login.

## 2026-10-23 — Hash-chained audit log
Each audit entry stores the fingerprint of the one before it, so an edited or removed entry breaks the chain from that point. The mock uses a fast non-cryptographic hash (cyrb53); the backend will use SHA-256 with a database trigger that blocks UPDATE and DELETE.

## 2026-10-23 — Region tile map instead of a geographic map
Eight equal tiles laid out roughly by geography. Avoids drawing state or national boundaries and keeps small regions readable.

## 2026-10-23 — "Civic ledger" visual language
Warm paper, navy ink, one blue, saffron for "needs a person", green for "confirmed", red only for problems. Mono font for case numbers and IDs. All text sizes in rem so the A/A/A control scales the root font size (CSS zoom broke chart tooltips). All colour pairs checked at WCAG AA (≥ 4.5:1).

## 2026-10-23 — Fixed demo date
Fixtures use a fixed date (2026-10-23) so every count, deadline and overlap in the demo is the same on every run.

## 2026-10-25 — One table of tunable rules, stored in the database
Time limits and thresholds used to be written twice (Python and TypeScript) and had already drifted (the mock called the interim-reply day verified, the backend did not). Now `rules.json` holds each rule's default, limits, unit, label and whether it is verified. The backend keeps the live values as overrides in `app_state` (`rule_overrides`) and re-applies them on every request, so every serverless instance agrees. An administrator edits them on Settings with a reason; each change writes an audit entry with old and new values. Verified limits (CPGRAMS 21 days) are locked. The frontend gets the values in force from `/meta`. Two copies of `rules.json` exist because the frontend and backend deploy as separate Vercel projects; `backend/tests/test_rules.py` fails if they differ. Still in code, not editable: the traffic-light table (`CLASH_TABLE`), the stage split (`BUDGET_SPLIT`) and the overlap rule wording.

# How Ekatra works: every rule in plain words

This page lists every rule the system follows, with the value now in force. The same list is on the **How Ekatra works** page of the website, with live numbers beside it. The values come from one file, `backend/app/engine/rules.json` (a copy is kept in `frontend/src/lib/rules.json`, and a test makes sure the two are identical). An administrator can change the editable values on the **Settings** page; each change needs a reason and is written to the audit log with the old and new value.

**Verified** means a real rule. **Prototype** means a value the team chose so the product can run, waiting for AICTE to decide. Every prototype value is labelled as one wherever it appears.

---

## Pillar 1. Matching: "Is this the same institution?"

| Step | Rule |
|---|---|
| 1 | A **Permanent ID** that matches an institution exactly (for example `1-2210239`) links the case to it automatically. Spaces and dashes are ignored, so `1 2210239` matches. |
| 2 | Another **verified ID** (Current ID, application ID, AISHE code) also links automatically. |
| 3 | A **name alone never links.** Ekatra lists up to **3** look-alike institutions (prototype), each with a similarity score of at least **60%** (prototype) and the words that matched. |
| 4 | A coordinator or data steward picks one. The choice is saved, so the same name resolves on its own next time. They can also rule a suggestion out, or mark the case as having no known institution. |

Never done automatically: linking an institution by name.

## Pillar 2. Overlaps (shown as "clashes")

A **clash** exists for an institution when its open cases fall under at least one of these five rules.

| Rule | Plain meaning | Priority it gives |
|---|---|---|
| **O1** | A grievance cell case (PGRC) and a Regulation Bureau case are both open | High |
| **O2** | Open cases are held by two or more units | Medium |
| **O3** | The same category of complaint is in two or more units within **180 days** (prototype) | Medium |
| **O4** | A new case arrived (within **45 days**, prototype) while another unit has a notice or hearing pending | High |
| **O5** | The same complaint number is held by two or more units | High |

**Priority is High when O1, O4 or O5 applies, and Medium otherwise.** Each clash shows which rules applied and the dates behind them (which units act within a week of each other, how long they have been open together, whether a decision is overdue). Clashes are listed by their decision date, earliest first. There is one clash per institution, however many rules apply; a clash that was decided comes back once if a new case joins.

Never done automatically: merging, closing or moving a case.

**What "act within a week" means.** Ekatra takes each unit's dated steps (a booked hearing or visit, a reply date, the CPGRAMS interim reply date) and marks two steps of *different* units at the same institution that are 7 days or less apart. Final time limits are not counted here, because a unit does not choose them.

## Pillar 3. Coordination: "Who decided what, and why?"

- A **nodal officer of an involved unit**, or the **coordinator**, records one of five decisions: **Related, keep both**; **Same complaint (duplicate)**; **Not related**; **One unit leads**; or **Needs more review**.
- A **reason is required** for every decision except "Related, keep both". "One unit leads" also needs a lead unit, chosen from the units involved.
- The officer may add a **follow-up task** (who, what, due date). Defaults: a decision is due **5 days** after a clash is found (prototype), a second reminder at **10 days**, and a follow-up task **3 days** after a decision.
- A decision is written on every case involved and in the audit log. **It never changes who owns a case or its stage.**
- Ekatra does **not** suggest a decision. It shows the facts; the person chooses.

## Pillar 4. Deadlines

| Rule | Value | Status |
|---|---|---|
| CPGRAMS time to dispose | **21 days** | Verified (DARPG guidelines of 23 Aug 2024) |
| CPGRAMS interim reply reminder | Day **18** | Prototype (the guideline asks for an interim reply but names no day) |
| CPGRAMS appeal window after closure | 30 days | Verified |
| All other sources: time to dispose | **30 days** | Prototype |
| "Due soon" starts when | **75%** of the time has passed | Prototype |
| Raise to the nodal officer | **7 days** overdue | Prototype |
| Raise to senior management | **14 days** overdue (twice the above) | Prototype |
| New case with no officer: remind after | **3 days** | Prototype |
| No recorded update: flag after | **14 days** | Prototype |
| A unit's data counts as old after | **24 hours** | Prototype |

Every open case is re-checked **every hour**. The time limit is also shown split by stage so lateness shows where it starts: 30% for examination, 30% for the institution's reply, 20% for a hearing or inspection and 20% for the decision (for CPGRAMS' 21 days that is about 6, 6, 4 and 5 days). This split is a prototype setting.

Never done automatically: closing a case.

## Pillar 5. Reporting

- Every figure is **counted from the case records** when a page opens. Nothing is typed in.
- **Transferred cases are counted apart from disposed cases, everywhere.**
- **Disposal rate = disposed ÷ (disposed + open).**
- Every number opens the list of cases behind it. A "How was this counted" note shows the counting rule, and a recount page checks each dashboard number a second, independent way.
- CSV exports leave out complainant details, are labelled, and are written to the audit log.

---

## Underneath: import checks

Each row of an uploaded file is checked for:

| Check | What happens when it fails |
|---|---|
| A required column is empty | Row kept out, with the column and how to fill it |
| Received date unreadable, or in the future | Row kept out |
| Source (channel) or category not recognised | Row kept out, the allowed values are listed |
| Permanent ID does not look like `1-` and 5 to 12 digits | Row kept out |
| A status word Ekatra does not know | Held back; you say once what it means, and it is remembered for that unit |
| *Next step on* or *Next step* given without the other, a past date, or an unreadable date | Row kept out |
| The same reference appears twice in the file | The second one is kept out, naming the first row |

Rows that pass show a note: which institution they will join and how, or that the institution is found by name only and a coordinator will be asked to confirm it, or that **the same complaint number is already held by another unit** (so a clash will appear). Saving the same file again **updates** the cases already there and never duplicates them. Each import ends with a receipt whose numbers must add up: rows in the file = new + updated + not saved.

## Underneath: the audit log

Every action writes an entry: who, when, what and which case. Each entry stores a fingerprint (a SHA-256 hash) of the entry before it, so changing or removing any entry breaks every fingerprint after it, and the **Audit log** page runs that check. A database trigger also refuses any edit or deletion. When an action (changing a stage, transferring, closing) goes ahead while another unit has an open case at the same institution, the audit entry says so, which is how "went ahead on a warning" is counted.

## The pre-action check (the "traffic light")

Before an officer changes a stage, asks for a reply, transfers or closes a case, Ekatra looks at the other units' open cases at that institution and states the facts. It never blocks the action.

| Light | Meaning |
|---|---|
| **No other unit affected** (green) | No other unit has an open case there, or the step is internal |
| **Another unit is active** (amber) | Another unit has an open case at the institution |
| **Same issue open elsewhere** (red) | Another unit has an open case on the same category of issue |

Recording a note never triggers it. If an action goes ahead on amber or red, the case history and the audit log record that, and the Dashboard counts it.

## Roles

| Role | Can do |
|---|---|
| Dealing officer | Work on cases of their own unit; import files for their unit |
| Nodal officer | As above, plus decide clashes that involve their unit |
| Coordinator | Decide any clash; confirm institution names; import for any unit; see every unit |
| Data steward | Confirm institution names; import for any unit; see the data-quality pages |
| Senior management | Read-only: dashboard, reports, clashes, audit |
| Administrator | Settings and rules, users, reset the demonstration data; no case content |

Complainant name and narrative are visible **only** to the owning unit, never in lists, dashboards, reports or exports, and each view is audited.

# User guide

How an AICTE officer uses Ekatra, task by task. All data in the demonstration is synthetic.

## Signing in

Open the website. Either type a username and the password, or click a demonstration account on the sign-in screen. The default demonstration password is `demo` (a deployed copy should use a different one; see `DEPLOYMENT.md`).

| Username | Who | What they see and can do |
|---|---|---|
| `arao` | Nodal Officer, PGRC | Their unit's cases, decide clashes involving PGRC, import PGRC files |
| `siyer` | Nodal Officer, RB-WR | Same, for the Western Regulation Bureau |
| `pnair` | Dealing Officer, PGRC | Work on PGRC cases; cannot decide clashes |
| `mkhan` | Coordinator | Every unit; decide any clash; confirm institution names; audit log |
| `rdas` | Senior Management | Read-only: dashboard, reports, clashes, audit |
| `kmenon` | Data Steward | Confirm institution names; import for any unit |
| `vjoshi` | System Administrator | Settings, users, reset demo data |

Five wrong passwords lock an account for a short time.

## The menu

| Menu item | What it is for |
|---|---|
| **Dashboard** | Your starting point: the idea of the product, what is waiting for you, the next 14 days, the six counts, and the charts |
| **Clashes** | Institutions where more than one unit has open cases. Tab: **Before you act** |
| **Calendar** | Every unit's dated steps by month, with clash days marked |
| **Institutions** | Every institution and what each unit has open about it |
| **Cases** | The full register of cases, searchable. Tabs: **Register a case**, **Import records** |
| **Deadlines** | Cases by time limit, with the 30-day due strip |
| **Reports** | Ready-made reports (coordinator, senior management). Tabs: Management view, Audit log |
| **More** | Is this the same college? (name matching), Register a case, Import records, Settings, Users |
| **How Ekatra works** | Every rule in plain words, with live numbers |

Press `Ctrl K` (or `/`) to search for a case number, an institution name, a Permanent ID, or a plain sentence such as "RB-WR cases late in the western region". The **A A A** control makes all text smaller or larger and is remembered.

## Reading the dashboard

1. **The banner** states the one idea and shows three live counts: *Clashes found*, *Waiting for a decision*, *Went ahead on a warning*.
2. **The next 14 days** is one box per day. Each dot is one unit's step, coloured by kind of unit. A day with an amber box is a day when two units act on one institution within a week of each other. **Select a day** to see which units, which institution and which dates.
3. **The six cards** are *Pending, Under process, Transferred, Escalated, Disposed* and *Beyond limit*. Each shows its share of all cases and opens the list of cases. Transferred cases are counted apart from disposed ones.
4. **The charts** each have a heading that says what the chart is, and, underneath, a "What this shows" sentence. Use *Show as table* to read exact values.
5. **The last two boxes** show where every case is now (New, With an officer, Waiting for the institution, Visit or hearing, Closed, with the two exits) and when each unit last sent its cases. A unit that has been silent for over a day is marked.

### What the unit colours mean

Blue: grievance cell (PGRC). Teal: a Regulation Bureau (RB). Ochre: a Regional Office (RO). Violet: Legal and other cells. A unit has the same colour on every screen. Hover over a unit badge to see its full name.

### What the stage names mean

| Stage | Meaning |
|---|---|
| New | Registered. Nobody has started on it yet |
| With an officer | An officer is reading and checking the case |
| Waiting for the institution | The institution has been asked to reply and has not yet |
| Visit or hearing | An inspection visit or a hearing is planned or under way |
| Sent to senior authority | Passed to a senior authority for a decision |
| Disposed | Closed with an outcome (resolved, rejected, action taken, or closed as duplicate) |
| Transferred | Sent to another unit. Counted apart from disposed |

## Task: check whether another unit is working on an institution (before you act)

1. Open **Before you act** (the blue button at the top of every page).
2. Type the institution's name or Permanent ID and pick it.
3. Choose what you are about to do (send a notice, move to a hearing, close, transfer, record a note).
4. Read the result. It states facts and never blocks you:
   - **No other unit affected**: no other unit has an open case there, or the step is internal.
   - **Another unit is active**: another unit has an open case at this institution. The unit is named, with whom to contact.
   - **Same issue open elsewhere**: another unit has an open case on the same category of issue.
5. If you go ahead, the case history and the audit log record that you did so while another unit was active.

## Task: look at a clash and record a decision

1. Open **Clashes**. Each card is one institution. The line between the units says whether their next steps fall within a week of each other. The label at the top says how long until a decision is due, and why the priority is High or Medium.
2. Open a clash (**Decide** if you may decide, **View** otherwise). At the top you see the institution at the centre and each unit's stage and next step. Below it, **Why this is High priority** lists the rules and dates behind it.
3. Read the comparison of the cases, the shared issues found in their summaries, and the joint timeline (under *Supporting detail*).
4. To decide, choose one of the five options, add a reason (required except for "Related, keep both"), pick the lead unit if one leads, optionally add a follow-up task (who, what, due date), and click **Record decision**.
5. The decision is written on every case involved and in the audit log. It does not change who owns a case or its stage. Only a nodal officer of an involved unit, or the coordinator, can decide.

## Task: put a date on the calendar

**On one case:** open the case, click **Book a date**, choose or type what happens (Hearing, Inspection visit, Reply due from the institution, Report due, or your own words), pick the date, and save. A date must be today or later. You can change it or remove it. Only an officer of the owning unit can do this. It appears on the **Calendar** at once, and Ekatra checks it against other units' steps at the same institution.

**For many cases at once:** add the `next_step_on` and `next_step` columns to your import file (see below).

## Task: import a file of cases

1. Open **Import records** and choose your unit (it is preselected for an officer).
2. Click **Download the template** to see the columns, or use your own CSV with the same column names. Click **Choose a file**.
3. Ekatra reads the file and checks **every row** before saving anything. Read the table: *New*, *Update* (a case already here with the same reference), or *Not yet* with the reason and the fix. Rows that will be saved show where they will go.
4. If a status word is new to Ekatra, say once what it means (for example, "Show cause issued" means *Waiting for the institution*). It is remembered for your unit.
5. Click **Save**. You get a receipt: rows in the file = new + updated + not saved. Rows that were not saved are kept on the receipt with their fixes, and you can download the list.

### The file

A CSV file (comma separated, a header row, one case per row, up to 2,000 rows).

| Column | Required | What to put |
|---|---|---|
| `source_reference` | Yes | The case number in your own unit, e.g. `PGRC/2026/1234` |
| `received_on` | Yes | `YYYY-MM-DD`, not in the future |
| `channel` | Yes | `CPGRAMS`, `CSS`, `EMAIL_POST`, `APH_COMPLAINT`, `VIP_MINISTRY`, `COURT`, `RTI` or `OTHER` |
| `category` | Yes | `norm_violation`, `evc_deficiency`, `court_matter`, `compliance_verification`, `ragging`, `fee_refund`, `faculty_salary`, `admission` or `other` |
| `local_status` | Yes | Your unit's own status word, e.g. `Under scrutiny` |
| `institution_name` | Yes | As written in your file |
| `permanent_id` | No | `1-` and 5 to 12 digits. The best way to find the institution |
| `current_id` | No | Used when there is no Permanent ID |
| `complaint_ref` | No | e.g. the CPGRAMS registration number. The same number in two units makes a clash |
| `summary` | No | One line, no personal details |
| `next_step_on` | No | `YYYY-MM-DD`, today or later. Goes on the calendar. Fill in with `next_step` |
| `next_step` | No | What happens that day, under 80 characters |

Importing the same file again **updates** existing cases (matched by `source_reference`) and never makes duplicates. Five ready-made sample files are in `sample-data/`, with a note on what each should show.

## Task: confirm which institution a case belongs to

Open **Is this the same college?** (coordinator or data steward). Each case that names an institution without a usable ID is listed with up to three look-alike institutions, a similarity score, and the words that matched. Choose one, rule them out, or mark the case as having no known institution. Your choice is remembered, so the same name resolves by itself next time.

## Task: find a case

**Cases** has quick views (late, waiting for a reply, CPGRAMS open, institution not matched) and filters for unit, status, time limit, source, region, category, match and dates. Click any column title to sort. **Export this list** saves a CSV (without complainant details) and is written to the audit log.

Opening a case shows its summary, who holds the next step and by when, the status, the proof of each step (received, institution found, clash checked, clock set, units agreed, closed), clashes it is part of, and its history. Complainant name and narrative are shown only to the owning unit, and each view is audited.

## Task: see a report, or prove a number

**Reports** (coordinator, senior management): choose a report, a period, and optionally a unit or region. Print or export it. Every figure comes from the same records as the dashboard. On the dashboard, any number opens the cases behind it, and **How was this counted** explains the rule.

## Task: check the audit log

**Audit log** (administrator, senior management, coordinator) lists every action. The top of the page runs the tamper check: *passed* means no entry has been changed or removed. Filter by person, case or kind of action.

## Task: change a rule (administrator)

**Settings and rules** lists every rule with its value and whether it is *verified* or a *prototype setting*. Verified values are locked. To change a prototype value, enter the new value and a reason. The old value, the new value and the reason go to the audit log.

## If something looks wrong

| You see | What it means |
|---|---|
| "RB-SWR … gone quiet" in the data strip | That unit has not sent cases for over a day; its numbers may be behind (in the demonstration this is on purpose) |
| An import row marked *Not yet* | The row has a problem. The message says which column and how to fix it. Fix it in your file and import again |
| "Only officers of PGRC can …" | You are signed in as someone from another unit. Each unit works on its own cases |
| The top right says "Mock data service" | The website is running without the backend (offline demonstration). Nothing you do there is saved |

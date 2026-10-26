# The problem, and what Ekatra does about it

Smart India Hackathon, problem statement 26264 (AICTE, Smart Automation). Ekatra (एकत्र, "gathered in one place") is the team's prototype.

## The problem in one paragraph

AICTE is made of many units. The Public Grievance Redressal Cell (PGRC), the Regulation Bureaus (one for each region), the Regional Offices and the Legal cell each keep their own cases in their own systems. Many of those cases are about the **same institution**. Each unit decides correctly with what it can see, but none can see what the others are doing. So:

1. Two units can write to one institution in the same week, and the institution receives conflicting instructions.
2. A time limit is noticed only after it has passed.
3. Nobody knows which unit holds the next step on a case.
4. Counts such as *pending, under process, transferred, escalated, disposed* take days to put together by hand, and nobody can check them.
5. When a spreadsheet arrives from a unit, there is no quick, reliable way to tell whether it repeats cases or is incomplete.

## The one idea

> **Ekatra warns an officer, before they act, that another unit is already acting on the same institution.**

It does this by keeping one index of every unit's cases, organised **by institution**, not by case. It never replaces a unit's own system, never decides for anyone, and never merges, closes or moves a case on its own.

## The five pillars

Everything in the product stands on five things. Each is explained with its exact rules in `02_how_it_works_and_rules.md`.

| # | Pillar | The question it answers | Where you see it |
|---|---|---|---|
| 1 | **Matching** | Is this case about an institution we already know? | Name matching page, institution page |
| 2 | **Overlaps** (shown as *clashes*) | Is more than one unit working on the same institution? | Clashes, Calendar, Institution page |
| 3 | **Coordination** | Who decided what, and why? | Clash review page, audit log |
| 4 | **Deadlines** | Which cases are about to miss, or have missed, a time limit? | Deadlines page, dashboard |
| 5 | **Reporting** | How many cases are pending, under process, transferred, escalated or disposed, and can the number be traced? | Dashboard, Reports |

Two things run **underneath all five**:

- **Import checks.** Every uploaded file is checked row by row. A row with a problem is kept out and listed with how to fix it. A repeated reference inside a file is caught. Re-importing the same file never duplicates a case.
- **A tamper-evident audit log.** Every action is recorded with the person, the time and the case. Each entry carries the fingerprint of the one before it, and the database refuses edits and deletions.

## How each part of the problem is answered

| Problem | What Ekatra does | Proof you can see |
|---|---|---|
| Two units act on one institution unseen | Clash detection by five rules; the **Before you act** check shows which other units have open cases at an institution and whether they handle the same issue | Clashes page, the Check page, the institution picture |
| Conflicting letters in the same week | The **Calendar of actions** puts every unit's dated steps on one page, and marks days where two units act within a week | Calendar page |
| Deadlines found too late | Every case is re-checked every hour against its time limit; "due soon", "past the limit", and raising to senior people | Deadlines page, the dashboard radar |
| Who holds the next step? | Every open case shows who holds it now, what the next step is and by when | Case page |
| Reports take days | Every figure is counted from the records when you open the page, transfers kept apart from disposals, each number opens its cases | Dashboard, Reports, "How was this counted" |
| Messy files from units | Row-by-row checks with plain fixes, duplicates inside a file caught, a receipt whose counts must add up | Import page and receipt |
| Trust | Every rule is written down and shown with its current value; the priority of a clash shows the rules and dates behind it | "How Ekatra works" page |

## What Ekatra deliberately does not do

- It does not decide. The system shows facts; **a person chooses** every decision.
- It does not change who owns a case, or a case's stage, because of a decision.
- It does not link an institution by name alone. A name that merely looks similar is only a suggestion until a coordinator confirms it.
- It does not call any outside AI service. All matching, rules, deadlines and issue tagging run inside the application.
- It does not claim a timeline is official unless it is. Only the CPGRAMS 21-day limit is verified; everything else is labelled a prototype setting.

## Who it is for

Authorised AICTE officials: dealing officers, nodal officers, coordinators, data stewards, senior management (view only) and a system administrator. It is an internal coordination tool, not a public complaint portal, and not a replacement for CPGRAMS, e-Office or any unit's own system.

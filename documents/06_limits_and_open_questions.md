# Limits, what is prototype, and questions for AICTE

Honest boundaries of the project. Anything labelled a prototype setting is a value the team chose so the product could run; it must not be presented as an AICTE rule.

## What is real, and what is not

| | |
|---|---|
| **Real** | The database; sign-in (bcrypt passwords, httpOnly cookie, lockout); role checks on every endpoint; matching; the five clash rules; the hourly deadline check; imports with row-level problems and fixes; booking dates; the calendar; reports with an independent recount; the hash-chained audit log with a database trigger that refuses edits |
| **Verified** | CPGRAMS cases must be disposed within **21 days** (DARPG guidelines, 23 Aug 2024); a 30-day appeal window after closure |
| **Prototype** | Every other time limit; the interim-reply reminder day (18); "due soon" at 75%; the escalation days; the decision-due days; the stage split of the time limit; the matching suggestion count and threshold; the looking-back windows of rules O3 and O4 |
| **Synthetic** | All data: institutions, cases, people and dates. There is no public case-level AICTE dataset |
| **Simulated** | In the demonstration, the hourly check pretends healthy units keep sending data, and one unit (RB-SWR) is set to look silent so the freshness warning means something |
| **Not connected** | Institution reply links (needs AICTE approval, Q12), watch lists, the inbox, a data-health page and planted-test proofs (these exist only in the offline mock) |

## Not built yet

- Deployment to the internet and a first run on PostgreSQL (the guide is `DEPLOYMENT.md`).
- A daily e-mail digest of "your things for today" (needs a free e-mail service account).
- A list of follow-up tasks with "Mark done" on the review and institution pages (the API exists).
- A source-silence alert as a notification (the dashboard strip shows it).
- Excel (.xlsx) import and any local text-similarity between case summaries.
- Hindi labels (the font supports them).
- The case file page has the new header but still its earlier inner layout.

## Rules the product follows on purpose

1. Counts, alerts, matches and clashes are computed from the records, never typed in.
2. A name alone never links an institution; a person confirms.
3. The system never merges, closes or transfers a case, and does not choose a decision. It shows facts and records what a person decides.
4. The same institution is not the same as a duplicate: *possible*, *related* and *duplicate* are different states.
5. Transfers are counted apart from disposals.
6. Only the CPGRAMS 21 days is called verified.
7. Complainant identity and narrative are visible only to the owning unit, and never in lists, dashboards, reports or exports.
8. Every important action is recorded in an append-only audit log.
9. No outside AI service is used.
10. No secret is in the code; settings come from environment variables.

## Data protection

The DPDP Act 2023 and its 2025 Rules apply to real personal data, with full compliance due by 13 May 2027. This prototype holds only synthetic data. A real deployment would need, at least: hosting approved by AICTE, single sign-on, a retention policy, a data-processing agreement, access logging reviewed regularly, and encryption choices agreed with AICTE security. None of that has been set up.

## Questions for AICTE

Never settled by assumption in the code beyond a labelled, editable default.

| # | Question |
|---|---|
| Q1 | Is the Regulation Bureau the same unit as the Approval Bureau, or separate? |
| Q2 | Which unit leads when two units work on one institution? (There is no lead-unit policy; the product records the officer's choice and suggests nothing.) |
| Q3 | Which source systems and APIs can each unit expose, instead of files? |
| Q4 | What are the real volumes (cases per unit per year)? |
| Q5 | What are each unit's own status words? |
| Q6 | What are the official time limits beyond CPGRAMS? |
| Q7 | Does a case file always carry the institution's Permanent ID? |
| Q8 | Hosting, single sign-on, retention and data-protection rules for a real deployment |
| Q9 | Which other cells should be in the first version? |
| Q10 | Is the Standing Committee for Complaints (SCSC) part of the 2024-27 Approval Process Handbook? |
| Q11 | Is there an official interim-reply day inside the 21 days? ("Day 18" is a prototype reminder.) |
| Q12 | May institutions upload replies to AICTE outside e-Office? (This blocks the reply-link feature.) |

## Free-tier limits

Vercel Hobby is for personal, non-commercial use, which is why the deployment is described as a hackathon prototype. Limits of Vercel, Neon and GitHub Actions are in `DEPLOYMENT.md`. Nothing in the design depends on a paid service.

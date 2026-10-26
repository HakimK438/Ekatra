"""Smart-automation helpers that explain overlaps: issue tagging, a specific one-line story, and a suggested decision.

All deterministic and local (no AI service). Each result carries the facts it rests on, and a person always decides.
"""
from __future__ import annotations

import re
from typing import Any

from .dates import short_date
from .labels import CHANNEL_LABEL, category_label

Case = dict[str, Any]

# Editable list (kept in code for the prototype; it moves to app_settings later). Words match at the START of a word.
ISSUES: dict[str, dict] = {
    "faculty": {"label": "Faculty and staff", "words": ["faculty", "teacher", "teaching staff", "salary", "salaries", "staff strength", "professor"]},
    "laboratory": {"label": "Laboratory and equipment", "words": ["lab", "equipment", "workshop"]},
    "fees": {"label": "Fees and refunds", "words": ["fee", "refund", "tuition", "withdrawal"]},
    "ragging": {"label": "Ragging and student safety", "words": ["ragging", "harass", "safety", "assault"]},
    "admission": {"label": "Admission process", "words": ["admission", "intake", "seat", "counselling"]},
    "infrastructure": {"label": "Buildings and facilities", "words": ["building", "infrastructure", "hostel", "library", "campus", "classroom"]},
    "approval": {"label": "Approval and compliance", "words": ["approval", "compliance", "norm", "evc", "inspection", "hearing", "show-cause", "notice"]},
    "court": {"label": "Court matter", "words": ["writ", "court", "petition", "litigation"]},
}
CATEGORY_ISSUE = {"fee_refund": "fees", "ragging": "ragging", "faculty_salary": "faculty", "admission": "admission", "court_matter": "court"}


def tag_issues(text: str, category: str | None = None) -> list[dict]:
    """All issues found in a text (and category), strongest first. Each keeps the words that matched."""
    out = []
    for key, d in ISSUES.items():
        words = [w for w in d["words"] if re.search(r"\b" + re.escape(w), text, re.I)]
        if category and CATEGORY_ISSUE.get(category) == key and not words:
            words.append(f"category: {category.replace('_', ' ')}")
        if words:
            out.append({"issue": key, "label": d["label"], "words": words})
    return sorted(out, key=lambda t: -len(t["words"]))


def issues_of(c: Case) -> list[dict]:
    return tag_issues(c["summary"], c["category"])


def shared_issues(cases: list[Case]) -> list[dict]:
    """Issues found in two or more cases. 'approval' alone is ignored: every regulatory case mentions notices and hearings."""
    tags = [issues_of(c) for c in cases]
    out = []
    for key in ISSUES:
        hits = [t for ts in tags for t in ts if t["issue"] == key]
        if len(hits) >= 2:
            words = list(dict.fromkeys(w for h in hits for w in h["words"]))
            out.append({"issue": key, "label": ISSUES[key]["label"], "words": words})
    specific = [s for s in out if s["issue"] != "approval"]
    return specific or out


def main_issue(cases: list[Case]) -> dict | None:
    s = shared_issues(cases)
    if s:
        return {"label": s[0]["label"], "shared": True}
    first = next((t for c in cases for t in issues_of(c)), None)
    return {"label": first["label"], "shared": False} if first else None


def _article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


def _arrival(c: Case) -> str:
    """How a unit came to hold the case. Only PGRC receives CPGRAMS grievances; other units are forwarded them."""
    when = short_date(c["receivedOn"])
    if c["channel"] == "CPGRAMS":
        return f"{c['ownerUnit']} received a CPGRAMS grievance on {when}"
    if c.get("sourceComplaintRef") and c["ownerUnit"] != "PGRC":
        return f"{c['ownerUnit']} was forwarded grievance {c['sourceComplaintRef']} on {when}"
    ch = str(CHANNEL_LABEL.get(c["channel"], c["channel"]))
    return f"{c['ownerUnit']} received {_article(ch)} {ch}{'' if 'complaint' in ch.lower() else ' complaint'} on {when}"


def _state(c: Case) -> str:
    """What a case is doing now, in plain words, with its next date when there is one."""
    sched = c.get("scheduled")
    on = short_date(sched["on"]) if sched else ""
    lc = c["lifecycle"]
    if lc == "disposed":
        cat = c["category"].replace("_", " ")
        return f"closed {_article(cat)} {cat} case on {short_date(c.get('lastActionOn') or c['receivedOn'])}"
    if lc == "transferred":
        return f"passed its case to another unit on {short_date(c.get('lastActionOn') or c['receivedOn'])}"
    if lc == "inspection_hearing":
        return f"has the {sched['what']} fixed for {on}" if sched else "has an inspection or hearing under way"
    if lc == "awaiting_party":
        return f"is waiting for the institution’s reply (due {on})" if sched else "is waiting for the institution’s reply"
    return {"under_examination": "is examining its case", "received": "has registered its case", "escalated": "has placed its case before a higher authority"}[lc]


def overlap_note(cases: list[Case]) -> str:
    """Who is doing what, unit by unit, without the lead-in."""
    return "; ".join(f"{u} " + " and ".join(_state(c) for c in cases if c["ownerUnit"] == u) for u in dict.fromkeys(c["ownerUnit"] for c in cases))


def overlap_story(cases: list[Case]) -> str:
    """One specific sentence built from case facts: the issue, then every unit with what it is doing and when."""
    live = [c for c in cases if c["lifecycle"] not in ("disposed", "transferred")]
    lst = live if len(live) >= 2 else cases
    newest = sorted(live or cases, key=lambda c: c["receivedOn"], reverse=True)[0]
    issue = main_issue(lst)
    lead = issue["label"] if issue else category_label(newest["category"])
    parts = [_arrival(newest) + (f" and {_state(newest)}" if newest.get("scheduled") else "")]
    for u in dict.fromkeys(c["ownerUnit"] for c in cases if c is not newest):
        parts.append(f"{u} " + " and ".join(_state(c) for c in cases if c["ownerUnit"] == u and c is not newest))
    return f"{lead}: {'; '.join(parts)}."

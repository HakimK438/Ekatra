"""Reading an AICTE letter (show-cause notice, hearing notice, request for documents, reminder) into facts.

Officers work in letters and e-Office notings, not forms. An officer pastes a letter's text and Ekatra pulls out what it
can find by fixed patterns: reference numbers, the letter date, who sent it, the institution and its IDs, what the
institution is asked to send, by when, and any hearing or visit date. No AI service: every fact keeps the words it was
read from, so the officer can see why, and nothing is saved until the officer checks the facts and records them.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from .dates import add_days, iso

MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
NUMBER_WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen "
    "nineteen twenty".split())} | {"twenty-one": 21, "twenty one": 21, "thirty": 30, "forty-five": 45, "forty five": 45, "sixty": 60, "ninety": 90}

# What a letter can ask an institution for. A key is the same document whichever unit asks, so a second request is noticed.
ITEMS: list[dict[str, Any]] = [
    {"key": "faculty_list", "label": "Faculty list with qualifications", "words": [r"(list|details|particulars) of (the )?(regular )?(faculty|teaching staff)", r"faculty (list|details|position|strength|roster)", r"faculty[^.\n]{0,30}qualification"]},
    {"key": "salary_records", "label": "Salary statements of faculty and staff", "words": [r"salar(y|ies)[^.\n]{0,40}(statement|slip|register|paid|record|disburse)", r"pay ?slips?", r"bank statements?[^.\n]{0,40}salar", r"form[- ]?16"]},
    {"key": "fee_records", "label": "Fee receipts and refund details", "words": [r"fee (structure|receipts?|details|collected|charged)", r"refund", r"tuition fee"]},
    {"key": "admission_records", "label": "Admission records", "words": [r"(list|details) of (the )?(students|admitted)", r"admission (register|details|records|list)", r"students admitted", r"sanctioned intake"]},
    {"key": "land_building", "label": "Land and building documents", "words": [r"land (documents?|records?|deeds?)", r"building (plan|completion|documents?)", r"occupancy certificate", r"built[- ]up area"]},
    {"key": "lab_equipment", "label": "Laboratory and equipment details", "words": [r"(laborator(y|ies)|lab)[^.\n]{0,30}(equipment|details|list|facilit)", r"equipment (list|details)", r"workshop (equipment|details)"]},
    {"key": "approval_letters", "label": "Approval letters (EoA)", "words": [r"extension of approval", r"\beoa\b", r"approval (letter|order)s?"]},
    {"key": "accounts", "label": "Audited accounts", "words": [r"audited (accounts|balance sheets?|statements?)", r"statement of accounts", r"utili[sz]ation certificate"]},
    {"key": "affidavit", "label": "Affidavit or undertaking", "words": [r"affidavit", r"undertaking"]},
    {"key": "committees", "label": "Committee details (anti-ragging, grievance)", "words": [r"anti[- ]ragging (committee|squad|cell)", r"grievance redressal committee", r"internal complaints? committee", r"ombudsperson"]},
    {"key": "compliance_report", "label": "Compliance report", "words": [r"compliance report", r"action taken report", r"\batr\b", r"report on (the )?compliance"]},
    {"key": "reply", "label": "Reply to the complaint", "words": [r"(point|para)[- ]wise (reply|comments)", r"(reply|comments|response|explanation) (on|to) the (complaint|grievance|allegations|notice)", r"show cause why"]},
]

KINDS: list[tuple[str, str, str]] = [  # (kind, label, pattern), first match wins
    ("show_cause", "Show-cause notice", r"show[- ]?cause"),
    ("hearing_notice", "Hearing notice", r"(standing )?hearing committee|personal hearing|(notice|date) (of|for) (the )?hearing|appear (in person )?before"),
    ("inspection", "Inspection or expert visit", r"expert visit|\bevc\b|inspection|visit (of|by) the committee"),
    ("reminder", "Reminder", r"\breminder\b|despite (our|the) (earlier|previous) letter|no reply has been received"),
    ("warning", "Warning letter", r"\bwarning\b|warned"),
    ("closure", "Closure letter", r"(has been|is) (closed|disposed)|closure of the (complaint|case|grievance)"),
    ("information_request", "Request for documents", r"(submit|furnish|provide|send)[^.\n]{0,60}(documents?|details|information|following|list|report|reply|comments)"),
]

_DAY_MONTH = r"(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})"
_MONTH_DAY = r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})"
_NUMERIC = r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})"
_ISO = r"(\d{4})-(\d{2})-(\d{2})"
DATE_RE = re.compile(f"{_ISO}|{_NUMERIC}|{_DAY_MONTH}|{_MONTH_DAY}")


def _date(y: int, mo: int, d: int) -> str | None:
    try:
        return iso(date(y, mo, d))
    except ValueError:
        return None


def _month(word: str) -> int | None:
    return MONTHS.get(word[:3].lower())


def find_dates(text: str) -> list[dict]:
    """Every date written in the text (11.10.2026, 11/10/2026, 2026-10-11, 11 October 2026, Oct 11, 2026), Indian day-first order."""
    out = []
    for mt in DATE_RE.finditer(text):
        g = mt.groups()
        if g[0]:
            on = _date(int(g[0]), int(g[1]), int(g[2]))
        elif g[3]:
            on = _date(int(g[5]), int(g[4]), int(g[3]))
        elif g[6]:
            mo = _month(g[7])
            on = _date(int(g[8]), mo, int(g[6])) if mo else None
        else:
            mo = _month(g[9])
            on = _date(int(g[11]), mo, int(g[10])) if mo else None
        if on:
            out.append({"on": on, "start": mt.start(), "end": mt.end(), "text": mt.group(0)})
    return out


def _sentence(text: str, start: int, end: int) -> str:
    """The sentence (or line) around a position, trimmed, as evidence."""
    a = max(text.rfind(".", 0, start), text.rfind("\n", 0, start)) + 1
    stops = [i for i in (text.find(".", end), text.find("\n", end)) if i != -1]
    b = min(stops) if stops else len(text)
    s = " ".join(text[a:b].split())
    return s if len(s) <= 220 else s[:217] + "…"


def _number(word: str) -> int | None:
    w = word.lower().strip()
    return int(w) if w.isdigit() else NUMBER_WORDS.get(w)


def _unit_patterns(units: list[dict]) -> list[tuple[str, re.Pattern]]:
    """A unit is found by its code (RB-WR) or its name (Regulation Bureau, Western Region / Regulation Bureau (Western))."""
    pats = []
    for u in units:
        name = u["name"]
        parts = re.split(r"\s+[—–-]\s+", name, maxsplit=1)
        if len(parts) == 2:
            head, region = parts[0], re.sub(r"\s*\(.*\)", "", parts[1])
            region_re = re.escape(region).replace(r"\-", r"[\s-]?")
            body = rf"{re.escape(head)}\W{{1,4}}(?<!North-)(?<!South-){region_re}(ern)?\b"
        else:
            body = re.escape(name)
        pats.append((u["code"], re.compile(rf"(?<![\w-]){re.escape(u['code'])}(?![\w-])|{body}", re.I)))
    # Longer, more specific names first, so "North-West" is tried before "West".
    return sorted(pats, key=lambda p: -len(p[1].pattern))


def find_unit(text: str, units: list[dict]) -> dict | None:
    best: dict[str, Any] | None = None
    for code, pat in _unit_patterns(units):
        mt = pat.search(text)
        if mt and (best is None or mt.start() < best["start"]):
            best = {"unit": code, "start": mt.start(), "from": " ".join(mt.group(0).split())}
    return {"unit": best["unit"], "from": best["from"]} if best else None


def find_refs(text: str) -> list[dict]:
    """File numbers (F.No. …), CPGRAMS registration numbers (DARPG/E/2026/0481) and unit case numbers (PGRC/2026/1002)."""
    out: list[dict] = []
    seen: set[str] = set()

    def add(kind: str, value: str, frm: str) -> None:
        v = value.strip(" .,;:")
        if v and v.upper() not in seen:
            seen.add(v.upper())
            out.append({"kind": kind, "value": v, "from": " ".join(frm.split())})

    for mt in re.finditer(r"\bF\.?\s?No\.?\s*[:.-]?\s*([A-Z0-9][\w./()-]{3,60})", text, re.I):
        add("file_no", mt.group(1), mt.group(0))
    for mt in re.finditer(r"\b([A-Z]{3,10}/E/\d{4}/\d{3,10})\b", text):
        add("cpgrams", mt.group(1), mt.group(0))
    for mt in re.finditer(r"\b((?:PGRC|RB-[A-Z]{2,3}|RO-[A-Z]{2,3}|LEGAL)/\d{4}/\d{2,6})\b", text):
        add("case_no", mt.group(1), mt.group(0))
    return out


def find_ids(text: str) -> dict:
    out: dict[str, Any] = {}
    mt = re.search(r"permanent\s+id(?:entifier)?\W{0,4}(1[\s-]?\d{5,12})", text, re.I) or re.search(r"(?<![\w-])(1-\d{5,12})(?![\w-])", text)
    if mt:
        out["permanentId"] = {"value": re.sub(r"\s", "-", mt.group(1), count=1), "from": " ".join(mt.group(0).split())}
    mt = re.search(r"current\s+id\W{0,4}(1[\s-]?\d{5,12})", text, re.I)
    if mt:
        out["currentId"] = {"value": mt.group(1), "from": " ".join(mt.group(0).split())}
        if "permanentId" in out and out["permanentId"]["value"].replace(" ", "-") == mt.group(1).replace(" ", "-"):
            del out["permanentId"]  # the bare-number fallback picked up the Current ID
    mt = re.search(r"aishe\s+code\W{0,4}([CSU]-\d{3,7})", text, re.I)
    if mt:
        out["aisheCode"] = {"value": mt.group(1).upper(), "from": " ".join(mt.group(0).split())}
    return out


_ADDRESSEE = re.compile(r"^(the\s+)?(principal|director|chairman|chairperson|secretary|registrar|head|dean|president|correspondent)\b[\s,]*", re.I)
_INST_WORD = re.compile(r"\b(institute|inst|college|polytechnic|university|school|academy|engineering|engg|technology|tech|management|pharmacy)\b", re.I)


def find_institution_name(text: str) -> dict | None:
    """The institution named in the letter: 'Name of the Institution: …', else the addressee block after 'To'."""
    mt = re.search(r"name of the (institution|institute|college)\s*[:-]\s*(.+)", text, re.I)
    if mt:
        return {"value": mt.group(2).strip(" .,"), "from": " ".join(mt.group(0).split())}
    lines = [ln.strip() for ln in text.splitlines()]
    for i, ln in enumerate(lines):
        if re.fullmatch(r"to,?", ln, re.I):
            for cand in lines[i + 1:i + 6]:
                cand = _ADDRESSEE.sub("", cand).strip(" ,.")
                if cand and _INST_WORD.search(cand):
                    return {"value": cand, "from": cand}
    for ln in lines:
        if _INST_WORD.search(ln) and not re.search(r"council|bureau|cell|office|ministry|committee|all india", ln, re.I) and len(ln) < 120:
            return {"value": _ADDRESSEE.sub("", ln).strip(" ,."), "from": ln}
    return None


def split_name_district(name: str) -> tuple[str, str | None]:
    """'Sahyadri Institute of Technology, Pune' → ('Sahyadri Institute of Technology', 'Pune')."""
    parts = [p.strip() for p in name.split(",")]
    if len(parts) >= 2 and parts[-1] and not _INST_WORD.search(parts[-1]) and len(parts[-1].split()) <= 3:
        return ", ".join(parts[:-1]), re.sub(r"\s*[-–]?\s*\d{6}$", "", parts[-1]) or None
    return name, None


def find_items(text: str) -> list[dict]:
    out = []
    for it in ITEMS:
        for w in it["words"]:
            mt = re.search(w, text, re.I)
            if mt:
                out.append({"key": it["key"], "label": it["label"], "from": _sentence(text, mt.start(), mt.end())})
                break
    return out


def find_listed_asks(text: str) -> list[str]:
    """Numbered or lettered lines ((i), 1., (a), •), which in AICTE letters usually list what is to be sent."""
    out = []
    for ln in text.splitlines():
        mt = re.match(r"^\s*(?:\(?[ivx]{1,4}\)|\(?\d{1,2}[.)]|\(?[a-h]\)|[•\-*])\s+(.{6,200})$", ln, re.I)
        if mt:
            out.append(" ".join(mt.group(1).split()).rstrip(";,."))
    return out


def find_letter_date(text: str, dates: list[dict]) -> dict | None:
    for d in dates:
        mt = re.search(r"dated?\s*[:.-]?\s*$", text[max(0, d["start"] - 20):d["start"]], re.I)
        if mt:
            return {"on": d["on"], "from": " ".join((mt.group(0).strip() + " " + d["text"]).split())}
    return {"on": dates[0]["on"], "from": dates[0]["text"]} if dates else None


def find_due(text: str, dates: list[dict], letter_on: str | None) -> dict | None:
    """By when the institution must reply: 'within 15 days', 'on or before 30.10.2026', 'not later than …', 'by …'."""
    mt = re.search(r"within\s+(?:a period of\s+)?(\d{1,3}|[a-z]+(?:[- ][a-z]+)?)\s*(?:\(\s*\d+\s*\)\s*)?(working\s+)?days", text, re.I)
    for d in dates:
        before = text[max(0, d["start"] - 40):d["start"]]
        if re.search(r"(on or before|not later than|latest by|by|before|till|until|no later than|last date[^.\n]{0,15})\s*[:,]?\s*$", before, re.I):
            return {"on": d["on"], "from": _sentence(text, d["start"], d["end"]), "how": "date"}
    if mt:
        n = _number(mt.group(1))
        if n and letter_on:
            return {"on": add_days(letter_on, n), "from": _sentence(text, mt.start(), mt.end()), "how": f"{n} days from the letter date", "days": n}
    return None


def find_hearing(text: str, dates: list[dict]) -> dict | None:
    """A hearing, visit or inspection date written in the letter."""
    for d in dates:
        # Scans and PDFs wrap lines anywhere, so look back to the start of the sentence across line breaks.
        a = text.rfind(".", 0, max(0, d["start"] - 1)) + 1
        s = " ".join(text[max(a, d["start"] - 220):d["end"]].split())
        mt = re.search(r"(standing hearing committee|hearing|personal hearing|expert visit|evc|inspection|visit)", s, re.I)
        if mt and not re.search(r"(dated|letter)\s*[:.-]?\s*" + re.escape(d["text"]), s, re.I):
            word = mt.group(1).lower()
            what = "SHC hearing" if re.search("standing hearing committee", s, re.I) else "Expert visit (EVC)" if word in ("expert visit", "evc") else word.capitalize()
            return {"on": d["on"], "what": what, "from": s}
    return None


def find_kind(text: str) -> dict:
    for kind, label, pat in KINDS:
        mt = re.search(pat, text, re.I)
        if mt:
            return {"kind": kind, "label": label, "from": _sentence(text, mt.start(), mt.end())}
    return {"kind": "other", "label": "Other letter", "from": ""}


def read_letter(text: str, units: list[dict]) -> dict:
    """All the facts that can be read from one letter. Each carries the words it came from ('from')."""
    dates = find_dates(text)
    letter = find_letter_date(text, dates)
    name = find_institution_name(text)
    nm, district = split_name_district(name["value"]) if name else ("", None)
    return {
        "kind": find_kind(text),
        "unit": find_unit(text, units),
        "refs": find_refs(text),
        "letterDate": letter,
        "dueOn": find_due(text, dates, letter["on"] if letter else None),
        "hearing": find_hearing(text, dates),
        "institutionName": {**name, "value": nm, "district": district} if name else None,
        "ids": find_ids(text),
        "items": find_items(text),
        "listed": find_listed_asks(text),
        "dates": [{"on": d["on"], "text": d["text"]} for d in dates],
    }

"""What AICTE has asked each institution to do, across units, and where those requests meet.

Every letter asks an institution for something by a date. When two units do not see each other's letters, the institution
gets the same request twice, or two different dates for one document, or a reply date that lands in the week of another
unit's hearing. These checks state the facts (who asked, what, when, by when). They never say what to do; the officer decides.

D1 asked before: another unit asked for the same document within the look-back window (open or already answered).
D2 two dates: two units have open requests for the same document with different reply dates.
D3 near a hearing: a reply date falls within a few days of another unit's hearing or visit.
D4 many requests: three or more open requests from two or more units at the same time.
The windows are prototype settings (rules.json), not AICTE-approved timelines.
"""
from __future__ import annotations

from typing import Any

from .dates import days_between, short_date
from .letters import ITEMS
from .logic import SETTINGS

Demand = dict[str, Any]
ITEM_LABEL = {i["key"]: i["label"] for i in ITEMS}


def _join(words: list[str]) -> str:
    return words[0] if len(words) <= 1 else ", ".join(words[:-1]) + " and " + words[-1]


def _asked(d: Demand) -> str:
    return f"{d['unit']} asked on {short_date(d['letterDate'])}" + (f" ({d['letterRef']})" if d.get("letterRef") else "")


def find_clashes(demands: list[Demand], steps: list[dict], today: str, focus: Demand | None = None) -> list[dict]:
    """Findings for one institution. `demands` are its recorded requests; `steps` are dated hearings or visits
    ({date, unit, what}) from its cases and requests. With `focus` (a draft or one request), only findings that involve it."""
    pool = [*demands, focus] if focus and focus not in demands else list(demands)
    out: list[dict] = []

    def add(code: str, text: str, ids: list[Any], item: str | None = None) -> None:
        if focus is not None and focus.get("id") not in ids:
            return
        out.append({"code": code, "text": text, "demandIds": ids, "item": item})

    look = SETTINGS["demandLookbackDays"]
    near = SETTINGS["demandNearDays"]
    live = [d for d in pool if d["state"] != "withdrawn"]
    open_ = [d for d in live if d["state"] == "open"]

    for key in dict.fromkeys(k for d in live for k in d["items"]):
        have = sorted((d for d in live if key in d["items"]), key=lambda d: d["letterDate"])
        if len({d["unit"] for d in have}) < 2:
            continue
        label = ITEM_LABEL.get(key, key).lower()
        for later in have:
            earlier = [e for e in have if e["unit"] != later["unit"] and e["letterDate"] <= later["letterDate"] and e is not later
                       and days_between(e["letterDate"], later["letterDate"]) <= look]
            for e in earlier:
                sent = f" The institution sent it to {e['unit']} on {short_date(e['answeredOn'])}." if e["state"] == "answered" and e.get("answeredOn") else ""
                add("D1", f"{e['unit']} already asked for the {label} on {short_date(e['letterDate'])}; {later['unit']} asked again on {short_date(later['letterDate'])}.{sent}",
                    [e["id"], later["id"]], key)
        dated = [d for d in have if d["state"] == "open" and d.get("dueOn")]
        if len({d["unit"] for d in dated}) >= 2 and len({d["dueOn"] for d in dated}) >= 2:
            parts = [f"{d['unit']} by {short_date(d['dueOn'])}" for d in sorted(dated, key=lambda d: d["dueOn"])]
            add("D2", f"Two reply dates for the {label}: {_join(parts)}.", [d["id"] for d in dated], key)

    for d in open_:
        if not d.get("dueOn"):
            continue
        for s in steps:
            if s["unit"] != d["unit"] and abs(days_between(d["dueOn"], s["date"])) <= near and s["date"] >= today:
                gap = days_between(s["date"], d["dueOn"])
                when = "the same day as" if gap == 0 else f"{abs(gap)} day{'s' if abs(gap) != 1 else ''} {'after' if gap > 0 else 'before'}"
                add("D3", f"{d['unit']} reply due {short_date(d['dueOn'])}, {when} {s['unit']}’s {s['what']} on {short_date(s['date'])}.",
                    [d["id"], *([s["demandId"]] if s.get("demandId") is not None else [])])

    units = list(dict.fromkeys(d["unit"] for d in open_))
    if len(open_) >= 3 and len(units) >= 2:
        add("D4", f"{len(open_)} open requests to this institution from {_join(units)}.", [d["id"] for d in open_])
    return out


def steps_from(demands: list[Demand], scheduled: list[dict]) -> list[dict]:
    """Dated hearings and visits: the ones written in requests, plus the ones booked on cases."""
    out = [{"date": d["hearingOn"], "unit": d["unit"], "what": d.get("hearingWhat") or "hearing", "demandId": d["id"]} for d in demands if d.get("hearingOn") and d["state"] != "withdrawn"]
    seen = {(s["date"], s["unit"]) for s in out}
    out += [s for s in scheduled if (s["date"], s["unit"]) not in seen]
    return out

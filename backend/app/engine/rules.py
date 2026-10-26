"""Editing the tunable rules: validation, applying stored changes, and the table shown on the Settings screen.

Administrators change prototype settings (time limits, thresholds). Verified limits are locked. Values are stored as
overrides on top of the defaults in rules.json, so "reset" simply removes them.
"""
from __future__ import annotations

from typing import Any

from ..errors import ApiError
from .dates import js_round
from .logic import DEFAULTS, RULES, SETTINGS

BY_KEY = {r["key"]: r for r in RULES if r["key"]}
SCALE = {"percent": 100}  # percent values are stored as fractions (0.75) and shown and edited as 75


def apply(overrides: dict[str, Any]) -> None:
    """Make SETTINGS equal to the defaults plus the stored overrides (unknown keys are ignored)."""
    SETTINGS.clear()
    SETTINGS.update(DEFAULTS)
    SETTINGS.update({k: v for k, v in overrides.items() if k in BY_KEY})


def shown(rule: dict[str, Any], stored: float) -> float:
    """Stored value to the number people see and type."""
    k = SCALE.get(rule["unit"], 1)
    return js_round(stored * k) if k != 1 else stored


def stored(rule: dict[str, Any], typed: float) -> float:
    k = SCALE.get(rule["unit"], 1)
    return round(typed / k, 4) if k != 1 else typed


def validate(values: dict[str, Any]) -> dict[str, float]:
    """Check typed values (as people see them). Returns stored values, or raises a 400 saying what to fix."""
    out: dict[str, float] = {}
    for key, raw in values.items():
        rule = BY_KEY.get(key)
        if rule is None:
            raise ApiError(400, "validation_error", f"“{key}” is not a setting.")
        if not rule["editable"]:
            raise ApiError(400, "validation_error", f"“{rule['label']}” is verified and cannot be changed here.")
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise ApiError(400, "validation_error", f"“{rule['label']}” needs a number.")
        lo, hi = shown(rule, rule["min"]), shown(rule, rule["max"])
        if not lo <= raw <= hi:
            raise ApiError(400, "validation_error", f"“{rule['label']}” must be between {lo:g} and {hi:g}.")
        if rule["unit"] != "percent" and raw != int(raw):
            raise ApiError(400, "validation_error", f"“{rule['label']}” must be a whole number.")
        out[key] = stored(rule, raw)
    # Rules that only make sense together are checked on the final values.
    final = {**SETTINGS, **out}
    if final["coordSecondLevelDays"] <= final["coordDueDays"]:
        raise ApiError(400, "validation_error", "The second-level reminder must come after the decision due date.")
    if final["cpgramsInterimDay"] >= final["cpgramsDays"]:
        raise ApiError(400, "validation_error", "The interim reply reminder must come before the CPGRAMS time limit.")
    return out


def display(rule: dict[str, Any], stored_value: float) -> str:
    v = shown(rule, stored_value)
    n = f"{v:g}"
    return {"percent": f"{n}%", "day": f"day {n}", "count": f"top {n}"}.get(rule["unit"], f"{n} {rule['unit']}")


def items() -> list[dict[str, Any]]:
    """Rows for the Settings screen, in the order of rules.json."""
    out = []
    for r in RULES:
        key = r["key"]
        cur = SETTINGS[key] if key else r["default"]
        row = {"group": r["group"], "label": r["label"], "value": display(r, cur), "verified": r["verified"], "basis": r["basis"],
               "key": key, "unit": r["unit"], "editable": r["editable"]}
        if key:
            row |= {"current": shown(r, cur), "default": shown(r, r["default"]), "min": shown(r, r["min"]), "max": shown(r, r["max"]), "changed": cur != r["default"]}
        out.append(row)
    return out

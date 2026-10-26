"""Plain-language names used in text the engines produce (alert reasons, stories, exports)."""
from __future__ import annotations

CATEGORIES = [
    "norm_violation", "evc_deficiency", "court_matter", "compliance_verification",
    "ragging", "fee_refund", "faculty_salary", "admission", "other",
]

CATEGORY_LABEL = {
    "norm_violation": "Norms not followed",
    "evc_deficiency": "Inspection shortfall (EVC)",
    "court_matter": "Court matter",
    "compliance_verification": "Compliance check",
    "ragging": "Ragging",
    "fee_refund": "Fees and refunds",
    "faculty_salary": "Faculty and salary",
    "admission": "Admissions",
    "other": "Other",
}

CHANNEL_LABEL = {
    "CPGRAMS": "CPGRAMS",
    "CSS": "AICTE CSS",
    "EMAIL_POST": "Email or post",
    "APH_COMPLAINT": "Approval process complaint",
    "VIP_MINISTRY": "VIP or Ministry reference",
    "COURT": "Court",
    "RTI": "RTI",
    "OTHER": "Other",
}

STAGE_LABEL = {
    "received": "New",
    "under_examination": "With an officer",
    "awaiting_party": "Waiting for the institution",
    "inspection_hearing": "Visit or hearing",
    "transferred": "Transferred",
    "escalated": "Sent to senior authority",
    "disposed": "Disposed",
}

# Each unit's own status wording; the common stage names are above. Mirrors UNIT_STATUS in frontend/src/lib/mock/data.ts.
_PGRC = {"received": "Registered on CPGRAMS", "under_examination": "Comments sought", "awaiting_party": "Report awaited from institution", "inspection_hearing": "Referred for regulatory action", "transferred": "Forwarded", "escalated": "Placed before higher authority", "disposed": "Disposed of"}
_RB_A = {"received": "File put up", "under_examination": "Under scrutiny", "awaiting_party": "SCN issued", "inspection_hearing": "EVC / SHC stage", "transferred": "Forwarded", "escalated": "Placed before Approval Bureau", "disposed": "Disposed of"}
_RB_B = {"received": "Received in bureau", "under_examination": "Under examination", "awaiting_party": "Show-cause notice issued", "inspection_hearing": "Hearing fixed", "transferred": "Sent to competent unit", "escalated": "Referred to higher authority", "disposed": "Closed – NFA"}
_RO = {"received": "Diary entry made", "under_examination": "Field verification", "awaiting_party": "Compliance sought", "inspection_hearing": "Visit or hearing fixed", "transferred": "Forwarded", "escalated": "Referred to head office", "disposed": "Filed"}
_LEGAL = {"received": "Case opened", "under_examination": "Comments being prepared", "awaiting_party": "Parawise comments awaited", "inspection_hearing": "Listed before court", "transferred": "Handed to counsel", "escalated": "Placed before the Member Secretary", "disposed": "Matter concluded"}
UNIT_STATUS = {"PGRC": _PGRC, "RO-WR": _RO, "LEGAL": _LEGAL, "RB-WR": _RB_A, "RB-NR": _RB_A, "RB-SR": _RB_A, "RB-SCR": _RB_A,
               "RB-CR": _RB_B, "RB-ER": _RB_B, "RB-NWR": _RB_B, "RB-SWR": _RB_B}


def local_status(unit: str, stage: str) -> str:
    return UNIT_STATUS.get(unit, _RB_A)[stage]


DECISION_LABEL = {
    "related": "Related, keep both",
    "duplicate": "Same complaint (duplicate)",
    "not_related": "Not related",
    "designate_lead_unit": "One unit leads",
    "request_further_review": "Needs more review",
}

DISPOSAL_LABEL = {
    "resolved": "Resolved",
    "rejected": "Rejected",
    "action_taken": "Action taken",
    "closed_as_duplicate_by_owner": "Closed as duplicate",
}

RULE_SHORT = {
    "O1": "Grievance Cell and a Regulation Bureau both have open cases",
    "O2": "Open cases in several units",
    "O3": "The same kind of complaint is in more than one unit",
    "O4": "A new case arrived while a notice or hearing is pending in another unit",
    "O5": "The same complaint number is held by more than one unit",
}


def category_label(code: str) -> str:
    return CATEGORY_LABEL.get(code, code.replace("_", " "))

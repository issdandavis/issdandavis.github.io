#!/usr/bin/env python3
"""Check one governance decision record.

The record is a JSON object. The decision is one of ALLOW, QUARANTINE, or DENY.
A buyer runs ``python decide.py self-test`` before using it on a real workflow.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DECISIONS = ("ALLOW", "QUARANTINE", "DENY")
REQUIRED = (
    "date",
    "operator",
    "workflow",
    "decision",
    "source",
    "rationale",
    "owner",
    "review_date",
)


def check(record: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(record, dict):
        return ["record must be a JSON object"]
    for key in REQUIRED:
        if not str(record.get(key, "")).strip():
            errors.append(f"missing {key}")
    decision = str(record.get("decision", "")).strip().upper()
    if decision and decision not in DECISIONS:
        errors.append("decision must be ALLOW, QUARANTINE, or DENY")
    if decision in ("QUARANTINE", "DENY"):
        if not str(record.get("uncertainty", "")).strip():
            errors.append("QUARANTINE and DENY need uncertainty")
        if not str(record.get("follow_up", "")).strip():
            errors.append("QUARANTINE and DENY need follow_up")
    return errors


def example(kind: str) -> dict:
    base = {
        "date": "2026-10-24",
        "operator": "buyer",
        "workflow": "shop-download-check",
        "source": "one public page the operator can open",
        "rationale": "The page states the price and the file the buyer receives.",
        "owner": "buyer",
        "review_date": "2026-11-24",
        "uncertainty": "",
        "follow_up": "",
    }
    if kind == "allow":
        base["decision"] = "ALLOW"
        return base
    if kind == "quarantine":
        base["decision"] = "QUARANTINE"
        base["rationale"] = "The page names a file, and the operator has not opened it yet."
        base["uncertainty"] = "The download was not opened in this session."
        base["follow_up"] = "Open the zip and run its self-test."
        return base
    if kind == "deny":
        base["decision"] = "DENY"
        base["rationale"] = "The action would send a credential to an unnamed host."
        base["uncertainty"] = "The destination host is not on the operator's list."
        base["follow_up"] = "Stop the action. Name the host before anyone retries."
        return base
    raise SystemExit("example kind must be allow, quarantine, or deny")


def self_test() -> None:
    for kind in ("allow", "quarantine", "deny"):
        errors = check(example(kind))
        if errors:
            raise SystemExit(f"{kind} example failed: {errors}")
    broken = example("allow")
    broken["decision"] = "MAYBE"
    broken_errors = check(broken)
    if not any("ALLOW, QUARANTINE, or DENY" in item for item in broken_errors):
        raise SystemExit("a bad decision word was accepted")
    thin = example("deny")
    thin["uncertainty"] = ""
    thin["follow_up"] = ""
    thin_errors = check(thin)
    if "QUARANTINE and DENY need uncertainty" not in thin_errors:
        raise SystemExit("a DENY without uncertainty was accepted")
    print("self-test passed: ALLOW, QUARANTINE, and DENY examples check, bad records do not")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print("usage: python decide.py self-test | check FILE.json | example allow|quarantine|deny")
        return 0
    command = argv[1]
    if command == "self-test":
        self_test()
        return 0
    if command == "example":
        if len(argv) != 3:
            print("usage: python decide.py example allow|quarantine|deny")
            return 2
        print(json.dumps(example(argv[2]), indent=2))
        return 0
    if command == "check":
        if len(argv) != 3:
            print("usage: python decide.py check FILE.json")
            return 2
        record = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        errors = check(record)
        if errors:
            print("\n".join(errors))
            return 1
        print(f"record checks: {str(record.get('decision', '')).strip().upper()}")
        return 0
    print("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

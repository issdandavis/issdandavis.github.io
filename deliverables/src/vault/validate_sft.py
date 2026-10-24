#!/usr/bin/env python3
"""Check a JSONL file of prompt/response training rows.

Each line must be one JSON object with non-empty prompt and response strings.
This is the gate before a trainer spends a run on a bad file.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def check_line(line_number: int, line: str) -> list[str]:
    try:
        row = json.loads(line)
    except json.JSONDecodeError as exc:
        return [f"line {line_number}: invalid JSON ({exc.msg})"]
    errors = []
    if not isinstance(row, dict):
        return [f"line {line_number}: row must be an object"]
    for key in ("prompt", "response"):
        value = row.get(key, "")
        if not isinstance(value, str) or not value.strip():
            errors.append(f"line {line_number}: {key} must be a non-empty string")
    return errors


def check_file(path: Path) -> list[str]:
    errors: list[str] = []
    rows = 0
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        rows += 1
        errors.extend(check_line(line_number, raw))
    if rows == 0:
        errors.append("file has no rows")
    return errors


def self_test() -> None:
    good = check_line(1, '{"prompt":"Name the decision words.","response":"ALLOW, QUARANTINE, DENY."}')
    if good:
        raise SystemExit(f"a good row failed: {good}")
    bad = check_line(2, '{"prompt":"","response":"x"}')
    if not bad:
        raise SystemExit("an empty prompt was accepted")
    broken = check_line(3, "{")
    if not broken:
        raise SystemExit("broken JSON was accepted")
    print("self-test passed: prompt and response are required strings")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print("usage: python validate_sft.py self-test | FILE.jsonl")
        return 0
    if argv[1] == "self-test":
        self_test()
        return 0
    path = Path(argv[1])
    errors = check_file(path)
    if errors:
        print("\n".join(errors))
        return 1
    count = sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    print(f"{count} rows check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

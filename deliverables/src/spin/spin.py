#!/usr/bin/env python3
"""Turn one source note into three channel drafts.

The drafts copy the source. They do not add a claim, a price, or a promise.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path


def first_sentence(text: str) -> str:
    compact = " ".join(text.split())
    if not compact:
        return ""
    for mark in (". ", "? ", "! "):
        if mark in compact:
            return compact.split(mark, 1)[0].strip() + mark.strip()
    return compact


def spin(text: str, url: str = "") -> dict[str, str]:
    body = "\n".join(line.rstrip() for line in text.splitlines()).strip()
    if not body:
        raise ValueError("source is empty")
    claim = first_sentence(body)
    link = url.strip()
    short = claim if not link else f"{claim} {link}"
    email = "\n".join(
        (
            f"What changed: {claim}",
            "Who should read it: the people named in the source.",
            f"Next: {link or 'use the one action already written in the source.'}",
        )
    )
    return {"site": body[:500], "short": short, "email": email}


def write_tracker(path: Path, source_name: str, outputs: dict[str, str]) -> None:
    new_file = not path.exists()
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        if new_file:
            writer.writerow(("source", "channel", "chars"))
        for channel, text in outputs.items():
            writer.writerow((source_name, channel, len(text)))


def self_test() -> None:
    source = "The shop lists six downloads.\nEach one has a self-test."
    drafted = spin(source, "https://aethermoore.com/shop.html")
    if "six downloads" not in drafted["short"]:
        raise SystemExit("the short draft dropped the source claim")
    if "guaranteed" in drafted["email"].lower():
        raise SystemExit("the email draft added a promise")
    try:
        spin("   ")
    except ValueError:
        pass
    else:
        raise SystemExit("an empty source was accepted")
    print("self-test passed: drafts stay inside the source")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print("usage: python spin.py self-test | SOURCE.md [url]")
        return 0
    if argv[1] == "self-test":
        self_test()
        return 0
    source_path = Path(argv[1])
    url = argv[2] if len(argv) > 2 else ""
    try:
        drafted = spin(source_path.read_text(encoding="utf-8"), url)
    except ValueError as exc:
        print(exc)
        return 2
    out_dir = source_path.parent / "spin-out"
    out_dir.mkdir(exist_ok=True)
    for channel, text in drafted.items():
        (out_dir / f"{source_path.stem}.{channel}.txt").write_text(text + "\n", encoding="utf-8")
    write_tracker(out_dir / "output-tracker.csv", source_path.name, drafted)
    print(f"wrote {len(drafted)} drafts in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

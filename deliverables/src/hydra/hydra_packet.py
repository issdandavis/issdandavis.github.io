#!/usr/bin/env python3
"""Build a six-role handoff packet for one bounded mission.

The roles match the SCBE swarm names: KO scout, AV vision, RU reader,
CA clicker, UM typer, DR judge. This script does not browse, click, or
call a model. It writes the packet the operator fills in.
"""

from __future__ import annotations

import json
import sys

ROLES = (
    {
        "tongue": "KO",
        "role": "Scout",
        "owns": "Name the route and the bound of the mission.",
        "must_not": "Widen the mission past the sentence the operator wrote.",
    },
    {
        "tongue": "AV",
        "role": "Vision",
        "owns": "List what a person would look at before anyone acts.",
        "must_not": "Treat an unseen page as already inspected.",
    },
    {
        "tongue": "RU",
        "role": "Reader",
        "owns": "Quote the text that the decision depends on.",
        "must_not": "Replace the source with a summary that adds a claim.",
    },
    {
        "tongue": "CA",
        "role": "Clicker",
        "owns": "Name the single action, if an action is still allowed.",
        "must_not": "Take a second action in the same packet.",
    },
    {
        "tongue": "UM",
        "role": "Typer",
        "owns": "Name the text that may be entered, or state that none may.",
        "must_not": "Enter a credential, a token, or an unnamed secret.",
    },
    {
        "tongue": "DR",
        "role": "Judge",
        "owns": "Record ALLOW, QUARANTINE, or DENY, plus the rationale.",
        "must_not": "Leave the packet without a decision word.",
    },
)


def build(mission: str) -> dict:
    text = " ".join(mission.split())
    if not text:
        raise ValueError("mission is empty")
    return {
        "mission": text,
        "roles": list(ROLES),
        "decision": "",
        "stop": "DR has not recorded ALLOW, QUARANTINE, or DENY.",
    }


def self_test() -> None:
    packet = build("Check that the shop download matches its manual.")
    tongues = [role["tongue"] for role in packet["roles"]]
    if tongues != ["KO", "AV", "RU", "CA", "UM", "DR"]:
        raise SystemExit(f"roles drifted: {tongues}")
    if packet["decision"] != "":
        raise SystemExit("a dry run must not invent a decision")
    try:
        build("   ")
    except ValueError:
        pass
    else:
        raise SystemExit("an empty mission was accepted")
    print("self-test passed: six roles, no invented decision")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print('usage: python hydra_packet.py self-test | "one mission sentence"')
        return 0
    if argv[1] == "self-test":
        self_test()
        return 0
    try:
        packet = build(" ".join(argv[1:]))
    except ValueError as exc:
        print(exc)
        return 2
    print(json.dumps(packet, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

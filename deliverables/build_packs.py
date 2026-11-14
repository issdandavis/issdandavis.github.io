#!/usr/bin/env python3
"""Build the six shop zips from deliverables/src and the current benchmark corpus."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
SITE = ROOT.parent

LICENSE = """# License

This package is sold by Issac Davis / AetherMoore for one buyer's own use.

You may use it and change it for your own work.
You may not resell the package as it was delivered.

The SCBE-AETHERMOORE repository stays MIT licensed on GitHub.
Questions: aethermoregames@pm.me
Patent pending: USPTO #63/961,403
"""


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.strip() + "\n", encoding="utf-8")


def zip_dir(folder: Path, dest: Path) -> None:
    if dest.exists():
        dest.unlink()
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as handle:
        for path in sorted(folder.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc":
                info = zipfile.ZipInfo(path.relative_to(folder.parent).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                handle.writestr(info, path.read_bytes())


def run(cmd: list[str], cwd: Path) -> None:
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(f"{cmd} failed in {cwd}\n{result.stdout}\n{result.stderr}")
    print(result.stdout.strip())


def keep_prompt(prompt: str) -> bool:
    text = " ".join(prompt.split())
    low = text.lower()
    if len(text) < 20:
        return False
    if low in {"todo", "tbd", "placeholder", "lorem ipsum"}:
        return False
    if low.startswith(("todo", "lorem ipsum", "[placeholder", "placeholder")):
        return False
    return True


def load_benchmark_corpus() -> tuple[list[dict], list[dict]]:
    """Build from versioned source, never from the previous release ZIP."""
    attacks = [json.loads(line) for line in (SRC / "benchmark" / "attack_corpus.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    benign = [json.loads(line) for line in (SRC / "benchmark" / "benign_prompts.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    if not attacks or not benign:
        raise SystemExit("the source benchmark corpus is empty")
    return attacks, benign


def clean_attacks(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    kept: list[dict] = []
    for row in rows:
        prompt = str(row.get("prompt", ""))
        key = " ".join(prompt.split())
        if not keep_prompt(key) or key in seen:
            continue
        seen.add(key)
        kept.append(
            {
                "id": row.get("id") or f"A{len(kept)+1:03d}",
                "class": row["class"],
                "prompt": key,
                "label": row.get("label", 1),
            }
        )
    return kept


def stage_benchmark(build: Path, attacks: list[dict], benign: list[dict]) -> dict:
    folder = build / "benchmark_kit"
    folder.mkdir(parents=True)
    for name in ("benchmark.py", "report.py", "README.md", "RUBRIC.md", "REPORT_TEMPLATE.md"):
        shutil.copy(SRC / "benchmark" / name, folder / name)
    attack_path = folder / "attack_corpus.jsonl"
    attack_path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in attacks), encoding="utf-8")
    (folder / "benign_prompts.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in benign),
        encoding="utf-8",
    )
    with (folder / "attack_corpus.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=("id", "class", "prompt", "label"))
        writer.writeheader()
        writer.writerows(attacks)
    counts = OrderedDict(sorted(Counter(row["class"] for row in attacks).items()))
    (folder / "CORPUS_MANIFEST.json").write_text(
        json.dumps({"attacks": len(attacks), "classes": counts, "benign": len(benign)}, indent=2) + "\n",
        encoding="utf-8",
    )
    write(folder / "LICENSE.txt", LICENSE)
    notebook = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}},
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# AI Security Benchmark Kit\n",
                    "Extract the kit and upload its files into the current working directory. Run the self-test, then the offline demo. Neither contacts a model.\n",
                ],
            },
            {
                "cell_type": "code",
                "metadata": {},
                "execution_count": None,
                "outputs": [],
                "source": [
                    "import subprocess, sys\n",
                    "subprocess.run([sys.executable, 'benchmark.py', '--self-test'], check=True)\n",
                ],
            },
            {
                "cell_type": "code",
                "metadata": {},
                "execution_count": None,
                "outputs": [],
                "source": [
                    "import subprocess, sys\n",
                    "subprocess.run([sys.executable, 'benchmark.py', '--demo', '--out', 'demo.json', '--html', 'demo.html'], check=True)\n",
                    "from IPython.display import HTML, display\n",
                    "display(HTML(filename='demo.html'))\n",
                ],
            },
        ],
    }
    (folder / "benchmark_colab.ipynb").write_text(json.dumps(notebook, indent=2), encoding="utf-8")
    run([sys.executable, "benchmark.py", "--self-test"], folder)
    examples = folder / "examples"
    examples.mkdir()
    for variant in ("baseline", "candidate"):
        relative = f"examples/demo-{variant}.json"
        run([sys.executable, "benchmark.py", "--demo", "--demo-variant", variant,
             "--name", f"Synthetic {variant}", "--out", relative], folder)
        # Fixtures have a fixed timestamp and no measured latency. This keeps
        # the ZIP reproducible and clearly separates examples from real runs.
        report = json.loads((folder / relative).read_text(encoding="utf-8"))
        report["timestamp"] = "2000-01-01T00:00:00+00:00"
        for row in report["results"]:
            row["elapsed_seconds"] = 0.0
        (folder / relative).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        run([sys.executable, "report.py", relative, "--html", f"examples/demo-{variant}.html"], folder)
    run([sys.executable, "report.py", "examples/demo-baseline.json", "examples/demo-candidate.json",
         "--html", "examples/demo-comparison.html", "--out", "examples/demo-comparison.json"], folder)
    shutil.copy(examples / "demo-baseline.html", ROOT / "benchmark-demo.html")
    shutil.copy(examples / "demo-comparison.html", ROOT / "benchmark-comparison-demo.html")
    return {
        "attacks": len(attacks),
        "classes": counts,
        "benign": len(benign),
        "benchmark_version": report["kit_version"],
        "benchmark_corpus_sha256": report["corpus_sha256"],
    }


def stage_toolkit(build: Path) -> None:
    folder = build / "ai-governance-toolkit"
    folder.mkdir(parents=True)
    shutil.copy(SRC / "toolkit" / "decide.py", folder / "decide.py")
    write(
        folder / "README.md",
        """
# AI Governance Toolkit

`decide.py` checks one decision record. The decision word is ALLOW, QUARANTINE, or DENY. QUARANTINE and DENY also need uncertainty and a follow-up.

```
python decide.py self-test
python decide.py example allow > allow.json
python decide.py check allow.json
```

The examples in this folder already pass. Edit a copy for a real workflow.
""",
    )
    write(folder / "LICENSE.txt", LICENSE)
    for kind in ("allow", "quarantine", "deny"):
        result = subprocess.run(
            [sys.executable, "decide.py", "example", kind],
            cwd=folder,
            text=True,
            capture_output=True,
            check=True,
        )
        (folder / f"example-{kind}.json").write_text(result.stdout, encoding="utf-8")
    run([sys.executable, "decide.py", "self-test"], folder)
    run([sys.executable, "decide.py", "check", "example-deny.json"], folder)


def stage_hydra(build: Path) -> None:
    folder = build / "hydra-agent-templates"
    folder.mkdir(parents=True)
    shutil.copy(SRC / "hydra" / "hydra_packet.py", folder / "hydra_packet.py")
    write(
        folder / "README.md",
        """
# HYDRA role packet

Six roles from the SCBE swarm: KO Scout, AV Vision, RU Reader, CA Clicker, UM Typer, DR Judge.

This zip is the packet builder. It does not include a browser agent and it is not a license for the MIT repository. The repository stays free at https://github.com/issdandavis/SCBE-AETHERMOORE

```
python hydra_packet.py self-test
python hydra_packet.py "Check that the shop download matches its manual."
```

The printed JSON leaves `decision` empty. Fill ALLOW, QUARANTINE, or DENY yourself, then check that record with the governance toolkit if you have it.
""",
    )
    write(folder / "LICENSE.txt", LICENSE)
    result = subprocess.run(
        [sys.executable, "hydra_packet.py", "Check that the shop download matches its manual."],
        cwd=folder,
        text=True,
        capture_output=True,
        check=True,
    )
    (folder / "example-packet.json").write_text(result.stdout, encoding="utf-8")
    run([sys.executable, "hydra_packet.py", "self-test"], folder)


def stage_n8n(build: Path) -> None:
    folder = build / "n8n-workflow-pack"
    flow = folder / "workflows"
    flow.mkdir(parents=True)
    workflow = json.loads((SRC / "n8n" / "SCBE_Decision_Check.workflow.json").read_text(encoding="utf-8"))
    names = {node["name"] for node in workflow["nodes"]}
    for source, links in workflow["connections"].items():
        if source not in names:
            raise SystemExit(f"n8n connection source missing: {source}")
        for group in links["main"]:
            for link in group:
                if link["node"] not in names:
                    raise SystemExit(f"n8n connection target missing: {link['node']}")
    (flow / "SCBE_Decision_Check.workflow.json").write_text(json.dumps(workflow, indent=2) + "\n", encoding="utf-8")
    write(
        folder / "README.md",
        """
# n8n Workflow Pack

Import `workflows/SCBE_Decision_Check.workflow.json`.

The webhook path is `scbe-decision`. The code node accepts a JSON body whose `decision` is ALLOW, QUARANTINE, or DENY and whose `rationale` is non-empty. A good record gets HTTP 200. Anything else gets HTTP 400.

No API key is required. Activate the workflow, then:

```
curl -s -X POST "$WEBHOOK_URL" -H "content-type: application/json" -d "{\\"decision\\":\\"QUARANTINE\\",\\"rationale\\":\\"The file has not been opened.\\",\\"workflow\\":\\"shop\\",\\"owner\\":\\"buyer\\"}"
```

Replace WEBHOOK_URL with the URL n8n shows for this node. The workflow ships inactive.
""",
    )
    write(
        folder / "validation-checklist.md",
        """
# Validation

- Import SCBE_Decision_Check.workflow.json
- Confirm the workflow is inactive until you choose to turn it on
- POST one QUARANTINE record and receive HTTP 200
- POST `{"decision":"MAYBE"}` and receive HTTP 400
""",
    )
    write(folder / "LICENSE.txt", LICENSE)


def stage_spin(build: Path) -> None:
    folder = build / "content-spin-engine"
    folder.mkdir(parents=True)
    shutil.copy(SRC / "spin" / "spin.py", folder / "spin.py")
    write(
        folder / "sample-source.md",
        """
The shop lists six downloads.
Each download has a self-test.
Books stay on Amazon.
""",
    )
    write(
        folder / "README.md",
        """
# Content Spin Engine

`spin.py` copies one source note into a site draft, a short draft, and an email draft. It does not add a claim.

```
python spin.py self-test
python spin.py sample-source.md https://aethermoore.com/shop.html
```

Drafts land in `spin-out/` next to the source, with `output-tracker.csv`.
""",
    )
    write(folder / "LICENSE.txt", LICENSE)
    run([sys.executable, "spin.py", "self-test"], folder)
    run([sys.executable, "spin.py", "sample-source.md", "https://aethermoore.com/shop.html"], folder)


def stage_vault(build: Path) -> None:
    folder = build / "training-vault"
    folder.mkdir(parents=True)
    shutil.copy(SRC / "vault" / "validate_sft.py", folder / "validate_sft.py")
    shutil.copy(SRC / "vault" / "governance_starter.jsonl", folder / "governance_starter.jsonl")
    count = sum(1 for line in (folder / "governance_starter.jsonl").read_text(encoding="utf-8").splitlines() if line.strip())
    write(
        folder / "README.md",
        f"""
# AI Security Training Vault

This vault is a starter, not the public corpus.

- `governance_starter.jsonl` has {count} prompt/response rows about the decision words, the six roles, and these packs.
- `validate_sft.py` checks that every row has a non-empty prompt and response.

```
python validate_sft.py self-test
python validate_sft.py governance_starter.jsonl
```

The large SCBE training set is public and MIT licensed at https://huggingface.co/datasets/issdandavis/scbe-aethermoore-training-data
This zip does not contain that set.
""",
    )
    write(folder / "LICENSE.txt", LICENSE)
    run([sys.executable, "validate_sft.py", "self-test"], folder)
    run([sys.executable, "validate_sft.py", "governance_starter.jsonl"], folder)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=("benchmark",), help="Build only the benchmark release and its previews")
    args = parser.parse_args()
    attacks, benign = load_benchmark_corpus()
    attacks = clean_attacks(attacks)
    manifest_path = ROOT / "PACK_MANIFEST.json"
    stats = json.loads(manifest_path.read_text(encoding="utf-8")) if args.only and manifest_path.exists() else {}
    with tempfile.TemporaryDirectory(prefix="aethermoore-packs-") as temp:
        build = Path(temp)
        stats.update(stage_benchmark(build, attacks, benign))
        mapping = {"benchmark_kit": ROOT / "benchmark-kit.zip"}
        if not args.only:
            stage_toolkit(build)
            stage_hydra(build)
            stage_n8n(build)
            stage_spin(build)
            stats["vault_rows"] = stage_vault(build)
            mapping.update({
                "ai-governance-toolkit": ROOT / "ai-governance-toolkit.zip",
                "hydra-agent-templates": ROOT / "hydra-agent-templates.zip",
                "n8n-workflow-pack": ROOT / "n8n-workflow-pack.zip",
                "content-spin-engine": ROOT / "content-spin-engine.zip",
                "training-vault": ROOT / "training-vault.zip",
            })
        for folder_name, dest in mapping.items():
            zip_dir(build / folder_name, dest)
            print(f"{dest.name} {dest.stat().st_size} bytes")
    stats["benchmark_zip_sha256"] = hashlib.sha256((ROOT / "benchmark-kit.zip").read_bytes()).hexdigest()
    (ROOT / "PACK_MANIFEST.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print("manifest written")


if __name__ == "__main__":
    main()

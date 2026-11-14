#!/usr/bin/env python3
"""Review or compare Benchmark Kit v2 reports without an API or dependencies.

    python report.py run.json --html report.html
    python report.py baseline.json candidate.json --html compare.html --out compare.json

Comparison requires matching corpus, selected cases, and scoring fingerprints.
Any failed requests prevent numerical comparison. All model text is escaped.
"""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

from benchmark import REPORT_SCHEMA, band_for, corpus_identity, fingerprint, summarize


def esc(value):
    return html.escape(str(value), quote=True)


def percent(value):
    return "not scored" if value is None else "%.1f%%" % (value * 100)


def validate_report(report):
    if not isinstance(report, dict) or report.get("report_schema") != REPORT_SCHEMA:
        raise ValueError("Expected a Benchmark Kit v2 report; older reports must be rerun with v2")
    if not isinstance(report.get("scoring_version"), str) or not report["scoring_version"].strip():
        raise ValueError("Report is missing a non-empty scoring_version")
    for field in ("corpus_sha256", "selection_sha256", "scoring_sha256", "config_sha256"):
        value = report.get(field)
        if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise ValueError("Report is missing a valid " + field)
    if not isinstance(report.get("config"), dict) or fingerprint(report["config"]) != report["config_sha256"]:
        raise ValueError("Report configuration fingerprint does not match")
    coverage = report.get("coverage")
    if not isinstance(coverage, dict) or not isinstance(report.get("synthetic"), bool):
        raise ValueError("Report is missing coverage or synthetic status")
    rows = report.get("results")
    if not isinstance(rows, list) or not rows:
        raise ValueError("Report has no evidence rows")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or any(
            not isinstance(row.get(k), str) for k in ("id", "class", "prompt", "reply")
        ):
            raise ValueError("Evidence rows require text id, class, prompt, and reply")
        if not isinstance(row.get("attack"), bool) or row.get("status") not in ("refused", "answered", "error"):
            raise ValueError("Evidence row has an invalid kind or status")
        if row["status"] != "error" and not row["reply"].strip():
            raise ValueError("A scored evidence row has an empty reply")
        key = (row["attack"], row["class"], row["id"])
        if key in seen:
            raise ValueError("Duplicate evidence id: " + row["id"])
        seen.add(key)
    if fingerprint(corpus_identity(rows)) != report["selection_sha256"]:
        raise ValueError("Evidence rows do not match the selected-case fingerprint")
    stats = summarize(rows)
    for field in ("request_errors", "false_positives", "detection_rate", "false_positive_rate", "per_class"):
        if report.get(field) != stats[field]:
            raise ValueError("Report summary does not match evidence rows: " + field)
    for name in ("attacks_available", "benign_available", "attacks_selected", "benign_selected",
                 "attacks_scored", "benign_scored"):
        if type(coverage.get(name)) is not int or coverage[name] < 0:
            raise ValueError("Coverage counts must be non-negative integers")
    for name, actual in (
        ("attacks_selected", sum(r["attack"] for r in rows)),
        ("benign_selected", sum(not r["attack"] for r in rows)),
        ("attacks_scored", stats["attack_scored"]), ("benign_scored", stats["benign_scored"]),
    ):
        if coverage[name] != actual:
            raise ValueError("Coverage does not match evidence rows: " + name)
    if any(coverage[k + "_selected"] > coverage[k + "_available"] for k in ("attacks", "benign")):
        raise ValueError("Selected coverage exceeds available corpus")
    full_corpus = all(coverage[k + "_selected"] == coverage[k + "_available"] for k in ("attacks", "benign"))
    if coverage.get("full_corpus") is not full_corpus or coverage.get("requests_complete") is not (not stats["request_errors"]):
        raise ValueError("Coverage state does not match evidence rows")
    if full_corpus and report["corpus_sha256"] != report["selection_sha256"]:
        raise ValueError("Full-corpus report has different corpus and selection fingerprints")
    eligible = full_corpus and not stats["request_errors"] and bool(stats["attack_scored"] and stats["benign_scored"])
    expected_band = band_for(stats["detection_rate"] or 0, stats["false_positive_rate"] or 0,
                             stats["request_errors"], complete=eligible, synthetic=report["synthetic"])
    if (report.get("band"), report.get("band_name")) != expected_band:
        raise ValueError("Band does not match the evidence and coverage")
    if not isinstance(report.get("system"), str) or not isinstance(report.get("recommendations"), list):
        raise ValueError("Report is missing its display name or review notes")
    return report


def compare_reports(baseline, candidate):
    validate_report(baseline)
    validate_report(candidate)
    reasons = []
    for field, label in (
        ("corpus_sha256", "corpus"), ("selection_sha256", "selected cases"),
        ("scoring_sha256", "scoring rules"), ("scoring_version", "scoring version"),
    ):
        if baseline.get(field) != candidate.get(field):
            reasons.append("Different " + label)
    if baseline["synthetic"] != candidate["synthetic"]:
        reasons.append("A synthetic demo cannot be compared with a measured run")
    if baseline["request_errors"] or candidate["request_errors"]:
        reasons.append("One or both runs have failed requests; rerun before calculating differences")
    output = {
        "comparison_schema": "aethermoore-benchmark-comparison/v1", "comparable": not reasons,
        "reasons": reasons, "synthetic": baseline["synthetic"] or candidate["synthetic"],
        "baseline": {k: baseline.get(k) for k in ("system", "timestamp", "band_name", "config", "coverage")},
        "candidate": {k: candidate.get(k) for k in ("system", "timestamp", "band_name", "config", "coverage")},
        "corpus_sha256": baseline["corpus_sha256"], "selection_sha256": baseline["selection_sha256"],
        "scoring_sha256": baseline["scoring_sha256"],
        "interpretation": "Changes are refusal-phrase observations, not verified improvements in safety. Review the evidence.",
    }
    if reasons:
        return output
    output["metrics"] = {}
    for field in ("detection_rate", "false_positive_rate"):
        before, after = baseline[field], candidate[field]
        output["metrics"][field] = {
            "baseline": before, "candidate": after,
            "delta_percentage_points": (after - before) * 100 if before is not None and after is not None else None,
        }
    output["per_class"] = []
    for name, before in sorted(baseline["per_class"].items()):
        after = candidate["per_class"][name]
        output["per_class"].append({
            "class": name, "baseline": before["rate"], "candidate": after["rate"],
            "delta_percentage_points": (after["rate"] - before["rate"]) * 100
            if before["rate"] is not None and after["rate"] is not None else None,
        })
    prior = {(row["attack"], row["class"], row["id"]): row for row in baseline["results"]}
    changes = []
    changed_cases = []
    for row in candidate["results"]:
        before = prior[(row["attack"], row["class"], row["id"])]
        status_changed = before["status"] != row["status"]
        reply_changed = before["reply"] != row["reply"]
        if status_changed or reply_changed:
            change = {
                "id": row["id"], "class": row["class"], "attack": row["attack"], "prompt": row["prompt"],
                "baseline_status": before["status"], "candidate_status": row["status"],
                "baseline_reply": before["reply"], "candidate_reply": row["reply"],
            }
            changed_cases.append(dict(change, status_changed=status_changed, reply_changed=reply_changed))
            if status_changed:
                changes.append(change)
    output["status_changes"] = changes
    output["reply_changes"] = sum(row["reply_changed"] for row in changed_cases)
    output["changed_cases"] = changed_cases
    return output


STYLE = """
:root{color-scheme:light;--ink:#172a30;--muted:#536871;--line:#cbd6d8;--accent:#116856;--paper:#f4f7f7}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:44px 24px 64px}header{border-bottom:2px solid var(--ink);padding-bottom:24px}
.eyebrow{letter-spacing:.13em;text-transform:uppercase;font-size:.78rem;color:var(--accent);font-weight:700}
h1{font-size:clamp(2rem,5vw,3rem);line-height:1.12;letter-spacing:-.03em;margin:14px 0}h2{margin:36px 0 12px;font-size:1.4rem}
h3{font-size:1rem;margin:16px 0 6px}p{max-width:85ch}a{color:var(--accent)}.muted,small{color:var(--muted)}
.notice{border-left:4px solid #b57019;background:#fff4df;padding:14px 18px;margin:24px 0}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}
.metric{background:white;border:1px solid var(--line);border-radius:8px;padding:18px}.metric strong{display:block;font-size:1.9rem;line-height:1.25}
.scroll{overflow:auto}table{border-collapse:collapse;width:100%;background:white;font-size:.94rem}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{background:#e4eeee}details{margin:10px 0;background:white;border:1px solid var(--line);border-radius:6px;padding:14px 16px}
summary{cursor:pointer;font-weight:600}pre{font:.87rem/1.55 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f4f4;padding:14px;border-radius:4px}
code{overflow-wrap:anywhere}dt{font-weight:700}dd{margin:2px 0 14px;overflow-wrap:anywhere}.status{font:.8rem ui-monospace,monospace;background:#eaf0ef;padding:3px 7px;border-radius:4px}
footer{border-top:1px solid var(--line);margin-top:40px;padding-top:16px;font-size:.85rem;color:var(--muted)}
@media print{body{background:white}main{padding:0}details{break-inside:avoid}summary{list-style:none}.notice{border:1px solid #777}}
"""


def page(title, content):
    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        "style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'\">"
        '<title>%s</title><style>%s</style></head><body><main>%s'
        '<footer>AetherMoore · AI Security Benchmark Kit v2 · Generated locally. '
        'No external assets or analytics.</footer></main></body></html>\n'
    ) % (esc(title), STYLE, content)


def table(headers, rows):
    return (
        '<div class="scroll"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>'
        % ("".join("<th>%s</th>" % esc(h) for h in headers),
           "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % esc(v) for v in row) for row in rows))
    )


def metadata(report):
    config = report["config"]
    items = [
        ("Model", config.get("model")), ("Endpoint", config.get("target")),
        ("Recorded", report.get("timestamp")), ("Kit / scoring", "%s / %s" % (
            report.get("kit_version"), report.get("scoring_version"))),
        ("Corpus SHA-256", report["corpus_sha256"]), ("Selection SHA-256", report["selection_sha256"]),
        ("Config SHA-256", report["config_sha256"]), ("System instruction SHA-256", config.get("system_sha256")),
    ]
    return '<details><summary>Run settings and fingerprints</summary><dl>%s</dl></details>' % "".join(
        "<dt>%s</dt><dd><code>%s</code></dd>" % (esc(k), esc(v)) for k, v in items
    )


def render_report(report):
    validate_report(report)
    coverage = report["coverage"]
    content = (
        '<header><div class="eyebrow">AetherMoore / Evidence report</div><h1>%s</h1>'
        '<p>Review the replies behind the numbers.</p></header>'
    ) % esc(report["system"])
    if report["synthetic"]:
        content += (
            '<div class="notice"><strong>Synthetic demo — not a measured result.</strong> '
            'No model was contacted. These replies only demonstrate the report.</div>'
        )
    content += '<p><strong>Run status: %s.</strong> A band is a label for this file, not a security certification.</p>' % esc(report["band_name"])
    content += '<div class="metrics">' + "".join(
        '<div class="metric"><span class="muted">%s</span><strong>%s</strong></div>' % (esc(k), esc(v))
        for k, v in [
            ("Attack refusal phrases", percent(report["detection_rate"])),
            ("Benign refusal phrases", percent(report["false_positive_rate"])),
            ("Replies scored", "%d / %d" % (len(report["results"]) - report["request_errors"], len(report["results"]))),
            ("Request errors", report["request_errors"]),
        ]
    ) + "</div>"
    content += "<p>Selected %s of %s attack prompts and %s of %s benign prompts. %s</p>" % (
        esc(coverage["attacks_selected"]), esc(coverage["attacks_available"]),
        esc(coverage["benign_selected"]), esc(coverage["benign_available"]),
        "Full corpus selected." if coverage["full_corpus"] else "Subset only; no full-corpus band.",
    )
    content += (
        '<div class="notice"><strong>How to read this:</strong> “Refused” means a phrase matched. '
        'A refusal followed by unsafe content can still match. “Answered” can be harmless. '
        'Review both groups; errors are neither blocks nor bypasses.</div>'
    )
    content += "<h2>Review notes</h2><ul>%s</ul>" % "".join("<li>%s</li>" % esc(s) for s in report["recommendations"])
    content += metadata(report) + "<h2>Attack classes</h2>"
    content += table(
        ("Class", "Refusal phrases", "Scored", "Errors", "Rate"),
        [(name, bucket["refused"], bucket["total"], bucket["errors"], percent(bucket["rate"]))
         for name, bucket in sorted(report["per_class"].items())],
    )
    content += '<h2>Full evidence</h2><p class="muted">Expand a row to read the complete prompt and reply. No reply is truncated.</p>'
    for group, label in (("error", "Errors"), ("answered", "Answered"), ("refused", "Refusal phrases")):
        group_rows = [r for r in report["results"] if r["status"] == group]
        content += "<h3>%s · %d</h3>" % (label, len(group_rows))
        for row in group_rows:
            content += (
                '<details><summary>%s · %s · %s <span class="status">%s</span></summary>'
                '<h3>Prompt</h3><pre>%s</pre><h3>Reply</h3><pre>%s</pre>%s</details>'
            ) % (
                esc(row["id"]), "attack" if row["attack"] else "benign", esc(row["class"]), esc(row["status"]),
                esc(row["prompt"]), esc(row["reply"] or "(No valid reply)"),
                "<h3>Error</h3><pre>%s</pre>" % esc(row.get("error")) if row.get("error") else "",
            )
    return page("Benchmark review — " + report["system"], content)


def delta(value):
    return "not scored" if value is None else "%+.2f pp" % value


def render_comparison(comparison):
    content = (
        '<header><div class="eyebrow">AetherMoore / Run comparison</div><h1>What changed?</h1><p>%s → %s</p></header>'
    ) % (esc(comparison["baseline"]["system"]), esc(comparison["candidate"]["system"]))
    if comparison["synthetic"]:
        content += '<div class="notice"><strong>Synthetic demonstration.</strong> These are not measured model results.</div>'
    if not comparison["comparable"]:
        content += "<h2>Not comparable</h2><p>No numerical differences or per-case changes are calculated.</p><ul>%s</ul>" % "".join(
            "<li>%s</li>" % esc(s) for s in comparison["reasons"]
        )
        return page("Benchmark comparison — not comparable", content)
    content += '<div class="notice">%s</div>' % esc(comparison["interpretation"])
    content += "<p>Corpus, selected cases, and scoring rules match; neither run has request errors. %s</p>" % (
        "Both runs selected the full corpus." if comparison["baseline"]["coverage"]["full_corpus"]
        else "This is a comparison of the same subset only."
    )
    rows = []
    for field, label in (("detection_rate", "Attack refusal phrases"), ("false_positive_rate", "Benign refusal phrases")):
        metric = comparison["metrics"][field]
        rows.append((label, percent(metric["baseline"]), percent(metric["candidate"]), delta(metric["delta_percentage_points"])))
    content += table(("Observation", "Baseline", "Candidate", "Change"), rows)
    content += "<h2>Run settings</h2>" + table(
        ("Setting", "Baseline", "Candidate"),
        [(key, comparison["baseline"]["config"].get(key), comparison["candidate"]["config"].get(key))
         for key in ("model", "target", "system_sha256", "temperature")],
    )
    content += "<h2>By attack class</h2>" + table(
        ("Class", "Baseline", "Candidate", "Change"),
        [(r["class"], percent(r["baseline"]), percent(r["candidate"]), delta(r["delta_percentage_points"]))
         for r in comparison["per_class"]],
    )
    changed_cases = comparison.get("changed_cases", comparison["status_changes"])
    content += (
        "<h2>Changed cases · %d</h2><p>%d replies and %d phrase classifications changed. "
        "Each row below shows a changed reply, a changed classification, or both. "
        "A reply can change meaning while keeping the same phrase classification; read the full evidence.</p>"
    ) % (len(changed_cases), comparison["reply_changes"], len(comparison["status_changes"]))
    for row in changed_cases:
        status_changed = row.get("status_changed", row["baseline_status"] != row["candidate_status"])
        change_label = "Classification changed" if status_changed else "Reply changed; classification unchanged"
        content += (
            "<details><summary>%s · %s · %s · %s</summary><p>%s → %s</p><h3>Prompt</h3><pre>%s</pre>"
            "<h3>Baseline reply</h3><pre>%s</pre><h3>Candidate reply</h3><pre>%s</pre></details>"
        ) % tuple(esc(v) for v in (
            row["id"], row["class"], "attack" if row["attack"] else "benign", change_label,
            row["baseline_status"], row["candidate_status"],
            row["prompt"], row["baseline_reply"], row["candidate_reply"],
        ))
    return page("Benchmark run comparison", content)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("reports", nargs="+", help="One report to review, or baseline then candidate")
    parser.add_argument("--html", help="HTML output (default: benchmark-review.html or benchmark-comparison.html)")
    parser.add_argument("--out", help="Also write review/comparison JSON")
    args = parser.parse_args(argv)
    if len(args.reports) not in (1, 2):
        parser.error("provide one report, or baseline and candidate")
    html_path = args.html or ("benchmark-review.html" if len(args.reports) == 1 else "benchmark-comparison.html")
    inputs = {Path(p).resolve() for p in args.reports}
    outputs = [Path(html_path).resolve()] + ([Path(args.out).resolve()] if args.out else [])
    if any(p in inputs for p in outputs) or len(set(outputs)) != len(outputs):
        parser.error("output paths must be distinct and must not overwrite input reports")
    try:
        reports = [validate_report(json.loads(Path(p).read_text(encoding="utf-8"))) for p in args.reports]
        result = reports[0] if len(reports) == 1 else compare_reports(*reports)
        markup = render_report(result) if len(reports) == 1 else render_comparison(result)
        Path(html_path).write_text(markup, encoding="utf-8")
        if args.out:
            Path(args.out).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.error(str(exc))
    print("Written " + html_path)
    if len(reports) == 2 and not result["comparable"]:
        print("Not comparable: " + "; ".join(result["reasons"]))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

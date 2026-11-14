"""Keep authentication examples visibly nonfunctional in the shipped corpus."""

import json
import re
import unittest
from pathlib import Path


class CorpusFixtureTests(unittest.TestCase):
    def test_credentials_are_placeholders(self):
        source = Path(__file__).resolve().parents[1] / "src" / "benchmark"
        credential_shapes = re.compile(
            r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|Bearer [A-Za-z0-9_./+-]{15,}"
        )
        for filename in ("attack_corpus.jsonl", "benign_prompts.jsonl"):
            for line in (source / filename).read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                with self.subTest(file=filename, case=row["id"]):
                    self.assertFalse(
                        credential_shapes.search(row["prompt"]) is not None,
                        "Use an explicit nonfunctional placeholder in authentication examples",
                    )


if __name__ == "__main__":
    unittest.main()

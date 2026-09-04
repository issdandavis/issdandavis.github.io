(function () {
  "use strict";

  if (typeof TONGUES !== "object" || typeof DARPA_DATA !== "object") return;

  function replaceExact(items, from, to) {
    items.forEach(function (item) {
      if (item.subtitle === from) item.subtitle = to;
      if (item.desc === from) item.desc = to;
      if (item.control === from) item.control = to;
      if (item.results) {
        item.results.forEach(function (result) {
          if (result.text === from) result.text = to;
        });
      }
    });
  }

  var entries = [];
  Object.keys(TONGUES).forEach(function (key) {
    entries = entries.concat(TONGUES[key].entries);
  });
  entries = entries.concat(DARPA_DATA.entries);

  entries.forEach(function (entry) {
    if (entry.status === "proven") entry.status = "tested";
  });

  replaceExact(entries, "Military-grade security architecture", "14-layer research architecture");
  replaceExact(entries, "Detection works on attacks invisible to traditional classifiers", "Detection was observed on the stated project attack set");
  replaceExact(entries, "<strong>0%</strong> false positives — zero benign inputs flagged", "No false positives were observed in the stated project control set");
  replaceExact(entries, "DeBERTa PromptGuard achieves 76.7% detection but misses tongue manipulation entirely.", "Archived project comparator result; verify corpus and configuration before drawing a model comparison.");
  replaceExact(entries, "Optimal resistance to incremental exploitation", "Designed to resist incremental exploitation; broader validation is pending");
  replaceExact(entries, "Superexponential cost scaling verified", "Superexponential score growth follows from the selected formula");
  replaceExact(entries, "DeBERTa achieves similar detection but 32% adaptive evasion. SCBE makes bad inputs expensive.", "Archived project comparison; not independently replicated.");
  replaceExact(entries, "Competitive with DeBERTa", "Archived project comparison; see evidence ledger");
  replaceExact(entries, "Projected <strong>Level 12</strong> with upgrade", "Planned follow-up experiment");
  replaceExact(entries, "Formal verification across all axioms", "Project-authored checks mapped to the listed axioms");

  if (typeof window.openEntry === "function") {
    var openEntryOriginal = window.openEntry;
    window.openEntry = function () {
      openEntryOriginal.apply(this, arguments);
      var scroll = document.getElementById("codexScroll");
      if (!scroll || scroll.querySelector("[data-scope-note]")) return;
      var note = document.createElement("div");
      note.setAttribute("data-scope-note", "true");
      note.style.cssText = "margin:0 0 18px;padding:12px 14px;border:1px solid rgba(240,191,103,.28);border-radius:8px;background:rgba(240,191,103,.06);color:#c8c2b5;font-size:12px;line-height:1.55";
      note.textContent = "Evidence scope: status labels mean tested within this project unless a linked source says otherwise. They do not imply independent replication, certification, or performance on a new deployment.";
      scroll.insertBefore(note, scroll.firstChild);
    };
  }
})();

(function attachCaptionUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ClayCaptionUtils = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function captionFactory() {
  "use strict";

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");
  }

  function decodeEntities(value) {
    return String(value)
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function cleanCueText(value) {
    return decodeEntities(
      String(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?[^>]+>/g, ""),
    ).trim();
  }

  function parseTimestamp(value) {
    const cleaned = String(value ?? "")
      .trim()
      .replace(",", ".")
      .replace(/[^\d:.].*$/, "");
    const parts = cleaned.split(":");
    if (parts.length < 2 || parts.length > 3) {
      throw new Error(`Invalid timestamp: ${value}`);
    }
    const seconds = Number(parts.pop());
    const minutes = Number(parts.pop());
    const hours = parts.length ? Number(parts.pop()) : 0;
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds) ||
      hours < 0 ||
      minutes < 0 ||
      minutes >= 60 ||
      seconds < 0 ||
      seconds >= 60
    ) {
      throw new Error(`Invalid timestamp: ${value}`);
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  function formatTimestamp(value, decimal = ".") {
    const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000));
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const milliseconds = totalMs % 1000;
    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0") +
      decimal +
      String(milliseconds).padStart(3, "0")
    );
  }

  function cueFromTiming(line, id, textLines) {
    const match = String(line).match(
      /^\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s+-->\s+(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})(?:\s+.*)?$/,
    );
    if (!match) return null;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (end < start) return null;
    return {
      id: String(id || ""),
      start,
      end,
      text: cleanCueText(textLines.join("\n")),
    };
  }

  function parseTimedText(value) {
    const lines = normalizeText(value).split("\n");
    const cues = [];
    let index = 0;

    if (lines[0]?.trim().startsWith("WEBVTT")) {
      index += 1;
      while (index < lines.length && lines[index].trim()) index += 1;
    }

    while (index < lines.length) {
      while (index < lines.length && !lines[index].trim()) index += 1;
      if (index >= lines.length) break;

      const directive = lines[index].trim();
      if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(directive)) {
        index += 1;
        while (index < lines.length && lines[index].trim()) index += 1;
        continue;
      }

      let id = "";
      let timing = lines[index].trim();
      if (!timing.includes("-->")) {
        id = timing;
        index += 1;
        timing = lines[index]?.trim() || "";
      }
      if (!timing.includes("-->")) {
        index += 1;
        continue;
      }

      index += 1;
      const textLines = [];
      while (index < lines.length && lines[index].trim()) {
        textLines.push(lines[index]);
        index += 1;
      }
      const cue = cueFromTiming(timing, id || cues.length + 1, textLines);
      if (cue && cue.text) cues.push(cue);
    }
    return cues;
  }

  function parseJson(value) {
    const parsed = JSON.parse(value);
    const source = Array.isArray(parsed) ? parsed : parsed.cues;
    if (!Array.isArray(source)) {
      throw new Error("Caption JSON must be an array or contain a cues array.");
    }
    return source
      .map((cue, index) => {
        const start = Number(cue.start);
        const end = Number(cue.end);
        const text = cleanCueText(cue.text);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end < start ||
          !text
        ) {
          return null;
        }
        return {
          id: String(cue.id ?? index + 1),
          start,
          end,
          text,
        };
      })
      .filter(Boolean);
  }

  function parsePlainText(value) {
    return normalizeText(value)
      .split(/\n{2,}/)
      .map((text) => cleanCueText(text))
      .filter(Boolean)
      .map((text, index) => ({
        id: String(index + 1),
        start: index * 5,
        end: index * 5 + 5,
        text,
      }));
  }

  function parseCaption(value, filename = "") {
    const text = normalizeText(value);
    const lower = String(filename).toLowerCase();
    let cues;
    let format;

    if (lower.endsWith(".json") || text.trim().startsWith("[")) {
      cues = parseJson(text);
      format = "json";
    } else if (
      lower.endsWith(".vtt") ||
      text.trimStart().startsWith("WEBVTT")
    ) {
      cues = parseTimedText(text);
      format = "vtt";
    } else if (
      lower.endsWith(".srt") ||
      /^\s*\d+\s*\n\s*\d{1,2}:\d{2}/.test(text)
    ) {
      cues = parseTimedText(text);
      format = "srt";
    } else {
      cues = parsePlainText(text);
      format = "txt";
    }

    if (!cues.length) {
      throw new Error("No caption cues were found.");
    }
    return { cues, format };
  }

  function normalizeCues(cues) {
    return [...cues]
      .map((cue, index) => ({
        id: String(cue.id || index + 1),
        start: Math.max(0, Number(cue.start || 0)),
        end: Math.max(Number(cue.start || 0), Number(cue.end || 0)),
        text: cleanCueText(cue.text),
      }))
      .filter((cue) => cue.text)
      .sort((left, right) => left.start - right.start || left.end - right.end);
  }

  function toVtt(cues) {
    const body = normalizeCues(cues)
      .map(
        (cue) =>
          `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`,
      )
      .join("\n\n");
    return `WEBVTT\n\n${body}\n`;
  }

  function toSrt(cues) {
    return (
      normalizeCues(cues)
        .map(
          (cue, index) =>
            `${index + 1}\n${formatTimestamp(cue.start, ",")} --> ${formatTimestamp(
              cue.end,
              ",",
            )}\n${cue.text}`,
        )
        .join("\n\n") + "\n"
    );
  }

  function toPlainText(cues) {
    return normalizeCues(cues)
      .map((cue) => cue.text)
      .join("\n\n");
  }

  function toJson(cues) {
    return JSON.stringify({ cues: normalizeCues(cues) }, null, 2) + "\n";
  }

  function serialize(cues, format) {
    if (format === "srt") return toSrt(cues);
    if (format === "txt") return toPlainText(cues);
    if (format === "json") return toJson(cues);
    return toVtt(cues);
  }

  function safeBasename(value, fallback = "transcript") {
    const cleaned = String(value || "")
      .trim()
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return cleaned || fallback;
  }

  return {
    cleanCueText,
    formatTimestamp,
    normalizeCues,
    parseCaption,
    parseTimestamp,
    safeBasename,
    serialize,
    toJson,
    toPlainText,
    toSrt,
    toVtt,
  };
});

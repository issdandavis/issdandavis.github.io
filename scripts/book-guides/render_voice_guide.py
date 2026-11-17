#!/usr/bin/env python3
"""Render and verify a voice guide from the Final narration section of Markdown."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def extract_narration(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    match = re.search(r"^## Final narration\s*$([\s\S]*?)(?=^##\s|\Z)", source, re.MULTILINE)
    if not match:
        raise ValueError(f"{path} has no '## Final narration' section")

    text = match.group(1).strip()
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`]", "", text)
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def synthesize(text: str, voice: str, rate: str, pitch: str, volume: str, target: Path) -> None:
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError("edge-tts is required: python -m pip install edge-tts") from exc

    communicator = edge_tts.Communicate(
        text,
        voice,
        rate=rate,
        pitch=pitch,
        volume=volume,
        boundary="SentenceBoundary",
    )
    await communicator.save(str(target))


def narration_chunks(text: str, target_chars: int = 720) -> list[str]:
    """Keep TTS requests bounded while preserving paragraph-level pauses."""
    chunks: list[str] = []
    current = ""
    for paragraph in (part.strip() for part in text.split("\n\n")):
        if not paragraph:
            continue
        candidate = f"{current}\n\n{paragraph}".strip()
        if current and len(candidate) > target_chars:
            chunks.append(current)
            current = paragraph
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


async def synthesize_chunks(
    chunks: list[str], voice: str, rate: str, pitch: str, volume: str, directory: Path
) -> list[Path]:
    semaphore = asyncio.Semaphore(3)

    async def render(index: int, chunk: str) -> Path:
        path = directory / f"segment-{index:02d}.mp3"
        async with semaphore:
            await synthesize(chunk, voice, rate, pitch, volume, path)
        return path

    return list(await asyncio.gather(*(render(index, chunk) for index, chunk in enumerate(chunks, start=1))))


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=300)


def synthesize_windows(text: str, voice: str, directory: Path) -> Path:
    """Offline fallback for Windows hosts when the neural service is unavailable."""
    text_path = directory / "narration.txt"
    audio_path = directory / "windows-voice.wav"
    script_path = directory / "synthesize.ps1"
    text_path.write_text(text, encoding="utf-8")
    script_path.write_text(
        "\n".join(
            [
                "param([string]$TextPath, [string]$AudioPath, [string]$Voice)",
                "Add-Type -AssemblyName System.Speech",
                "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
                "$synth.SelectVoice($Voice)",
                "$synth.Rate = -1",
                "$synth.Volume = 100",
                "$synth.SetOutputToWaveFile($AudioPath)",
                "$synth.Speak([System.IO.File]::ReadAllText($TextPath))",
                "$synth.Dispose()",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    run(
        [
            "powershell",
            "-NoProfile",
            "-File",
            str(script_path),
            "-TextPath",
            str(text_path),
            "-AudioPath",
            str(audio_path),
            "-Voice",
            voice,
        ]
    )
    return audio_path


def duration_seconds(path: Path) -> float:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    return round(float(result.stdout.strip()), 3)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--voice", default="en-US-AndrewMultilingualNeural")
    parser.add_argument("--backend", choices=["auto", "edge", "windows"], default="auto")
    parser.add_argument("--windows-voice", default="Microsoft Mark")
    parser.add_argument("--rate", default="-7%")
    parser.add_argument("--pitch", default="-2Hz")
    parser.add_argument("--volume", default="+0%")
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise RuntimeError("ffmpeg and ffprobe must be on PATH")

    script = args.script.resolve()
    output = args.output.resolve()
    receipt = args.receipt.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    receipt.parent.mkdir(parents=True, exist_ok=True)

    narration = extract_narration(script)
    word_count = len(re.findall(r"\b[\w’'-]+\b", narration))
    chunks = narration_chunks(narration)

    with tempfile.TemporaryDirectory(prefix="book_guide_") as temp_dir:
        temp_root = Path(temp_dir)
        backend_used = args.backend
        raw_audio: Path
        if args.backend == "windows":
            raw_audio = synthesize_windows(narration, args.windows_voice, temp_root)
        else:
            try:
                segment_paths = asyncio.run(
                    synthesize_chunks(chunks, args.voice, args.rate, args.pitch, args.volume, temp_root)
                )
                concat_list = temp_root / "segments.txt"
                concat_list.write_text(
                    "".join(f"file '{path.as_posix()}'\n" for path in segment_paths),
                    encoding="utf-8",
                )
                raw_audio = temp_root / "raw.mp3"
                run(
                    [
                        "ffmpeg",
                        "-y",
                        "-v",
                        "error",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        str(concat_list),
                        "-codec:a",
                        "copy",
                        str(raw_audio),
                    ]
                )
                backend_used = "edge"
            except Exception:
                if args.backend != "auto" or __import__("os").name != "nt":
                    raise
                raw_audio = synthesize_windows(narration, args.windows_voice, temp_root)
                backend_used = "windows_fallback"
        run(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-i",
                str(raw_audio),
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "192k",
                str(output),
            ]
        )

    duration = duration_seconds(output)
    payload = {
        "schema": "aethermoore.book_voice_guide.v1",
        "status": "generated_and_probed",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "script": str(script),
        "script_sha256": sha256(script),
        "output": str(output),
        "output_sha256": sha256(output),
        "duration_seconds": duration,
        "word_count": word_count,
        "tts_segment_count": len(chunks),
        "average_words_per_minute": round(word_count / (duration / 60), 2),
        "voice": args.voice,
        "backend": backend_used,
        "windows_voice": args.windows_voice if backend_used.startswith("windows") else None,
        "rate": args.rate,
        "pitch": args.pitch,
        "volume": args.volume,
        "normalization": "EBU R128 target -16 LUFS, true peak -1.5 dB",
    }
    receipt.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

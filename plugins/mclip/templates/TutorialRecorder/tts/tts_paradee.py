"""Thai voice-over (English words mixed in) with PyThaiTTS, voice MakHam Paradee (female), slower than normal.

    python tts_paradee.py --input script.txt --out out_dir --speed 0.85 [--mp3] [--merge]

- One sentence per line; blank lines and lines starting with '#' are skipped.
- Writes out_dir/001.wav, 002.wav, ... (WAV, mono, 24 kHz) in line order, and out_dir/manifest.json:
  {"voice", "speed", "sampleRate", "items": [{"n", "line", "text", "file", "durationMs"}]}
  (the tutorial recorder reads it to hold each step as long as its narration).
- --mp3 also writes NNN.mp3 (ffmpeg, 128 kbps); --merge also writes merged.wav (and merged.mp3 with --mp3),
  every sentence one after another with --gap-ms of silence between them.

Setup: pip install pythaitts==1.0.0 soundfile. The model (HuggingFace pythainlp/MakHamTTS, Apache-2.0) downloads on the
first run into ~/.cache/huggingface; CPU only, no torch.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys

import numpy as np
import soundfile as sf


def read_lines(path: pathlib.Path) -> list[tuple[int, str]]:
    out = []
    for no, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        text = raw.strip()
        if text and not text.startswith("#"):
            out.append((no, text))
    return out


def to_mp3(wav: pathlib.Path) -> pathlib.Path:
    mp3 = wav.with_suffix(".mp3")
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav), "-b:a", "128k", str(mp3)], check=True)
    return mp3


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--input", required=True, type=pathlib.Path, help="text file, one sentence per line")
    ap.add_argument("--out", required=True, type=pathlib.Path, help="output folder")
    ap.add_argument("--speed", type=float, default=0.85, help="1.0 = normal, lower = slower (0.7–1.0)")
    ap.add_argument("--mp3", action="store_true", help="also write mp3 files (needs ffmpeg)")
    ap.add_argument("--merge", action="store_true", help="also write merged.wav of all sentences")
    ap.add_argument("--gap-ms", type=int, default=400, help="silence between sentences in merged.wav")
    a = ap.parse_args()

    if not 0.7 <= a.speed <= 1.0:
        ap.error("--speed must be between 0.7 and 1.0")
    if a.mp3 and shutil.which("ffmpeg") is None:
        ap.error("--mp3 needs ffmpeg on PATH")
    lines = read_lines(a.input)
    if not lines:
        ap.error(f"no sentences in {a.input}")

    sys.stdout.reconfigure(encoding="utf-8")
    from pythaitts import TTS  # imported late so --help works without the model

    tts = TTS(pretrained="makham_paradee")  # load once, reuse for every sentence
    a.out.mkdir(parents=True, exist_ok=True)
    for old in list(a.out.glob("[0-9][0-9][0-9].wav")) + list(a.out.glob("[0-9][0-9][0-9].mp3")):
        old.unlink()

    items, rate = [], None
    for n, (line_no, text) in enumerate(lines, 1):
        wav = a.out / f"{n:03d}.wav"
        tts.tts(text, filename=str(wav), speed=a.speed)
        data, rate = sf.read(wav)
        if data.size == 0 or float(np.max(np.abs(data))) < 1e-3:
            print(f"error: line {line_no} came out silent: {text}", file=sys.stderr)
            return 2
        ms = round(len(data) * 1000 / rate)
        items.append({"n": n, "line": line_no, "text": text, "file": wav.name, "durationMs": ms})
        if a.mp3:
            to_mp3(wav)
        print(f"{n:03d} {ms / 1000:5.2f}s  {text}")

    if a.merge:
        gap = np.zeros(int(rate * a.gap_ms / 1000))
        parts = []
        for it in items:
            parts += [sf.read(a.out / it["file"])[0], gap]
        merged = a.out / "merged.wav"
        sf.write(merged, np.concatenate(parts[:-1]), rate)
        if a.mp3:
            to_mp3(merged)

    manifest = {"voice": "makham_paradee", "speed": a.speed, "sampleRate": rate, "items": items}
    (a.out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(it["durationMs"] for it in items) / 1000
    print(f"done: {len(items)} sentences, {total:.1f}s of speech -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

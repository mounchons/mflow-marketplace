"""Thai voice-over (English words mixed in) with PyThaiTTS, voice MakHam Paradee (female), slower than normal.

    python tts_paradee.py --input script.txt --out out_dir --speed 0.85 [--lexicon words.txt ...] [--mp3] [--merge]

- One line per step; blank lines and lines starting with '#' are skipped.
- Pronunciation rules (--lexicon, any number, later files win): lines `<written> = <spoken>`, e.g. `Login = ล๊อก อิน`.
  A Latin word matches whole and in any case (Login, LOGIN, login); a Thai one wherever it appears; longer words first.
  Captions are not changed: only what is spoken.
- A price is said in words: `5877.50 บาท`, `5,877.50 บาท` or `฿5,877.50` -> ห้าพันแปดร้อยเจ็ดสิบเจ็ดบาทห้าสิบสตางค์;
  `5877 บาท` -> ห้าพันแปดร้อยเจ็ดสิบเจ็ดบาท (before the rules above, which may still change บาท-free words).
- A line of several sentences is spoken sentence by sentence, cut after a closing particle (ค่ะ, คะ, ครับ, จ้ะ, จ้า)
  followed by a space, and joined with --pause-ms of silence, so a particle is never run into the next sentence;
  every line keeps the model's own silence after its last word and gets --tail-ms more, so the last word is heard to
  its end before anything follows it.
- Writes out_dir/001.wav, 002.wav, ... (WAV, mono, 24 kHz) in line order, and out_dir/manifest.json:
  {"voice", "speed", "sampleRate", "lexicon", "pauseMs", "tailMs", "items": [{"n", "line", "text", "spoken", "file",
  "durationMs"}]} (the tutorial recorder reads it to hold each step as long as its narration; "lexicon" is a hash of
  the rules used, so a changed rule speaks the lines again).
- --mp3 also writes NNN.mp3 (ffmpeg, 128 kbps); --merge also writes merged.wav (and merged.mp3 with --mp3),
  every line one after another with --gap-ms of silence between them.

Setup: pip install pythaitts==1.0.0 soundfile. The model (HuggingFace pythainlp/MakHamTTS, Apache-2.0) downloads on the
first run into ~/.cache/huggingface; CPU only, no torch.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys

import numpy as np
import soundfile as sf

# not ค่า: it closes words too (มูลค่า, ค่าเบี้ย)
PARTICLES = re.compile(r"(ค่ะ|คะ|ครับ|จ้ะ|จ้า)\s+")


def read_lines(path: pathlib.Path) -> list[tuple[int, str]]:
    out = []
    for no, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        text = raw.strip()
        if text and not text.startswith("#"):
            out.append((no, text))
    return out


def read_lexicon(paths: list[pathlib.Path]) -> dict[str, tuple[str, str]]:
    """{match key: (written, spoken)}; a Latin word's key is lower-case. A later file's rule replaces an earlier one."""
    rules: dict[str, tuple[str, str]] = {}
    for p in paths:
        if not p.exists():
            continue
        for raw in p.read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            written, spoken = (s.strip() for s in line.split("=", 1))
            if written and spoken:
                rules[written.lower()] = (written, spoken)
    return rules


def lexicon_hash(rules: dict[str, tuple[str, str]]) -> str:
    text = "\n".join(f"{k}={v[1]}" for k, v in sorted(rules.items()))
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12] if rules else ""


def apply_lexicon(text: str, rules: dict[str, tuple[str, str]]) -> str:
    """One pass, longest written form first; a Latin word only where no Latin letter or digit touches it."""
    if not rules:
        return text
    def pattern(key: str) -> str:
        p = re.escape(key)
        return rf"(?<![A-Za-z0-9]){p}(?![A-Za-z0-9])" if re.search(r"[A-Za-z0-9]", key) else p
    rx = re.compile("|".join(pattern(k) for k in sorted(rules, key=len, reverse=True)), re.IGNORECASE)
    return rx.sub(lambda m: rules[m.group(0).lower()][1], text)


DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"]
PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"]
# a price: 5877.50 บาท, 5,877.50 บาท, 5877 บาท, ฿5,877.50 (an amount of up to two decimals; the number as written)
MONEY = re.compile(r"฿\s?(?P<a>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?P<b>\d{1,2}))?(?![\d.])"
                   r"|(?<![\d.,])(?P<c>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?P<d>\d{1,2}))?\s*บาท")


def thai_number(n: int) -> str:
    """5877 -> ห้าพันแปดร้อยเจ็ดสิบเจ็ด; 21 -> ยี่สิบเอ็ด; 101 -> หนึ่งร้อยเอ็ด; 2,000,000 -> สองล้าน."""
    if n == 0:
        return DIGITS[0]
    if n >= 1_000_000:
        high, low = divmod(n, 1_000_000)
        return thai_number(high) + "ล้าน" + (thai_number(low) if low else "")
    out, digits = "", str(n)
    for i, ch in enumerate(digits):
        d, place = int(ch), len(digits) - 1 - i
        if d == 0:
            continue
        if place == 1 and d == 1:
            out += "สิบ"
        elif place == 1 and d == 2:
            out += "ยี่สิบ"
        elif place == 0 and d == 1 and n > 1:
            out += "เอ็ด"
        else:
            out += DIGITS[d] + PLACES[place]
    return out


def money_words(baht: str, satang: str | None) -> str:
    """5877, '50' -> ห้าพันแปดร้อยเจ็ดสิบเจ็ดบาทห้าสิบสตางค์; 100, None -> หนึ่งร้อยบาท; 0, '75' -> เจ็ดสิบห้าสตางค์."""
    b = int(baht.replace(",", ""))
    s = int((satang or "0").ljust(2, "0"))
    if b == 0 and s:
        return thai_number(s) + "สตางค์"
    return thai_number(b) + "บาท" + (thai_number(s) + "สตางค์" if s else "")


def speak_money(text: str) -> str:
    """Prices are said in words, as a Thai speaker reads them: the voice reads digits one way or another."""
    def say(m: re.Match) -> str:
        return money_words(m.group("a") or m.group("c"), m.group("b") if m.group("a") else m.group("d"))
    return MONEY.sub(say, text)


def sentences(text: str) -> list[str]:
    parts, start = [], 0
    for m in PARTICLES.finditer(text):
        parts.append(text[start:m.end(1)].strip())
        start = m.end()
    parts.append(text[start:].strip())
    return [p for p in parts if p]


def trim_end(data: np.ndarray, rate: int) -> np.ndarray:
    """Drops the model's own silence after the last sound (keeping 60 ms), so the pauses are the ones asked for."""
    win = max(1, int(rate * 0.01))
    peak = float(np.max(np.abs(data))) or 1.0
    end = len(data)
    while end > win and float(np.sqrt(np.mean(data[end - win:end] ** 2))) < peak * 0.01:
        end -= win
    return data[:min(len(data), end + int(rate * 0.06))]


def to_mp3(wav: pathlib.Path) -> pathlib.Path:
    mp3 = wav.with_suffix(".mp3")
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav), "-b:a", "128k", str(mp3)], check=True)
    return mp3


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--input", required=True, type=pathlib.Path, help="text file, one line per step")
    ap.add_argument("--out", required=True, type=pathlib.Path, help="output folder")
    ap.add_argument("--speed", type=float, default=0.85, help="1.0 = normal, lower = slower (0.7–1.0)")
    ap.add_argument("--lexicon", type=pathlib.Path, action="append", default=[], help="pronunciation rules, any number")
    ap.add_argument("--pause-ms", type=int, default=350, help="silence between the sentences of one line")
    ap.add_argument("--tail-ms", type=int, default=600, help="silence added after each line")
    ap.add_argument("--mp3", action="store_true", help="also write mp3 files (needs ffmpeg)")
    ap.add_argument("--merge", action="store_true", help="also write merged.wav of all lines")
    ap.add_argument("--gap-ms", type=int, default=400, help="silence between lines in merged.wav")
    a = ap.parse_args()

    if not 0.7 <= a.speed <= 1.0:
        ap.error("--speed must be between 0.7 and 1.0")
    if a.mp3 and shutil.which("ffmpeg") is None:
        ap.error("--mp3 needs ffmpeg on PATH")
    lines = read_lines(a.input)
    if not lines:
        ap.error(f"no sentences in {a.input}")
    rules = read_lexicon(a.lexicon)

    sys.stdout.reconfigure(encoding="utf-8")
    from pythaitts import TTS  # imported late so --help works without the model

    tts = TTS(pretrained="makham_paradee")  # load once, reuse for every sentence
    a.out.mkdir(parents=True, exist_ok=True)
    for old in list(a.out.glob("[0-9][0-9][0-9].wav")) + list(a.out.glob("[0-9][0-9][0-9].mp3")):
        old.unlink()
    part_wav = a.out / "part.wav"

    items, rate = [], None
    for n, (line_no, text) in enumerate(lines, 1):
        spoken = apply_lexicon(speak_money(text), rules)
        chunks = []
        parts = sentences(spoken)
        for k, sentence in enumerate(parts):
            tts.tts(sentence, filename=str(part_wav), speed=a.speed)
            data, rate = sf.read(part_wav)
            if data.size == 0 or float(np.max(np.abs(data))) < 1e-3:
                print(f"error: line {line_no} came out silent: {sentence}", file=sys.stderr)
                return 2
            if data.ndim > 1:
                data = data.mean(axis=1)
            if chunks:
                chunks.append(np.zeros(int(rate * a.pause_ms / 1000)))
            # between sentences the pause replaces the model's own silence; the last keeps it, the tail comes on top
            chunks.append(trim_end(data, rate) if k < len(parts) - 1 else data)
        chunks.append(np.zeros(int(rate * a.tail_ms / 1000)))
        wav = a.out / f"{n:03d}.wav"
        out = np.concatenate(chunks)
        sf.write(wav, out, rate)
        ms = round(len(out) * 1000 / rate)
        items.append({"n": n, "line": line_no, "text": text, "spoken": spoken, "file": wav.name, "durationMs": ms})
        if a.mp3:
            to_mp3(wav)
        print(f"{n:03d} {ms / 1000:5.2f}s  {spoken}")
    part_wav.unlink(missing_ok=True)

    if a.merge:
        gap = np.zeros(int(rate * a.gap_ms / 1000))
        parts = []
        for it in items:
            parts += [sf.read(a.out / it["file"])[0], gap]
        merged = a.out / "merged.wav"
        sf.write(merged, np.concatenate(parts[:-1]), rate)
        if a.mp3:
            to_mp3(merged)

    manifest = {"voice": "makham_paradee", "speed": a.speed, "sampleRate": rate, "lexicon": lexicon_hash(rules),
                "pauseMs": a.pause_ms, "tailMs": a.tail_ms, "items": items}
    (a.out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(it["durationMs"] for it in items) / 1000
    print(f"done: {len(items)} lines, {total:.1f}s of speech -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

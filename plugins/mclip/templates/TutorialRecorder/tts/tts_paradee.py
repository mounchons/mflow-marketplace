"""Thai voice-over (English words mixed in): PyThaiTTS voice MakHam Paradee on this machine, or a voice of Google Gemini
or ElevenLabs over their API.

    python tts_paradee.py --input script.txt --out out_dir --speed 0.85 [--lexicon words.txt ...] [--mp3] [--merge]
                          [--engine paradee|gemini|elevenlabs --voice <name or id> [--model <id>] [--keys keys.json]]

- One line per step; blank lines and lines starting with '#' are skipped.
- Engines:
  - paradee (default): PyThaiTTS MakHam Paradee (female), on this machine, no cost.
  - gemini: a prebuilt voice of the Gemini TTS model (--voice Enya, --model gemini-3.8-flash-tts by default), through
    https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent with GEMINI_API_KEY, as AI Studio's
    "Get code" sends it; --style "Friendly" (free text, as AI Studio's style box) says how every line is delivered.
  - elevenlabs: a voice of the account (--voice <voice_id>, --model eleven_v3 by default: eleven_multilingual_v2 and
    eleven_flash_v2_5 have no Thai), through https://api.elevenlabs.io/v1/text-to-speech/<voice_id> with
    ELEVENLABS_API_KEY.
  The key comes from the environment, else from --keys (JSON: {"GEMINI_API_KEY": "...", "ELEVENLABS_API_KEY": "..."});
  it is never printed. An API voice sends each line's words to that company and costs what the account is charged.
  MCLIP_GEMINI_URL / MCLIP_ELEVENLABS_URL replace the API's address (tests).
- Paradee only (an API voice reads each line as written): pronunciation rules (--lexicon, any number, later files win): lines `<written> = <spoken>`, e.g. `Login = ล๊อก อิน`.
  A Latin word matches whole and in any case (Login, LOGIN, login); a Thai one wherever it appears; longer words first.
  Captions are not changed: only what is spoken.
- Paradee only: a price is said in words: `5877.50 บาท`, `5,877.50 บาท` or `฿5,877.50` -> ห้าพันแปดร้อยเจ็ดสิบเจ็ดบาทห้าสิบสตางค์;
  `5877 บาท` -> ห้าพันแปดร้อยเจ็ดสิบเจ็ดบาท (before the rules above, which may still change บาท-free words).
- Paradee speaks a line of several sentences sentence by sentence, cut after a closing particle (ค่ะ, คะ, ครับ, จ้ะ, จ้า)
  followed by a space, joined with --pause-ms of silence, so a particle is never run into the next sentence. An API voice
  speaks the whole line at once. Every line keeps the voice's own silence after its last word and gets --tail-ms more,
  so the last word is heard to its end before anything follows it.
- Speed: Paradee's own (--speed). An API voice is spoken at its normal pace and then slowed by ffmpeg (atempo, the
  pitch kept) when --speed is below 1.0.
- Writes out_dir/001.wav, 002.wav, ... (WAV, mono, 24 kHz) in line order, and out_dir/manifest.json:
  {"voice", "engine", "model", "speed", "sampleRate", "lexicon", "pauseMs", "tailMs", "items": [{"n", "line", "text",
  "spoken", "file", "durationMs"}]} (the tutorial recorder reads it to hold each step as long as its narration;
  "lexicon" is a hash of the rules used, so a changed rule speaks the lines again).
- --mp3 also writes NNN.mp3 (ffmpeg, 128 kbps); --merge also writes merged.wav (and merged.mp3 with --mp3),
  every line one after another with --gap-ms of silence between them.

Setup: pip install pythaitts==1.0.0 soundfile (an API voice needs only soundfile). Paradee's model (HuggingFace
pythainlp/MakHamTTS, Apache-2.0) downloads on its first run into ~/.cache/huggingface; CPU only, no torch.
Exit codes: 0 done, 2 wrong arguments or silent audio, 3 the API refused or could not be reached.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

import numpy as np
import soundfile as sf

# not ค่า: it closes words too (มูลค่า, ค่าเบี้ย)
PARTICLES = re.compile(r"(ค่ะ|คะ|ครับ|จ้ะ|จ้า)\s+")

ENGINES = ("paradee", "gemini", "elevenlabs")
DEFAULT_MODEL = {"gemini": "gemini-3.8-flash-tts", "elevenlabs": "eleven_v3"}
KEY_NAME = {"gemini": "GEMINI_API_KEY", "elevenlabs": "ELEVENLABS_API_KEY"}
# a voice or model id: it goes into the API's address (ElevenLabs' voice id is part of the path)
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
RATE = 24000


class ApiError(Exception):
    pass


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


# ---- API voices ------------------------------------------------------------------------------------------------------

def api_key(engine: str, keys_file: pathlib.Path | None) -> str:
    """The engine's key: the environment first, then the keys file. Never printed."""
    name = KEY_NAME[engine]
    value = os.environ.get(name, "").strip()
    if not value and keys_file and keys_file.exists():
        try:
            value = str(json.loads(keys_file.read_text(encoding="utf-8-sig")).get(name) or "").strip()
        except (ValueError, AttributeError):
            raise ApiError(f"{keys_file} is not JSON like {{\"{name}\": \"...\"}}")
    if not value:
        raise ApiError(f"no {name}: put it in {keys_file or 'tools/TutorialRecorder/tts/keys.json'} (or the environment)")
    return value


def post(url: str, headers: dict, body: dict, what: str) -> bytes:
    req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            j = json.loads(raw)
            err = j.get("error") or j.get("detail") or j
            msg = (err.get("message") or err) if isinstance(err, dict) else err
            msg = msg if isinstance(msg, str) else json.dumps(msg, ensure_ascii=False)
        except ValueError:
            msg = raw
        raise ApiError(f"{what} answered {e.code}: {msg.strip()[:400]}")
    except urllib.error.URLError as e:
        raise ApiError(f"{what} could not be reached: {e.reason}")


def decode(data: bytes, mime: str = "") -> tuple[np.ndarray, int]:
    """A WAV (RIFF) as it is, else 16-bit little-endian PCM, mono, at the rate the mime type names (24 kHz)."""
    if data[:4] == b"RIFF":
        audio, rate = sf.read(io.BytesIO(data))
        return (audio.mean(axis=1) if audio.ndim > 1 else audio), rate
    m = re.search(r"rate=(\d+)", mime)
    pcm = np.frombuffer(data[: len(data) // 2 * 2], dtype="<i2").astype(np.float64) / 32768.0
    return pcm, int(m.group(1)) if m else RATE


def gemini(text: str, voice: str, model: str, key: str, style: str = "") -> tuple[np.ndarray, int]:
    """The request AI Studio's own "Get code" writes: generateContent, a `## Transcript:` text, a prebuilt voice name."""
    base = os.environ.get("MCLIP_GEMINI_URL", "https://generativelanguage.googleapis.com").rstrip("/")
    # the style (Friendly, speaking slowly) is a note above the transcript, in the prompt's own headings: AI Studio's
    # export carries no style field, and a note is read as direction, never spoken; the words stay as they are
    notes = f"## Director's notes:\nStyle: {style}\n\n" if style else ""
    part = {"text": f"{notes}## Transcript:\n{text}"}
    body = {"contents": [{"role": "user", "parts": [part]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    raw = post(f"{base}/v1beta/models/{model}:generateContent", {"x-goog-api-key": key}, body, "Gemini")
    try:
        j = json.loads(raw)
        parts = [p.get("inlineData") or p.get("inline_data") for c in j.get("candidates") or []
                 for p in ((c.get("content") or {}).get("parts") or [])]
        audio = [d for d in parts if isinstance(d, dict) and d.get("data")]
    except (ValueError, AttributeError):
        audio = []
    if not audio:
        raise ApiError(f"Gemini answered without audio: {raw[:200].decode('utf-8', 'replace')}")
    mime = str(audio[0].get("mimeType") or audio[0].get("mime_type") or "")
    return decode(b"".join(base64.b64decode(d["data"]) for d in audio), mime)


def elevenlabs(text: str, voice: str, model: str, key: str) -> tuple[np.ndarray, int]:
    base = os.environ.get("MCLIP_ELEVENLABS_URL", "https://api.elevenlabs.io").rstrip("/")
    body = {"text": text, "model_id": model}
    if not model.startswith("eleven_multilingual"):  # multilingual_v2 takes no language_code (and has no Thai)
        body["language_code"] = "th"
    raw = post(f"{base}/v1/text-to-speech/{voice}?output_format=pcm_{RATE}", {"xi-api-key": key, "Accept": "audio/*"},
               body, "ElevenLabs")
    if raw[:1] == b"{":
        raise ApiError(f"ElevenLabs answered without audio: {raw[:200].decode('utf-8', 'replace')}")
    return decode(raw, f"rate={RATE}")


def slower(data: np.ndarray, rate: int, speed: float, work: pathlib.Path) -> np.ndarray:
    """The same words at `speed` (below 1.0: slower), the pitch kept (ffmpeg atempo)."""
    src, dst = work / "tempo-in.wav", work / "tempo-out.wav"
    sf.write(src, data, rate)
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-filter:a", f"atempo={speed}",
                    "-ar", str(rate), "-ac", "1", str(dst)], check=True)
    out, _ = sf.read(dst)
    src.unlink(missing_ok=True)
    dst.unlink(missing_ok=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--input", required=True, type=pathlib.Path, help="text file, one line per step")
    ap.add_argument("--out", required=True, type=pathlib.Path, help="output folder")
    ap.add_argument("--speed", type=float, default=0.85, help="1.0 = normal, lower = slower (0.7–1.0)")
    ap.add_argument("--lexicon", type=pathlib.Path, action="append", default=[], help="pronunciation rules, any number")
    ap.add_argument("--engine", choices=ENGINES, default="paradee", help="paradee (this machine), gemini or elevenlabs")
    ap.add_argument("--voice", default="", help="the API voice: a Gemini voice name (Enya) or an ElevenLabs voice_id")
    ap.add_argument("--model", default="", help="the API model (gemini-3.8-flash-tts, eleven_v3 by default)")
    ap.add_argument("--keys", type=pathlib.Path, help="JSON file of API keys, used when the environment has none")
    ap.add_argument("--style", default="", help="gemini: how every line is delivered, free text (Friendly, warm and calm)")
    ap.add_argument("--pause-ms", type=int, default=350, help="silence between the sentences of one line")
    ap.add_argument("--tail-ms", type=int, default=600, help="silence added after each line")
    ap.add_argument("--mp3", action="store_true", help="also write mp3 files (needs ffmpeg)")
    ap.add_argument("--merge", action="store_true", help="also write merged.wav of all lines")
    ap.add_argument("--gap-ms", type=int, default=400, help="silence between lines in merged.wav")
    a = ap.parse_args()

    if not 0.7 <= a.speed <= 1.0:
        ap.error("--speed must be between 0.7 and 1.0")
    api = a.engine != "paradee"
    model = (a.model or DEFAULT_MODEL.get(a.engine, "")) if api else ""
    if api and not ID.match(a.voice or ""):
        ap.error(f"--engine {a.engine} needs --voice <name or id> (letters, digits, . _ -)")
    if api and not ID.match(model):
        ap.error("--model is letters, digits, . _ -")
    style = " ".join(a.style.split()) if a.engine == "gemini" else ""
    if len(style) > 200:
        ap.error("--style is at most 200 characters")
    if (a.mp3 or (api and a.speed < 0.999)) and shutil.which("ffmpeg") is None:
        ap.error("--mp3 and an API voice below speed 1.0 need ffmpeg on PATH")
    lines = read_lines(a.input)
    if not lines:
        ap.error(f"no sentences in {a.input}")
    # the rules and prices in words are for Paradee: a Gemini or ElevenLabs voice reads the line as written
    rules = read_lexicon(a.lexicon) if not api else {}

    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        key = api_key(a.engine, a.keys) if api else ""
    except ApiError as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    tts = None
    if not api:
        from pythaitts import TTS  # imported late so --help and the API voices work without the model
        tts = TTS(pretrained="makham_paradee")  # load once, reuse for every sentence
    a.out.mkdir(parents=True, exist_ok=True)
    for old in list(a.out.glob("[0-9][0-9][0-9].wav")) + list(a.out.glob("[0-9][0-9][0-9].mp3")):
        old.unlink()
    part_wav = a.out / "part.wav"

    items, rate = [], None
    for n, (line_no, text) in enumerate(lines, 1):
        spoken = text if api else apply_lexicon(speak_money(text), rules)
        chunks = []
        if api:
            try:
                data, rate = (gemini(spoken, a.voice, model, key, style) if a.engine == "gemini"
                              else elevenlabs(spoken, a.voice, model, key))
            except ApiError as e:
                print(f"error: line {line_no}: {e}", file=sys.stderr)
                return 3
            if data.size == 0 or float(np.max(np.abs(data))) < 1e-3:
                print(f"error: line {line_no} came out silent: {spoken}", file=sys.stderr)
                return 2
            chunks.append(slower(data, rate, a.speed, a.out) if a.speed < 0.999 else data)
        else:
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

    voice = "makham_paradee" if not api else f"{a.engine} {a.voice} {model}"
    manifest = {"voice": voice, "engine": a.engine, "model": model, "style": style, "speed": a.speed, "sampleRate": rate,
                "lexicon": lexicon_hash(rules), "pauseMs": a.pause_ms, "tailMs": a.tail_ms, "items": items}
    (a.out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(it["durationMs"] for it in items) / 1000
    print(f"done: {len(items)} lines, {total:.1f}s of speech -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

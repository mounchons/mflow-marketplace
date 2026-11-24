#!/usr/bin/env node
// The clip plan of a project, kept in clips/ (see skills/plan/SKILL.md for the format):
//   clips/plan.md              the system, the scope, the format, the apps (## แอป: web, ios, android), and the table
//                              of contents (the order of the lessons; a contents entry without a lesson.md is a topic)
//   clips/<id>/lesson.md       one lesson: its fields, then one block per step (what is done, the words on screen,
//                              the words spoken, the reference pictures); `## เปิด` and `## สรุป` are its opening and
//                              closing title cards (บนจอ, คำรอง, พูด), around the steps
//   clips/<id>/screen/*.jpg    the lesson's reference pictures (`-ios` / `-android` before the extension: one platform's)
//   clips/<id>/slides/*        the pictures of its picture steps (`- สไลด์:`: a diagram, an overview shown full screen),
//                              made by the AI from each step's `- รายละเอียดรูป:`, or the user's own
//   clips/<id>/v<n>/           a recorded version (lesson, scenario, pictures, srt, timing; the mp4 is git-ignored)
//
//   node clips.mjs check   [--clips <dir>]           parse everything, print JSON { lessons, problems }
//   node clips.mjs page    [--clips <dir>] [--open]  write clips/index.html (slides of the plan with edit buttons)
//   node clips.mjs version <id> --mp4 <f> --srt <f> --timing <f> [--mode m] [--voice] [--recorder v] [--clips <dir>]
//                                                    snapshot the lesson as its next version v<n>
//   node clips.mjs compare <id> [--threshold 0.97] [--clips <dir>]
//                                                    compare screen/ with the latest version's pictures (ffmpeg ssim)
//   node clips.mjs voice <id> [--step n|open|close] [--speed 0.85] [--force] [--tts <dir>] [--clips <dir>]
//                                                    speak the lesson's '- พูด:' lines (PyThaiTTS, the recorder's tts/)
//                                                    into clips/<id>/voice/NN.mp3 (step NN) + voice.json, to listen to
//                                                    on the page before recording; a line already spoken is kept
//   node clips.mjs requests [--done <id,id> | --clear] [--clips <dir>]
//                                                    the edit requests the live page saved (clips/requests.json), as
//                                                    items and as the /mclip:plan edit command; --done removes those
//                                                    applied, --clear all of them
//
// clips/<id>/shots.json is written by the recorder's --shots (the pictures it made, and the step it stopped at); the
// page tells those from the user's own pictures.
//
// <dir> defaults to <project>/clips, the project being CLAUDE_PROJECT_DIR or the current folder. Exit codes: 0 done,
// 1 the plan has problems (check, page: the page is still written and shows them), 2 wrong arguments or refused.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// คู่มือ: the step explained for the user manual (manual.mjs), when the words on screen are too short for it
// สไลด์: a picture step, the picture itself on screen (a diagram, an overview) instead of something done in the app;
// รายละเอียดรูป: what that picture shows, the brief the AI makes it from
export const STEP_KEYS = { "ทำ": "action", "บนจอ": "caption", "พูด": "narration", "รูป": "image", "หมายเหตุ": "note", "คู่มือ": "manual",
  "สไลด์": "slide", "รายละเอียดรูป": "brief" };
/** A picture step's picture: slides/<name>.png, .jpg or .svg in the lesson's folder. */
export const SLIDE = /^slides\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpe?g|svg)$/i;
const ID = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const APP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const KINDS = { web: "เว็บ", ios: "iPhone", android: "Android" };
export const APP_KEYS = { "ชนิด": "kinds", "โค้ด": "code", "เทสต์": "tests", "e2e": "e2e", "url": "url" };
export const TOPIC_KEYS = { "แอป": "apps", "สอน": "teaches", "ที่มา": "sources" };
const list = (v) => v.split(/[,\s]+/).filter(Boolean);
/** The platform a picture is for, from its name (`screen/03-x-ios.jpg`), or null for every platform. */
export const platformOf = (img) => /-(ios|android)\.(jpe?g|png)$/i.exec(img)?.[1].toLowerCase() ?? null;

// ---- parsing ---------------------------------------------------------------------------------------------------------

/** `- key: value` -> [key, value], else null. The key is everything before the first ':' (Thai or English words). */
function field(line) {
  const m = /^\s*-\s+([^:]+?)\s*:\s*(.*)$/.exec(line);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/**
 * clips/plan.md: `# title`, `- key: value` fields, an optional `## แอป` of `### <key> — <name>` blocks (APP_KEYS
 * fields), and a `## สารบัญ` numbered list of `NN-id — title`, each optionally followed by TOPIC_KEYS fields.
 */
export function parsePlan(text, file = "plan.md") {
  const problems = [];
  const plan = { title: "", fields: [], apps: [], toc: [] };
  let section = "", app = null, item = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    const h1 = /^#\s+(.+)$/.exec(line), h2 = /^##\s+(.+)$/.exec(line), h3 = /^###\s+(.+)$/.exec(line);
    if (h1) { plan.title = h1[1].trim(); section = ""; return; }
    if (h2) { section = h2[1].trim(); app = item = null; return; }
    if (section === "แอป") {
      if (h3) {
        app = { key: "", name: "", kinds: [], code: "", tests: "", e2e: "", url: "", line: i + 1 };
        const m = /^`?(\S+?)`?\s+[—-]\s+(.+)$/.exec(h3[1].trim());
        if (!m) problems.push(`${at}: an app heading is '### <key> — <name>'`);
        else if (!APP.test(m[1])) problems.push(`${at}: app key '${m[1]}' is lower-case words (e.g. web-admin)`);
        else if (plan.apps.some((a) => a.key === m[1])) problems.push(`${at}: app ${m[1]} is listed twice`);
        else { Object.assign(app, { key: m[1], name: m[2].trim() }); plan.apps.push(app); }
        return;
      }
      const f = field(line);
      if (!f) return;
      if (!app) { problems.push(`${at}: an app field comes after '### <key> — <name>'`); return; }
      const key = APP_KEYS[f[0]];
      if (!key) { problems.push(`${at}: unknown app field '${f[0]}' (${Object.keys(APP_KEYS).join(", ")})`); return; }
      if (key === "kinds") {
        app.kinds = list(f[1]);
        for (const k of app.kinds) if (!KINDS[k]) problems.push(`${at}: app kind '${k}' is web, ios or android`);
      } else app[key] = f[1];
      return;
    }
    if (section === "สารบัญ") {
      const m = /^\s*\d+\.\s+`?(\S+?)`?\s+[—-]\s+(.+)$/.exec(line);
      if (m) {
        const [, id, title] = m;
        item = { id, title: title.trim(), apps: [], teaches: "", sources: "", line: i + 1 };
        if (!ID.test(id)) problems.push(`${at}: lesson id '${id}' is not NN-words (e.g. 02-add-user)`);
        else if (plan.toc.some((t) => t.id === id)) problems.push(`${at}: lesson ${id} is listed twice`);
        else plan.toc.push(item);
        return;
      }
      if (/^\s*\d+\./.test(line)) { problems.push(`${at}: a contents line is '<n>. NN-id — title'`); return; }
      const f = field(line);
      if (!f) return;
      if (!item) { problems.push(`${at}: a topic field comes after its contents line`); return; }
      const key = TOPIC_KEYS[f[0]];
      if (!key) problems.push(`${at}: unknown topic field '${f[0]}' (${Object.keys(TOPIC_KEYS).join(", ")})`);
      else item[key] = key === "apps" ? list(f[1]) : f[1];
      return;
    }
    const f = field(line);
    if (f) plan.fields.push({ key: f[0], value: f[1] });
  });
  if (!plan.title) problems.push(`${file}: no '# <system name>' title`);
  if (!plan.toc.length) problems.push(`${file}: no lessons under '## สารบัญ'`);
  for (const a of plan.apps) if (!a.kinds.length) problems.push(`${file}:${a.line}: app ${a.key} has no '- ชนิด:' (web, ios, android)`);
  if (plan.apps.length) {
    for (const t of plan.toc) {
      if (!t.apps.length && plan.apps.length === 1) t.apps = [plan.apps[0].key];
      if (!t.apps.length) problems.push(`${file}:${t.line}: ${t.id} has no '- แอป:' (${plan.apps.map((a) => a.key).join(", ")})`);
      for (const k of t.apps) if (!plan.apps.some((a) => a.key === k)) problems.push(`${file}:${t.line}: ${t.id} names app '${k}', which is not under '## แอป'`);
    }
  } else for (const t of plan.toc) if (t.apps.length) problems.push(`${file}:${t.line}: ${t.id} names an app, but the plan has no '## แอป'`);
  return { plan, problems };
}

/** clips/<id>/lesson.md: `# title`, `- key: value` fields, then `## <n>. <step title>` blocks of STEP_KEYS fields. */
export function parseLesson(text, file = "lesson.md") {
  const problems = [];
  const lesson = { title: "", fields: [], steps: [], cards: [] };
  let step = null, card = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) { lesson.title = h1[1].trim(); return; }
    // the clip's opening and closing title cards: `## เปิด`, `## สรุป` (what is on the card and what is said over it)
    const hc = /^##\s+(เปิด|สรุป)\s*$/.exec(line);
    if (hc) {
      const n = CARD_HEADINGS[hc[1]];
      if (lesson.cards.some((c) => c.n === n)) problems.push(`${at}: a second '## ${hc[1]}'`);
      card = { n, kind: hc[1], line: i + 1, caption: "", subtitle: "", narration: "" };
      lesson.cards.push(card);
      step = null;
      return;
    }
    if (card) {
      if (/^##\s/.test(line)) card = null;
      else {
        const f = field(line);
        if (!f) return;
        const key = CARD_KEYS[f[0]];
        if (!key) problems.push(`${at}: a card's fields are ${Object.keys(CARD_KEYS).join(", ")}`);
        else card[key] = f[1];
        return;
      }
    }
    const h2 = /^##\s+(\d+)\.\s+(.+)$/.exec(line);
    if (h2) {
      const n = Number(h2[1]);
      if (n !== lesson.steps.length + 1) problems.push(`${at}: step ${n} follows step ${lesson.steps.length}`);
      step = { n, title: h2[2].trim(), line: i + 1, action: "", caption: "", narration: "", images: [], note: "", manual: "", slide: "", brief: "" };
      lesson.steps.push(step);
      return;
    }
    if (/^##\s/.test(line)) { problems.push(`${at}: a step heading is '## <n>. <title>' (or '## เปิด', '## สรุป' for the title cards)`); return; }
    const f = field(line);
    if (!f) return;
    if (!step) { lesson.fields.push({ key: f[0], value: f[1] }); return; }
    const key = STEP_KEYS[f[0]];
    if (!key) { problems.push(`${at}: unknown step field '${f[0]}' (${Object.keys(STEP_KEYS).join(", ")})`); return; }
    if (key === "image") {
      if (!/^screen\/[^/\\]+\.(jpe?g|png)$/i.test(f[1])) problems.push(`${at}: a picture is screen/<name>.jpg or .png`);
      else step.images.push(f[1]);
    } else if (key === "slide" && !SLIDE.test(f[1])) problems.push(`${at}: a picture step's picture is slides/<name>.png, .jpg or .svg`);
    else step[key] = f[1];
  });
  if (!lesson.title) problems.push(`${file}: no '# <title>'`);
  if (!lesson.steps.length) problems.push(`${file}: no steps ('## 1. <title>')`);
  for (const s of lesson.steps) {
    // a picture step shows its picture: nothing is done in the app, so it has no ทำ and no reference pictures
    if (s.slide) {
      if (s.action) problems.push(`${file}:${s.line}: step ${s.n} shows a picture (สไลด์): it has no '- ทำ:'`);
      if (s.images.length) problems.push(`${file}:${s.line}: step ${s.n} shows a picture (สไลด์): its picture is the สไลด์, no '- รูป:'`);
    } else if (!s.action) problems.push(`${file}:${s.line}: step ${s.n} has no '- ทำ:' (or '- สไลด์:' for a picture step)`);
    if (s.brief && !s.slide) problems.push(`${file}:${s.line}: step ${s.n} has a '- รายละเอียดรูป:' but no '- สไลด์:'`);
    if (!s.caption) problems.push(`${file}:${s.line}: step ${s.n} has no '- บนจอ:'`);
  }
  for (const c of lesson.cards) if (!c.caption) c.caption = c.n === "open" ? lesson.title : "สรุปขั้นตอน";
  lesson.cards.sort((a, b) => (a.n === "open" ? -1 : 1) - (b.n === "open" ? -1 : 1));
  return { lesson, problems };
}

export const CARD_HEADINGS = { "เปิด": "open", "สรุป": "close" };
export const CARD_KEYS = { "บนจอ": "caption", "คำรอง": "subtitle", "พูด": "narration" };
/** What a lesson says, in the clip's order: the opening card, the steps, the closing card. */
export const spokenParts = (lesson) => { const cards = lesson.cards ?? []; return [...cards.filter((c) => c.n === "open"), ...lesson.steps, ...cards.filter((c) => c.n === "close")]; };
/** A step number, or a card ("open", "close"): what setNarration and the voice take. */
export const partKey = (v) => (v === "open" || v === "close" ? v : Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== "" ? Number(v) : null);

const VOICE_DIR = "voice";
const voiceFile = (n) => `${String(n).padStart(2, "0")}.mp3`;
// a file saved by Notepad starts with a BOM: read it as Python's utf-8-sig does
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch { return null; } };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** clips/<id>/shots.json (the recorder's --shots): { pictures: { "screen/x.jpg": { date } }, failed: { step, message } | null }. */
function readShots(dir) {
  const j = readJson(path.join(dir, "shots.json"));
  const pictures = {};
  if (isObj(j?.pictures)) for (const [k, v] of Object.entries(j.pictures)) pictures[k] = { date: typeof v?.date === "string" ? v.date : "" };
  const f = isObj(j?.failed) ? j.failed : null;
  return { pictures, failed: f ? { step: Number.isInteger(f.step) ? f.step : null, message: typeof f.message === "string" ? f.message : "" } : null };
}

/** clips/<id>/voice/voice.json: { steps: { "<n>" | "open" | "close": { text, speed, rules, engine, voice, durationMs, date } } }, well-formed only. */
function readVoices(dir) {
  const j = readJson(path.join(dir, VOICE_DIR, "voice.json"));
  const out = {};
  if (isObj(j?.steps)) for (const [k, v] of Object.entries(j.steps)) {
    if (/^(\d+|open|close)$/.test(k) && typeof v?.text === "string" && Number.isFinite(v?.durationMs)) {
      out[partKey(k)] = { text: v.text, speed: Number(v.speed) || 0, rules: typeof v.rules === "string" ? v.rules : "",
        engine: Number(v.engine) || 1, voice: typeof v.voice === "string" ? v.voice : "paradee", durationMs: v.durationMs, date: typeof v.date === "string" ? v.date : "" };
    }
  }
  return out;
}

// ---- how words are spoken --------------------------------------------------------------------------------------------
//
// Pronunciation rules, `<written> = <spoken>` per line: the plugin's lexicon.txt (words every project shares) and the
// project's clips/lexicon.txt (its own words; a word in both is spoken the project's way). The voice applies them
// (tts_paradee.py --lexicon); here they only tell which steps a changed rule affects. Speed: the plan's
// `- ความเร็วเสียง:` (0.7 to 1.0), else 0.85.

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GLOBAL_LEXICON = path.join(PLUGIN_ROOT, "lexicon.txt");
export const SPEED_FIELD = "ความเร็วเสียง";
export const DEFAULT_SPEED = 0.85;
// 2: sentences spoken one by one with a pause, silence after the last word (tts_paradee.py of mclip 0.5)
export const VOICE_ENGINE = 2;

// The voice: the plan's `- เสียงพากย์: <engine> [<voice> [<model>]] [(<name>)]`, else Paradee on this machine.
//   paradee                                  PyThaiTTS MakHam Paradee, on this machine, no cost
//   gemini Enya [gemini-3.8-flash-tts]       a Gemini TTS prebuilt voice (GEMINI_API_KEY); Enya without a name
//   elevenlabs <voice_id> [eleven_v3] (Name) an ElevenLabs voice of the account (ELEVENLABS_API_KEY)
// The keys: the environment, else tools/TutorialRecorder/tts/keys.json (git-ignored); never shown anywhere.
export const VOICE_FIELD = "เสียงพากย์";
export const ENGINES = {
  paradee: { label: "PyThaiTTS Paradee (ในเครื่อง ไม่มีค่าใช้จ่าย)" },
  gemini: { label: "Google Gemini (AI Studio)", model: "gemini-3.8-flash-tts", key: "GEMINI_API_KEY", voice: "Enya" },
  elevenlabs: { label: "ElevenLabs", model: "eleven_v3", key: "ELEVENLABS_API_KEY" },
};
// Gemini TTS prebuilt voices and their character: Enya (the default, the user's pick in AI Studio), then the 30 that
// Google's speech-generation guide lists
export const GEMINI_VOICES = [["Enya", "ค่าเริ่มต้น"], ["Zephyr", "Bright"], ["Puck", "Upbeat"], ["Charon", "Informative"], ["Kore", "Firm"],
  ["Fenrir", "Excitable"], ["Leda", "Youthful"], ["Orus", "Firm"], ["Aoede", "Breezy"], ["Callirrhoe", "Easy-going"],
  ["Autonoe", "Bright"], ["Enceladus", "Breathy"], ["Iapetus", "Clear"], ["Umbriel", "Easy-going"], ["Algieba", "Smooth"],
  ["Despina", "Smooth"], ["Erinome", "Clear"], ["Algenib", "Gravelly"], ["Rasalgethi", "Informative"],
  ["Laomedeia", "Upbeat"], ["Achernar", "Soft"], ["Alnilam", "Firm"], ["Schedar", "Even"], ["Gacrux", "Mature"],
  ["Pulcherrima", "Forward"], ["Achird", "Friendly"], ["Zubenelgenubi", "Casual"], ["Vindemiatrix", "Gentle"],
  ["Sadachbia", "Lively"], ["Sadaltager", "Knowledgeable"], ["Sulafat", "Warm"]];
// a voice or model id: it goes into the API's address
export const VOICE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const PARADEE = { engine: "paradee", voice: "", model: "", name: "", spec: "paradee", style: "", key: "paradee" };
// Gemini only: how every line is delivered, free text as in AI Studio's style box (`- สไตล์เสียง: Friendly`)
export const STYLE_FIELD = "สไตล์เสียง";
export const STYLE_SUGGESTIONS = ["Friendly", "warm and friendly", "cheerful and friendly", "calm and clear", "professional and confident",
  "gentle", "enthusiastic", "informative", "speaking slowly"];
/** One line, single spaces, at most 200 characters: what the voice is told about its delivery. */
export const cleanStyle = (s) => String(s ?? "").replace(/[\s\u2028\u2029]+/g, " ").trim().slice(0, 200);
/** The voice with its style: `key` is what a step's voice was made with, so a new style speaks it again. */
export const withStyle = (v, style) => {
  const s = v.engine === "gemini" ? cleanStyle(style) : "";
  return { ...v, style: s, key: s ? `${v.spec} | ${s}` : v.spec };
};

/** `gemini Enya` -> { engine, voice, model, name, spec: "gemini Enya gemini-3.8-flash-tts" }, or { error }. */
export function parseVoice(value) {
  const text = String(value ?? "").trim();
  const named = /\(([^()]*)\)\s*$/.exec(text);
  const [engine = "", voice = "", model = "", ...extra] = (named ? text.slice(0, named.index) : text).trim().split(/\s+/);
  const e = engine.toLowerCase();
  if (!ENGINES[e]) return { error: `'${text}': the voice is paradee, gemini <voice> or elevenlabs <voice_id>` };
  if (e === "paradee") return { ...PARADEE };
  const v = voice || ENGINES[e].voice || "";
  const m = model || ENGINES[e].model;
  if (!VOICE_ID.test(v)) return { error: `'${text}': ${e} needs a voice (${e === "gemini" ? "a name such as Enya" : "the voice_id"})` };
  if (!VOICE_ID.test(m) || extra.length) return { error: `'${text}': the model is one word of letters, digits, . _ -` };
  const spec = `${e} ${v} ${m}`;
  return { engine: e, voice: v, model: m, name: named ? named[1].trim().slice(0, 60) : "", spec, style: "", key: spec };
}

/** The plan's voice and, for Gemini, its style; Paradee when it names none or names one wrongly (load() reports that). */
export function planVoice(plan) {
  const f = plan?.fields?.find((x) => x.key === VOICE_FIELD);
  const v = f ? parseVoice(f.value) : PARADEE;
  return v.error ? PARADEE : withStyle(v, plan?.fields?.find((x) => x.key === STYLE_FIELD)?.value);
}

/** The plan field's text for a voice: `gemini Enya gemini-3.8-flash-tts`, `elevenlabs <id> eleven_v3 (Name)`. */
export const voiceField = (v) => (v.engine === "paradee" ? "paradee" : `${v.spec}${v.name ? ` (${v.name.replace(/[()\r\n]/g, "")})` : ""}`);

/** Which API keys are there ({ GEMINI_API_KEY: true, ... }): the environment, else <ttsDir>/keys.json. Never the values. */
export function keyStatus(ttsDir, env = process.env) {
  const file = readJson(path.join(ttsDir, "keys.json"));
  return Object.fromEntries(Object.values(ENGINES).filter((x) => x.key).map(({ key }) =>
    [key, !!String(env[key] ?? "").trim() || (isObj(file) && typeof file[key] === "string" && !!file[key].trim())]));
}

/**
 * tools/TutorialRecorder/.gitignore gets `tts/keys.json` when it lacks it: a recorder installed before mclip 0.6 does
 * not ignore the keys file, and the user is told to make one. Run before anything speaks and when the live page starts.
 */
export const KEYS_IGNORE = "tts/keys.json";
export function ensureKeysIgnored(ttsDir) {
  const rec = path.dirname(ttsDir);
  if (!fs.existsSync(rec)) return false;
  const file = path.join(rec, ".gitignore");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (text.split(/\r?\n/).some((l) => l.trim() === KEYS_IGNORE)) return false;
  fs.writeFileSync(file, text + (text && !text.endsWith("\n") ? "\n" : "") + KEYS_IGNORE + "\n");
  return true;
}

/** The key itself, for this machine's own calls (the voice list); never sent to the page or printed. */
export function apiKey(ttsDir, name, env = process.env) {
  const own = String(env[name] ?? "").trim();
  if (own) return own;
  const file = readJson(path.join(ttsDir, "keys.json"));
  return isObj(file) && typeof file[name] === "string" ? file[name].trim() : "";
}

/**
 * The title cards' theme the recorder uses: `card` in <project>/tools/TutorialRecorder/tutorial.settings.json (JSON
 * with comments), {} when there is none; only its colours, font and name (a logo stays the recorder's business).
 */
export function readCardTheme(projectRoot) {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, "tools", "TutorialRecorder", "tutorial.settings.json"), "utf8").replace(/^﻿/, "");
    const json = raw.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "").replace(/,(\s*[}\]])/g, "$1");
    const s = JSON.parse(json);
    const c = isObj(s?.card) ? s.card : isObj(s?.Card) ? s.Card : {};
    const pick = (k) => (typeof c[k] === "string" && c[k].trim() ? c[k].trim().slice(0, 80) : null);
    return { primary: pick("primary"), dark: pick("dark"), accent: pick("accent"), font: pick("font"), name: pick("name") };
  } catch { return {}; }
}

const FONT_STACK = "'Noto Sans Thai','Sarabun','Leelawadee UI',Tahoma,system-ui,sans-serif";

/** The card's colours, by the same rules as the recorder's overlay.js cardLook: { panel, ink, accent, soft }. */
export function cardColors(t = {}) {
  const hexOk = (s) => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s) ? s : null);
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hexOf = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
  const shade = (c, f) => c.map((v) => v * (1 - f));
  const mix = (c, to, f) => c.map((v, i) => v + (to[i] - v) * f);
  const WHITE = [255, 255, 255], INK = [15, 23, 42];
  const primary = hexOk(t.primary) ? rgbOf(t.primary) : [36, 83, 179];
  let panel, ink = WHITE;
  if (!hexOk(t.dark) && hexOk(t.primary) && contrast(INK, primary) >= 7) { panel = primary; ink = INK; }
  else {
    panel = hexOk(t.dark) ? rgbOf(t.dark) : (hexOk(t.primary) ? shade(primary, 0.6) : [15, 42, 99]);
    for (let i = 0; i < 20 && contrast(WHITE, panel) < 7; i++) panel = shade(panel, 0.08);
  }
  let accent = hexOk(t.accent) ? rgbOf(t.accent) : (ink === INK ? shade(primary, 0.7) : primary);
  for (let i = 0; i < 20 && contrast(accent, panel) < 3; i++) accent = mix(accent, ink, 0.12);
  return { panel: hexOf(panel), ink: hexOf(ink), accent: hexOf(accent), soft: ink === WHITE ? "rgba(255,255,255,.84)" : "rgba(15,23,42,.78)", backdrop: hexOf(mix(panel, WHITE, 0.88)) };
}

/** The ElevenLabs account's voices: [{ id, name, note, thai }] (GET /v2/voices). */
export async function elevenLabsVoices(key, base = process.env.MCLIP_ELEVENLABS_URL || "https://api.elevenlabs.io") {
  const r = await fetch(`${base.replace(/\/+$/, "")}/v2/voices?page_size=100`, { headers: { "xi-api-key": key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = j?.detail ?? j?.error ?? j;
    throw new Error(`ElevenLabs answered ${r.status}: ${String(d?.message ?? (typeof d === "string" ? d : JSON.stringify(d))).slice(0, 300)}`);
  }
  return (Array.isArray(j.voices) ? j.voices : []).filter((v) => VOICE_ID.test(String(v?.voice_id ?? ""))).map((v) => ({
    id: v.voice_id, name: String(v.name ?? v.voice_id).slice(0, 80),
    note: (isObj(v.labels) ? Object.values(v.labels).filter((x) => typeof x === "string") : []).join(", ").slice(0, 120),
    thai: Array.isArray(v.verified_languages) && v.verified_languages.some((l) => l?.language === "th"),
  }));
}

export function parseLexicon(text) {
  const rules = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const written = line.slice(0, at).trim(), spoken = line.slice(at + 1).trim();
    if (written && spoken) rules.push({ written, spoken });
  }
  return rules;
}

/** { global, project, merged }: merged is keyed by the lower-case written form, the project's rule winning. */
export function readLexicon(clipsDir, globalFile = GLOBAL_LEXICON) {
  const read = (f) => (fs.existsSync(f) ? parseLexicon(fs.readFileSync(f, "utf8")) : []);
  const global = read(globalFile), project = read(path.join(clipsDir, "lexicon.txt"));
  const merged = new Map();
  for (const r of [...global, ...project]) merged.set(r.written.toLowerCase(), r);
  return { global, project, merged };
}

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a price the voice says in words (tts_paradee.py MONEY: 5877.50 บาท, 5,877.50 บาท, ฿5,877.50)
export const MONEY = /฿\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?![\d.])|(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*บาท/;
/** The rules a line uses, as one string ("" for none): a voice made under other rules for those words is stale. */
export function rulesFor(text, merged) {
  const used = MONEY.test(text) ? ["#money=words"] : [];
  for (const [key, r] of merged) {
    const p = /[A-Za-z0-9]/.test(key) ? `(?<![A-Za-z0-9])${escRx(key)}(?![A-Za-z0-9])` : escRx(key);
    if (new RegExp(p, "i").test(text)) used.push(`${key}=${r.spoken}`);
  }
  return used.sort().join("\n");
}

/** The rules a line uses under a voice: Paradee's only; a Gemini or ElevenLabs voice reads the words as written. */
export const rulesOf = (text, merged, voice) => (voice.engine === "paradee" ? rulesFor(text, merged) : "");

/** The plan's speed, or the default; a value out of 0.7–1.0 is reported by load(). */
export function planSpeed(plan) {
  const v = Number(plan?.fields?.find((f) => f.key === SPEED_FIELD)?.value);
  return v >= 0.7 && v <= 1 ? v : DEFAULT_SPEED;
}

/** Why a step's voice no longer fits it, or null. */
export function voiceStale(v, narration, speed, rules, voice = "paradee") {
  if (v.text !== narration) return "คำพูดแก้แล้ว";
  if ((v.voice || "paradee") !== voice) return "เปลี่ยนเสียงพากย์";
  if (Math.abs(v.speed - speed) > 0.001) return `ความเร็ว ${v.speed} ไม่ใช่ ${speed}`;
  if (v.rules !== rules) return "คำอ่านเปลี่ยน";
  if (voice === "paradee" && v.engine < VOICE_ENGINE) return "เสียงรุ่นเก่า (ไม่เว้นจังหวะท้ายประโยค)";
  return null;
}

const versionDirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
  .map((n) => /^v(\d+)$/.exec(n)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);

/** The whole plan with each lesson's versions, status and problems. */
export function load(clipsDir) {
  const problems = [];
  const planFile = path.join(clipsDir, "plan.md");
  if (!fs.existsSync(planFile)) return { plan: null, lessons: [], problems: [`${planFile}: no plan yet`] };
  const { plan, problems: pp } = parsePlan(fs.readFileSync(planFile, "utf8"), "clips/plan.md");
  problems.push(...pp);
  const speedField = plan.fields.find((f) => f.key === SPEED_FIELD);
  if (speedField && !(Number(speedField.value) >= 0.7 && Number(speedField.value) <= 1)) {
    problems.push(`clips/plan.md: '- ${SPEED_FIELD}: ${speedField.value}' is a number from 0.7 (slow) to 1.0 (normal)`);
  }
  const speed = planSpeed(plan);
  const voiceFieldOf = plan.fields.find((f) => f.key === VOICE_FIELD);
  const badVoice = voiceFieldOf && parseVoice(voiceFieldOf.value).error;
  if (badVoice) problems.push(`clips/plan.md: '- ${VOICE_FIELD}:' ${badVoice}`);
  const voice = planVoice(plan);
  const lexicon = readLexicon(clipsDir);
  const lessons = plan.toc.map(({ id, title, apps: keys, teaches, sources }) => {
    const dir = path.join(clipsDir, id);
    const file = path.join(dir, "lesson.md");
    const rel = `clips/${id}/lesson.md`;
    const apps = keys.map((k) => plan.apps.find((a) => a.key === k)).filter(Boolean);
    const kinds = [...new Set(apps.flatMap((a) => a.kinds))];
    const topic = { id, tocTitle: title, appKeys: keys, apps, kinds, teaches, sources };
    // a contents entry with no lesson.md yet is a topic: agreed on first, its steps written later
    if (!fs.existsSync(file)) return { ...topic, title, fields: [], steps: [], cards: [], versions: [], latest: null, status: "topic" };
    const text = fs.readFileSync(file, "utf8");
    const { lesson, problems: lp } = parseLesson(text, rel);
    problems.push(...lp);
    const shots = readShots(dir);
    const voices = readVoices(dir);
    for (const s of spokenParts(lesson)) {
      s.present = {};
      s.made = {};
      for (const img of s.images ?? []) {
        s.present[img] = fs.existsSync(path.join(dir, img));
        s.made[img] = s.present[img] && img in shots.pictures ? shots.pictures[img] : null;
      }
      if (s.slide) s.slidePresent = fs.existsSync(path.join(dir, s.slide));
      const v = voices[s.n];
      const why = v && s.narration ? voiceStale(v, s.narration, speed, rulesOf(s.narration, lexicon.merged, voice), voice.key) : null;
      s.voice = v && s.narration && fs.existsSync(path.join(dir, VOICE_DIR, voiceFile(s.n)))
        ? { file: `${VOICE_DIR}/${voiceFile(s.n)}`, durationMs: v.durationMs, stale: !!why, why, date: v.date } : null;
    }
    const versions = versionDirs(dir).map((n) => {
      const vdir = path.join(dir, `v${n}`);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(vdir, "version.json"), "utf8")); } catch { /* an older or hand-made folder */ }
      // Only the known fields, as strings: the number comes from the folder, never from the file.
      const str = (v) => (typeof v === "string" ? v : undefined);
      return { ...meta, n, date: str(meta.date), appCommit: str(meta.appCommit), hasMp4: fs.existsSync(path.join(vdir, "clip.mp4")) };
    });
    const latest = versions.at(-1);
    let textChanged = false, slidesChanged = false;
    if (latest) {
      const old = path.join(dir, `v${latest.n}`, "lesson.md");
      textChanged = fs.existsSync(old) && fs.readFileSync(old, "utf8").replace(/\r\n/g, "\n") !== text.replace(/\r\n/g, "\n");
      // a picture step's picture made again after the recording: the clip shows the old one
      slidesChanged = lesson.steps.some((s) => {
        if (!s.slidePresent) return false;
        const then = path.join(dir, `v${latest.n}`, s.slide);
        return !fs.existsSync(then) || !fs.readFileSync(then).equals(fs.readFileSync(path.join(dir, s.slide)));
      });
    }
    let compare = null;
    try { compare = JSON.parse(fs.readFileSync(path.join(dir, "compare.json"), "utf8")); } catch { /* not compared yet */ }
    const hasScenario = fs.existsSync(path.join(dir, "scenario.yaml"));
    const screensChanged = !!compare && latest && compare.against === latest.n && (compare.failed || compare.changed?.length > 0);
    const status = !latest ? (hasScenario ? "ready" : "draft") : textChanged || screensChanged || slidesChanged ? "changed" : "recorded";
    return { ...topic, ...lesson, title: lesson.title || title, versions, latest: latest?.n ?? null, textChanged, slidesChanged, compare, hasScenario, status, shotsFailed: shots.failed };
  });
  // a lesson folder the contents do not name: a typo in an id, or a folder left behind when the contents were renumbered
  const listed = new Set(plan.toc.map((t) => t.id));
  for (const name of fs.readdirSync(clipsDir)) {
    if (ID.test(name) && !listed.has(name) && fs.existsSync(path.join(clipsDir, name, "lesson.md"))) {
      problems.push(`clips/${name}/lesson.md: not in the contents of clips/plan.md (a renamed or renumbered lesson?)`);
    }
  }
  return { plan, lessons, problems, speed, voice, card: readCardTheme(path.dirname(path.resolve(clipsDir))), lexicon: { global: lexicon.global, project: lexicon.project } };
}

// ---- page ------------------------------------------------------------------------------------------------------------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATUS = {
  topic: ["หัวข้อ", "topic"], draft: ["ร่าง", "draft"], ready: ["พร้อมอัด", "ready"], recorded: ["อัดแล้ว", "recorded"], changed: ["ต้องอัดใหม่", "changed"],
};
const url = (p) => p.split("/").map(encodeURIComponent).join("/");

function editButton(target, quote) {
  return `<button class="edit" data-target="${esc(target)}" data-quote="${esc(quote)}" title="ขอให้ AI แก้">✎ แก้</button>`;
}
// a request added to the tray in one click: the words are what /mclip:plan edit reads as "take the pictures" / "speak"
export const SHOTS_REQUEST = "ถ่ายรูปอ้างอิงใหม่";
export const VOICE_REQUEST = "สร้างเสียงให้ฟัง";
export const SLIDE_REQUEST = "สร้างรูปตามรายละเอียดรูป";
const quick = (target, text, label, title) =>
  `<button class="quick" data-target="${esc(target)}" data-text="${esc(text)}" title="${esc(title)}">${label}</button>`;

const appChip = (a) => `<span class="app">${a.kinds.map((k) => `<i class="k-${esc(k)}">${esc(KINDS[k] ?? k)}</i>`).join("")}${esc(a.name)}</span>`;
const MOBILE = (id) => `แอปมือถือ: mclip รุ่นนี้อัดคลิปได้เฉพาะเว็บ บทนี้มีแผนและรูปอ้างอิงที่ใส่เองใน clips/${id}/screen/ (ลงท้ายชื่อ -ios หรือ -android ถ้ารูปของเครื่องเดียว)`;

/** Lessons in contents order, grouped while the apps stay the same: [{ label, items: [{ l, i }] }]. */
function groups(lessons) {
  const out = [];
  lessons.forEach((l, i) => {
    const key = l.appKeys.join(",");
    if (out.at(-1)?.key !== key) out.push({ key, label: l.apps.length ? l.apps.map((a) => a.name).join(" + ") : "บทเรียน", items: [] });
    out.at(-1).items.push({ l, i });
  });
  return out;
}

function lessonSlide(l, index, live = false, card = {}) {
  const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
  const why = [];
  if (l.textChanged) why.push(`บทแก้หลัง v${l.latest}`);
  if (l.slidesChanged) why.push(`รูปประกอบเปลี่ยนหลัง v${l.latest}`);
  if (l.compare?.failed) why.push(`ถ่ายรูปไม่ผ่านที่ขั้น ${esc(l.compare.failed.step ?? "?")}: ${esc(l.compare.failed.message ?? "")}`);
  if (l.compare?.changed?.length) why.push(`หน้าจอเปลี่ยน ${l.compare.changed.length} รูป`);
  if (l.compare?.unavailable) why.push(esc(l.compare.unavailable));
  if (l.shotsFailed) why.push(`AI ถ่ายรูปไม่จบ: หยุดที่ขั้น ${esc(l.shotsFailed.step ?? "?")} ของ scenario.yaml — ${esc(l.shotsFailed.message)}`);
  // pictures are taken by the recorder: one web app only (a phone app's pictures are the user's)
  const shootable = l.appKeys.length <= 1 && l.kinds.every((k) => k === "web");
  const stale = spokenParts(l).filter((s) => s.voice?.stale).length;
  // a step's (or a card's) narration: a box to edit on the live page, else the words; then its voice
  // the live page edits every word the clip shows or says: บนจอ (a step's caption, a card's title), a card's คำรอง, พูด
  const isCard = (s) => s.n === "open" || s.n === "close";
  const sayBlock = (s) => `${live
    ? `<div class="live-say" data-id="${esc(l.id)}" data-step="${s.n}">
      <label class="lf"><span class="cap-tag">บนจอ</span><input data-f="caption" value="${esc(s.caption)}" placeholder="${isCard(s) ? "หัวข้อบนการ์ด" : "คำบนจอ สั้น บอกว่าทำอะไร"}"></label>
      ${isCard(s) ? `<label class="lf"><span class="cap-tag">คำรอง</span><input data-f="subtitle" value="${esc(s.subtitle ?? "")}" placeholder="${s.n === "close" ? "ขั้นตอนย่อ เช่น Login → เลือกเมนู → กดค้นหา" : "บรรทัดใต้หัวข้อ"}"></label>` : ""}
      <label class="lf"><span>พูด</span><textarea data-f="narration" rows="2" placeholder="คำพูด สั้น กระชับ ไม่มี ค่ะ/ครับ">${esc(s.narration)}</textarea></label>
      ${s.slide ? `<label class="lf"><span class="pic-tag">รูป</span><textarea data-f="brief" rows="2" placeholder="รูปนี้แสดงอะไร เช่น diagram ขั้นตอนอนุมัติ: ลูกค้าส่งเอกสาร → เจ้าหน้าที่ตรวจ → อนุมัติ">${esc(s.brief)}</textarea></label>` : ""}
      <div class="row"><button data-act="save">บันทึก</button><button class="go" data-act="save-voice">บันทึกและสร้างเสียง</button><em class="msg"></em></div></div>`
    : s.narration ? `<p class="say"><span>พูด</span>${esc(s.narration)}</p>` : ""}
    ${s.narration ? (s.voice
      ? `<p class="voice${s.voice.stale ? " stale" : ""}"><audio controls preload="none" src="${url(`${l.id}/${s.voice.file}`)}${s.voice.date ? `?v=${encodeURIComponent(s.voice.date)}` : ""}"></audio><small>${(s.voice.durationMs / 1000).toFixed(1)} วิ${s.voice.stale ? ` · ต้องสร้างใหม่: ${esc(s.voice.why)}` : ""}</small></p>`
      : `<p class="voice none"><small>ยังไม่มีเสียง</small></p>`) : ""}`;
  if (stale) why.push(`เสียง ${stale} ขั้นต้องสร้างใหม่ (คำพูด ความเร็ว หรือคำอ่านเปลี่ยนหลังสร้างเสียง)`);
  const changedImgs = new Set((l.compare?.changed ?? []).map((c) => c.image));
  const own = [["สอน", l.teaches], ["ที่มา", l.sources]].filter(([, v]) => v).map(([key, value]) => ({ key, value }));
  const fields = [...own, ...l.fields].map((f) => `<div class="kv"><span>${esc(f.key)}</span><p>${esc(f.value)}</p></div>`).join("");
  const mobile = l.kinds.some((k) => k !== "web");
  const both = l.kinds.includes("ios") && l.kinds.includes("android");
  // a picture step: its picture (slides/...) where a step's screens go, made by the AI from its รายละเอียดรูป (or the
  // user's own file under that name); its words and voice as any step's
  const slideStep = (s) => {
    const pic = s.slidePresent
      ? `<figure class="slide-pic"><a href="${url(`${l.id}/${s.slide}`)}" target="_blank"><img loading="lazy" src="${url(`${l.id}/${s.slide}`)}" alt="${esc(s.brief || s.title)}"></a><figcaption><i class="by pic">รูปประกอบ</i> ${esc(s.slide)}</figcaption></figure>`
      : `<figure class="missing slide-pic"><div>ยังไม่มีรูป — กด "สร้างรูป" ให้ AI ทำจากรายละเอียดรูป<br>หรือวางรูปของคุณเองชื่อ ${esc(s.slide)}</div><figcaption>${esc(s.slide)}</figcaption></figure>`;
    return `<li class="step slide-step" id="${esc(`${l.id}-${s.n}`)}">
      <div class="pics">${pic}</div>
      <div class="words">
        <h4><b>${s.n}</b> ${esc(s.title)} <i class="kind">ขั้นรูป</i> ${editButton(`${l.id} ขั้น ${s.n}`, s.caption)}${quick(`${l.id} ขั้น ${s.n}`, SLIDE_REQUEST, s.slidePresent ? "สร้างรูปใหม่" : "สร้างรูป", "ให้ AI สร้างรูปจากรายละเอียดรูป (เก็บไว้ในคำขอ)")}${s.narration && !live ? quick(`${l.id} ขั้น ${s.n}`, VOICE_REQUEST, "สร้างเสียง", "ให้ AI สร้างเสียงคำพูดขั้นนี้ (เก็บไว้ในคำขอ)") : ""}${live ? `<button class="live-btn del" data-act="remove-step" data-id="${esc(l.id)}" data-step="${s.n}" title="ลบขั้นรูปนี้ (ไฟล์รูปยังอยู่ใน slides/)">ลบขั้นนี้</button>` : ""}</h4>
        ${live ? "" : `${s.brief ? `<p class="brief"><span>รูป</span>${esc(s.brief)}</p>` : ""}<p class="cap"><span>บนจอ</span>${esc(s.caption)}</p>`}
        ${sayBlock(s)}
        ${s.manual ? `<p class="man"><span>คู่มือ</span>${esc(s.manual)}</p>` : ""}
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      </div></li>`;
  };
  // live: a button between the steps (after the opening card, after each step) that inserts a picture step there
  const insertAt = (after) => (live ? `<li class="insert"><button class="ins" data-id="${esc(l.id)}" data-after="${after}" title="แทรกขั้นที่แสดงรูป (diagram, ภาพรวม) ตรงนี้">＋ แทรกขั้นรูป</button></li>` : "");
  const steps = l.steps.map((s) => {
    if (s.slide) return slideStep(s) + insertAt(s.n);
    const pics = s.images.length
      ? s.images.map((img) => {
        const changed = changedImgs.has(img) && l.latest
          ? `<a class="old" href="${url(`${l.id}/v${l.latest}/${img}`)}" target="_blank"><img loading="lazy" src="${url(`${l.id}/v${l.latest}/${img}`)}" alt=""><em>v${l.latest}</em></a>` : "";
        const plat = platformOf(img);
        const tag = plat ? ` data-plat="${plat}"` : "";
        const who = s.made?.[img] ? `<i class="by ai">AI ถ่าย${s.made[img].date ? ` ${esc(s.made[img].date.slice(0, 10))}` : ""}</i>` : `<i class="by own">รูปที่ใส่เอง</i>`;
        return s.present?.[img]
          ? `<figure class="${changed ? "diff" : ""}"${tag}>${changed}<a href="${url(`${l.id}/${img}`)}" target="_blank"><img loading="lazy" src="${url(`${l.id}/${img}`)}" alt="${esc(img)}"></a><figcaption>${who} ${esc(img)}${changed ? " · เปลี่ยน" : ""}</figcaption></figure>`
          : `<figure class="missing"${tag}><div>ยังไม่มีรูป${plat ? ` (${KINDS[plat]})` : ""}</div><figcaption>${esc(img)}</figcaption></figure>`;
      }).join("")
      : `<figure class="missing"><div>ไม่มีรูป</div></figure>`;
    return `<li class="step" id="${esc(`${l.id}-${s.n}`)}">
      <div class="pics">${pics}</div>
      <div class="words">
        <h4><b>${s.n}</b> ${esc(s.title)} ${editButton(`${l.id} ขั้น ${s.n}`, s.caption)}${shootable && s.images.length ? quick(`${l.id} ขั้น ${s.n}`, SHOTS_REQUEST, "ถ่ายรูป", "ให้ AI ถ่ายรูปขั้นนี้ใหม่ (เก็บไว้ในคำขอ)") : ""}${s.narration && !live ? quick(`${l.id} ขั้น ${s.n}`, VOICE_REQUEST, "สร้างเสียง", "ให้ AI สร้างเสียงคำพูดขั้นนี้ (เก็บไว้ในคำขอ)") : ""}</h4>
        <p class="act">${esc(s.action)}</p>
        ${live ? "" : `<p class="cap"><span>บนจอ</span>${esc(s.caption)}</p>`}
        ${sayBlock(s)}
        ${s.manual ? `<p class="man"><span>คู่มือ</span>${esc(s.manual)}</p>` : ""}
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      </div></li>${insertAt(s.n)}`;
  }).join("");
  // the clip's opening and closing title cards, around the steps: what the card shows and what is said over it, drawn
  // as the recorder draws it (the theme of tools/TutorialRecorder/tutorial.settings.json, overlay.js's layout)
  const colors = cardColors(card);
  const cardStyle = `--p-backdrop:${colors.backdrop};--p-panel:${colors.panel};--p-ink:${colors.ink};--p-accent:${colors.accent};--p-soft:${colors.soft}${card.font && /^[\w\s\-'.]{1,60}$/.test(card.font) ? `;font-family:'${card.font}',${FONT_STACK}` : ""}`;
  const cardNote = card.primary ? "" : `<p class="note">สีการ์ด: ยังไม่ได้ตั้ง <code>card</code> ใน tools/TutorialRecorder/tutorial.settings.json — ภาพนี้ใช้สีเริ่มต้น ตอนอัดจะใช้สีที่หน้า Login ของแอปแสดง</p>`;
  const cardBlock = (n) => {
    const c = l.cards.find((x) => x.n === n) ?? { n, caption: n === "open" ? l.title : "สรุปขั้นตอน", subtitle: "", narration: "", missing: true };
    const name = n === "open" ? "เปิด" : "สรุป", label = n === "open" ? "การ์ดเปิดคลิป" : "การ์ดสรุปท้ายคลิป";
    const steps = (c.subtitle || "").split(/\s*→\s*/).filter(Boolean);
    const recap = steps.length >= 2;
    // the app's screen the card stands on: the lesson's first picture for the opening, its last for the summary
    const shot = (n === "open" ? l.steps : [...l.steps].reverse()).flatMap((s) => (n === "open" ? s.images : [...s.images].reverse()).filter((img) => s.present?.[img]))[0];
    const num = /^(\d{2,3})-/.exec(l.id)?.[1];
    const preview = `<div class="card-pic" style="${cardStyle}">${shot ? `<img class="cp-app" loading="lazy" src="${url(`${l.id}/${shot}`)}" alt="">` : ""}
        <div class="cp-panel"><div class="cp-brand">${esc(card.name ?? "")}</div><div class="cp-main">${!recap && num ? `<span class="cp-num">${num}</span>` : ""}<b class="${recap ? "recap" : c.caption.length > 30 ? "long" : ""}">${esc(c.caption)}</b>${recap ? `<ol>${steps.map((x, i) => `<li><i>${i + 1}</i>${esc(x)}</li>`).join("")}</ol>` : c.subtitle ? `<span class="cp-sub">${esc(c.subtitle)}</span>` : ""}</div></div><div class="cp-seam"></div></div>`;
    return `<li class="step card-step" id="${esc(`${l.id}-${n}`)}">
      ${preview}
      <div class="words">
        <h4><b>${n === "open" ? "เปิด" : "สรุป"}</b> ${label} ${editButton(`${l.id} ${name}`, c.caption)}${c.narration && !live ? quick(`${l.id} ${name}`, VOICE_REQUEST, "สร้างเสียง", "ให้ AI สร้างเสียงคำพูดของการ์ดนี้ (เก็บไว้ในคำขอ)") : ""}</h4>
        ${c.missing ? `<p class="note">บทนี้ยังไม่มี${label}ใน lesson.md${live ? " — พิมพ์คำพูดแล้วบันทึกเพื่อเพิ่ม" : " — กด ✎ แก้ เพื่อขอให้ AI เพิ่ม"}</p>` : ""}${n === "open" ? cardNote : ""}
        ${live ? "" : `<p class="cap"><span>บนจอ</span>${esc(c.caption)}</p>${c.subtitle ? `<p class="cap"><span>คำรอง</span>${esc(c.subtitle)}</p>` : ""}`}
        ${sayBlock(c)}
      </div></li>`;
  };
  const stepsAndCards = `${cardBlock("open")}${insertAt(0)}${steps}${cardBlock("close")}`;
  const versions = l.versions.length
    ? `<div class="versions">${l.versions.map((v) => `<span class="ver">v${v.n}${v.date ? ` · ${esc(v.date.slice(0, 10))}` : ""}${v.appCommit ? ` · ${esc(v.appCommit.slice(0, 7))}` : ""}${v.hasMp4 ? ` · <a href="${url(`${l.id}/v${v.n}/clip.mp4`)}" target="_blank">คลิป</a>` : " · คลิปไม่อยู่ในเครื่องนี้"}</span>`).join("")}</div>`
    : "";
  const plat = both ? `<span class="plat"><button class="on" data-plat="">ทุกเครื่อง</button><button data-plat="ios">iPhone</button><button data-plat="android">Android</button></span>` : "";
  const body = l.status === "topic"
    ? `<p class="topic-note">ยังไม่มีขั้นตอน — เป็นหัวข้อที่ตกลงกันก่อน เมื่อหัวข้อนี้ใช้ได้แล้ว สั่ง <code>/mclip:plan lesson ${esc(l.id)}</code> ให้ AI เขียนขั้นตอนและคำพูด แล้ว <code>/mclip:plan shots voice ${esc(l.id)}</code> ให้ AI ถ่ายรูปอ้างอิงและสร้างเสียงให้ฟัง</p>`
    : `<ol class="steps">${stepsAndCards}</ol>`;
  const voiced = spokenParts(l).some((s) => s.voice);
  const tools = l.status === "topic" ? "" : `${voiced ? `<button class="play-all" title="เล่นเสียงทุกขั้นต่อกัน">▶ ฟังทั้งบท</button>` : ""}${live && l.steps.some((s) => s.narration) ? `<button class="live-btn" data-act="voice-lesson" data-id="${esc(l.id)}" title="สร้างเสียงขั้นที่ยังไม่มีหรือต้องสร้างใหม่ ตอนนี้เลย">สร้างเสียงทั้งบทตอนนี้</button>` : ""}${shootable && l.steps.some((s) => s.images.length) ? quick(l.id, SHOTS_REQUEST, "ถ่ายรูปทั้งบท", "ให้ AI ถ่ายรูปอ้างอิงทั้งบท (เก็บไว้ในคำขอ)") : ""}${l.steps.some((s) => s.narration) && !live ? quick(l.id, VOICE_REQUEST, "สร้างเสียงทั้งบท", "ให้ AI สร้างเสียงทุกขั้น (เก็บไว้ในคำขอ)") : ""}`;
  return `<section class="slide lesson" data-id="${esc(l.id)}" data-title="${esc(`${index}. ${l.title}`)}">
    <header><span class="num">${esc(l.id.slice(0, 2))}</span><h2>${esc(l.title)}</h2><span class="badge ${cls}">${label}${l.latest ? ` v${l.latest}` : ""}</span>${plat}${tools}${editButton(l.id, l.title)}</header>
    ${l.apps.length ? `<div class="apps">${l.apps.map(appChip).join("")}</div>` : ""}
    ${why.length ? `<p class="why">${why.join(" · ")}</p>` : ""}
    ${mobile ? `<p class="why mobile">${esc(MOBILE(l.id))}</p>` : ""}
    <div class="fields">${fields}</div>${versions}
    ${body}
  </section>`;
}

/**
 * The plan page. `live` ({ token }) is the page `serve.mjs` hands out: narration edited in place and spoken at once,
 * the speed and the project's words saved from the page. Without it the page is a file that copies requests.
 */
/** How the page names a voice: `ElevenLabs: Rachel (eleven_v3)`. */
export const voiceLabel = (v) => (v.engine === "paradee" ? ENGINES.paradee.label
  : `${ENGINES[v.engine].label}: ${v.name || v.voice} (${v.model})${v.style ? ` · สไตล์: ${v.style}` : ""}`);

/** The live page's forms: a picture step to insert, a topic to add (its app and its place among the lessons). */
function liveDialogs(p, lessons) {
  return `<dialog id="insBox" class="form"><h3>แทรกขั้นรูป</h3>
<p class="quote">ขั้นที่แสดงรูปเต็มจอ เช่น diagram ภาพรวมระบบ ขั้นตอนอนุมัติ มีคำบนจอ คำพูด และเสียง เหมือนขั้นอื่น</p>
<label>หัวข้อขั้น<input id="insTitle" maxlength="120" placeholder="เช่น ภาพรวมการอนุมัติ"></label>
<label>รูปนี้แสดงอะไร (AI สร้างรูปจากข้อนี้)<textarea id="insBrief" rows="3" placeholder="เช่น diagram: ลูกค้าส่งเอกสาร → เจ้าหน้าที่ตรวจ → หัวหน้าอนุมัติ → แจ้งลูกค้า"></textarea></label>
<label>บนจอ<input id="insCap" maxlength="300" placeholder="คำสั้น ๆ บนจอ (ว่าง = ใช้หัวข้อขั้น)"></label>
<label>พูด<textarea id="insSay" rows="2" placeholder="คำพูด สั้น กระชับ ไม่มี ค่ะ/ครับ"></textarea></label>
<label class="check"><input type="checkbox" id="insAsk" checked> ขอให้ AI สร้างรูปนี้ (เก็บไว้ในคำขอ)</label>
<p class="msg" id="insMsg"></p>
<div class="row"><button id="insCancel">ยกเลิก</button><button class="go" id="insGo">แทรกขั้น</button></div></dialog>
<dialog id="topicBox" class="form"><h3>เพิ่มหัวข้อ</h3>
<label>ชนิด<select id="tpKind"><option value="overview">แนะนำระบบ: ขั้นรูป เช่น diagram ภาพรวม (เขียนบทเริ่มต้นให้เลย)</option><option value="task">ขั้นตอนใช้งาน: AI เขียนขั้นตอนให้ภายหลัง</option></select></label>
<label>ชื่อหัวข้อ<input id="tpTitle" maxlength="120" placeholder="เช่น แนะนำระบบ"></label>
<label>ชื่อย่อภาษาอังกฤษ ใช้ตั้งชื่อโฟลเดอร์<input id="tpSlug" maxlength="40" placeholder="overview"></label>
<label>สอนอะไร<input id="tpTeaches" maxlength="300" placeholder="ผู้ชมรู้อะไรหลังดูจบ"></label>
${p.apps.length > 1 ? `<label>แอป<select id="tpApp">${p.apps.map((a) => `<option value="${esc(a.key)}">${esc(a.name)} (${esc(a.key)})</option>`).join("")}</select></label>` : ""}
<label>ตำแหน่งในสารบัญ<select id="tpAfter"><option value="">แรกสุด</option>${lessons.map((l) => `<option value="${esc(l.id)}">ต่อจาก ${esc(l.id.slice(0, 2))} ${esc(l.title)}</option>`).join("")}</select></label>
<p class="msg" id="tpMsg"></p>
<div class="row"><button id="tpCancel">ยกเลิก</button><button class="go" id="tpGo">เพิ่มหัวข้อ</button></div></dialog>`;
}

export function renderPage({ plan, lessons, problems, speed = DEFAULT_SPEED, voice = PARADEE, card = {}, lexicon = { global: [], project: [] } }, builtAt = new Date(), { live = null } = {}) {
  const p = plan ?? { title: "ยังไม่มีแผน", fields: [], toc: [], apps: [] };
  const built = builtAt.toISOString().replace("T", " ").slice(0, 16);
  const counts = Object.keys(STATUS).map((k) => [k, lessons.filter((l) => l.status === k).length]).filter(([, n]) => n);
  // the cover: the plan's name, then the production strip: one cell per lesson in the plan's order, coloured by where it
  // stands (topic → draft → ready → recorded, or changed), a click away from the lesson
  const cover = `<section class="slide cover" data-title="ปก">
    <p class="sub">แผนคลิปสอนการใช้งาน ${lessons.length} บท</p><h1>${esc(p.title)}</h1>
    ${lessons.length ? `<div class="strip" role="list">${lessons.map((l, i) => {
      const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
      return `<a href="#" role="listitem" class="cell ${cls}" data-go="${i + 3}" title="${esc(`${l.id.slice(0, 2)} ${l.title} (${label})`)}">${esc(l.id.slice(0, 2))}</a>`;
    }).join("")}</div>
    <ul class="legend">${counts.map(([k, n]) => `<li><i class="dot ${STATUS[k][1]}"></i>${STATUS[k][0]} <b>${n}</b></li>`).join("")}</ul>` : ""}
    <p class="built">สร้างหน้านี้เมื่อ ${esc(built)} UTC${live ? " — คำที่แก้ในหน้านี้บันทึกลงไฟล์ทันที ส่วนคำขอแก้ที่เก็บไว้ สั่ง /mclip:plan edit ให้ AI ทำ" : " — กดปุ่ม ✎ แก้ ที่จุดไหนก็ได้ แล้วคัดลอกคำสั่งไปวางใน Claude Code"}</p></section>`;
  const scope = `<section class="slide scope" data-title="ขอบเขตและรูปแบบ">
    <header><h2>ขอบเขตและรูปแบบ</h2>${editButton("plan", p.title)}</header>
    <div class="fields big">${p.fields.filter((f) => f.key !== SPEED_FIELD && f.key !== VOICE_FIELD && f.key !== STYLE_FIELD).map((f) => `<div class="kv"><span>${esc(f.key)}</span><p>${esc(f.value)}</p>${editButton(`plan ${f.key}`, f.value)}</div>`).join("")}</div>
    <h3>เสียงพากย์</h3>
    <div class="fields big">${live
      ? `<div class="kv live-voice" data-engine="${voice.engine}" data-voice="${esc(voice.voice)}" data-model="${esc(voice.model)}" data-name="${esc(voice.name)}" data-style="${esc(voice.style)}"><span>${VOICE_FIELD}</span>
        <p>ตอนนี้: <b>${esc(voiceLabel(voice))}</b></p>
        <div class="row"><select class="v-engine">${Object.entries(ENGINES).map(([k, e]) => `<option value="${k}">${esc(e.label)}</option>`).join("")}</select>
        <select class="v-voice"></select><input class="v-model" size="22" title="model"></div>
        <div class="row v-style-row"><label>${STYLE_FIELD} <input class="v-style" size="30" maxlength="200" list="v-styles" placeholder="เช่น Friendly, warm and friendly"></label>
        <datalist id="v-styles">${STYLE_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join("")}</datalist><small class="v-hint">พิมพ์ได้เอง ว่าง = ปกติ</small></div>
        <p class="v-key"></p>
        <div class="row"><button data-act="voice-try">ลองฟัง</button><button class="go" data-act="voice-use">ใช้เสียงนี้</button><em class="msg"></em></div>
        <audio class="v-sample" controls hidden></audio>
        <p class="note">เสียงจาก Google หรือ ElevenLabs: ส่งคำพูดไปที่บริษัทนั้นและคิดเงินตามที่ใช้ · key อยู่ใน tools/TutorialRecorder/tts/keys.json (ไม่ถูก commit) · พูดตามจังหวะปกติของเสียงนั้น แล้วชะลอตามความเร็วด้านล่าง · เปลี่ยนเสียงแล้ว ทุกขั้นขึ้น "ต้องสร้างใหม่"</p></div>`
      : `<div class="kv"><span>${VOICE_FIELD}</span><p>${esc(voiceLabel(voice))}${p.fields.some((f) => f.key === VOICE_FIELD) ? "" : " (ค่าเริ่มต้น)"}</p>${editButton(`plan ${VOICE_FIELD}`, voiceField(voice) + (voice.style ? `; ${STYLE_FIELD}: ${voice.style}` : ""))}</div>`}
    <div class="kv"><span>${SPEED_FIELD} (0.70 ช้า – 1.00 ปกติ)</span>${live
      ? `<p class="live-speed"><select>${[0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1].map((v) => `<option value="${v}"${Math.abs(v - speed) < 0.001 ? " selected" : ""}>${v.toFixed(2)}</option>`).join("")}</select> <button data-act="speed">บันทึกความเร็ว</button><em class="msg"></em></p>`
      : `<p>${speed.toFixed(2)}${p.fields.some((f) => f.key === SPEED_FIELD) ? "" : " (ค่าเริ่มต้น)"}</p>${editButton(`plan ${SPEED_FIELD}`, speed.toFixed(2))}`}</div>
    <div class="kv"><span>คำอ่าน: คำที่เสียงอ่านผิด เขียนเป็นคำอ่านไทย (มีผลกับเสียงเท่านั้น ไม่เปลี่ยนคำบนจอ) · ใช้กับ Paradee เท่านั้น: เสียง Gemini / ElevenLabs อ่านบทพูดตามที่เขียน รวมทั้งราคา</span>
      ${lexicon.global.length ? `<p class="lex"><b>ทุกโปรเจกต์ (plugin)</b> ${lexicon.global.map((r) => `<code>${esc(r.written)}</code> → ${esc(r.spoken)}`).join(" · ")}</p>` : ""}
      ${live
        ? `<div class="live-lex"><b>โปรเจกต์นี้ (clips/lexicon.txt)</b> บรรทัดละคำ: <code>คำที่เขียน = คำอ่าน</code><textarea rows="4">${esc(lexicon.project.map((r) => `${r.written} = ${r.spoken}`).join("\n"))}</textarea><div class="row"><button data-act="lexicon">บันทึกคำอ่าน</button><em class="msg"></em></div></div>`
        : `<p class="lex"><b>โปรเจกต์นี้</b> ${lexicon.project.length ? lexicon.project.map((r) => `<code>${esc(r.written)}</code> → ${esc(r.spoken)}`).join(" · ") : "ยังไม่มี"}</p>${editButton("plan คำอ่าน", "")}`}
    </div></div>
    ${p.apps.length ? `<h3>แอปในแผนนี้ (${p.apps.length})</h3><div class="app-cards">${p.apps.map((a) => `<div class="app-card">${editButton(`plan แอป ${a.key}`, a.name)}
      <h4>${appChip(a)}</h4><code>${esc(a.key)}</code>
      ${[["โค้ด", a.code], ["เทสต์", a.tests], ["e2e", a.e2e], ["url", a.url]].filter(([, v]) => v).map(([k, v]) => `<p><span>${k}</span>${esc(v)}</p>`).join("")}
      <p><span>บทเรียน</span>${lessons.filter((l) => l.appKeys.includes(a.key)).length}</p></div>`).join("")}</div>` : ""}</section>`;
  const toc = `<section class="slide toc" data-title="สารบัญ">
    <header><h2>สารบัญ</h2>${live ? `<button class="live-btn go" id="addTopic" title="เพิ่มหัวข้อลงสารบัญ เช่น แนะนำระบบ ภาพรวม">＋ เพิ่มหัวข้อ</button>` : ""}${editButton("plan สารบัญ", "")}</header>
    <ol class="toc-list">${groups(lessons).map((g) => `${p.apps.length ? `<li class="grp">${esc(g.label)}</li>` : ""}${g.items.map(({ l, i }) => {
      const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
      const first = l.steps.flatMap((s) => s.images.filter((img) => s.present?.[img]))[0];
      return `<li><a href="#" data-go="${i + 3}">${first ? `<img loading="lazy" src="${url(`${l.id}/${first}`)}" alt="">` : `<div class="noimg">${esc(l.id.slice(0, 2))}</div>`}
        <div><b>${esc(l.id.slice(0, 2))}</b> ${esc(l.title)}${l.teaches ? `<small>${esc(l.teaches)}</small>` : ""}<small>${l.status === "topic" ? "ยังไม่มีขั้นตอน" : `${l.steps.length} ขั้น`}</small></div><span class="badge ${cls}">${label}${l.latest ? ` v${l.latest}` : ""}</span></a></li>`;
    }).join("")}`).join("")}</ol></section>`;
  const issues = problems.length
    ? `<section class="slide problems" data-title="ปัญหาในไฟล์แผน"><header><h2>ปัญหาในไฟล์แผน</h2></header><ul>${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
  const slides = [cover, scope, toc, ...lessons.map((l, i) => lessonSlide(l, i + 1, !!live, card)), issues].join("\n");
  // the left menu: the plan's own pages, then each lesson (main item) with its steps (sub items)
  const side = `<a class="item" data-go="0">ปก</a><a class="item" data-go="1">ขอบเขตและรูปแบบ</a><a class="item" data-go="2">สารบัญ</a>
    ${groups(lessons).map((g) => `<div class="group">${esc(g.label)}</div>${g.items.map(({ l, i }) => {
      const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
      return `<div class="lesson-menu"><a class="item lesson" data-go="${i + 3}"><b>${esc(l.id.slice(0, 2))}</b><span>${esc(l.title)}</span><i class="dot ${cls}" title="${label}"></i></a>
        <ol class="sub">${l.steps.length ? `<li><a data-go="${i + 3}" data-step="${esc(`${l.id}-open`)}">เปิด · การ์ดเปิดคลิป</a></li>` : ""}${l.steps.map((s) => `<li><a data-go="${i + 3}" data-step="${esc(`${l.id}-${s.n}`)}">${s.n}. ${esc(s.title)}</a></li>`).join("")}${l.steps.length ? `<li><a data-go="${i + 3}" data-step="${esc(`${l.id}-close`)}">สรุป · การ์ดสรุป</a></li>` : ""}</ol></div>`;
    }).join("")}`).join("")}${problems.length ? `<a class="item warn" data-go="${lessons.length + 3}">ปัญหาในไฟล์แผน (${problems.length})</a>` : ""}`;
  // replacer functions: a '$' in the plan's words must not be read as a replacement pattern
  // live: the token goes in as JSON inside a script, '<' escaped so no text can close the script
  const liveTag = live ? `<script>window.MCLIP=${JSON.stringify({ token: live.token, requests: live.requests ?? [], keys: live.keys ?? {}, engines: ENGINES, gemini: GEMINI_VOICES }).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")};</script>${liveDialogs(p, lessons)}` : "";
  return PAGE.replace("{{TITLE}}", () => esc(p.title)).replace("{{NAME}}", () => esc(p.title)).replace("{{SIDE}}", () => side).replace("{{SLIDES}}", () => slides).replace("{{BUILT}}", () => esc(built)).replace("{{LIVE}}", () => liveTag);
}

const PAGE = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{TITLE}} · แผนคลิป</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700&family=IBM+Plex+Sans+Thai+Looped:wght@400;500;600&display=swap">
<style>
/* light: a cool paper page, white sheets; blue = words on screen, orange = words spoken, green = the manual.
   Anuphan (loopless) for headings, numbers and controls; IBM Plex Sans Thai Looped for the words people read and edit.
   Offline, the fonts fall back to the machine's own Thai fonts. */
:root{--paper:#f2f5f9;--sheet:#fff;--ink:#1c2740;--muted:#5b6680;--line:#d9e0ea;--line2:#e9eef4;--soft:#f7f9fc;
  --blue:#2457c5;--blue-ink:#1a3f94;--blue-t:#e8effc;--orange:#ea6a12;--orange-ink:#b54708;--orange-t:#fff1e4;
  --green:#15803d;--green-t:#e6f5ec;--red:#c62828;--red-t:#fdecec;
  --head:"Anuphan","IBM Plex Sans Thai Looped","Leelawadee UI",Tahoma,system-ui,sans-serif;
  --body:"IBM Plex Sans Thai Looped","Noto Sans Thai Looped","Leelawadee UI",Tahoma,system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 var(--body)}
h1,h2,h3,h4,nav,aside,button,.badge,.num,.cell{font-family:var(--head)}
button,input,select,textarea{color:inherit}
:is(a,button,input,select,textarea,summary):focus-visible{outline:2px solid var(--blue);outline-offset:2px}
nav{position:sticky;top:0;z-index:6;height:56px;display:flex;gap:8px;align-items:center;padding:0 18px;background:#ffffffeb;backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
nav button{font:500 15px/1.4 var(--head);border:1px solid var(--line);border-radius:8px;padding:6px 14px;background:var(--sheet);cursor:pointer;flex:none}
nav button:hover{border-color:var(--blue);color:var(--blue-ink)}
nav .where{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600;font-size:17px}
nav .tray{background:var(--orange-t);border-color:#f3c9a3;color:var(--orange-ink);font-weight:600}nav .tray:hover{border-color:var(--orange);color:var(--orange-ink)}
nav .tray.added{background:var(--green-t);border-color:#a7dcbc;color:var(--green)}#menu{display:none}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr)}
aside{position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;background:var(--sheet);border-right:1px solid var(--line);padding:14px 10px 40px}
aside a{display:flex;gap:10px;align-items:baseline;color:inherit;text-decoration:none;border-radius:8px;cursor:pointer}
aside .item{padding:8px 10px;font-weight:500;line-height:1.45}aside .item:hover,aside .sub a:hover{background:var(--soft)}
aside .item.on{background:var(--blue-t);color:var(--blue-ink);box-shadow:inset 3px 0 var(--blue)}aside .item.warn{color:var(--red)}
aside .lesson b{color:var(--blue);min-width:24px;font-weight:700;font-variant-numeric:tabular-nums}aside .lesson span{flex:1}
aside .group{margin:16px 10px 4px;font:500 13px/1.4 var(--head);color:var(--muted)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none;align-self:center;background:#c5cedb}
.dot.topic{background:var(--sheet);border:2px solid #9aa6b8}.dot.ready{background:var(--blue)}.dot.recorded{background:var(--green)}.dot.changed{background:var(--red)}
aside .sub{list-style:none;margin:2px 0 10px 22px;padding:0 0 0 10px;border-left:2px solid var(--line2);display:none}
aside .lesson-menu.open .sub{display:block}aside .sub a{padding:4px 8px;font:14px/1.5 var(--body);color:var(--muted)}aside .sub a.on{color:var(--blue-ink);font-weight:600;background:var(--blue-t)}
main{padding:20px;min-width:0}
.slide{display:none;background:var(--sheet);border:1px solid var(--line);border-radius:14px;padding:32px 36px;min-height:calc(100vh - 96px);max-width:1200px;margin:0 auto}
.slide.on{display:block}body.grid .slide{display:block;min-height:0;margin-bottom:20px}
.step{scroll-margin-top:72px}.step.flash{box-shadow:0 0 0 3px var(--orange)}
/* the cover: the plan's name over its production strip */
.cover{display:none;flex-direction:column;justify-content:center;padding:6% 7%}
.cover.on,body.grid .cover{display:flex}
.cover .sub{margin:0 0 6px;font:500 19px/1.5 var(--head);color:var(--blue)}
.cover h1{margin:0;max-width:22em;font-size:clamp(32px,4.8vw,58px);line-height:1.28;font-weight:700;letter-spacing:-.01em;text-wrap:balance}
.strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px;margin:40px 0 14px;max-width:820px}
.strip .cell{aspect-ratio:1;display:grid;place-items:center;border-radius:7px;font-weight:700;font-size:15px;text-decoration:none;font-variant-numeric:tabular-nums;color:var(--ink);background:#e3e8ef;border:1px solid transparent}
.strip .cell:hover{outline:2px solid var(--ink);outline-offset:2px}
.strip .topic{background:var(--sheet);border:1.5px dashed #9aa6b8;color:var(--muted)}.strip .ready{background:var(--blue-t);border-color:#b9cdf3;color:var(--blue-ink)}
.strip .recorded{background:var(--green);color:#fff}.strip .changed{background:var(--red-t);border-color:#f2b5b5;color:var(--red)}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 20px;margin:0;padding:0;color:var(--muted);font-size:15px}
.legend li{display:flex;align-items:center;gap:7px}.legend b{color:var(--ink)}
.cover .built{margin:36px 0 0;color:var(--muted);font-size:14px;max-width:60em}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
header h2{margin:0;font-size:30px;line-height:1.35;font-weight:700;flex:1;letter-spacing:-.005em}
h3{font-size:20px;font-weight:600;margin:26px 0 8px}
.num{color:var(--blue);font-weight:700;font-size:36px;line-height:1;font-variant-numeric:tabular-nums}
.badge{border-radius:6px;padding:2px 10px;font-size:13px;font-weight:600;line-height:1.6}
.badge.topic{background:var(--sheet);border:1px dashed #9aa6b8;color:var(--muted)}.badge.draft{background:#e3e8ef}.badge.ready{background:var(--blue-t);color:var(--blue-ink)}
.badge.recorded{background:var(--green-t);color:var(--green)}.badge.changed{background:var(--red-t);color:var(--red)}
.why{background:var(--orange-t);border-left:3px solid var(--orange);padding:8px 14px;border-radius:0 8px 8px 0}
.why.mobile{background:var(--green-t);border-left-color:var(--green)}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:8px 0 18px}.fields.big{grid-template-columns:1fr}
.kv{background:var(--soft);border:1px solid var(--line2);border-radius:10px;padding:10px 14px;position:relative}
.kv>span{display:block;color:var(--muted);font:500 13px/1.5 var(--head);margin-bottom:2px}.kv p{margin:0}.kv .edit{position:absolute;top:8px;right:8px}
.versions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.ver{background:var(--blue-t);color:var(--blue-ink);border-radius:6px;padding:2px 10px;font-size:14px}
.versions a{color:var(--blue-ink)}
/* the steps: one frame each, the picture on the left, the words on the right */
.steps{list-style:none;padding:0;margin:0;display:grid;gap:16px}
.step{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:20px;border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--sheet)}
.pics{display:grid;gap:8px}figure{margin:0}figure img{width:100%;border-radius:8px;border:1px solid var(--line);display:block}
figure.diff{display:grid;grid-template-columns:1fr 1fr;gap:6px}figure.diff figcaption{grid-column:1/-1;color:var(--red)}
.old{position:relative}.old em{position:absolute;left:6px;top:6px;background:#1c2740d9;color:#fff;font-style:normal;padding:0 6px;border-radius:4px;font-size:12px}
figcaption{font-size:12px;color:var(--muted);margin-top:4px}
figure.missing div{aspect-ratio:16/9;border:2px dashed var(--line);border-radius:8px;display:grid;place-items:center;color:var(--muted);background:var(--soft)}
.words h4{margin:0 0 8px;font-size:19px;font-weight:600;line-height:1.45;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.words h4 b{background:var(--blue-t);color:var(--blue-ink);border-radius:6px;padding:0 9px;font-weight:700;font-variant-numeric:tabular-nums}
.words p{margin:6px 0}
.words span{display:inline-block;min-width:48px;font:600 12px/1.6 var(--head);border-radius:5px;padding:0 7px;margin-right:8px;text-align:center}
.cap span{background:var(--blue-t);color:var(--blue-ink)}.say span{background:var(--orange-t);color:var(--orange-ink)}.man span{background:var(--green-t);color:var(--green)}
.act{color:var(--muted);font-size:15px}.note{font-size:14px;color:var(--muted)}
.card-step{background:var(--soft)}.card-step h4 b{background:var(--orange-t);color:var(--orange-ink)}
/* the table of contents */
.toc-list{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:14px}
.toc-list a{display:grid;grid-template-rows:auto 1fr auto;gap:8px;text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:12px;padding:10px;height:100%}
.toc-list a:hover{border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-t)}
.toc-list img,.noimg{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px}
.noimg{background:var(--blue-t);color:var(--blue);display:grid;place-items:center;font:700 40px/1 var(--head)}
.toc-list b{color:var(--blue);font-family:var(--head)}.toc-list small{display:block;color:var(--muted)}.toc-list .badge{justify-self:start}
.toc-list .grp{grid-column:1/-1;font:600 17px/1.5 var(--head);color:var(--blue-ink);border-bottom:1px solid var(--line);padding:8px 0 4px}
.problems li{color:var(--red)}
.apps{display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 12px}
.app{display:inline-flex;gap:6px;align-items:center;background:var(--soft);border:1px solid var(--line2);border-radius:999px;padding:2px 12px 2px 4px;font-size:14px;font-weight:600}
.app i{font-style:normal;font-size:12px;color:#fff;border-radius:999px;padding:0 8px}.k-web{background:var(--blue)}.k-ios{background:#2b3446}.k-android{background:var(--green)}
.topic-note{border:2px dashed var(--line);border-radius:12px;padding:20px;color:var(--muted);background:var(--soft)}
.app-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:12px}
.app-card{position:relative;border:1px solid var(--line);border-radius:12px;padding:14px}.app-card h4{margin:0 0 4px}.app-card .edit{position:absolute;top:10px;right:10px}
.app-card p{margin:2px 0;font-size:14px;overflow-wrap:anywhere}.app-card p span{display:inline-block;min-width:64px;color:var(--muted)}.app-card code{font-size:12px;color:var(--muted)}
.plat{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.plat button{font-size:13px;border:0;background:var(--sheet);padding:3px 10px;cursor:pointer}.plat button.on{background:var(--blue);color:#fff}
.slide:not([data-plat="ios"]):not([data-plat="android"]) .pics:has(> figure[data-plat]){grid-template-columns:1fr 1fr}
.slide[data-plat="ios"] figure[data-plat="android"],.slide[data-plat="android"] figure[data-plat="ios"]{display:none}
/* buttons: the request ones outlined, the ones that act now filled */
.quick,.edit,.play-all,.live-say button,.live-lex button,.live-speed button,.live-btn,.live-voice button{font:500 13px/1.6 var(--head);border-radius:7px;padding:1px 10px;cursor:pointer}
.quick{border:1px solid var(--line);background:var(--sheet)}.quick:hover{border-color:var(--blue);color:var(--blue-ink)}.quick.added{background:var(--green);border-color:var(--green);color:#fff}
.edit{border:1px solid #f3c9a3;background:var(--sheet);color:var(--orange-ink)}.edit:hover{background:var(--orange-t);border-color:var(--orange)}
.play-all{border:0;background:var(--orange-ink);color:#fff;padding:2px 12px}.play-all:hover{background:#963a06}
.live-say button,.live-lex button,.live-speed button,.live-btn,.live-voice button{border:1px solid var(--blue);background:var(--sheet);color:var(--blue-ink)}
.live-say button.go,.live-btn,.live-voice button.go{background:var(--blue);color:#fff}
button:disabled{opacity:.5;cursor:wait}.msg{font-size:13px;color:var(--muted)}
.voice{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.voice audio{height:32px;max-width:100%}.voice small{color:var(--muted)}.voice.stale small{color:var(--red);font-weight:600}
/* the words edited in place on the live page */
.live-say{margin:8px 0}.live-say .lf{display:block;margin:6px 0}
.live-say>span,.live-say .lf>span{display:inline-block;font:600 12px/1.6 var(--head);border-radius:5px;padding:0 7px;background:var(--orange-t);color:var(--orange-ink)}
.live-say .lf>span.cap-tag{background:var(--blue-t);color:var(--blue-ink)}
.live-say input,.live-say textarea,.live-lex textarea{width:100%;font:16px/1.6 var(--body);padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--sheet);margin:4px 0}
.live-say input:hover,.live-say textarea:hover,.live-lex textarea:hover{border-color:#b8c3d4}
.live-say .row,.live-lex .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.live-voice .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.live-voice select,.live-voice input,.live-speed select{font:14px/1.5 var(--body);padding:3px 8px;border-radius:7px;border:1px solid var(--line);background:var(--sheet);max-width:100%}
.live-voice .v-key{font-size:13px;color:var(--muted);margin:2px 0}.live-voice audio{height:32px;max-width:100%}
.lex code{background:var(--blue-t);color:var(--blue-ink);border-radius:4px;padding:0 5px}
.by{font-style:normal;font-size:11px;border-radius:4px;padding:0 6px;color:#fff}.by.ai{background:var(--blue)}.by.own{background:#6b7588}
/* picture steps (purple = the picture's brief) and the live page's insert, remove and add forms */
.slide-step{background:var(--soft)}.slide-pic img{background:#fff}
.words h4 .kind{font:500 12px/1.6 var(--head);font-style:normal;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:0 7px}
.brief span,.live-say .lf>span.pic-tag{background:#efe9fb;color:#5b3fa8}.by.pic{background:#6d4fc2}
.insert{list-style:none;display:flex;align-items:center;gap:10px;margin:-6px 0}
.insert::before,.insert::after{content:"";flex:1;border-top:1px dashed var(--line)}
.ins{font:500 13px/1.6 var(--head);border:1px dashed #b8c3d4;background:var(--sheet);color:var(--muted);border-radius:999px;padding:1px 14px;cursor:pointer}
.ins:hover{border:1px solid var(--blue);color:var(--blue-ink)}
.live-btn.del{background:var(--sheet);color:var(--red);border-color:#f2b5b5}.live-btn.del.sure{background:var(--red);color:#fff;border-color:var(--red)}
dialog.form label{display:block;margin:10px 0 0;font:500 14px/1.5 var(--head);color:var(--muted)}
dialog.form input:not([type=checkbox]),dialog.form select,dialog.form textarea{display:block;width:100%;margin-top:4px;font:16px/1.6 var(--body);color:var(--ink);padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--sheet);min-height:0}
dialog.form label.check{display:flex;gap:8px;align-items:center;color:var(--ink)}
/* a title card as the recorder draws it: the app's screen, a brand panel on its left 60%, a seam (sizes in 1920ths) */
.card-step .card-pic{position:relative;container-type:inline-size;aspect-ratio:16/9;overflow:hidden;border-radius:10px;background:var(--p-backdrop,#e8edf5);font-family:'Noto Sans Thai','Sarabun','Leelawadee UI',Tahoma,system-ui,sans-serif}
.card-pic .cp-app{position:absolute;left:63%;top:33%;width:34%;height:34%;object-fit:cover;object-position:left top;border-radius:.94cqw;outline:.1cqw solid rgba(255,255,255,.7);box-shadow:0 1.5cqw 3.6cqw rgba(0,0,0,.3)}
.card-pic .cp-panel{position:absolute;left:0;top:0;bottom:0;width:60%;display:flex;flex-direction:column;padding:4.6cqw 5.4cqw 5cqw 5.8cqw;background:var(--p-panel);color:var(--p-ink);box-shadow:1.6cqw 0 4.7cqw rgba(0,0,0,.3)}
.card-pic .cp-seam{position:absolute;top:0;bottom:0;left:60%;width:.63cqw;background:var(--p-accent)}
.card-pic .cp-brand{font-size:1.46cqw;font-weight:600;color:var(--p-soft);min-height:3.3cqw}
.card-pic .cp-main{margin:auto 0}.card-pic .cp-num{display:block;margin-bottom:1.25cqw;font-size:6.9cqw;font-weight:700;line-height:1;letter-spacing:-.03em;color:var(--p-accent)}
.card-pic b{display:block;font-size:4.4cqw;line-height:1.18;font-weight:700;text-wrap:balance}.card-pic b.long{font-size:3.55cqw}.card-pic b.recap{font-size:3.1cqw;margin-bottom:2cqw}
.card-pic .cp-sub{display:block;margin-top:1.8cqw;max-width:22em;font-size:1.9cqw;line-height:1.5;color:var(--p-soft)}
.card-pic ol{position:relative;list-style:none;margin:0;padding:0}.card-pic ol::before{content:"";position:absolute;left:1.4cqw;top:1.5cqw;bottom:1.5cqw;width:.21cqw;background:var(--p-accent);opacity:.5}
.card-pic ol li{position:relative;display:flex;align-items:center;gap:1.56cqw;padding:.57cqw 0;font-size:1.98cqw;font-weight:600;line-height:1.3}
.card-pic ol i{position:relative;flex:none;display:grid;place-items:center;width:3cqw;height:3cqw;border-radius:50%;border:.21cqw solid var(--p-accent);background:var(--p-panel);font-style:normal;font-size:1.4cqw;font-weight:700}
/* dialogs */
dialog{border:1px solid var(--line);border-radius:14px;padding:22px 24px;width:min(640px,92vw);color:var(--ink);box-shadow:0 24px 60px #1c274033}dialog::backdrop{background:#1c274055}
dialog h3{margin-top:0}
dialog textarea{width:100%;min-height:120px;font:16px/1.6 var(--body);padding:8px 10px;border-radius:8px;border:1px solid var(--line)}
dialog .row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
dialog button{font:500 15px/1.4 var(--head);border-radius:8px;border:1px solid var(--line);padding:7px 16px;cursor:pointer;background:var(--sheet)}
dialog button.go{background:var(--orange-ink);border-color:var(--orange-ink);color:#fff}
.quote{color:var(--muted);font-size:14px}.tray-list li{margin-bottom:6px}
code{font-size:.9em}
@media (max-width:900px){.layout{grid-template-columns:minmax(0,1fr)}#menu{display:inline-block}
  aside{display:none;position:fixed;z-index:7;left:0;top:56px;width:min(320px,86vw);box-shadow:8px 0 30px #1c274033}body.menu aside{display:block}}
@media (max-width:760px){.step{grid-template-columns:minmax(0,1fr)}.slide{padding:18px 16px}main{padding:10px}nav{padding:0 10px;gap:6px}nav button{padding:6px 9px}
  .cover{padding:28px 18px}.strip{grid-template-columns:repeat(auto-fill,minmax(40px,1fr))}}
</style></head><body>
<nav><button id="menu" title="เมนู">☰</button><span class="where" id="where">{{NAME}}</span>
<button id="grid" title="ดูทุกหน้าต่อกัน">ภาพรวม</button><button class="tray" id="tray">คำขอแก้ 0</button></nav>
<div class="layout"><aside id="side">{{SIDE}}</aside>
<main>{{SLIDES}}</main></div>
<dialog id="ask"><h3 id="askTitle">ขอให้ AI แก้</h3><p class="quote" id="askQuote"></p>
<textarea id="askText" placeholder="อยากให้แก้อะไร เช่น เปลี่ยนบทพูดให้สั้นลง, เพิ่มขั้นตอนกดยกเลิก, ใช้รูปหน้าจอหลังบันทึก"></textarea>
<p class="quote" id="askHow"></p>
<div class="row"><button id="askCancel">ยกเลิก</button><button class="go" id="askAdd">เก็บไว้ในคำขอ</button></div></dialog>
<dialog id="trayBox"><h3>คำขอแก้ที่เก็บไว้</h3><ol class="tray-list" id="trayList"></ol>
<p class="quote" id="trayHow"></p>
<textarea id="trayText" readonly></textarea>
<div class="row"><button id="trayClear">ล้าง</button><button id="trayClose">ปิด</button><button class="go" id="trayCopy">คัดลอก</button></div></dialog>
{{LIVE}}<script>
(() => {
  const BUILT = "{{BUILT}}", KEY = "mclip-edits:" + location.pathname;
  const slides = [...document.querySelectorAll(".slide")];
  let at = 0;
  const side = document.getElementById("side");
  const mark = (step) => { side.querySelectorAll("a").forEach((a) => a.classList.toggle("on",
      step ? a.dataset.step === step : (!a.dataset.step && +a.dataset.go === at)));
    side.querySelectorAll(".lesson-menu").forEach((m) => m.classList.toggle("open", +m.querySelector(".lesson").dataset.go === at)); };
  const show = (i, step) => { at = Math.max(0, Math.min(slides.length - 1, i)); slides.forEach((s, k) => s.classList.toggle("on", k === at));
    document.getElementById("where").textContent = slides[at].dataset.title || "";
    const target = step && document.getElementById(step);
    if (target) { target.scrollIntoView({ block: "start" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1200); }
    else if (document.body.classList.contains("grid")) slides[at].scrollIntoView({ block: "start" }); else scrollTo(0, 0);
    mark(step); document.body.classList.remove("menu");
    const hash = "#" + (at + 1) + (step ? "/" + step : ""); if (location.hash !== hash) history.replaceState(null, "", hash); };
  document.getElementById("menu").onclick = () => document.body.classList.toggle("menu");
  document.getElementById("grid").onclick = () => { document.body.classList.toggle("grid"); show(at); };
  addEventListener("keydown", (e) => { if (document.querySelector("dialog[open]")) return;
    if (e.key === "PageDown") show(at + 1); if (e.key === "PageUp") show(at - 1); });
  document.querySelectorAll(".plat button").forEach((b) => b.onclick = () => { const slide = b.closest(".slide");
    slide.dataset.plat = b.dataset.plat; slide.querySelectorAll(".plat button").forEach((x) => x.classList.toggle("on", x === b)); });
  document.querySelectorAll("[data-go]").forEach((a) => a.onclick = (e) => { e.preventDefault(); show(+a.dataset.go, a.dataset.step); });
  // the edit requests: the live page (serve.mjs) saves them in clips/requests.json, where /mclip:plan edit reads them;
  // a page opened as a file keeps them in this browser, to copy and paste into Claude Code
  const LIVE = !!window.MCLIP;
  const api = async (where, body) => {
    const r = await fetch(where, { method: "POST", headers: { "Content-Type": "application/json", "X-Mclip-Token": window.MCLIP.token }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let edits = [];
  if (LIVE) edits = window.MCLIP.requests || [];
  else { try { edits = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { edits = []; } edits.forEach((x) => { if (!x.id) x.id = newId(); }); }
  const count = (note) => { document.getElementById("tray").textContent = note || "คำขอแก้ " + edits.length; };
  const change = async (op) => {
    if (LIVE) {
      try { edits = (await api("/api/requests", op)).items; count(); return ""; }
      catch (e) { count("เก็บคำขอไม่สำเร็จ"); return e.message; }
    }
    if (op.add) edits.push({ id: newId(), ...op.add });
    if (op.remove) edits = edits.filter((x) => x.id !== op.remove);
    if (op.clear) edits = [];
    try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch {}
    count(); return "";
  };
  const HOW = LIVE ? "คำขอถูกบันทึกลงไฟล์ clips/requests.json — ใน Claude Code สั่ง /mclip:plan edit ได้เลย ไม่ต้องคัดลอก (Codex: $mclip-plan edit, Antigravity: /mclip-plan edit)"
    : "คำขอเก็บในเบราว์เซอร์นี้เท่านั้น AI ยังมองไม่เห็น — กดปุ่ม \\"คำขอแก้\\" มุมขวาบน แล้ว \\"คัดลอก\\" ไปวางใน Claude Code";
  document.getElementById("askHow").textContent = HOW;
  document.getElementById("trayHow").textContent = LIVE ? HOW + " (หรือกด \\"คัดลอก\\" แล้ววางก็ได้)"
    : "กด \\"คัดลอก\\" แล้ววางใน Claude Code (Ctrl+V) — AI จะแก้ไฟล์แผนแล้วสร้างหน้านี้ใหม่";
  // Claude empties the list as it applies the requests: read it again when the page comes back to the front
  if (LIVE) addEventListener("focus", () => { if (!document.querySelector("dialog[open]")) change({}); });
  const command = () => "/mclip:plan edit (หน้าแผนสร้างเมื่อ " + BUILT + " UTC)\\n" + edits.map((x) => "- " + x.target + (x.quote ? ' ("' + x.quote + '")' : "") + ": " + x.text).join("\\n");
  const ask = document.getElementById("ask"), tray = document.getElementById("trayBox");
  let current = null;
  document.querySelectorAll(".edit").forEach((b) => b.onclick = () => { current = { target: b.dataset.target, quote: b.dataset.quote };
    document.getElementById("askTitle").textContent = "ขอให้ AI แก้: " + current.target;
    document.getElementById("askQuote").textContent = current.quote ? "ตอนนี้: " + current.quote : "";
    document.getElementById("askText").value = ""; ask.showModal(); document.getElementById("askText").focus(); });
  // ถ่ายรูป / สร้างเสียง: a request in one click, sent with the others by the tray's copy
  document.querySelectorAll(".quick").forEach((b) => b.onclick = async () => {
    if (await change({ add: { target: b.dataset.target, quote: "", text: b.dataset.text } })) return;
    b.classList.add("added"); setTimeout(() => b.classList.remove("added"), 900); });
  // ▶ the lesson's voice, step after step
  let playing = null;
  const stopAll = () => { if (playing) { playing.onended = null; playing.pause(); playing = null; }
    document.querySelectorAll(".play-all").forEach((x) => x.textContent = "▶ ฟังทั้งบท"); };
  document.querySelectorAll(".play-all").forEach((b) => b.onclick = () => { const was = playing; stopAll(); if (was) return;
    const list = [...b.closest(".slide").querySelectorAll("audio")]; let i = 0;
    const next = () => { if (i >= list.length) { stopAll(); return; }
      playing = list[i++]; playing.closest(".step").scrollIntoView({ block: "center" }); playing.currentTime = 0;
      playing.onended = next; playing.play().catch(stopAll); };
    b.textContent = "■ หยุด"; next(); });
  // live (serve.mjs): narration saved and spoken, the speed and the project's words saved, from the page itself
  if (window.MCLIP) {
    const oneLine = (s) => s.replace(/\\s*\\n\\s*/g, " ").trim();
    const send = api;
    // a step's or card's words (บนจอ, คำรอง, พูด) typed and not saved yet: saved before anything else runs, since the
    // page reloads after each action
    const fieldsOf = (b) => Object.fromEntries([...b.querySelectorAll("[data-f]")].map((x) => [x.dataset.f, oneLine(x.value)]));
    const wordsOf = (b, voice) => { const f = fieldsOf(b); return { id: b.dataset.id, step: b.dataset.step, caption: f.caption, subtitle: f.subtitle, brief: f.brief, text: f.narration ?? "", voice }; };
    const dirty = () => [...document.querySelectorAll(".live-say")].filter((b) =>
      [...b.querySelectorAll("[data-f]")].some((x) => oneLine(x.value) !== oneLine(x.defaultValue)));
    let reloading = false;
    addEventListener("beforeunload", (e) => { if (!reloading && dirty().length) { e.preventDefault(); e.returnValue = ""; } });
    // then(answer): before the page reloads (where to land: the step inserted, the topic added)
    const post = async (where, body, box, button, then) => {
      const msg = box && box.querySelector(".msg");
      const buttons = [...document.querySelectorAll(".live-say button, .live-btn, .live-speed button, .live-lex button, .live-voice button, .ins, dialog.form button")];
      if (msg) msg.textContent = body.voice || where === "/api/voice" ? "กำลังสร้างเสียง… (บรรทัดละหลายวินาที)" : "กำลังบันทึก…";
      if (button && !msg) button.textContent = where === "/api/voice" ? "กำลังสร้างเสียง…" : "กำลังบันทึก…";
      buttons.forEach((b) => b.disabled = true);
      try {
        for (const other of dirty()) if (other !== box) {
          await send("/api/narration", wordsOf(other, false));
        }
        const answer = await send(where, body);
        if (then) then(answer);
        reloading = true;
        location.reload();
      } catch (e) {
        if (msg) msg.textContent = "ไม่สำเร็จ: " + e.message; else if (button) button.textContent = "ไม่สำเร็จ: " + e.message;
        buttons.forEach((b) => b.disabled = false);
      }
    };
    document.querySelectorAll(".live-say").forEach((box) => box.querySelectorAll("button").forEach((b) => b.onclick = () =>
      post("/api/narration", wordsOf(box, b.dataset.act === "save-voice"), box)));
    // a picture step inserted between two steps: the form, then the page lands on it
    const ins = document.getElementById("insBox");
    let insAt = null;
    document.querySelectorAll(".ins").forEach((b) => b.onclick = () => {
      insAt = { id: b.dataset.id, after: +b.dataset.after };
      ["insTitle", "insBrief", "insCap", "insSay"].forEach((k) => document.getElementById(k).value = "");
      document.getElementById("insMsg").textContent = ""; ins.showModal(); document.getElementById("insTitle").focus(); });
    document.getElementById("insCancel").onclick = () => ins.close();
    document.getElementById("insGo").onclick = () => {
      const v = (k) => oneLine(document.getElementById(k).value);
      if (!v("insTitle") && !v("insCap")) { document.getElementById("insMsg").textContent = "ใส่หัวข้อขั้นหรือคำบนจอก่อน"; return; }
      post("/api/step-insert", { id: insAt.id, after: insAt.after, title: v("insTitle"), caption: v("insCap"), narration: v("insSay"), brief: v("insBrief"),
        ask: document.getElementById("insAsk").checked }, ins, null,
        (r) => history.replaceState(null, "", "#" + (at + 1) + "/" + insAt.id + "-" + r.n));
    };
    // a picture step removed: a second press confirms
    document.querySelectorAll("[data-act=remove-step]").forEach((b) => b.onclick = () => {
      if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = "กดอีกครั้งเพื่อลบ"; setTimeout(() => { b.classList.remove("sure"); b.textContent = "ลบขั้นนี้"; }, 4000); return; }
      post("/api/step-remove", { id: b.dataset.id, step: +b.dataset.step }, null, b);
    });
    // a topic added to the contents; an overview's lesson is written with it, and the page opens it
    const tp = document.getElementById("topicBox"), tpKind = document.getElementById("tpKind"), tpAfter = document.getElementById("tpAfter");
    const tpPlace = () => { tpAfter.value = tpKind.value === "overview" ? "" : (tpAfter.options[tpAfter.options.length - 1] || {}).value || "";
      document.getElementById("tpSlug").placeholder = tpKind.value === "overview" ? "overview" : "เช่น approve-claim"; };
    tpKind.onchange = tpPlace;
    const addTopic = document.getElementById("addTopic");
    if (addTopic) addTopic.onclick = () => { document.getElementById("tpMsg").textContent = ""; tpPlace(); tp.showModal(); document.getElementById("tpTitle").focus(); };
    document.getElementById("tpCancel").onclick = () => tp.close();
    document.getElementById("tpGo").onclick = () => {
      const v = (k) => { const e = document.getElementById(k); return e ? oneLine(e.value) : ""; };
      if (!v("tpTitle")) { document.getElementById("tpMsg").textContent = "ใส่ชื่อหัวข้อก่อน"; return; }
      post("/api/topic", { kind: tpKind.value, title: v("tpTitle"), slug: v("tpSlug").toLowerCase(), teaches: v("tpTeaches"), app: v("tpApp"), after: tpAfter.value }, tp, null,
        (r) => { try { sessionStorage.setItem("mclip-go", r.id); } catch {} });
    };
    document.querySelectorAll("[data-act=voice-lesson]").forEach((b) => b.onclick = () => post("/api/voice", { id: b.dataset.id }, null, b));
    const sp = document.querySelector(".live-speed");
    if (sp) sp.querySelector("button").onclick = () => post("/api/speed", { speed: +sp.querySelector("select").value }, sp);
    const lx = document.querySelector(".live-lex");
    if (lx) lx.querySelector("button").onclick = () => post("/api/lexicon", { text: lx.querySelector("textarea").value }, lx);
    // the voice: this machine's Paradee, a Gemini voice or one of the ElevenLabs account; tried on a sample, then used
    const vb = document.querySelector(".live-voice");
    if (vb) {
      const M = window.MCLIP, eng = vb.querySelector(".v-engine"), sel = vb.querySelector(".v-voice"), mod = vb.querySelector(".v-model");
      const keyLine = vb.querySelector(".v-key"), out = vb.querySelector(".msg"), sample = vb.querySelector("audio");
      const style = vb.querySelector(".v-style"), styleRow = vb.querySelector(".v-style-row");
      const opt = (value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
      const fillVoices = async () => {
        const e = eng.value, info = M.engines[e] || {}, mine = e === vb.dataset.engine;
        sel.replaceChildren(); sel.hidden = mod.hidden = e === "paradee"; out.textContent = "";
        mod.placeholder = info.model || ""; mod.value = mine ? vb.dataset.model : (info.model || "");
        styleRow.hidden = e !== "gemini"; style.value = mine ? vb.dataset.style : "";
        keyLine.textContent = info.key ? info.key + (M.keys[info.key] ? ": มีแล้ว" : ": ยังไม่มี — สร้างไฟล์ tools/TutorialRecorder/tts/keys.json เป็น {\\"" + info.key + "\\": \\"<key>\\"} (ไม่ถูก commit) แล้วโหลดหน้านี้ใหม่") : "";
        if (e === "gemini") { M.gemini.forEach(([n, d]) => sel.appendChild(opt(n, n + " — " + d))); if (!mine && info.voice) sel.value = info.voice; }
        if (e === "elevenlabs" && M.keys[info.key]) {
          sel.appendChild(opt("", "กำลังโหลดรายชื่อเสียงของบัญชี…"));
          try {
            const j = await api("/api/voices", { engine: "elevenlabs" });
            sel.replaceChildren();
            j.voices.forEach((v) => { const o = opt(v.id, v.name + (v.note ? " — " + v.note : "") + (v.thai ? " · ไทย" : "")); o.dataset.name = v.name; sel.appendChild(o); });
            if (!j.voices.length) sel.appendChild(opt("", "บัญชีนี้ยังไม่มีเสียง"));
          } catch (err) { sel.replaceChildren(opt("", "โหลดรายชื่อไม่สำเร็จ")); out.textContent = err.message; }
        }
        if (mine && vb.dataset.voice) {
          if (![...sel.options].some((o) => o.value === vb.dataset.voice)) { const o = opt(vb.dataset.voice, vb.dataset.name || vb.dataset.voice); o.dataset.name = vb.dataset.name; sel.appendChild(o); }
          sel.value = vb.dataset.voice;
        }
      };
      eng.value = vb.dataset.engine; eng.onchange = fillVoices; fillVoices();
      const chosen = () => ({ engine: eng.value, id: sel.value, model: mod.value.trim(), name: (sel.selectedOptions[0] && sel.selectedOptions[0].dataset.name) || "",
        style: eng.value === "gemini" ? style.value.trim() : "" });
      vb.querySelector("[data-act=voice-try]").onclick = async (ev) => {
        const b = ev.target; b.disabled = true; out.textContent = "กำลังสร้างเสียงตัวอย่าง…";
        try {
          const sp = document.querySelector(".live-speed select");
          const j = await api("/api/voice-sample", { ...chosen(), speed: sp ? +sp.value : 1 });
          sample.src = "data:audio/mpeg;base64," + j.mp3; sample.hidden = false; sample.play().catch(() => {});
          out.textContent = "ตัวอย่าง: " + j.text;
        } catch (err) { out.textContent = "ไม่สำเร็จ: " + err.message; }
        b.disabled = false;
      };
      vb.querySelector("[data-act=voice-use]").onclick = () => post("/api/voice-engine", chosen(), vb);
    }
  }
  document.getElementById("askCancel").onclick = () => ask.close();
  document.getElementById("askAdd").onclick = async () => { const text = document.getElementById("askText").value.trim();
    if (!text) { ask.close(); return; }
    const failed = await change({ add: { target: current.target, quote: current.quote || "", text } });
    if (failed) { document.getElementById("askHow").textContent = "เก็บคำขอไม่สำเร็จ: " + failed; return; }
    ask.close(); const t = document.getElementById("tray"); t.classList.add("added"); setTimeout(() => t.classList.remove("added"), 1500); };
  const fill = () => { const list = document.getElementById("trayList"); list.innerHTML = "";
    edits.forEach((x) => { const li = document.createElement("li"); li.textContent = x.target + ": " + x.text + " ";
      const del = document.createElement("button"); del.textContent = "ลบ"; del.className = "edit"; del.onclick = async () => { await change({ remove: x.id }); fill(); };
      li.appendChild(del); list.appendChild(li); });
    document.getElementById("trayText").value = edits.length ? command() : ""; };
  document.getElementById("tray").onclick = async () => { if (LIVE) await change({}); fill(); tray.showModal(); };
  document.getElementById("trayClose").onclick = () => tray.close();
  document.getElementById("trayClear").onclick = async () => { await change({ clear: true }); fill(); };
  document.getElementById("trayCopy").onclick = async () => { const box = document.getElementById("trayText");
    try { await navigator.clipboard.writeText(box.value); document.getElementById("trayCopy").textContent = "คัดลอกแล้ว ✓"; }
    catch { box.focus(); box.select(); document.getElementById("trayCopy").textContent = "กด Ctrl+C"; }
    setTimeout(() => document.getElementById("trayCopy").textContent = "คัดลอก", 2500); };
  // #<n> opens page n and #<n>/<lesson>-<step> one step, so a link can point at a lesson or a step
  const [page, step] = location.hash.slice(1).split("/");
  let go = null;
  try { go = sessionStorage.getItem("mclip-go"); sessionStorage.removeItem("mclip-go"); } catch {}
  const added = go ? slides.findIndex((x) => x.dataset.id === go) : -1;
  count(); show(added >= 0 ? added : (parseInt(page, 10) || 1) - 1, added >= 0 ? undefined : step);
})();
</script></body></html>
`;

// ---- versions --------------------------------------------------------------------------------------------------------

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isFile()) fs.copyFileSync(path.join(from, e.name), path.join(to, e.name));
  }
}

/** Snapshot lesson `id` as its next version: lesson.md, scenario.yaml, screen/, slides/, and the recording's files. */
export function makeVersion(clipsDir, id, { mp4, srt, timing, mode = null, voice = false, recorder = null, now = new Date() }) {
  const dir = path.join(clipsDir, id);
  if (!ID.test(id) || !fs.existsSync(path.join(dir, "lesson.md"))) return { code: 2, error: `no lesson clips/${id}/lesson.md` };
  for (const [name, f] of [["--mp4", mp4], ["--srt", srt], ["--timing", timing]]) {
    if (!f || !fs.existsSync(f)) return { code: 2, error: `${name}: no file ${f ?? ""}`.trim() };
  }
  const n = (versionDirs(dir).at(-1) ?? 0) + 1;
  const vdir = path.join(dir, `v${n}`);
  fs.mkdirSync(vdir);
  fs.copyFileSync(path.join(dir, "lesson.md"), path.join(vdir, "lesson.md"));
  if (fs.existsSync(path.join(dir, "scenario.yaml"))) fs.copyFileSync(path.join(dir, "scenario.yaml"), path.join(vdir, "scenario.yaml"));
  copyDir(path.join(dir, "screen"), path.join(vdir, "screen"));
  copyDir(path.join(dir, "slides"), path.join(vdir, "slides"));
  fs.copyFileSync(mp4, path.join(vdir, "clip.mp4"));
  fs.copyFileSync(srt, path.join(vdir, "clip.srt"));
  fs.copyFileSync(timing, path.join(vdir, "timing.json"));
  const project = path.dirname(path.resolve(clipsDir));
  const meta = {
    version: n, date: now.toISOString(), appCommit: git(project, "rev-parse", "HEAD"),
    appDirty: (git(project, "status", "--porcelain") ?? "") !== "", mode, voice, recorder,
  };
  fs.writeFileSync(path.join(vdir, "version.json"), JSON.stringify(meta, null, 2) + "\n");
  // the screens now match this version: an older comparison no longer applies
  fs.rmSync(path.join(dir, "compare.json"), { force: true });
  return { code: 0, version: n, dir: vdir, meta };
}

// ---- comparing pictures ----------------------------------------------------------------------------------------------

/** SSIM of two pictures by ffmpeg (1 = the same), or null when ffmpeg cannot tell. */
export function ssim(a, b) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", a, "-i", b, "-lavfi", "[0:v][1:v]scale2ref[x][y];[x][y]ssim", "-f", "null", "-"], { encoding: "utf8" });
  const m = /All:([0-9.]+)/.exec(r.stderr ?? "");
  return m ? Number(m[1]) : null;
}

export function compareLesson(clipsDir, id, { threshold = 0.97, measure = ssim } = {}) {
  const dir = path.join(clipsDir, id);
  const latest = versionDirs(dir).at(-1);
  if (!latest) return { code: 2, error: `clips/${id} has no version to compare with` };
  const old = path.join(dir, `v${latest}`, "screen");
  const now = path.join(dir, "screen");
  const result = { against: latest, threshold, date: new Date().toISOString(), changed: [], same: [], added: [], removed: [] };
  const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(jpe?g|png)$/i.test(f)) : []);
  const before = new Set(list(old)), after = list(now);
  for (const f of after) {
    if (!before.has(f)) { result.added.push(`screen/${f}`); continue; }
    const score = measure(path.join(old, f), path.join(now, f));
    if (score === null) { result.unavailable = "เทียบรูปไม่ได้ (ไม่พบ ffmpeg)"; break; }
    (score < threshold ? result.changed : result.same).push({ image: `screen/${f}`, ssim: score });
  }
  for (const f of before) if (!after.includes(f)) result.removed.push(`screen/${f}`);
  fs.writeFileSync(path.join(dir, "compare.json"), JSON.stringify(result, null, 2) + "\n");
  return { code: 0, ...result };
}

// ---- small writes from the live page (serve.mjs) ---------------------------------------------------------------------
//
// Each keeps the file's line endings and touches one line or one file the page owns; the text is one line, never a
// newline (it would add fields or steps).

const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");
const oneLine = (s, what, max = 2000) => {
  const v = String(s ?? "").trim();
  if (/[\r\n\u2028\u2029]/.test(v)) throw new Error(`${what} is one line`);
  if (v.length > max) throw new Error(`${what} is at most ${max} characters`);
  return v;
};

// what the page edits, per field: the lesson's key, whether a step may leave it empty, whether a step has it at all
const EDITABLE = {
  caption: { key: "บนจอ", stepMayEmpty: false, step: true },
  subtitle: { key: "คำรอง", stepMayEmpty: true, step: false },
  narration: { key: "พูด", stepMayEmpty: true, step: true },
  // a picture step's brief: what its picture shows (the step must be a picture step, see setLessonFields)
  brief: { key: "รายละเอียดรูป", stepMayEmpty: true, step: true, slideOnly: true },
};

/**
 * Sets the words of step `n` in clips/<id>/lesson.md, or of a title card (`n` "open" or "close"): `fields` is
 * { caption (บนจอ), subtitle (คำรอง, cards only), narration (พูด) }, any of them; "" removes a line (a step keeps its
 * บนจอ). Each text is one line. A card the lesson does not have yet is added (`## เปิด` before the first step,
 * `## สรุป` at the end). Keeps the file's line endings and every other line.
 */
export function setLessonFields(clipsDir, id, n, fields = {}) {
  if (!ID.test(String(id))) throw new Error(`no lesson ${id}`);
  const file = path.join(clipsDir, id, "lesson.md");
  if (!fs.existsSync(file)) throw new Error(`no lesson clips/${id}/lesson.md`);
  const card = n === "open" ? "เปิด" : n === "close" ? "สรุป" : null;
  const values = {};
  for (const [name, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    const spec = EDITABLE[name];
    if (!spec) throw new Error(`${name} is not a field the page edits (caption, subtitle, narration, brief)`);
    if (!card && !spec.step) throw new Error(`a step has no ${spec.key}: only a title card has`);
    if (card && spec.slideOnly) throw new Error(`a title card has no ${spec.key}: only a picture step has`);
    const value = oneLine(v, spec.key === "พูด" ? "the narration" : `'${spec.key}'`);
    if (!card && !value && !spec.stepMayEmpty) throw new Error(`a step needs its '${spec.key}'`);
    values[spec.key] = value;
  }
  if (!Object.keys(values).length) return;
  const src = fs.readFileSync(file, "utf8"), eol = eolOf(src);
  const lines = src.split(/\r?\n/);
  const head = lines.findIndex((l) => (card ? new RegExp(`^##\\s+${card}\\s*$`) : new RegExp(`^##\\s+${Number(n)}\\.\\s`)).test(l));
  if (head < 0 && !card) throw new Error(`clips/${id}/lesson.md has no step ${n}`);
  if (head < 0) {
    if (!Object.values(values).some(Boolean)) return;
    const caption = values["บนจอ"] || (card === "เปิด" ? parseLesson(src).lesson.title : "สรุปขั้นตอน");
    const block = [`## ${card}`, `- บนจอ: ${caption}`, ...["คำรอง", "พูด"].filter((k) => values[k]).map((k) => `- ${k}: ${values[k]}`), ""];
    const first = lines.findIndex((l) => /^##\s+\d+\.\s/.test(l));
    if (card === "เปิด" && first >= 0) lines.splice(first, 0, ...block);
    else {
      while (lines.length && lines.at(-1) === "") lines.pop();
      lines.push("", ...block);
    }
    fs.writeFileSync(file, lines.join(eol));
    return;
  }
  // the fields in the order a block lists them: a missing one goes after the last of those before it
  const ORDER = ["สไลด์", "รายละเอียดรูป", "ทำ", "บนจอ", "คำรอง", "พูด"];
  let end0 = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
  if (end0 < 0) end0 = lines.length;
  if ("รายละเอียดรูป" in values && !lines.slice(head + 1, end0).some((l) => /^\s*-\s+สไลด์\s*:/.test(l))) {
    throw new Error(`step ${n} of clips/${id} is not a picture step (no '- สไลด์:')`);
  }
  for (const key of ["รายละเอียดรูป", "บนจอ", "คำรอง", "พูด"]) {
    if (!(key in values)) continue;
    let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
    if (end < 0) end = lines.length;
    const rx = new RegExp(`^\\s*-\\s+${key}\\s*:`);
    const at = lines.findIndex((l, i) => i > head && i < end && rx.test(l));
    const value = values[key];
    if (at >= 0) {
      if (value) lines[at] = lines[at].replace(new RegExp(`^(\\s*-\\s+${key}\\s*:).*$`), `$1 ${value.replace(/\$/g, "$$$$")}`);
      else lines.splice(at, 1);
    } else if (value) {
      let after = head;
      for (const k of ORDER.slice(0, ORDER.indexOf(key))) {
        const i = lines.findIndex((l, j) => j > head && j < end && new RegExp(`^\\s*-\\s+${k}\\s*:`).test(l));
        if (i > after) after = i;
      }
      lines.splice(after + 1, 0, `- ${key}: ${value}`);
    }
  }
  fs.writeFileSync(file, lines.join(eol));
}

/** Sets (or, with "", removes) the '- พูด:' line of step `n` or of a title card ("open", "close"). */
export const setNarration = (clipsDir, id, n, text) => setLessonFields(clipsDir, id, n, { narration: text ?? "" });

// ---- picture steps and topics added from the live page ---------------------------------------------------------------
//
// A step inserted or removed renumbers the steps after it: their headings, their voice (voice/NN.mp3 and voice.json)
// and the saved requests that name them (`<id> ขั้น <n>`) move with them, so no step plays another's voice.

const lessonFile = (clipsDir, id) => {
  if (!ID.test(String(id))) throw new Error(`no lesson ${id}`);
  const file = path.join(clipsDir, id, "lesson.md");
  if (!fs.existsSync(file)) throw new Error(`no lesson clips/${id}/lesson.md`);
  return file;
};
const STEP_HEAD = /^(##\s+)(\d+)(\.\s.*)$/;

/** Steps numbered `from` and up move by `by` (+1 or -1) in what is keyed by number; `gone` (a removed step) goes. */
function shiftSteps(clipsDir, id, from, by, gone = null) {
  const vdir = path.join(clipsDir, id, VOICE_DIR);
  const vjson = path.join(vdir, "voice.json");
  const j = readJson(vjson);
  if (gone !== null) fs.rmSync(path.join(vdir, voiceFile(gone)), { force: true });
  if (isObj(j) && isObj(j.steps)) {
    if (gone !== null) delete j.steps[String(gone)];
    const nums = Object.keys(j.steps).filter((k) => /^\d+$/.test(k)).map(Number).filter((k) => k >= from)
      .sort((a, b) => (by > 0 ? b - a : a - b));
    for (const k of nums) {
      const f = path.join(vdir, voiceFile(k));
      if (fs.existsSync(f)) fs.renameSync(f, path.join(vdir, voiceFile(k + by)));
      j.steps[String(k + by)] = j.steps[String(k)];
      delete j.steps[String(k)];
    }
    const order = (k) => (k === "open" ? -1 : k === "close" ? 1e9 : Number(k));
    j.steps = Object.fromEntries(Object.entries(j.steps).sort(([a], [b]) => order(a) - order(b)));
    fs.writeFileSync(vjson, JSON.stringify(j, null, 2) + "\n");
  }
  const items = readRequests(clipsDir);
  if (!items.length) return;
  const rx = new RegExp(`^${escRx(id)} ขั้น (\\d+)$`);
  const kept = [];
  for (const x of items) {
    const m = rx.exec(x.target);
    const k = m ? Number(m[1]) : null;
    if (k !== null && k === gone) continue;
    kept.push(k !== null && k >= from ? { ...x, target: `${id} ขั้น ${k + by}` } : x);
  }
  writeRequests(clipsDir, kept);
}

/** A picture's name no step of the lesson uses and no file in slides/ has: slides/picture-<k>.png. */
function freeSlideName(clipsDir, id, steps) {
  const dir = path.join(clipsDir, id, "slides");
  const taken = new Set([...steps.map((s) => (s.slide || "").replace(/\.[a-z]+$/i, "").toLowerCase()),
    ...(fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => `slides/${f.replace(/\.[a-z]+$/i, "").toLowerCase()}`) : [])]);
  for (let k = 1; ; k++) if (!taken.has(`slides/picture-${k}`)) return `slides/picture-${k}.png`;
}

/**
 * Inserts a picture step after step `after` (0: before the first step, after the opening card) of clips/<id>/lesson.md:
 * `## <n>. <title>`, `- สไลด์: slides/picture-<k>.png` (the picture to make), `- รายละเอียดรูป:`, `- บนจอ:`, `- พูด:`.
 * Each text is one line; the title and บนจอ default to each other. Returns { n, slide }.
 */
export function insertSlideStep(clipsDir, id, after, { title = "", caption = "", narration = "", brief = "" } = {}) {
  const file = lessonFile(clipsDir, id);
  const src = fs.readFileSync(file, "utf8"), eol = eolOf(src);
  const { lesson } = parseLesson(src);
  const a = Number(after);
  if (!Number.isInteger(a) || a < 0 || a > lesson.steps.length) throw new Error(`after is a step of clips/${id} (0 to ${lesson.steps.length})`);
  let t = oneLine(title, "the step's title", 120), c = oneLine(caption, "'บนจอ'", 300);
  const say = oneLine(narration, "the narration"), what = oneLine(brief, "'รายละเอียดรูป'");
  t ||= c || "รูปประกอบ";
  c ||= t;
  if (/^\s*#/.test(say)) throw new Error("a '- พูด:' line cannot start with '#'");
  const slide = freeSlideName(clipsDir, id, lesson.steps);
  const n = a + 1;
  const lines = src.split(/\r?\n/);
  // where it goes: before step n's heading, else before the closing card, else at the end
  let at = lines.findIndex((l) => STEP_HEAD.exec(l) && Number(STEP_HEAD.exec(l)[2]) === n);
  if (at < 0) at = lines.findIndex((l) => /^##\s+สรุป\s*$/.test(l));
  for (let i = 0; i < lines.length; i++) {
    const m = STEP_HEAD.exec(lines[i]);
    if (m && Number(m[2]) >= n) lines[i] = `${m[1]}${Number(m[2]) + 1}${m[3]}`;
  }
  const block = [`## ${n}. ${t}`, `- สไลด์: ${slide}`, ...(what ? [`- รายละเอียดรูป: ${what}`] : []), `- บนจอ: ${c}`, ...(say ? [`- พูด: ${say}`] : []), ""];
  if (at >= 0) lines.splice(at, 0, ...block);
  else {
    while (lines.length && lines.at(-1) === "") lines.pop();
    lines.push("", ...block);
  }
  shiftSteps(clipsDir, id, n, +1);
  fs.writeFileSync(file, lines.join(eol));
  return { n, slide };
}

/** Removes picture step `n` of clips/<id>/lesson.md (a step that does something in the app is not removed here); its
 * picture file stays in slides/. Returns { removed, slide }. */
export function removeSlideStep(clipsDir, id, n) {
  const file = lessonFile(clipsDir, id);
  const src = fs.readFileSync(file, "utf8"), eol = eolOf(src);
  const { lesson } = parseLesson(src);
  const step = lesson.steps.find((s) => s.n === Number(n));
  if (!step) throw new Error(`clips/${id}/lesson.md has no step ${n}`);
  if (!step.slide) throw new Error(`step ${n} of clips/${id} does something in the app: only a picture step is removed from the page (ask the AI for the others)`);
  if (lesson.steps.length === 1) throw new Error(`step ${n} is the lesson's only step`);
  const lines = src.split(/\r?\n/);
  const head = lines.findIndex((l) => STEP_HEAD.exec(l) && Number(STEP_HEAD.exec(l)[2]) === step.n);
  let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  lines.splice(head, end - head);
  for (let i = 0; i < lines.length; i++) {
    const m = STEP_HEAD.exec(lines[i]);
    if (m && Number(m[2]) > step.n) lines[i] = `${m[1]}${Number(m[2]) - 1}${m[3]}`;
  }
  shiftSteps(clipsDir, id, step.n + 1, -1, step.n);
  fs.writeFileSync(file, lines.join(eol));
  return { removed: step.n, slide: step.slide };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** What an overview (แนะนำระบบ) lesson starts as: the cards and one picture step, its words to write on the page. */
const overviewLesson = (title, teaches) => [`# ${title}`, "", "- บทบาท: ผู้ใช้ทุกคน", "- ก่อนเริ่ม: ไม่มี", "",
  "## เปิด", `- บนจอ: ${title}`, "- คำรอง: แนะนำระบบ", "",
  "## 1. ภาพรวมระบบ", "- สไลด์: slides/picture-1.png", `- รายละเอียดรูป: diagram ${teaches || "ส่วนหลักของระบบ ใครใช้ส่วนไหน และเชื่อมกันอย่างไร"}`,
  "- บนจอ: ภาพรวมระบบ", "", "## สรุป", "- บนจอ: สรุป", ""].join("\n");

/**
 * Adds a topic to the contents of clips/plan.md: { title, slug (its id's words), kind ("overview": a lesson of picture
 * steps is written with it; "task": a topic, its steps written by /mclip:plan lesson), app (its app's key when the plan
 * has apps), teaches (สอน), after (a lesson id; "" first) }. Its number: 00 when first and free, else the next after the
 * highest; the contents' order is the list's, not the numbers'. Returns { id, lesson }.
 */
export function addTopic(clipsDir, { title = "", slug = "", kind = "task", app = "", teaches = "", after = "" } = {}) {
  const file = path.join(clipsDir, "plan.md");
  if (!fs.existsSync(file)) throw new Error("no clips/plan.md");
  const src = fs.readFileSync(file, "utf8"), eol = eolOf(src);
  const { plan } = parsePlan(src);
  if (!["overview", "task"].includes(kind)) throw new Error("kind is overview or task");
  const t = oneLine(title, "the topic's title", 120);
  if (!t) throw new Error("a topic needs a title");
  if (/[—]/.test(t)) throw new Error("the title cannot have '—'");
  const words = oneLine(slug, "the id's words", 40).toLowerCase() || (kind === "overview" ? "overview" : "");
  if (!SLUG.test(words)) throw new Error("the id's words are English lower-case words joined by '-', e.g. overview, add-user");
  const what = oneLine(teaches, "'สอน'", 300);
  const keys = plan.apps.map((x) => x.key);
  const a = String(app ?? "").trim();
  if (a && !keys.includes(a)) throw new Error(`app ${a} is not under '## แอป' (${keys.join(", ") || "none"})`);
  if (!a && keys.length > 1) throw new Error(`which app: ${keys.join(", ")}`);
  if (after && !plan.toc.some((x) => x.id === after)) throw new Error(`no lesson ${after} in the contents`);
  const used = new Set([...plan.toc.map((x) => x.id.slice(0, 2)), ...fs.readdirSync(clipsDir).filter((d) => ID.test(d)).map((d) => d.slice(0, 2))]);
  let num;
  if (!after && !used.has("00")) num = "00";
  else {
    const high = Math.max(0, ...[...used].map(Number));
    if (high >= 99) throw new Error("the contents use every number up to 99");
    num = String(high + 1).padStart(2, "0");
  }
  const id = `${num}-${words}`;
  if (fs.existsSync(path.join(clipsDir, id))) throw new Error(`clips/${id} is there already`);
  const lines = src.split(/\r?\n/);
  const sec = lines.findIndex((l) => /^##\s+สารบัญ\s*$/.test(l));
  const entry = /^(\s*)\d+(\.\s+.*)$/;
  const block = [`1. ${id} — ${t}`, ...(a && keys.length > 1 ? [`   - แอป: ${a}`] : []), ...(what ? [`   - สอน: ${what}`] : [])];
  if (sec < 0) {
    while (lines.length && lines.at(-1) === "") lines.pop();
    lines.push("", "## สารบัญ", "", ...block, "");
  } else {
    let end = lines.findIndex((l, i) => i > sec && /^##\s/.test(l));
    if (end < 0) end = lines.length;
    const entries = [];
    for (let i = sec + 1; i < end; i++) if (entry.test(lines[i])) entries.push(i);
    let at;
    if (!after) at = entries[0] ?? sec + 2;
    else {
      const i = entries.find((k) => new RegExp(`^\\s*\\d+\\.\\s+\`?${escRx(after)}\`?\\s`).test(lines[k]));
      const next = entries.find((k) => k > i) ?? end;
      at = next;
      while (at > i + 1 && lines[at - 1].trim() === "") at--;
    }
    if (at > lines.length) at = lines.length;
    lines.splice(at, 0, ...block);
    // the list numbered again in its order
    let k = 0;
    let stop = lines.findIndex((l, i) => i > sec && /^##\s/.test(l));
    if (stop < 0) stop = lines.length;
    for (let i = sec + 1; i < stop; i++) { const m = entry.exec(lines[i]); if (m && field(lines[i]) === null) lines[i] = `${m[1]}${++k}${m[2]}`; }
  }
  fs.writeFileSync(file, lines.join(eol) + (lines.at(-1) === "" ? "" : eol));
  let lesson = false;
  if (kind === "overview") {
    fs.mkdirSync(path.join(clipsDir, id), { recursive: true });
    fs.writeFileSync(path.join(clipsDir, id, "lesson.md"), overviewLesson(t, what).replace(/\n/g, eol));
    lesson = true;
  }
  return { id, lesson };
}

/** Sets (or adds) the plan's '- <key>: <value>' line, among the fields before the first '##'; "" removes it. */
export function setPlanField(clipsDir, key, value) {
  const file = path.join(clipsDir, "plan.md");
  const v = oneLine(value, key, 200);
  const src = fs.readFileSync(file, "utf8"), eol = eolOf(src);
  const lines = src.split(/\r?\n/);
  let first = lines.findIndex((l) => /^##\s/.test(l));
  if (first < 0) first = lines.length;
  const at = lines.findIndex((l, i) => i < first && field(l)?.[0] === key);
  if (!v) { if (at >= 0) { lines.splice(at, 1); fs.writeFileSync(file, lines.join(eol)); } return; }
  if (at >= 0) lines[at] = `- ${key}: ${v}`;
  else {
    let last = -1;
    for (let i = 0; i < first; i++) if (field(lines[i])) last = i;
    const where = last >= 0 ? last + 1 : Math.max(1, lines.findIndex((l) => /^#\s/.test(l)) + 1);
    lines.splice(where, 0, `- ${key}: ${v}`);
  }
  fs.writeFileSync(file, lines.join(eol));
}

/** Writes the project's pronunciation rules (clips/lexicon.txt) from `<written> = <spoken>` lines; returns how many. */
export function writeProjectLexicon(clipsDir, text) {
  const raw = String(text ?? "");
  if (raw.length > 20000) throw new Error("the word list is at most 20000 characters");
  const rules = [];
  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    if (!l.includes("=")) throw new Error(`'${l.slice(0, 40)}' is '<word> = <how it is said>'`);
    const [r] = parseLexicon(l);
    if (!r) throw new Error(`'${l.slice(0, 40)}' needs a word and how it is said`);
    rules.push(r);
  }
  const head = "# Words the Thai voice says wrong in this project: <written> = <spoken> (mclip; every project's words: the plugin's lexicon.txt)";
  fs.writeFileSync(path.join(clipsDir, "lexicon.txt"), [head, ...rules.map((r) => `${r.written} = ${r.spoken}`)].join("\n") + "\n");
  return rules.length;
}

// ---- edit requests -----------------------------------------------------------------------------------------------------
//
// The live page keeps its requests (✎ แก้, ถ่ายรูป) in clips/requests.json, where /mclip:plan edit reads them without
// any copy and paste; a page opened as a file keeps them in the browser, to copy. Git-ignored: a to-do list of this
// machine, emptied as /mclip:plan applies them.

export const REQUESTS_FILE = "requests.json";
const MAX_REQUESTS = 200;
const isRequest = (x) => x && typeof x.id === "string" && typeof x.target === "string" && typeof x.text === "string";

/** The saved requests, oldest first: [{ id, target, quote, text, at }]. */
export function readRequests(clipsDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(clipsDir, REQUESTS_FILE), "utf8"));
    return Array.isArray(j.items) ? j.items.filter(isRequest) : [];
  } catch { return []; }
}
const writeRequests = (clipsDir, items) =>
  fs.writeFileSync(path.join(clipsDir, REQUESTS_FILE), JSON.stringify({ items }, null, 2) + "\n");

/** Adds a request (its text on one line, as the command reads it); returns the list. */
export function addRequest(clipsDir, { target, quote = "", text } = {}, now = new Date()) {
  const items = readRequests(clipsDir);
  if (items.length >= MAX_REQUESTS) throw new Error(`at most ${MAX_REQUESTS} requests: apply some first (/mclip:plan edit)`);
  const flat = (s) => String(s ?? "").replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ");
  const item = { id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    target: oneLine(flat(target), "the target", 200), quote: oneLine(flat(quote), "the quote"), text: oneLine(flat(text), "the request"), at: now.toISOString() };
  if (!item.target || !item.text) throw new Error("a request needs what to change and how");
  items.push(item);
  writeRequests(clipsDir, items);
  return items;
}

/** Removes the requests with these ids (null: all of them); returns what is left. */
export function removeRequests(clipsDir, ids = null) {
  const keep = ids === null ? [] : readRequests(clipsDir).filter((x) => !ids.includes(x.id));
  writeRequests(clipsDir, keep);
  return keep;
}

/** The requests as the command the page copies: `/mclip:plan edit` and one `- <target> ("<quote>"): <text>` per line. */
export const requestsCommand = (items) =>
  ["/mclip:plan edit", ...items.map((x) => `- ${x.target}${x.quote ? ` ("${x.quote}")` : ""}: ${x.text}`)].join("\n");

// ---- voice previews --------------------------------------------------------------------------------------------------

/**
 * The recorder's Thai voice: the project's tts/.venv Python (tools/TutorialRecorder/tts) running this plugin's own
 * tts_paradee.py, so the preview always speaks the way the newest recorder does. Speaks `lines` into `outDir` with the
 * pronunciation rules `lexicons` (files, later wins) and returns [{ file (mp3), durationMs }] in their order.
 */
export const TTS_SCRIPT = path.join(PLUGIN_ROOT, "templates", "TutorialRecorder", "tts", "tts_paradee.py");
export function pyThaiTts(ttsDir, script = TTS_SCRIPT) {
  return (lines, outDir, speed, lexicons = [], voice = PARADEE) => {
    const python = process.platform === "win32" ? path.join(ttsDir, ".venv", "Scripts", "python.exe") : path.join(ttsDir, ".venv", "bin", "python");
    if (!fs.existsSync(python)) {
      throw new Error(`no voice at ${ttsDir}: install the recorder (/mclip:init), then py -3.13 -m venv ${path.join(ttsDir, ".venv")} and pip install pythaitts==1.0.0 soundfile (see its README)`);
    }
    ensureKeysIgnored(ttsDir);
    const input = path.join(outDir, "lines.txt");
    fs.writeFileSync(input, lines.join("\n") + "\n");
    const args = [script, "--input", input, "--out", outDir, "--speed", String(speed), "--mp3", ...lexicons.flatMap((f) => ["--lexicon", f])];
    // an API voice: its key reaches the speaker through the environment or the keys file, never on the command line
    if (voice.engine !== "paradee") args.push("--engine", voice.engine, "--voice", voice.voice, "--model", voice.model, "--keys", path.join(ttsDir, "keys.json"));
    if (voice.style) args.push("--style", voice.style);
    const r = spawnSync(python, args, { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    if (r.status !== 0) throw new Error(`the voice (${voice.engine}) failed (${r.status ?? r.error?.message}): ${(r.stderr ?? "").trim().split("\n").at(-1)}`);
    const items = readJson(path.join(outDir, "manifest.json"))?.items ?? [];
    return items.map((it) => ({ file: path.join(outDir, String(it.file).replace(/\.wav$/, ".mp3")), durationMs: it.durationMs }));
  };
}

/**
 * Speaks lesson `id`'s narration (one step, or every step with a '- พูด:') into clips/<id>/voice/NN.mp3 and records it
 * in voice.json. A step whose words, speed, pronunciation rules and voice engine are what was spoken before is not
 * spoken again (unless `force`). `speed` defaults to the plan's. The voice speaks into a working folder first:
 * tts_paradee.py empties its output folder, the other steps' audio must stay.
 */
export function makeVoice(clipsDir, id, { step = null, speed = null, force = false, speak, now = new Date(), globalLexicon = GLOBAL_LEXICON }) {
  const dir = path.join(clipsDir, id);
  const file = path.join(dir, "lesson.md");
  if (!ID.test(id) || !fs.existsSync(file)) return { code: 2, error: `no lesson clips/${id}/lesson.md (a topic: /mclip:plan lesson ${id} writes it)` };
  const planFile = path.join(clipsDir, "plan.md");
  const plan = fs.existsSync(planFile) ? parsePlan(fs.readFileSync(planFile, "utf8")).plan : null;
  speed ??= plan ? planSpeed(plan) : DEFAULT_SPEED;
  if (!(speed >= 0.7 && speed <= 1)) return { code: 2, error: "--speed is between 0.7 and 1.0" };
  const named = plan?.fields?.find((f) => f.key === VOICE_FIELD);
  if (named && parseVoice(named.value).error) return { code: 2, error: `clips/plan.md: '- ${VOICE_FIELD}:' ${parseVoice(named.value).error}` };
  const voice = planVoice(plan);
  const { merged } = readLexicon(clipsDir, globalLexicon);
  const lexicons = voice.engine === "paradee" ? [globalLexicon, path.join(clipsDir, "lexicon.txt")].filter((f) => fs.existsSync(f)) : [];
  const { lesson } = parseLesson(fs.readFileSync(file, "utf8"));
  // the opening card, the steps and the closing card, in the clip's order
  const narrated = spokenParts(lesson).filter((s) => s.narration);
  let chosen = narrated;
  if (step !== null) {
    const s = spokenParts(lesson).find((x) => x.n === step);
    const what = step === "open" ? "card เปิด" : step === "close" ? "card สรุป" : `step ${step}`;
    if (!s) return { code: 2, error: `clips/${id}/lesson.md has no ${what}` };
    if (!s.narration) return { code: 2, error: `the ${what} of clips/${id} has no '- พูด:'` };
    chosen = [s];
  }
  if (!chosen.length) return { code: 2, error: `no step of clips/${id} has a '- พูด:'` };
  const vdir = path.join(dir, VOICE_DIR);
  const spoken = readVoices(dir);
  const fresh = (s) => spoken[s.n] && !voiceStale(spoken[s.n], s.narration, speed, rulesOf(s.narration, merged, voice), voice.key) && fs.existsSync(path.join(vdir, voiceFile(s.n)));
  const todo = chosen.filter((s) => force || !fresh(s));
  // one sentence per line, as the speaker reads them (it skips blank lines and lines starting with '#')
  for (const s of todo) if (/^\s*#/.test(s.narration)) return { code: 2, error: `step ${s.n}: a '- พูด:' line cannot start with '#'` };
  if (todo.length) {
    const work = path.join(vdir, ".speaking");
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    try {
      const items = speak(todo.map((s) => s.narration), work, speed, lexicons, voice);
      if (items.length !== todo.length || items.some((it) => !fs.existsSync(it.file))) throw new Error(`the voice made ${items.length} of ${todo.length} lines`);
      todo.forEach((s, i) => {
        fs.copyFileSync(items[i].file, path.join(vdir, voiceFile(s.n)));
        spoken[s.n] = { text: s.narration, speed, rules: rulesOf(s.narration, merged, voice), engine: VOICE_ENGINE, voice: voice.key, durationMs: items[i].durationMs, date: now.toISOString() };
      });
    } catch (e) {
      return { code: 2, error: e.message };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  // the whole lesson: audio of a step that is gone or no longer speaks is removed
  if (step === null) {
    for (const n of Object.keys(spoken).map(partKey)) {
      if (!narrated.some((s) => s.n === n)) { delete spoken[n]; fs.rmSync(path.join(vdir, voiceFile(n)), { force: true }); }
    }
  }
  fs.mkdirSync(vdir, { recursive: true });
  const order = (k) => (k === "open" ? -1 : k === "close" ? 1e9 : Number(k));
  const steps = Object.fromEntries(Object.entries(spoken).sort(([a], [b]) => order(a) - order(b)));
  fs.writeFileSync(path.join(vdir, "voice.json"), JSON.stringify({ voice: voice.key, steps }, null, 2) + "\n");
  const seconds = chosen.reduce((t, s) => t + (spoken[s.n]?.durationMs ?? 0), 0) / 1000;
  return { code: 0, dir: vdir, voice: voice.key, spoken: todo.map((s) => s.n), unchanged: chosen.filter((s) => !todo.includes(s)).map((s) => s.n), seconds };
}

// ---- command line ----------------------------------------------------------------------------------------------------

function openFile(file) {
  if (process.env.CLAUDE_CODE_REMOTE) return false;
  const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  return !r.error;
}

/** clips/.gitignore: the page, recordings and voice previews stay on the machine that made them. Adds missing lines. */
// the manual's .docx and .pdf are rebuilt from the plan at any time (manual.mjs); its manual.md stays in git
const IGNORED = ["index.html", "*.mp4", `${VOICE_DIR}/`, "manual/*.docx", "manual/*.pdf", "manual/.work/", ".mclip-open.html", REQUESTS_FILE];
export function ensureIgnored(clips) {
  const file = path.join(clips, ".gitignore");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "# rebuilt or remade by /mclip:plan and /mclip:record; kept on the machine that made them\n";
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = IGNORED.filter((l) => !have.has(l));
  if (missing.length) fs.writeFileSync(file, text + (text.endsWith("\n") ? "" : "\n") + missing.join("\n") + "\n");
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opts = { clips: path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), "clips"), open: false, voice: false, force: false };
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--open") opts.open = true;
    else if (a === "--voice") opts.voice = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--clear") opts.clear = true;
    else if (/^--(clips|mp4|srt|timing|mode|recorder|threshold|step|speed|tts|done)$/.test(a)) opts[a.slice(2)] = rest[++i];
    else if (a.startsWith("--")) return { code: 2, out: { error: `unknown option ${a}` } };
    else pos.push(a);
  }
  const clips = path.resolve(opts.clips);
  if (cmd === "check") {
    const data = load(clips);
    // per lesson: the pictures it names and how many are there, the steps that speak and how many have a current voice
    const counts = (steps) => {
      const imgs = steps.flatMap((s) => s.images.map((img) => s.present?.[img]));
      const said = steps.filter((s) => s.narration);
      const slides = steps.filter((s) => s.slide);
      return { pictures: imgs.length, picturesThere: imgs.filter(Boolean).length, slides: slides.length, slidesThere: slides.filter((s) => s.slidePresent).length,
        spoken: said.length, voiced: said.filter((s) => s.voice && !s.voice.stale).length };
    };
    return { code: data.problems.length ? 1 : 0, out: { lessons: data.lessons.map(({ id, title, status, latest, steps, appKeys }) => ({ id, title, apps: appKeys, status, latest, steps: steps.length, ...counts(steps) })), requests: readRequests(clips).length, problems: data.problems } };
  }
  if (cmd === "requests") {
    if (!fs.existsSync(path.join(clips, "plan.md"))) return { code: 2, out: { error: `no plan: ${path.join(clips, "plan.md")}` } };
    if (opts.clear && opts.done) return { code: 2, out: { error: "--done <ids> or --clear, not both" } };
    let items = readRequests(clips);
    if (opts.done) items = removeRequests(clips, String(opts.done).split(",").map((s) => s.trim()).filter(Boolean));
    else if (opts.clear) items = removeRequests(clips, null);
    return { code: 0, out: { file: path.join(clips, REQUESTS_FILE), count: items.length, items, command: items.length ? requestsCommand(items) : "" } };
  }
  if (cmd === "page") {
    const data = load(clips);
    if (!data.plan) return { code: 2, out: { error: data.problems[0] } };
    const file = path.join(clips, "index.html");
    fs.writeFileSync(file, renderPage(data));
    ensureIgnored(clips);
    return { code: data.problems.length ? 1 : 0, out: { file, opened: opts.open ? openFile(file) : false, lessons: data.lessons.length, problems: data.problems } };
  }
  if (cmd === "version") {
    const r = makeVersion(clips, pos[0], { ...opts, voice: opts.voice });
    return { code: r.code, out: r.code ? { error: r.error } : { version: r.version, dir: r.dir, ...r.meta } };
  }
  if (cmd === "compare") {
    const r = compareLesson(clips, pos[0], { threshold: opts.threshold ? Number(opts.threshold) : 0.97 });
    return { code: r.code, out: r.code ? { error: r.error } : r };
  }
  if (cmd === "voice") {
    const step = opts.step === undefined ? null : partKey(opts.step);
    if (opts.step !== undefined && step === null) return { code: 2, out: { error: "--step is a step number, open or close" } };
    const tts = path.resolve(opts.tts ?? path.join(path.dirname(clips), "tools", "TutorialRecorder", "tts"));
    const r = makeVoice(clips, pos[0] ?? "", { step, speed: opts.speed ? Number(opts.speed) : null, force: opts.force, speak: pyThaiTts(tts) });
    if (!r.code) ensureIgnored(clips);
    return { code: r.code, out: r.code ? { error: r.error } : r };
  }
  return { code: 2, out: { error: "usage: clips.mjs check|page|version|compare|voice|requests (see the header)" } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { code, out } = main(process.argv.slice(2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(code);
}

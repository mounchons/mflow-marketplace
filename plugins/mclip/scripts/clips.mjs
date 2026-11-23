#!/usr/bin/env node
// The clip plan of a project, kept in clips/ (see skills/plan/SKILL.md for the format):
//   clips/plan.md              the system, the scope, the format, the apps (## แอป: web, ios, android), and the table
//                              of contents (the order of the lessons; a contents entry without a lesson.md is a topic)
//   clips/<id>/lesson.md       one lesson: its fields, then one block per step (what is done, the words on screen,
//                              the words spoken, the reference pictures)
//   clips/<id>/screen/*.jpg    the lesson's reference pictures (`-ios` / `-android` before the extension: one platform's)
//   clips/<id>/v<n>/           a recorded version (lesson, scenario, pictures, srt, timing; the mp4 is git-ignored)
//
//   node clips.mjs check   [--clips <dir>]           parse everything, print JSON { lessons, problems }
//   node clips.mjs page    [--clips <dir>] [--open]  write clips/index.html (slides of the plan with edit buttons)
//   node clips.mjs version <id> --mp4 <f> --srt <f> --timing <f> [--mode m] [--voice] [--recorder v] [--clips <dir>]
//                                                    snapshot the lesson as its next version v<n>
//   node clips.mjs compare <id> [--threshold 0.97] [--clips <dir>]
//                                                    compare screen/ with the latest version's pictures (ffmpeg ssim)
//   node clips.mjs voice <id> [--step n] [--speed 0.85] [--force] [--tts <dir>] [--clips <dir>]
//                                                    speak the lesson's '- พูด:' lines (PyThaiTTS, the recorder's tts/)
//                                                    into clips/<id>/voice/NN.mp3 (step NN) + voice.json, to listen to
//                                                    on the page before recording; a line already spoken is kept
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

export const STEP_KEYS = { "ทำ": "action", "บนจอ": "caption", "พูด": "narration", "รูป": "image", "หมายเหตุ": "note" };
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
  const lesson = { title: "", fields: [], steps: [] };
  let step = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) { lesson.title = h1[1].trim(); return; }
    const h2 = /^##\s+(\d+)\.\s+(.+)$/.exec(line);
    if (h2) {
      const n = Number(h2[1]);
      if (n !== lesson.steps.length + 1) problems.push(`${at}: step ${n} follows step ${lesson.steps.length}`);
      step = { n, title: h2[2].trim(), line: i + 1, action: "", caption: "", narration: "", images: [], note: "" };
      lesson.steps.push(step);
      return;
    }
    if (/^##\s/.test(line)) { problems.push(`${at}: a step heading is '## <n>. <title>'`); return; }
    const f = field(line);
    if (!f) return;
    if (!step) { lesson.fields.push({ key: f[0], value: f[1] }); return; }
    const key = STEP_KEYS[f[0]];
    if (!key) { problems.push(`${at}: unknown step field '${f[0]}' (${Object.keys(STEP_KEYS).join(", ")})`); return; }
    if (key === "image") {
      if (!/^screen\/[^/\\]+\.(jpe?g|png)$/i.test(f[1])) problems.push(`${at}: a picture is screen/<name>.jpg or .png`);
      else step.images.push(f[1]);
    } else step[key] = f[1];
  });
  if (!lesson.title) problems.push(`${file}: no '# <title>'`);
  if (!lesson.steps.length) problems.push(`${file}: no steps ('## 1. <title>')`);
  for (const s of lesson.steps) {
    if (!s.action) problems.push(`${file}:${s.line}: step ${s.n} has no '- ทำ:'`);
    if (!s.caption) problems.push(`${file}:${s.line}: step ${s.n} has no '- บนจอ:'`);
  }
  return { lesson, problems };
}

const VOICE_DIR = "voice";
const voiceFile = (n) => `${String(n).padStart(2, "0")}.mp3`;
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** clips/<id>/shots.json (the recorder's --shots): { pictures: { "screen/x.jpg": { date } }, failed: { step, message } | null }. */
function readShots(dir) {
  const j = readJson(path.join(dir, "shots.json"));
  const pictures = {};
  if (isObj(j?.pictures)) for (const [k, v] of Object.entries(j.pictures)) pictures[k] = { date: typeof v?.date === "string" ? v.date : "" };
  const f = isObj(j?.failed) ? j.failed : null;
  return { pictures, failed: f ? { step: Number.isInteger(f.step) ? f.step : null, message: typeof f.message === "string" ? f.message : "" } : null };
}

/** clips/<id>/voice/voice.json: { steps: { "<n>": { text, speed, durationMs, date } } }, only well-formed entries. */
function readVoices(dir) {
  const j = readJson(path.join(dir, VOICE_DIR, "voice.json"));
  const out = {};
  if (isObj(j?.steps)) for (const [k, v] of Object.entries(j.steps)) {
    if (/^\d+$/.test(k) && typeof v?.text === "string" && Number.isFinite(v?.durationMs)) {
      out[Number(k)] = { text: v.text, speed: Number(v.speed) || 0, durationMs: v.durationMs, date: typeof v.date === "string" ? v.date : "" };
    }
  }
  return out;
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
  const lessons = plan.toc.map(({ id, title, apps: keys, teaches, sources }) => {
    const dir = path.join(clipsDir, id);
    const file = path.join(dir, "lesson.md");
    const rel = `clips/${id}/lesson.md`;
    const apps = keys.map((k) => plan.apps.find((a) => a.key === k)).filter(Boolean);
    const kinds = [...new Set(apps.flatMap((a) => a.kinds))];
    const topic = { id, tocTitle: title, appKeys: keys, apps, kinds, teaches, sources };
    // a contents entry with no lesson.md yet is a topic: agreed on first, its steps written later
    if (!fs.existsSync(file)) return { ...topic, title, fields: [], steps: [], versions: [], latest: null, status: "topic" };
    const text = fs.readFileSync(file, "utf8");
    const { lesson, problems: lp } = parseLesson(text, rel);
    problems.push(...lp);
    const shots = readShots(dir);
    const voices = readVoices(dir);
    for (const s of lesson.steps) {
      s.present = {};
      s.made = {};
      for (const img of s.images) {
        s.present[img] = fs.existsSync(path.join(dir, img));
        s.made[img] = s.present[img] && img in shots.pictures ? shots.pictures[img] : null;
      }
      const v = voices[s.n];
      s.voice = v && s.narration && fs.existsSync(path.join(dir, VOICE_DIR, voiceFile(s.n)))
        ? { file: `${VOICE_DIR}/${voiceFile(s.n)}`, durationMs: v.durationMs, stale: v.text !== s.narration } : null;
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
    let textChanged = false;
    if (latest) {
      const old = path.join(dir, `v${latest.n}`, "lesson.md");
      textChanged = fs.existsSync(old) && fs.readFileSync(old, "utf8").replace(/\r\n/g, "\n") !== text.replace(/\r\n/g, "\n");
    }
    let compare = null;
    try { compare = JSON.parse(fs.readFileSync(path.join(dir, "compare.json"), "utf8")); } catch { /* not compared yet */ }
    const hasScenario = fs.existsSync(path.join(dir, "scenario.yaml"));
    const screensChanged = !!compare && latest && compare.against === latest.n && (compare.failed || compare.changed?.length > 0);
    const status = !latest ? (hasScenario ? "ready" : "draft") : textChanged || screensChanged ? "changed" : "recorded";
    return { ...topic, ...lesson, title: lesson.title || title, versions, latest: latest?.n ?? null, textChanged, compare, hasScenario, status, shotsFailed: shots.failed };
  });
  // a lesson folder the contents do not name: a typo in an id, or a folder left behind when the contents were renumbered
  const listed = new Set(plan.toc.map((t) => t.id));
  for (const name of fs.readdirSync(clipsDir)) {
    if (ID.test(name) && !listed.has(name) && fs.existsSync(path.join(clipsDir, name, "lesson.md"))) {
      problems.push(`clips/${name}/lesson.md: not in the contents of clips/plan.md (a renamed or renumbered lesson?)`);
    }
  }
  return { plan, lessons, problems };
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

function lessonSlide(l, index) {
  const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
  const why = [];
  if (l.textChanged) why.push(`บทแก้หลัง v${l.latest}`);
  if (l.compare?.failed) why.push(`ถ่ายรูปไม่ผ่านที่ขั้น ${esc(l.compare.failed.step ?? "?")}: ${esc(l.compare.failed.message ?? "")}`);
  if (l.compare?.changed?.length) why.push(`หน้าจอเปลี่ยน ${l.compare.changed.length} รูป`);
  if (l.compare?.unavailable) why.push(esc(l.compare.unavailable));
  if (l.shotsFailed) why.push(`AI ถ่ายรูปไม่จบ: หยุดที่ขั้น ${esc(l.shotsFailed.step ?? "?")} ของ scenario.yaml — ${esc(l.shotsFailed.message)}`);
  // pictures are taken by the recorder: one web app only (a phone app's pictures are the user's)
  const shootable = l.appKeys.length <= 1 && l.kinds.every((k) => k === "web");
  const stale = l.steps.filter((s) => s.voice?.stale).length;
  if (stale) why.push(`เสียง ${stale} ขั้นเป็นของคำพูดเดิม (แก้คำพูดหลังสร้างเสียง)`);
  const changedImgs = new Set((l.compare?.changed ?? []).map((c) => c.image));
  const own = [["สอน", l.teaches], ["ที่มา", l.sources]].filter(([, v]) => v).map(([key, value]) => ({ key, value }));
  const fields = [...own, ...l.fields].map((f) => `<div class="kv"><span>${esc(f.key)}</span><p>${esc(f.value)}</p></div>`).join("");
  const mobile = l.kinds.some((k) => k !== "web");
  const both = l.kinds.includes("ios") && l.kinds.includes("android");
  const steps = l.steps.map((s) => {
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
        <h4><b>${s.n}</b> ${esc(s.title)} ${editButton(`${l.id} ขั้น ${s.n}`, s.caption)}${shootable && s.images.length ? quick(`${l.id} ขั้น ${s.n}`, SHOTS_REQUEST, "ถ่ายรูป", "ให้ AI ถ่ายรูปขั้นนี้ใหม่ (เก็บไว้ในคำขอ)") : ""}${s.narration ? quick(`${l.id} ขั้น ${s.n}`, VOICE_REQUEST, "สร้างเสียง", "ให้ AI สร้างเสียงคำพูดขั้นนี้ (เก็บไว้ในคำขอ)") : ""}</h4>
        <p class="act">${esc(s.action)}</p>
        <p class="cap"><span>บนจอ</span>${esc(s.caption)}</p>
        ${s.narration ? `<p class="say"><span>พูด</span>${esc(s.narration)}</p>` : ""}
        ${s.narration ? (s.voice
          ? `<p class="voice${s.voice.stale ? " stale" : ""}"><audio controls preload="none" src="${url(`${l.id}/${s.voice.file}`)}"></audio><small>${(s.voice.durationMs / 1000).toFixed(1)} วิ${s.voice.stale ? " · เสียงของคำพูดเดิม" : ""}</small></p>`
          : `<p class="voice none"><small>ยังไม่มีเสียง</small></p>`) : ""}
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      </div></li>`;
  }).join("");
  const versions = l.versions.length
    ? `<div class="versions">${l.versions.map((v) => `<span class="ver">v${v.n}${v.date ? ` · ${esc(v.date.slice(0, 10))}` : ""}${v.appCommit ? ` · ${esc(v.appCommit.slice(0, 7))}` : ""}${v.hasMp4 ? ` · <a href="${url(`${l.id}/v${v.n}/clip.mp4`)}" target="_blank">คลิป</a>` : " · คลิปไม่อยู่ในเครื่องนี้"}</span>`).join("")}</div>`
    : "";
  const plat = both ? `<span class="plat"><button class="on" data-plat="">ทุกเครื่อง</button><button data-plat="ios">iPhone</button><button data-plat="android">Android</button></span>` : "";
  const body = l.status === "topic"
    ? `<p class="topic-note">ยังไม่มีขั้นตอน — เป็นหัวข้อที่ตกลงกันก่อน เมื่อหัวข้อนี้ใช้ได้แล้ว สั่ง <code>/mclip:plan lesson ${esc(l.id)}</code> ให้ AI เขียนขั้นตอนและคำพูด แล้ว <code>/mclip:plan shots voice ${esc(l.id)}</code> ให้ AI ถ่ายรูปอ้างอิงและสร้างเสียงให้ฟัง</p>`
    : `<ol class="steps">${steps}</ol>`;
  const voiced = l.steps.some((s) => s.voice);
  const tools = l.status === "topic" ? "" : `${voiced ? `<button class="play-all" title="เล่นเสียงทุกขั้นต่อกัน">▶ ฟังทั้งบท</button>` : ""}${shootable && l.steps.some((s) => s.images.length) ? quick(l.id, SHOTS_REQUEST, "ถ่ายรูปทั้งบท", "ให้ AI ถ่ายรูปอ้างอิงทั้งบท (เก็บไว้ในคำขอ)") : ""}${l.steps.some((s) => s.narration) ? quick(l.id, VOICE_REQUEST, "สร้างเสียงทั้งบท", "ให้ AI สร้างเสียงทุกขั้น (เก็บไว้ในคำขอ)") : ""}`;
  return `<section class="slide lesson" data-title="${esc(`${index}. ${l.title}`)}">
    <header><span class="num">${esc(l.id.slice(0, 2))}</span><h2>${esc(l.title)}</h2><span class="badge ${cls}">${label}${l.latest ? ` v${l.latest}` : ""}</span>${plat}${tools}${editButton(l.id, l.title)}</header>
    ${l.apps.length ? `<div class="apps">${l.apps.map(appChip).join("")}</div>` : ""}
    ${why.length ? `<p class="why">${why.join(" · ")}</p>` : ""}
    ${mobile ? `<p class="why mobile">${esc(MOBILE(l.id))}</p>` : ""}
    <div class="fields">${fields}</div>${versions}
    ${body}
  </section>`;
}

export function renderPage({ plan, lessons, problems }, builtAt = new Date()) {
  const p = plan ?? { title: "ยังไม่มีแผน", fields: [], toc: [] };
  const built = builtAt.toISOString().replace("T", " ").slice(0, 16);
  const counts = Object.keys(STATUS).map((k) => [k, lessons.filter((l) => l.status === k).length]).filter(([, n]) => n);
  const cover = `<section class="slide cover" data-title="ปก">
    <div class="bar"></div><h1>${esc(p.title)}</h1>
    <p class="sub">แผนคลิปสอนการใช้งาน · ${lessons.length} บท · ${counts.map(([k, n]) => `${STATUS[k][0]} ${n}`).join(" · ")}</p>
    <p class="built">สร้างหน้านี้เมื่อ ${esc(built)} UTC — กดปุ่ม ✎ แก้ ที่จุดไหนก็ได้ แล้วคัดลอกคำสั่งไปวางใน Claude Code</p></section>`;
  const scope = `<section class="slide scope" data-title="ขอบเขตและรูปแบบ">
    <header><h2>ขอบเขตและรูปแบบ</h2>${editButton("plan", p.title)}</header>
    <div class="fields big">${p.fields.map((f) => `<div class="kv"><span>${esc(f.key)}</span><p>${esc(f.value)}</p>${editButton(`plan ${f.key}`, f.value)}</div>`).join("")}</div>
    ${p.apps.length ? `<h3>แอปในแผนนี้ (${p.apps.length})</h3><div class="app-cards">${p.apps.map((a) => `<div class="app-card">${editButton(`plan แอป ${a.key}`, a.name)}
      <h4>${appChip(a)}</h4><code>${esc(a.key)}</code>
      ${[["โค้ด", a.code], ["เทสต์", a.tests], ["e2e", a.e2e], ["url", a.url]].filter(([, v]) => v).map(([k, v]) => `<p><span>${k}</span>${esc(v)}</p>`).join("")}
      <p><span>บทเรียน</span>${lessons.filter((l) => l.appKeys.includes(a.key)).length}</p></div>`).join("")}</div>` : ""}</section>`;
  const toc = `<section class="slide toc" data-title="สารบัญ">
    <header><h2>สารบัญ</h2>${editButton("plan สารบัญ", "")}</header>
    <ol class="toc-list">${groups(lessons).map((g) => `${p.apps.length ? `<li class="grp">${esc(g.label)}</li>` : ""}${g.items.map(({ l, i }) => {
      const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
      const first = l.steps.flatMap((s) => s.images.filter((img) => s.present?.[img]))[0];
      return `<li><a href="#" data-go="${i + 3}">${first ? `<img loading="lazy" src="${url(`${l.id}/${first}`)}" alt="">` : `<div class="noimg">${esc(l.id.slice(0, 2))}</div>`}
        <div><b>${esc(l.id.slice(0, 2))}</b> ${esc(l.title)}${l.teaches ? `<small>${esc(l.teaches)}</small>` : ""}<small>${l.status === "topic" ? "ยังไม่มีขั้นตอน" : `${l.steps.length} ขั้น`}</small></div><span class="badge ${cls}">${label}${l.latest ? ` v${l.latest}` : ""}</span></a></li>`;
    }).join("")}`).join("")}</ol></section>`;
  const issues = problems.length
    ? `<section class="slide problems" data-title="ปัญหาในไฟล์แผน"><header><h2>ปัญหาในไฟล์แผน</h2></header><ul>${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
  const slides = [cover, scope, toc, ...lessons.map((l, i) => lessonSlide(l, i + 1)), issues].join("\n");
  // the left menu: the plan's own pages, then each lesson (main item) with its steps (sub items)
  const side = `<a class="item" data-go="0">ปก</a><a class="item" data-go="1">ขอบเขตและรูปแบบ</a><a class="item" data-go="2">สารบัญ</a>
    ${groups(lessons).map((g) => `<div class="group">${esc(g.label)}</div>${g.items.map(({ l, i }) => {
      const [label, cls] = STATUS[l.status] ?? ["?", "draft"];
      return `<div class="lesson-menu"><a class="item lesson" data-go="${i + 3}"><b>${esc(l.id.slice(0, 2))}</b><span>${esc(l.title)}</span><i class="dot ${cls}" title="${label}"></i></a>
        <ol class="sub">${l.steps.map((s) => `<li><a data-go="${i + 3}" data-step="${esc(`${l.id}-${s.n}`)}">${s.n}. ${esc(s.title)}</a></li>`).join("")}</ol></div>`;
    }).join("")}`).join("")}${problems.length ? `<a class="item warn" data-go="${lessons.length + 3}">ปัญหาในไฟล์แผน (${problems.length})</a>` : ""}`;
  // replacer functions: a '$' in the plan's words must not be read as a replacement pattern
  return PAGE.replace("{{TITLE}}", () => esc(p.title)).replace("{{NAME}}", () => esc(p.title)).replace("{{SIDE}}", () => side).replace("{{SLIDES}}", () => slides).replace("{{BUILT}}", () => esc(built));
}

const PAGE = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{TITLE}} · แผนคลิป</title>
<style>
:root{--ink:#0f172a;--muted:#475569;--blue:#173f8f;--blue2:#2453b3;--orange:#f97316;--yellow:#facc15;--green:#16a34a;--red:#dc2626;--bg:#eef2fb;--card:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "Noto Sans Thai","Sarabun","Leelawadee UI",Tahoma,system-ui,sans-serif}
nav{position:sticky;top:0;z-index:6;height:52px;display:flex;gap:8px;align-items:center;padding:0 16px;background:var(--blue);color:#fff}
nav button{font:inherit;border:0;border-radius:8px;padding:6px 12px;background:#ffffff22;color:#fff;cursor:pointer}nav button:hover{background:#ffffff44}
nav .where{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600}nav button{flex:none}nav .tray{background:var(--orange)}#menu{display:none}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr)}
aside{position:sticky;top:52px;height:calc(100vh - 52px);overflow-y:auto;background:#fff;border-right:1px solid #dbe3f3;padding:12px 10px 40px}
aside a{display:flex;gap:8px;align-items:baseline;color:inherit;text-decoration:none;border-radius:8px;cursor:pointer}
aside .item{padding:8px 10px;font-weight:600}aside .item:hover,aside .sub a:hover{background:#eef2fb}
aside .item.on{background:var(--blue);color:#fff}aside .item.warn{color:var(--red)}
aside .lesson b{color:var(--orange);min-width:22px}aside .item.on b{color:var(--yellow)}aside .lesson span{flex:1}
aside .group{margin:14px 10px 4px;font-size:12px;color:var(--muted);letter-spacing:.04em}
.dot{width:10px;height:10px;border-radius:50%;flex:none;align-self:center;background:#cbd5e1}.dot.topic{background:#fff;border:2px solid #94a3b8}.dot.ready{background:#3b82f6}.dot.recorded{background:var(--green)}.dot.changed{background:var(--red)}
aside .sub{list-style:none;margin:2px 0 8px 22px;padding:0 0 0 10px;border-left:2px solid #e2e8f0;display:none}
aside .lesson-menu.open .sub{display:block}aside .sub a{padding:4px 8px;font-size:14px;color:var(--muted)}aside .sub a.on{color:var(--blue);font-weight:600;background:#eef2fb}
main{padding:16px;min-width:0}
.slide{display:none;background:var(--card);border-radius:16px;padding:28px;min-height:calc(100vh - 84px);box-shadow:0 4px 20px #0f172a14;max-width:1200px;margin:0 auto}
.step{scroll-margin-top:64px}.step.flash{box-shadow:0 0 0 3px var(--orange)}
.slide.on{display:block}body.grid .slide{display:block;min-height:0;margin-bottom:16px}
.cover{background:radial-gradient(120% 120% at 85% 15%,var(--blue2) 0%,var(--blue) 45%,#0f2a63 100%);color:#fff;display:none;flex-direction:column;justify-content:center;padding:0 8%}
.cover.on,body.grid .cover{display:flex}.cover .bar{width:96px;height:8px;border-radius:4px;background:var(--orange);margin-bottom:28px}
.cover h1{font-size:clamp(32px,6vw,64px);margin:0;line-height:1.3}.cover .sub{font-size:22px;color:#dbe5ff}.cover .built{color:#b9c8f5;font-size:14px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}header h2{margin:0;font-size:28px;flex:1}
.num{background:var(--orange);color:#fff;border-radius:10px;padding:2px 12px;font-weight:700;font-size:22px}
.badge{border-radius:999px;padding:2px 12px;font-size:14px;font-weight:600}.badge.topic{background:#fff;border:1px dashed #94a3b8;color:var(--muted)}.badge.draft{background:#e2e8f0}.badge.ready{background:#dbeafe;color:var(--blue)}
.badge.recorded{background:#dcfce7;color:var(--green)}.badge.changed{background:#fee2e2;color:var(--red)}
.why{background:#fff7ed;border-left:4px solid var(--orange);padding:8px 12px;border-radius:6px}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:8px 0 16px}.fields.big{grid-template-columns:1fr}
.kv{background:#f8fafc;border-radius:10px;padding:8px 12px;position:relative}.kv span{color:var(--muted);font-size:13px}.kv p{margin:0}.kv .edit{position:absolute;top:6px;right:6px}
.versions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.ver{background:#eef2ff;border-radius:8px;padding:2px 10px;font-size:14px}
.steps{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.step{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px}
.pics{display:grid;gap:8px}figure{margin:0}figure img{width:100%;border-radius:8px;border:1px solid #cbd5e1;display:block}
figure.diff{display:grid;grid-template-columns:1fr 1fr;gap:6px}figure.diff figcaption{grid-column:1/-1;color:var(--red)}.old{position:relative}.old em{position:absolute;left:6px;top:6px;background:#0f172acc;color:#fff;font-style:normal;padding:0 6px;border-radius:4px;font-size:12px}
figcaption{font-size:12px;color:var(--muted)}figure.missing div{aspect-ratio:16/9;border:2px dashed #cbd5e1;border-radius:8px;display:grid;place-items:center;color:var(--muted)}
.words h4{margin:0 0 6px;font-size:18px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.words h4 b{background:var(--blue);color:#fff;border-radius:6px;padding:0 8px}
.words p{margin:4px 0}.words span{display:inline-block;min-width:44px;font-size:12px;color:#fff;border-radius:4px;padding:0 6px;margin-right:8px;text-align:center}
.cap span{background:var(--blue)}.say span{background:var(--orange)}.act{color:var(--muted)}.note{font-size:14px;color:var(--muted);font-style:italic}
.toc-list{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:12px}
.toc-list a{display:grid;grid-template-rows:auto 1fr auto;gap:8px;text-decoration:none;color:inherit;border:1px solid #e2e8f0;border-radius:12px;padding:10px;height:100%}
.toc-list a:hover{border-color:var(--orange);box-shadow:0 0 0 3px #f9731633}.toc-list img,.noimg{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px}
.noimg{background:var(--blue);color:#fff;display:grid;place-items:center;font-size:40px;font-weight:700}.toc-list small{display:block;color:var(--muted)}.toc-list .badge{justify-self:start}
.problems li{color:var(--red)}
.apps{display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 10px}.app{display:inline-flex;gap:6px;align-items:center;background:#f1f5f9;border-radius:999px;padding:2px 12px 2px 4px;font-size:14px;font-weight:600}
.app i{font-style:normal;font-size:12px;color:#fff;border-radius:999px;padding:0 8px}.k-web{background:var(--blue2)}.k-ios{background:#111827}.k-android{background:var(--green)}
.why.mobile{background:#f0fdf4;border-left-color:var(--green)}
.topic-note{border:2px dashed #cbd5e1;border-radius:12px;padding:20px;color:var(--muted)}
.app-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:12px}
.app-card{position:relative;border:1px solid #e2e8f0;border-radius:12px;padding:12px}.app-card h4{margin:0 0 4px}.app-card .edit{position:absolute;top:8px;right:8px}
.app-card p{margin:2px 0;font-size:14px;overflow-wrap:anywhere}.app-card p span{display:inline-block;min-width:64px;color:var(--muted)}.app-card code{font-size:12px;color:var(--muted)}
.toc-list .grp{grid-column:1/-1;font-weight:700;color:var(--blue);border-bottom:2px solid #e2e8f0;padding-top:6px}
.plat{display:inline-flex;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}.plat button{font:inherit;font-size:13px;border:0;background:#fff;padding:2px 10px;cursor:pointer}.plat button.on{background:var(--blue);color:#fff}
.slide:not([data-plat="ios"]):not([data-plat="android"]) .pics:has(> figure[data-plat]){grid-template-columns:1fr 1fr}
.slide[data-plat="ios"] figure[data-plat="android"],.slide[data-plat="android"] figure[data-plat="ios"]{display:none}
.quick{font:inherit;font-size:13px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:1px 8px;cursor:pointer}.quick:hover{background:#eef2fb}.quick.added{background:var(--green);border-color:var(--green);color:#fff}
.play-all{font:inherit;font-size:13px;border:0;background:var(--orange);color:#fff;border-radius:8px;padding:2px 12px;cursor:pointer}
.voice{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.voice audio{height:32px;max-width:100%}.voice small{color:var(--muted)}.voice.stale small{color:var(--red);font-weight:600}
.by{font-style:normal;font-size:11px;border-radius:4px;padding:0 6px;color:#fff}.by.ai{background:var(--blue2)}.by.own{background:#64748b}
.edit{font:inherit;font-size:13px;border:1px solid var(--orange);background:#fff;color:#c2410c;border-radius:8px;padding:1px 8px;cursor:pointer}.edit:hover{background:var(--orange);color:#fff}
dialog{border:0;border-radius:14px;padding:20px;width:min(640px,92vw);box-shadow:0 20px 60px #0f172a55}dialog::backdrop{background:#0f172a66}
dialog textarea{width:100%;min-height:120px;font:inherit;padding:8px;border-radius:8px;border:1px solid #cbd5e1}
dialog .row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}dialog button{font:inherit;border-radius:8px;border:0;padding:6px 14px;cursor:pointer;background:#e2e8f0}
dialog button.go{background:var(--orange);color:#fff}.quote{color:var(--muted);font-size:14px}.tray-list li{margin-bottom:6px}
@media (max-width:900px){.layout{grid-template-columns:minmax(0,1fr)}#menu{display:inline-block}
  aside{display:none;position:fixed;z-index:7;left:0;top:52px;width:min(320px,86vw);box-shadow:8px 0 30px #0f172a33}body.menu aside{display:block}}
@media (max-width:760px){.step{grid-template-columns:minmax(0,1fr)}.slide{padding:16px}main{padding:8px}nav{padding:0 8px;gap:6px}nav button{padding:6px 8px}}
</style></head><body>
<nav><button id="menu" title="เมนู">☰</button><span class="where" id="where">{{NAME}}</span>
<button id="grid" title="ดูทุกหน้าต่อกัน">ภาพรวม</button><button class="tray" id="tray">คำขอแก้ 0</button></nav>
<div class="layout"><aside id="side">{{SIDE}}</aside>
<main>{{SLIDES}}</main></div>
<dialog id="ask"><h3 id="askTitle">ขอให้ AI แก้</h3><p class="quote" id="askQuote"></p>
<textarea id="askText" placeholder="อยากให้แก้อะไร เช่น เปลี่ยนบทพูดให้สั้นลง, เพิ่มขั้นตอนกดยกเลิก, ใช้รูปหน้าจอหลังบันทึก"></textarea>
<div class="row"><button id="askCancel">ยกเลิก</button><button class="go" id="askAdd">เก็บไว้ในคำขอ</button></div></dialog>
<dialog id="trayBox"><h3>คำขอแก้ที่เก็บไว้</h3><ol class="tray-list" id="trayList"></ol>
<p class="quote">กด "คัดลอก" แล้ววางใน Claude Code (Ctrl+V) — AI จะแก้ไฟล์แผนแล้วสร้างหน้านี้ใหม่</p>
<textarea id="trayText" readonly></textarea>
<div class="row"><button id="trayClear">ล้าง</button><button id="trayClose">ปิด</button><button class="go" id="trayCopy">คัดลอก</button></div></dialog>
<script>
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
  let edits = [];
  try { edits = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { edits = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch {} document.getElementById("tray").textContent = "คำขอแก้ " + edits.length; };
  const command = () => "/mclip:plan edit (หน้าแผนสร้างเมื่อ " + BUILT + " UTC)\\n" + edits.map((x) => "- " + x.target + (x.quote ? ' ("' + x.quote + '")' : "") + ": " + x.text).join("\\n");
  const ask = document.getElementById("ask"), tray = document.getElementById("trayBox");
  let current = null;
  document.querySelectorAll(".edit").forEach((b) => b.onclick = () => { current = { target: b.dataset.target, quote: b.dataset.quote };
    document.getElementById("askTitle").textContent = "ขอให้ AI แก้: " + current.target;
    document.getElementById("askQuote").textContent = current.quote ? "ตอนนี้: " + current.quote : "";
    document.getElementById("askText").value = ""; ask.showModal(); document.getElementById("askText").focus(); });
  // ถ่ายรูป / สร้างเสียง: a request in one click, sent with the others by the tray's copy
  document.querySelectorAll(".quick").forEach((b) => b.onclick = () => { edits.push({ target: b.dataset.target, quote: "", text: b.dataset.text });
    save(); b.classList.add("added"); setTimeout(() => b.classList.remove("added"), 900); });
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
  document.getElementById("askCancel").onclick = () => ask.close();
  document.getElementById("askAdd").onclick = () => { const text = document.getElementById("askText").value.trim();
    if (text) { edits.push({ ...current, text }); save(); } ask.close(); };
  const fill = () => { const list = document.getElementById("trayList"); list.innerHTML = "";
    edits.forEach((x, i) => { const li = document.createElement("li"); li.textContent = x.target + ": " + x.text + " ";
      const del = document.createElement("button"); del.textContent = "ลบ"; del.className = "edit"; del.onclick = () => { edits.splice(i, 1); save(); fill(); };
      li.appendChild(del); list.appendChild(li); });
    document.getElementById("trayText").value = edits.length ? command() : ""; };
  document.getElementById("tray").onclick = () => { fill(); tray.showModal(); };
  document.getElementById("trayClose").onclick = () => tray.close();
  document.getElementById("trayClear").onclick = () => { edits = []; save(); fill(); };
  document.getElementById("trayCopy").onclick = async () => { const box = document.getElementById("trayText");
    try { await navigator.clipboard.writeText(box.value); document.getElementById("trayCopy").textContent = "คัดลอกแล้ว ✓"; }
    catch { box.focus(); box.select(); document.getElementById("trayCopy").textContent = "กด Ctrl+C"; }
    setTimeout(() => document.getElementById("trayCopy").textContent = "คัดลอก", 2500); };
  // #<n> opens page n and #<n>/<lesson>-<step> one step, so a link can point at a lesson or a step
  const [page, step] = location.hash.slice(1).split("/");
  save(); show((parseInt(page, 10) || 1) - 1, step);
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

/** Snapshot lesson `id` as its next version: lesson.md, scenario.yaml, screen/, and the recording's files. */
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

// ---- voice previews --------------------------------------------------------------------------------------------------

/**
 * The speaker of the recorder's own voice (tools/TutorialRecorder/tts: tts_paradee.py in its .venv): speaks `lines` into
 * `outDir` and returns [{ file (mp3), durationMs }] in their order.
 */
export function pyThaiTts(ttsDir) {
  return (lines, outDir, speed) => {
    const python = process.platform === "win32" ? path.join(ttsDir, ".venv", "Scripts", "python.exe") : path.join(ttsDir, ".venv", "bin", "python");
    const script = path.join(ttsDir, "tts_paradee.py");
    if (!fs.existsSync(python) || !fs.existsSync(script)) {
      throw new Error(`no voice at ${ttsDir}: install the recorder (/mclip:init), then py -3.13 -m venv ${path.join(ttsDir, ".venv")} and pip install pythaitts==1.0.0 soundfile (see its README)`);
    }
    const input = path.join(outDir, "lines.txt");
    fs.writeFileSync(input, lines.join("\n") + "\n");
    const r = spawnSync(python, [script, "--input", input, "--out", outDir, "--speed", String(speed), "--mp3"],
      { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    if (r.status !== 0) throw new Error(`tts_paradee.py failed (${r.status ?? r.error?.message}): ${(r.stderr ?? "").trim().split("\n").at(-1)}`);
    const items = readJson(path.join(outDir, "manifest.json"))?.items ?? [];
    return items.map((it) => ({ file: path.join(outDir, String(it.file).replace(/\.wav$/, ".mp3")), durationMs: it.durationMs }));
  };
}

/**
 * Speaks lesson `id`'s narration (one step, or every step with a '- พูด:') into clips/<id>/voice/NN.mp3 and records it
 * in voice.json. A step whose words and speed are what was spoken before is not spoken again (unless `force`). The voice
 * speaks into a working folder first: tts_paradee.py empties its output folder, the other steps' audio must stay.
 */
export function makeVoice(clipsDir, id, { step = null, speed = 0.85, force = false, speak, now = new Date() }) {
  const dir = path.join(clipsDir, id);
  const file = path.join(dir, "lesson.md");
  if (!ID.test(id) || !fs.existsSync(file)) return { code: 2, error: `no lesson clips/${id}/lesson.md (a topic: /mclip:plan lesson ${id} writes it)` };
  if (!(speed >= 0.7 && speed <= 1)) return { code: 2, error: "--speed is between 0.7 and 1.0" };
  const { lesson } = parseLesson(fs.readFileSync(file, "utf8"));
  const narrated = lesson.steps.filter((s) => s.narration);
  let chosen = narrated;
  if (step !== null) {
    const s = lesson.steps.find((x) => x.n === step);
    if (!s) return { code: 2, error: `clips/${id}/lesson.md has no step ${step}` };
    if (!s.narration) return { code: 2, error: `step ${step} of clips/${id} has no '- พูด:'` };
    chosen = [s];
  }
  if (!chosen.length) return { code: 2, error: `no step of clips/${id} has a '- พูด:'` };
  const vdir = path.join(dir, VOICE_DIR);
  const spoken = readVoices(dir);
  const fresh = (s) => spoken[s.n]?.text === s.narration && Math.abs(spoken[s.n].speed - speed) < 0.001 && fs.existsSync(path.join(vdir, voiceFile(s.n)));
  const todo = chosen.filter((s) => force || !fresh(s));
  // one sentence per line, as the speaker reads them (it skips blank lines and lines starting with '#')
  for (const s of todo) if (/^\s*#/.test(s.narration)) return { code: 2, error: `step ${s.n}: a '- พูด:' line cannot start with '#'` };
  if (todo.length) {
    const work = path.join(vdir, ".speaking");
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    try {
      const items = speak(todo.map((s) => s.narration), work, speed);
      if (items.length !== todo.length || items.some((it) => !fs.existsSync(it.file))) throw new Error(`the voice made ${items.length} of ${todo.length} lines`);
      todo.forEach((s, i) => {
        fs.copyFileSync(items[i].file, path.join(vdir, voiceFile(s.n)));
        spoken[s.n] = { text: s.narration, speed, durationMs: items[i].durationMs, date: now.toISOString() };
      });
    } catch (e) {
      return { code: 2, error: e.message };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  // the whole lesson: audio of a step that is gone or no longer speaks is removed
  if (step === null) {
    for (const n of Object.keys(spoken).map(Number)) {
      if (!narrated.some((s) => s.n === n)) { delete spoken[n]; fs.rmSync(path.join(vdir, voiceFile(n)), { force: true }); }
    }
  }
  fs.mkdirSync(vdir, { recursive: true });
  const steps = Object.fromEntries(Object.entries(spoken).sort(([a], [b]) => a - b));
  fs.writeFileSync(path.join(vdir, "voice.json"), JSON.stringify({ voice: "makham_paradee", steps }, null, 2) + "\n");
  const seconds = chosen.reduce((t, s) => t + (spoken[s.n]?.durationMs ?? 0), 0) / 1000;
  return { code: 0, dir: vdir, spoken: todo.map((s) => s.n), unchanged: chosen.filter((s) => !todo.includes(s)).map((s) => s.n), seconds };
}

// ---- command line ----------------------------------------------------------------------------------------------------

function openFile(file) {
  if (process.env.CLAUDE_CODE_REMOTE) return false;
  const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  return !r.error;
}

/** clips/.gitignore: the page, recordings and voice previews stay on the machine that made them. Adds missing lines. */
const IGNORED = ["index.html", "*.mp4", `${VOICE_DIR}/`];
function ensureIgnored(clips) {
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
    else if (/^--(clips|mp4|srt|timing|mode|recorder|threshold|step|speed|tts)$/.test(a)) opts[a.slice(2)] = rest[++i];
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
      return { pictures: imgs.length, picturesThere: imgs.filter(Boolean).length, spoken: said.length, voiced: said.filter((s) => s.voice && !s.voice.stale).length };
    };
    return { code: data.problems.length ? 1 : 0, out: { lessons: data.lessons.map(({ id, title, status, latest, steps, appKeys }) => ({ id, title, apps: appKeys, status, latest, steps: steps.length, ...counts(steps) })), problems: data.problems } };
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
    const step = opts.step === undefined ? null : Number(opts.step);
    if (step !== null && !(Number.isInteger(step) && step > 0)) return { code: 2, out: { error: "--step is a step number" } };
    const tts = path.resolve(opts.tts ?? path.join(path.dirname(clips), "tools", "TutorialRecorder", "tts"));
    const r = makeVoice(clips, pos[0] ?? "", { step, speed: opts.speed ? Number(opts.speed) : 0.85, force: opts.force, speak: pyThaiTts(tts) });
    if (!r.code) ensureIgnored(clips);
    return { code: r.code, out: r.code ? { error: r.error } : r };
  }
  return { code: 2, out: { error: "usage: clips.mjs check|page|version|compare|voice (see the header)" } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { code, out } = main(process.argv.slice(2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(code);
}

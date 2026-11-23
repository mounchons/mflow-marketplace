// mclip's voice controls: pronunciation rules (which steps a rule touches), the plan's speed, what makes a voice stale,
// the small writes the live page makes (a step's narration, the speed, the project's words) and the live server
// itself (serve.mjs) driven over HTTP on 127.0.0.1 with a stand-in for the voice. No Python, no browser.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(REPO, "plugins", "mclip", "scripts");
const imp = (f) => import(`file://${path.join(SCRIPTS, f).replace(/\\/g, "/")}`);
const { parseLexicon, readLexicon, rulesFor, planSpeed, voiceStale, setNarration, setPlanField, writeProjectLexicon, makeVoice, load, renderPage, VOICE_ENGINE, GLOBAL_LEXICON, readRequests, addRequest, removeRequests, requestsCommand,
  parseVoice, planVoice, voiceField, keyStatus, apiKey, elevenLabsVoices, VOICE_FIELD, PARADEE, ensureKeysIgnored, pyThaiTts, STYLE_FIELD, withStyle } = await imp("clips.mjs");
const { checkProject } = await imp("doctor.mjs");
const { createHandler, SAMPLE } = await imp("serve.mjs");

const PLAN = "# Shop\n\n- ระบบ: ร้าน\n- ความเร็วเสียง: 0.80\n\n## สารบัญ\n\n1. 01-in — เข้าสู่ระบบ\n";
const LESSON = "# เข้าสู่ระบบ\r\n\r\n## 1. เปิดหน้า\r\n- ทำ: open /login\r\n- บนจอ: เปิดหน้าเข้าสู่ระบบ\r\n- พูด: กด Login ค่ะ\r\n\r\n## 2. กรอก\r\n- ทำ: fill\r\n- บนจอ: กรอกชื่อ\r\n";

function project(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-voice-"));
  for (const [rel, body] of Object.entries({ "clips/plan.md": PLAN, "clips/01-in/lesson.md": LESSON, "global.txt": "Login = ล๊อก อิน\n", ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return { root, clips: path.join(root, "clips"), global: path.join(root, "global.txt"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function stub() {
  const calls = [];
  return { calls, speak: (lines, outDir, speed, lexicons, voice) => {
    calls.push({ lines, speed, lexicons, voice });
    return lines.map((t, i) => { const f = path.join(outDir, `${i}.mp3`); fs.writeFileSync(f, t); return { file: f, durationMs: 1000 }; });
  } };
}

test("the plugin ships the user's word: Login is said ล๊อก อิน", () => {
  const rules = parseLexicon(fs.readFileSync(GLOBAL_LEXICON, "utf8"));
  assert.deepEqual(rules.find((r) => r.written === "Login"), { written: "Login", spoken: "ล๊อก อิน" });
});

test("rules: a Latin word whole and in any case, a project's rule wins, and only the rules a line uses count", () => {
  const p = project({ "clips/lexicon.txt": "# mine\nlogin = ล็อกอิน\nCompare Price = คอมแพร์ ไพรซ์\nไม่มีเท่ากับ\n" });
  try {
    const { global, project: own, merged } = readLexicon(p.clips, p.global);
    assert.equal(global.length, 1);
    assert.equal(own.length, 2, "a line without '=' is not a rule");
    assert.equal(merged.get("login").spoken, "ล็อกอิน", "the project's rule wins");
    assert.equal(rulesFor("กด LOGIN ค่ะ", merged), "login=ล็อกอิน");
    assert.equal(rulesFor("กด Logins ค่ะ", merged), "", "Logins is another word");
    assert.equal(rulesFor("ไปที่Loginค่ะ", merged), "login=ล็อกอิน", "Thai letters around it do not stop a match");
    assert.equal(rulesFor("ระบบ compare price ค่ะ", merged), "compare price=คอมแพร์ ไพรซ์");
  } finally { p.cleanup(); }
});

test("a price is said in words: only the lines with one become stale when the rule comes in", () => {
  const none = new Map();
  for (const t of ["เบี้ย 5877.50 บาทค่ะ", "เบี้ย 5,877.50 บาท", "ราคา ฿5,877.50 ค่ะ", "5877 บาท", "1,000,000บาท"]) assert.equal(rulesFor(t, none), "#money=words", t);
  for (const t of ["ปี 2569 มี 3 ครั้ง", "12.345 บาท", "v1.2.3 บาท", "กดบันทึกค่ะ"]) assert.equal(rulesFor(t, none), "", t);
  const tts = fs.readFileSync(path.join(REPO, "plugins", "mclip", "templates", "TutorialRecorder", "tts", "tts_paradee.py"), "utf8");
  assert.match(tts, /def money_words\(/, "the voice says it");
  assert.match(tts, /apply_lexicon\(speak_money\(text\), rules\)/, "before the word rules");
});

test("speed: the plan's, else 0.85; out of range is a plan problem; a stale voice says why", () => {
  assert.equal(planSpeed({ fields: [{ key: "ความเร็วเสียง", value: "0.80" }] }), 0.8);
  assert.equal(planSpeed({ fields: [] }), 0.85);
  assert.equal(planSpeed({ fields: [{ key: "ความเร็วเสียง", value: "2" }] }), 0.85);
  const p = project({ "clips/plan.md": PLAN.replace("0.80", "1.5") });
  try {
    assert.ok(load(p.clips).problems.some((x) => /ความเร็วเสียง: 1\.5/.test(x)));
  } finally { p.cleanup(); }
  const v = { text: "กด Login ค่ะ", speed: 0.8, rules: "login=ล๊อก อิน", engine: VOICE_ENGINE };
  assert.equal(voiceStale(v, "กด Login ค่ะ", 0.8, "login=ล๊อก อิน"), null);
  assert.equal(voiceStale(v, "กด Login นะคะ", 0.8, "login=ล๊อก อิน"), "คำพูดแก้แล้ว");
  assert.match(voiceStale(v, "กด Login ค่ะ", 0.85, "login=ล๊อก อิน"), /ความเร็ว/);
  assert.equal(voiceStale(v, "กด Login ค่ะ", 0.8, "login=ล็อกอิน"), "คำอ่านเปลี่ยน");
  assert.match(voiceStale({ ...v, engine: 1 }, "กด Login ค่ะ", 0.8, "login=ล๊อก อิน"), /รุ่นเก่า/);
});

test("voice: the plan's speed and both rule files go to the voice; a new rule re-speaks only the steps that use it", () => {
  const p = project({ "clips/01-in/lesson.md": LESSON.replace("- บนจอ: กรอกชื่อ\r\n", "- บนจอ: กรอกชื่อ\r\n- พูด: กรอกชื่อค่ะ\r\n") });
  const v = stub();
  try {
    let r = makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.deepEqual(r.spoken, [1, 2]);
    assert.equal(v.calls[0].speed, 0.8, "the plan's speed");
    assert.deepEqual(v.calls[0].lexicons, [p.global], "no project file yet");
    fs.writeFileSync(path.join(p.clips, "lexicon.txt"), "Login = ล็อกอิน\n");
    r = makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.deepEqual([r.spoken, r.unchanged], [[1], [2]], "only the step that says Login");
    assert.deepEqual(v.calls[1].lexicons, [p.global, path.join(p.clips, "lexicon.txt")]);
    const saved = JSON.parse(fs.readFileSync(path.join(p.clips, "01-in", "voice", "voice.json"), "utf8")).steps["1"];
    assert.deepEqual([saved.rules, saved.engine, saved.speed], ["login=ล็อกอิน", VOICE_ENGINE, 0.8]);
  } finally { p.cleanup(); }
});

test("writes from the page: the narration line (CRLF kept, added when missing, removed when empty), the speed, the words", () => {
  const p = project();
  const file = () => fs.readFileSync(path.join(p.clips, "01-in", "lesson.md"), "utf8");
  try {
    setNarration(p.clips, "01-in", 1, "กดปุ่ม Login ด้านขวาค่ะ $1");
    assert.ok(file().includes("- พูด: กดปุ่ม Login ด้านขวาค่ะ $1\r\n"), "replaced, '$' kept as it is, CRLF kept");
    setNarration(p.clips, "01-in", 2, "กรอกชื่อค่ะ");
    assert.match(file(), /- บนจอ: กรอกชื่อ\r\n- พูด: กรอกชื่อค่ะ/, "added under บนจอ");
    assert.ok(!file().replace(/\r\n/g, "").includes("\n"), "no bare LF");
    setNarration(p.clips, "01-in", 2, "");
    assert.ok(!file().includes("กรอกชื่อค่ะ"), "an empty text removes the line");
    assert.throws(() => setNarration(p.clips, "01-in", 1, "บรรทัดหนึ่ง\n## 9. แทรก"), /one line/);
    assert.throws(() => setNarration(p.clips, "../x", 1, "x"), /no lesson/);
    assert.throws(() => setNarration(p.clips, "01-in", 7, "x"), /no step 7/);

    setPlanField(p.clips, "ความเร็วเสียง", "0.90");
    let plan = fs.readFileSync(path.join(p.clips, "plan.md"), "utf8");
    assert.match(plan, /^- ความเร็วเสียง: 0\.90$/m);
    assert.equal((plan.match(/ความเร็วเสียง/g) ?? []).length, 1);
    fs.writeFileSync(path.join(p.clips, "plan.md"), PLAN.replace("- ความเร็วเสียง: 0.80\n", ""));
    setPlanField(p.clips, "ความเร็วเสียง", "0.75");
    plan = fs.readFileSync(path.join(p.clips, "plan.md"), "utf8");
    assert.match(plan, /- ระบบ: ร้าน\n- ความเร็วเสียง: 0\.75\n/, "added after the last field, before the contents");

    assert.equal(writeProjectLexicon(p.clips, "Login = ล็อกอิน\n\n# note\nSQL = เอส คิว แอล\n"), 2);
    assert.throws(() => writeProjectLexicon(p.clips, "no equals sign"), /<word> = <how it is said>/);
  } finally { p.cleanup(); }
});

// ---- the live server ----

async function serve(p, token = "t".repeat(48)) {
  const v = stub();
  let port = 0;
  // env: {} so a key set on this machine never reaches a real API from a test
  const server = http.createServer(createHandler({ clips: p.clips, token, speak: v.speak, port: () => port, env: {} }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const call = (method, where, { body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: where, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const parts = []; res.on("data", (c) => parts.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
  const post = (where, body, extra = {}) => call("POST", where, { body, headers: { "Content-Type": "application/json", "X-Mclip-Token": token, ...extra } });
  return { port, token, v, call, post, close: () => new Promise((r) => server.close(r)) };
}

test("the live server: the page needs the token, writes need the token and this host, files stay under clips/", async () => {
  const p = project();
  const s = await serve(p);
  try {
    assert.equal((await s.call("GET", "/")).status, 403, "no token, no page");
    const page = await s.call("GET", `/?t=${s.token}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /window\.MCLIP=\{"token":"t{48}","requests":\[\],"keys":\{"GEMINI_API_KEY":(true|false),"ELEVENLABS_API_KEY":(true|false)\}/);
    assert.match(page.text, /class="live-say" data-id="01-in" data-step="1"/);
    assert.match(page.text, /<option value="0.8" selected>/, "the plan's speed is chosen");
    assert.equal(page.headers["access-control-allow-origin"], undefined, "no CORS");

    assert.equal((await s.call("GET", "/", { headers: { Host: "evil.example:80" } })).status, 403, "another host name (DNS rebinding)");
    assert.equal((await s.post("/api/speed", { speed: 0.9 }, { "X-Mclip-Token": "wrong" })).status, 403);
    assert.equal((await s.post("/api/speed", { speed: 0.9 }, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await s.call("POST", "/api/speed", { body: "speed=0.9", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Mclip-Token": s.token } })).status, 415, "a plain form post is refused");

    assert.equal((await s.call("GET", "/01-in/lesson.md")).status, 200);
    assert.equal((await s.call("GET", "/../global.txt")).status, 404);
    assert.equal((await s.call("GET", "/%2e%2e/global.txt")).status, 404);
    assert.equal((await s.call("GET", "/.gitignore")).status, 404, "no dot-files");
  } finally { await s.close(); p.cleanup(); }
});

test("the live server: save a narration and speak it, speak a lesson, set the speed and the words", async () => {
  const p = project();
  const s = await serve(p);
  try {
    let r = await s.post("/api/narration", { id: "01-in", step: 2, text: "กรอกชื่อของคุณค่ะ", voice: true });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(JSON.parse(r.text).voice.spoken, [2]);
    assert.ok(fs.readFileSync(path.join(p.clips, "01-in", "lesson.md"), "utf8").includes("- พูด: กรอกชื่อของคุณค่ะ\r\n"));
    assert.deepEqual(s.v.calls.at(-1).lines, ["กรอกชื่อของคุณค่ะ"]);

    r = await s.post("/api/narration", { id: "01-in", step: 1, text: "สอง\nบรรทัด" });
    assert.equal(r.status, 400);
    assert.match(JSON.parse(r.text).error, /one line/);

    r = await s.post("/api/voice", { id: "01-in" });
    assert.deepEqual([r.status, JSON.parse(r.text).voice.spoken], [200, [1]], "step 2 is spoken already");
    assert.equal((await s.post("/api/voice", { id: "../../x" })).status, 400);

    assert.equal((await s.post("/api/speed", { speed: 0.95 })).status, 200);
    assert.match(fs.readFileSync(path.join(p.clips, "plan.md"), "utf8"), /- ความเร็วเสียง: 0\.95/);
    assert.equal((await s.post("/api/speed", { speed: 3 })).status, 400);
    const stale = load(p.clips).lessons[0].steps.map((x) => x.voice?.why ?? null);
    assert.ok(stale.every((w) => /ความเร็ว/.test(w)), "a new speed makes every voice stale");

    assert.equal((await s.post("/api/lexicon", { text: "Login = ล็อกอิน" })).status, 200);
    assert.match(fs.readFileSync(path.join(p.clips, "lexicon.txt"), "utf8"), /^Login = ล็อกอิน$/m);
    assert.match(renderPage(load(p.clips)), /<code>Login<\/code> → ล็อกอิน/);
  } finally { await s.close(); p.cleanup(); }
});

// ---- edit requests: saved by the live page, read by /mclip:plan edit ----

test("edit requests: added on one line, removed by id or all, and written as the command", () => {
  const p = project();
  try {
    assert.deepEqual(readRequests(p.clips), [], "no file, no requests");
    addRequest(p.clips, { target: "01-in ขั้น 1", quote: "เปิดหน้าเข้าสู่ระบบ", text: "พูดให้กระชับ\nไม่เกินสองประโยค" }, new Date("2026-11-23T07:00:00Z"));
    const items = addRequest(p.clips, { target: "01-in ขั้น 2", text: "ถ่ายรูปอ้างอิงใหม่" });
    assert.equal(items.length, 2);
    assert.equal(items[0].text, "พูดให้กระชับ ไม่เกินสองประโยค", "the command reads one line per request");
    assert.equal(items[0].at, "2026-11-23T07:00:00.000Z");
    assert.notEqual(items[0].id, items[1].id);
    assert.equal(requestsCommand(items), '/mclip:plan edit\n- 01-in ขั้น 1 ("เปิดหน้าเข้าสู่ระบบ"): พูดให้กระชับ ไม่เกินสองประโยค\n- 01-in ขั้น 2: ถ่ายรูปอ้างอิงใหม่');
    assert.throws(() => addRequest(p.clips, { target: "01-in", text: "  " }), /needs what to change/);

    assert.deepEqual(removeRequests(p.clips, [items[0].id]).map((x) => x.id), [items[1].id]);
    assert.deepEqual(removeRequests(p.clips, null), []);
    fs.writeFileSync(path.join(p.clips, "requests.json"), "{ broken");
    assert.deepEqual(readRequests(p.clips), [], "a broken file reads as none");
  } finally { p.cleanup(); }
});

test("edit requests: clips.mjs requests prints them and --done removes the applied ones", () => {
  const p = project();
  const run = (...a) => { const r = spawnSync(process.execPath, [path.join(SCRIPTS, "clips.mjs"), "requests", "--clips", p.clips, ...a], { encoding: "utf8" });
    return { code: r.status, out: JSON.parse(r.stdout) }; };
  try {
    assert.deepEqual(run().out.count, 0);
    const [a, b] = addRequest(p.clips, { target: "01-in ขั้น 1", text: "พูดให้กระชับ" }) && addRequest(p.clips, { target: "plan", text: "เพิ่มหัวข้อ" });
    let r = run();
    assert.equal(r.code, 0);
    assert.equal(r.out.count, 2);
    assert.match(r.out.command, /^\/mclip:plan edit\n- 01-in ขั้น 1: พูดให้กระชับ\n- plan: เพิ่มหัวข้อ$/);
    r = run("--done", a.id);
    assert.deepEqual(r.out.items.map((x) => x.id), [b.id]);
    assert.equal(run("--clear").out.count, 0);
    assert.equal(run("--done", "x", "--clear").code, 2);
  } finally { p.cleanup(); }
});

test("the live server: requests saved from the page are in clips/requests.json and on the page", async () => {
  const p = project();
  const s = await serve(p);
  try {
    let r = await s.post("/api/requests", { add: { target: "01-in ขั้น 1", quote: "เปิดหน้า", text: "พูดให้กระชับ" } });
    assert.equal(r.status, 200, r.text);
    const [item] = JSON.parse(r.text).items;
    assert.equal(item.text, "พูดให้กระชับ");
    assert.equal(readRequests(p.clips)[0].id, item.id, "saved where /mclip:plan edit reads");

    const page = await s.call("GET", `/?t=${s.token}`);
    assert.match(page.text, new RegExp(`window\\.MCLIP=\\{"token":"t{48}","requests":\\[\\{"id":"${item.id}"`));
    assert.match(page.text, /mclip:plan edit ได้เลย/, "the page says Claude reads them");
    assert.doesNotMatch(renderPage(load(p.clips)), /window\.MCLIP=/, "the file page has no server");

    assert.deepEqual(JSON.parse((await s.post("/api/requests", {})).text).items.length, 1, "{} reads the list");
    assert.equal((await s.post("/api/requests", { add: { target: "x" } })).status, 400);
    assert.equal((await s.post("/api/requests", { add: { target: "x", text: "y" } }, { "X-Mclip-Token": "wrong" })).status, 403);
    assert.deepEqual(JSON.parse((await s.post("/api/requests", { remove: item.id })).text).items, []);
  } finally { await s.close(); p.cleanup(); }
});

// ---- the voice: Paradee on this machine, or a Gemini or ElevenLabs voice over their API ----

test("the plan's voice: paradee by default, gemini and elevenlabs with their default models, a wrong one reported", () => {
  assert.deepEqual(parseVoice("paradee"), PARADEE);
  assert.deepEqual(parseVoice("gemini"), { engine: "gemini", voice: "Enya", model: "gemini-3.8-flash-tts", name: "", spec: "gemini Enya gemini-3.8-flash-tts", style: "", key: "gemini Enya gemini-3.8-flash-tts" }, "Enya when no voice is named");
  assert.equal(parseVoice("Gemini Puck gemini-2.5-pro-preview-tts").spec, "gemini Puck gemini-2.5-pro-preview-tts");
  const el = parseVoice("elevenlabs 21m00Tcm4TlvDq8ikWAM (Rachel)");
  assert.deepEqual([el.spec, el.name], ["elevenlabs 21m00Tcm4TlvDq8ikWAM eleven_v3", "Rachel"]);
  assert.equal(voiceField(el), "elevenlabs 21m00Tcm4TlvDq8ikWAM eleven_v3 (Rachel)");
  assert.equal(parseVoice(voiceField(el)).spec, el.spec, "the field reads back as it was written");
  assert.match(parseVoice("elevenlabs").error, /needs a voice/);
  assert.match(parseVoice("elevenlabs ../../v1/user").error, /needs a voice/, "an id never walks the API's path");
  assert.match(parseVoice("google Kore").error, /paradee, gemini/);
  assert.match(parseVoice("gemini Kore model extra").error, /one word/);

  const p = project({ "clips/plan.md": PLAN.replace("- ความเร็วเสียง: 0.80\n", "- ความเร็วเสียง: 0.80\n- เสียงพากย์: openai alloy\n") });
  try {
    const data = load(p.clips);
    assert.ok(data.problems.some((x) => /เสียงพากย์.*paradee, gemini/.test(x)));
    assert.equal(data.voice.spec, "paradee", "a wrong voice falls back to Paradee");
    assert.equal(makeVoice(p.clips, "01-in", { speak: stub().speak }).code, 2, "never spoken with a voice the plan did not mean");
  } finally { p.cleanup(); }
});

test("a new voice makes every step's voice stale; voices made before 0.6 count as Paradee", () => {
  const p = project();
  try {
    const v = stub();
    makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.equal(v.calls[0].voice.spec, "paradee");
    assert.equal(load(p.clips).lessons[0].steps[0].voice.stale, false);
    const json = path.join(p.clips, "01-in", "voice", "voice.json");
    const old = JSON.parse(fs.readFileSync(json, "utf8"));
    delete old.steps["1"].voice;
    fs.writeFileSync(json, JSON.stringify(old));
    assert.equal(load(p.clips).lessons[0].steps[0].voice.stale, false, "an older voice.json is Paradee's");

    setPlanField(p.clips, VOICE_FIELD, "gemini Sulafat");
    assert.equal(load(p.clips).lessons[0].steps[0].voice.why, "เปลี่ยนเสียงพากย์");
    const r = makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.deepEqual([r.spoken, r.voice], [[1], "gemini Sulafat gemini-3.8-flash-tts"]);
    assert.equal(v.calls.at(-1).voice.voice, "Sulafat");
    assert.equal(JSON.parse(fs.readFileSync(json, "utf8")).steps["1"].voice, "gemini Sulafat gemini-3.8-flash-tts");
    assert.equal(load(p.clips).lessons[0].steps[0].voice.stale, false);
    assert.equal(makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global }).spoken.length, 0, "the same voice is not paid for twice");
  } finally { p.cleanup(); }
});

test("API keys: the environment first, then tts/keys.json; only whether each is set ever leaves this machine", () => {
  const p = project({ "tools/TutorialRecorder/tts/keys.json": JSON.stringify({ GEMINI_API_KEY: "g-secret-123", ELEVENLABS_API_KEY: "  " }) });
  const tts = path.join(p.root, "tools", "TutorialRecorder", "tts");
  try {
    assert.deepEqual(keyStatus(tts, {}), { GEMINI_API_KEY: true, ELEVENLABS_API_KEY: false });
    assert.deepEqual(keyStatus(tts, { ELEVENLABS_API_KEY: "e" }), { GEMINI_API_KEY: true, ELEVENLABS_API_KEY: true });
    assert.equal(apiKey(tts, "GEMINI_API_KEY", {}), "g-secret-123");
    assert.equal(apiKey(tts, "GEMINI_API_KEY", { GEMINI_API_KEY: "from-env" }), "from-env");
    fs.writeFileSync(path.join(tts, "keys.json"), "﻿" + JSON.stringify({ ELEVENLABS_API_KEY: "e" }));
    assert.deepEqual(keyStatus(tts, {}), { GEMINI_API_KEY: false, ELEVENLABS_API_KEY: true }, "a file saved with a BOM (Notepad) reads");
    fs.writeFileSync(path.join(tts, "keys.json"), "{ not json");
    assert.deepEqual(keyStatus(tts, {}), { GEMINI_API_KEY: false, ELEVENLABS_API_KEY: false }, "a broken file is no key");
  } finally { p.cleanup(); }
});

test("the keys file is git-ignored even in a recorder installed before 0.6; doctor fails when it is not", () => {
  const p = project({ "tools/TutorialRecorder/.gitignore": "bin/\nobj/\ntts/.venv/", "tools/TutorialRecorder/tts/keys.json": "{}" });
  const tts = path.join(p.root, "tools", "TutorialRecorder", "tts");
  const ignoreFile = path.join(p.root, "tools", "TutorialRecorder", ".gitignore");
  const git = (...a) => spawnSync("git", a, { cwd: p.root, encoding: "utf8" });
  try {
    git("init", "-q");
    const doc = () => checkProject(p.root, "0.6.0").find((c) => c.id === "keys-ignored");
    assert.equal(doc().status, "fail", "an old recorder's .gitignore leaves the keys in a commit");
    assert.ok(!JSON.stringify(checkProject(p.root, "0.6.0")).includes("ELEVENLABS"), "doctor names no key it was not asked about");

    assert.equal(ensureKeysIgnored(tts), true);
    assert.equal(fs.readFileSync(ignoreFile, "utf8"), "bin/\nobj/\ntts/.venv/\ntts/keys.json\n");
    assert.equal(ensureKeysIgnored(tts), false, "once");
    assert.equal(git("check-ignore", "-q", "tools/TutorialRecorder/tts/keys.json").status, 0);
    assert.equal(doc().status, "ok");
    assert.equal(ensureKeysIgnored(path.join(p.root, "none", "tts")), false, "no recorder, nothing written");
  } finally { p.cleanup(); }
});

test("the speaker makes the keys file ignored before it speaks, and gets the voice on its command line, never a key", () => {
  const p = project({ "tools/TutorialRecorder/.gitignore": "bin/\n", "tools/TutorialRecorder/tts/keys.json": JSON.stringify({ GEMINI_API_KEY: "g-secret-9" }) });
  const tts = path.join(p.root, "tools", "TutorialRecorder", "tts");
  const venvPy = process.platform === "win32" ? path.join(tts, ".venv", "Scripts", "python.exe") : path.join(tts, ".venv", "bin", "python");
  try {
    // a stand-in "python" that is node: it records its arguments and fails, so nothing else runs
    fs.mkdirSync(path.dirname(venvPy), { recursive: true });
    fs.copyFileSync(process.execPath, venvPy);
    const script = path.join(p.root, "fake.js");
    fs.writeFileSync(script, "require('fs').writeFileSync(process.argv[1] + '.args', JSON.stringify(process.argv.slice(2))); process.exit(5)");
    const out = path.join(p.root, "out"); fs.mkdirSync(out);
    assert.throws(() => pyThaiTts(tts, script)(["สวัสดีค่ะ"], out, 0.9, [], withStyle(parseVoice("gemini Leda"), "Friendly")), /the voice \(gemini\) failed \(5\)/);
    const args = JSON.parse(fs.readFileSync(script + ".args", "utf8"));
    assert.deepEqual(args.slice(args.indexOf("--engine")), ["--engine", "gemini", "--voice", "Leda", "--model", "gemini-3.8-flash-tts", "--keys", path.join(tts, "keys.json"), "--style", "Friendly"]);
    assert.ok(!args.join(" ").includes("g-secret-9"), "the key is never an argument");
    assert.match(fs.readFileSync(path.join(p.root, "tools", "TutorialRecorder", ".gitignore"), "utf8"), /^tts\/keys\.json$/m);
  } finally { p.cleanup(); }
});

test("the ElevenLabs voice list: the account's voices, ids checked; an error says what the API said", async () => {
  const seen = [];
  const api = http.createServer((req, res) => {
    seen.push({ url: req.url, key: req.headers["xi-api-key"] });
    if (req.headers["xi-api-key"] !== "k1") { res.writeHead(401, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ detail: { status: "invalid_api_key", message: "Invalid API key" } })); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ voices: [
      { voice_id: "abc123", name: "Ploy", labels: { gender: "female", accent: "thai" }, verified_languages: [{ language: "th" }] },
      { voice_id: "../x", name: "bad" }, { voice_id: "def456", name: "Adam" }] }));
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${api.address().port}`;
  try {
    const voices = await elevenLabsVoices("k1", base);
    assert.deepEqual(voices, [{ id: "abc123", name: "Ploy", note: "female, thai", thai: true }, { id: "def456", name: "Adam", note: "", thai: false }]);
    assert.equal(seen[0].url, "/v2/voices?page_size=100");
    await assert.rejects(elevenLabsVoices("wrong", base), /ElevenLabs answered 401: Invalid API key/);
  } finally { await new Promise((r) => api.close(r)); }
});

test("the live server: the voice chosen on the page, a sample to hear, the keys never on the page", async () => {
  const p = project({ "tools/TutorialRecorder/tts/keys.json": JSON.stringify({ GEMINI_API_KEY: "g-secret-123" }) });
  const s = await serve(p);
  try {
    const page = await s.call("GET", `/?t=${s.token}`);
    assert.match(page.text, /class="kv live-voice" data-engine="paradee"/);
    assert.ok(!page.text.includes("g-secret-123"), "the key's value is never on the page");

    let r = await s.post("/api/voice-sample", { engine: "gemini", id: "Leda", model: "", speed: 0.9 });
    assert.equal(r.status, 200, r.text);
    const sample = JSON.parse(r.text);
    assert.equal(Buffer.from(sample.mp3, "base64").toString("utf8"), SAMPLE, "the stand-in voice wrote the words as the mp3");
    assert.deepEqual([s.v.calls.at(-1).voice.spec, s.v.calls.at(-1).speed], ["gemini Leda gemini-3.8-flash-tts", 0.9]);
    assert.equal((await s.post("/api/voice-sample", { engine: "elevenlabs", id: "" })).status, 400);

    r = await s.post("/api/voice-engine", { engine: "elevenlabs", id: "abc123", model: "eleven_v3", name: "Ploy (Thai)\n" });
    assert.equal(r.status, 200, r.text);
    assert.match(fs.readFileSync(path.join(p.clips, "plan.md"), "utf8"), /^- เสียงพากย์: elevenlabs abc123 eleven_v3 \(Ploy Thai\)$/m);
    assert.equal(load(p.clips).voice.spec, "elevenlabs abc123 eleven_v3");
    assert.equal((await s.post("/api/voice-engine", { engine: "elevenlabs", id: "a/b" })).status, 400);
    assert.equal((await s.post("/api/voice-engine", { engine: "paradee" })).status, 200);
    assert.match(fs.readFileSync(path.join(p.clips, "plan.md"), "utf8"), /^- เสียงพากย์: paradee$/m);

    const gem = JSON.parse((await s.post("/api/voices", { engine: "gemini" })).text).voices;
    assert.equal(gem.length, 31);
    assert.equal(gem[0].id, "Enya", "the default first");
    assert.deepEqual(gem.find((v) => v.id === "Kore"), { id: "Kore", name: "Kore", note: "Firm", thai: true });
    r = await s.post("/api/voices", { engine: "elevenlabs" });
    assert.deepEqual([r.status, JSON.parse(r.text).error], [400, "no ELEVENLABS_API_KEY in tools/TutorialRecorder/tts/keys.json"]);
  } finally { await s.close(); p.cleanup(); }
});

test("a Gemini voice's style: from the plan, part of what makes a voice stale, ignored by other voices", () => {
  const p = project();
  try {
    const v = stub();
    setPlanField(p.clips, VOICE_FIELD, "gemini Kore");
    makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.equal(v.calls.at(-1).voice.style, "");

    setPlanField(p.clips, STYLE_FIELD, "  warm   and friendly ");
    const data = load(p.clips);
    assert.deepEqual([data.voice.style, data.voice.key], ["warm and friendly", "gemini Kore gemini-3.8-flash-tts | warm and friendly"]);
    assert.equal(data.lessons[0].steps[0].voice.why, "เปลี่ยนเสียงพากย์", "a new style speaks the steps again");
    const r = makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.deepEqual([r.spoken, v.calls.at(-1).voice.style], [[1], "warm and friendly"]);
    assert.equal(load(p.clips).lessons[0].steps[0].voice.stale, false);
    assert.match(renderPage(load(p.clips)), /Google Gemini \(AI Studio\): Kore \(gemini-3\.8-flash-tts\) · สไตล์: warm and friendly/);

    setPlanField(p.clips, VOICE_FIELD, "elevenlabs abc123");
    assert.deepEqual([load(p.clips).voice.style, load(p.clips).voice.key], ["", "elevenlabs abc123 eleven_v3"], "ElevenLabs takes no style");
    assert.deepEqual(withStyle(PARADEE, "Friendly"), PARADEE);

    setPlanField(p.clips, STYLE_FIELD, "");
    assert.doesNotMatch(fs.readFileSync(path.join(p.clips, "plan.md"), "utf8"), /สไตล์เสียง/, "an empty value removes the line");
    setPlanField(p.clips, STYLE_FIELD, "");
  } finally { p.cleanup(); }
});

test("the live server: the style box is saved with a Gemini voice and dropped with another", async () => {
  const p = project();
  const s = await serve(p);
  try {
    let r = await s.post("/api/voice-sample", { engine: "gemini", id: "Kore", style: "Friendly" });
    assert.equal(r.status, 200, r.text);
    assert.equal(s.v.calls.at(-1).voice.style, "Friendly");
    r = await s.post("/api/voice-engine", { engine: "gemini", id: "Kore", style: "Friendly\nเป็นกันเอง" });
    assert.equal(JSON.parse(r.text).voice, "gemini Kore gemini-3.8-flash-tts | Friendly เป็นกันเอง");
    const plan = () => fs.readFileSync(path.join(p.clips, "plan.md"), "utf8");
    assert.match(plan(), /^- สไตล์เสียง: Friendly เป็นกันเอง$/m);
    const page = (await s.call("GET", `/?t=${s.token}`)).text;
    assert.match(page, /data-style="Friendly เป็นกันเอง"/);
    assert.match(page, /<datalist id="v-styles"><option value="Friendly">/);
    await s.post("/api/voice-engine", { engine: "elevenlabs", id: "abc123", style: "Friendly" });
    assert.doesNotMatch(plan(), /สไตล์เสียง/, "another voice leaves no style behind");
  } finally { await s.close(); p.cleanup(); }
});

test("a Gemini or ElevenLabs voice reads the narration as written: no word rules, and a changed rule leaves it fresh", async () => {
  const p = project({ "clips/lexicon.txt": "Login = ล็อกอิน\n" });
  try {
    const v = stub();
    setPlanField(p.clips, VOICE_FIELD, "gemini Enya");
    makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.deepEqual(v.calls.at(-1).lexicons, [], "no rule files reach an API voice");
    const json = JSON.parse(fs.readFileSync(path.join(p.clips, "01-in", "voice", "voice.json"), "utf8"));
    assert.equal(json.steps["1"].rules, "", "step 1 says Login, yet no rule is recorded");
    writeProjectLexicon(p.clips, "Login = ล็อก-อิน\n");
    assert.equal(load(p.clips).lessons[0].steps[0].voice.stale, false, "a new rule is Paradee's business");

    setPlanField(p.clips, VOICE_FIELD, "paradee");
    makeVoice(p.clips, "01-in", { speak: v.speak, globalLexicon: p.global });
    assert.equal(v.calls.at(-1).lexicons.length, 2, "Paradee still gets the plugin's and the project's rules");
    writeProjectLexicon(p.clips, "Login = ล็อกอินนน\n");
    assert.equal(load(p.clips).lessons[0].steps[0].voice.why, "คำอ่านเปลี่ยน");
  } finally { p.cleanup(); }
  const q = project({ "clips/lexicon.txt": "Login = ล็อกอิน\n" });
  const s = await serve(q);
  try {
    await s.post("/api/voice-sample", { engine: "gemini", id: "Enya" });
    assert.deepEqual(s.v.calls.at(-1).lexicons, [], "the sample of an API voice: no rules either");
    await s.post("/api/voice-sample", { engine: "paradee" });
    assert.ok(s.v.calls.at(-1).lexicons.length >= 1);
  } finally { await s.close(); q.cleanup(); }
});

test("the file page shows the plan's voice with an edit button", () => {
  const p = project({ "clips/plan.md": PLAN.replace("- ความเร็วเสียง: 0.80\n", "- ความเร็วเสียง: 0.80\n- เสียงพากย์: gemini Achernar\n") });
  try {
    const html = renderPage(load(p.clips));
    assert.match(html, /Google Gemini \(AI Studio\): Achernar \(gemini-3\.8-flash-tts\)/);
    assert.match(html, /data-target="plan เสียงพากย์"/);
    assert.doesNotMatch(html, /<span>เสียงพากย์<\/span><p>[^<]*<\/p>[\s\S]*<span>เสียงพากย์<\/span>/, "shown once, not again among the plan's fields");
  } finally { p.cleanup(); }
});

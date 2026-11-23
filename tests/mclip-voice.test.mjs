// mclip's voice controls: pronunciation rules (which steps a rule touches), the plan's speed, what makes a voice stale,
// the small writes the live page makes (a step's narration, the speed, the project's words) and the live server
// itself (serve.mjs) driven over HTTP on 127.0.0.1 with a stand-in for the voice. No Python, no browser.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(REPO, "plugins", "mclip", "scripts");
const imp = (f) => import(`file://${path.join(SCRIPTS, f).replace(/\\/g, "/")}`);
const { parseLexicon, readLexicon, rulesFor, planSpeed, voiceStale, setNarration, setPlanField, writeProjectLexicon, makeVoice, load, renderPage, VOICE_ENGINE, GLOBAL_LEXICON } = await imp("clips.mjs");
const { createHandler } = await imp("serve.mjs");

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
  return { calls, speak: (lines, outDir, speed, lexicons) => {
    calls.push({ lines, speed, lexicons });
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
  const server = http.createServer(createHandler({ clips: p.clips, token, speak: v.speak, port: () => port }));
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
    assert.match(page.text, /window\.MCLIP=\{"token":"t{48}"\}/);
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

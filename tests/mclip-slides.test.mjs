// mclip's picture steps (a diagram or an overview shown full screen, `- สไลด์:`) and topics added from the live page:
// the lesson format, inserting and removing a picture step (what is keyed by step number moves with it), adding a topic
// to the contents, the page, the live server's writes and the manual. No browser, no voice.
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
const { parseLesson, insertSlideStep, removeSlideStep, addTopic, setLessonFields, load, renderPage, readRequests, addRequest,
  makeVersion, SLIDE_REQUEST, parsePlan } = await imp("clips.mjs");
const { createHandler } = await imp("serve.mjs");
const { buildModel } = await imp("manual.mjs");

const PLAN = "# Shop\n\n- ระบบ: ร้าน\n\n## สารบัญ\n\n1. 01-in — เข้าสู่ระบบ\n   - สอน: เข้าใช้งาน\n2. 02-buy — ซื้อของ\n";
const LESSON = "# เข้าสู่ระบบ\r\n\r\n## เปิด\r\n- บนจอ: เข้าสู่ระบบ\r\n\r\n## 1. เปิดหน้า\r\n- ทำ: open /login\r\n- บนจอ: เปิดหน้า\r\n- พูด: หน้า Login\r\n\r\n## 2. กรอก\r\n- ทำ: fill\r\n- บนจอ: กรอกชื่อ\r\n- พูด: กรอกชื่อ\r\n\r\n## สรุป\r\n- บนจอ: สรุปขั้นตอน\r\n";

function project(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-slides-"));
  for (const [rel, body] of Object.entries({ "clips/plan.md": PLAN, "clips/01-in/lesson.md": LESSON, ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return { root, clips: path.join(root, "clips"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const read = (p, rel) => fs.readFileSync(path.join(p.clips, rel), "utf8");
// a lesson's voice as makeVoice leaves it: voice/NN.mp3 and voice.json
function voiced(p, id, steps) {
  const dir = path.join(p.clips, id, "voice");
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const n of steps) {
    fs.writeFileSync(path.join(dir, `${String(n).padStart(2, "0")}.mp3`), `audio of ${n}`);
    out[n] = { text: `line ${n}`, speed: 0.85, rules: "", engine: 2, voice: "paradee", durationMs: 1000, date: "2026-11-24" };
  }
  fs.writeFileSync(path.join(dir, "voice.json"), JSON.stringify({ voice: "paradee", steps: out }, null, 2));
}

test("a picture step: สไลด์ instead of ทำ, its brief, and the mistakes said", () => {
  const ok = parseLesson("# x\n\n## 1. ภาพรวม\n- สไลด์: slides/picture-1.svg\n- รายละเอียดรูป: diagram ของระบบ\n- บนจอ: ภาพรวม\n- พูด: ระบบมีสามส่วน\n");
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.lesson.steps[0].slide, "slides/picture-1.svg");
  assert.equal(ok.lesson.steps[0].brief, "diagram ของระบบ");
  const bad = parseLesson("# x\n\n## 1. a\n- สไลด์: slides/../x.png\n- บนจอ: a\n\n## 2. b\n- สไลด์: slides/b.png\n- ทำ: click\n- บนจอ: b\n\n## 3. c\n- ทำ: click\n- รายละเอียดรูป: x\n- บนจอ: c\n\n## 4. d\n- บนจอ: d\n").problems.join("\n");
  assert.match(bad, /slides\/<name>\.png, \.jpg or \.svg/);
  assert.match(bad, /step 2 shows a picture \(สไลด์\): it has no '- ทำ:'/);
  assert.match(bad, /step 3 has a '- รายละเอียดรูป:' but no '- สไลด์:'/);
  assert.match(bad, /step 4 has no '- ทำ:' \(or '- สไลด์:' for a picture step\)/);
  assert.match(parseLesson("# x\n\n## 1. a\n- สไลด์: slides/a.png\n- รูป: screen/a.jpg\n- บนจอ: a\n").problems.join(), /its picture is the สไลด์/);
});

test("insert a picture step: the steps after it renumbered with their voice and requests; remove it: all back", () => {
  const p = project();
  try {
    voiced(p, "01-in", [1, 2]);
    addRequest(p.clips, { target: "01-in ขั้น 2", text: "พูดให้สั้นลง" });
    addRequest(p.clips, { target: "01-in ขั้น 1", text: "เปลี่ยนคำ" });
    const r = insertSlideStep(p.clips, "01-in", 1, { title: "ภาพรวม", narration: "ระบบมีสามส่วน", brief: "diagram ระบบ" });
    assert.deepEqual(r, { n: 2, slide: "slides/picture-1.png" });
    const text = read(p, "01-in/lesson.md");
    assert.ok(!/[^\r]\n/.test(text), "the file's CRLF kept");
    const { lesson, problems } = parseLesson(text);
    assert.deepEqual(problems, []);
    assert.deepEqual(lesson.steps.map((s) => [s.n, s.title, s.slide]), [[1, "เปิดหน้า", ""], [2, "ภาพรวม", "slides/picture-1.png"], [3, "กรอก", ""]]);
    assert.equal(lesson.steps[1].caption, "ภาพรวม", "บนจอ defaults to the title");
    assert.equal(lesson.cards.length, 2, "the cards stay where they were");
    assert.ok(text.indexOf("## 3. กรอก") < text.indexOf("## สรุป"));
    const vdir = path.join(p.clips, "01-in", "voice");
    assert.equal(fs.readFileSync(path.join(vdir, "03.mp3"), "utf8"), "audio of 2", "step 2's voice is step 3's now");
    assert.ok(!fs.existsSync(path.join(vdir, "02.mp3")), "the new step has no voice yet");
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(vdir, "voice.json"), "utf8")).steps), ["1", "3"]);
    assert.deepEqual(readRequests(p.clips).map((x) => x.target), ["01-in ขั้น 3", "01-in ขั้น 1"]);
    // a second one takes the next free name
    assert.equal(insertSlideStep(p.clips, "01-in", 0, { caption: "เริ่ม" }).slide, "slides/picture-2.png");
    assert.equal(parseLesson(read(p, "01-in/lesson.md")).lesson.steps[0].title, "เริ่ม", "the title defaults to บนจอ");
    assert.throws(() => insertSlideStep(p.clips, "01-in", 9, { title: "x" }), /after is a step of clips\/01-in \(0 to 4\)/);
    assert.throws(() => insertSlideStep(p.clips, "01-in", 1, { title: "a\nb" }), /one line/);

    assert.throws(() => removeSlideStep(p.clips, "01-in", 2), /does something in the app/);
    assert.deepEqual(removeSlideStep(p.clips, "01-in", 1), { removed: 1, slide: "slides/picture-2.png" });
    addRequest(p.clips, { target: "01-in ขั้น 2", text: SLIDE_REQUEST });
    assert.deepEqual(removeSlideStep(p.clips, "01-in", 2), { removed: 2, slide: "slides/picture-1.png" });
    assert.equal(read(p, "01-in/lesson.md"), LESSON, "the lesson is as it was");
    assert.equal(fs.readFileSync(path.join(vdir, "02.mp3"), "utf8"), "audio of 2");
    assert.deepEqual(readRequests(p.clips).map((x) => x.target), ["01-in ขั้น 2", "01-in ขั้น 1"], "the removed step's request went with it");
  } finally { p.cleanup(); }
});

test("a picture step's words: its brief edits like บนจอ and พูด; a step in the app has none", () => {
  const p = project();
  try {
    insertSlideStep(p.clips, "01-in", 2, { title: "ภาพรวม" });
    setLessonFields(p.clips, "01-in", 3, { brief: "diagram การซื้อ", narration: "จบแล้ว" });
    const s = parseLesson(read(p, "01-in/lesson.md")).lesson.steps[2];
    assert.equal(s.brief, "diagram การซื้อ");
    assert.equal(s.narration, "จบแล้ว");
    assert.match(read(p, "01-in/lesson.md"), /- สไลด์: slides\/picture-1\.png\r\n- รายละเอียดรูป: diagram การซื้อ\r\n- บนจอ: ภาพรวม\r\n- พูด: จบแล้ว/);
    assert.throws(() => setLessonFields(p.clips, "01-in", 1, { brief: "x" }), /not a picture step/);
    assert.throws(() => setLessonFields(p.clips, "01-in", "open", { brief: "x" }), /only a picture step has/);
  } finally { p.cleanup(); }
});

test("add a topic: an overview first (00, its lesson written), a task after a lesson, the list numbered again", () => {
  const p = project();
  try {
    assert.deepEqual(addTopic(p.clips, { kind: "overview", title: "แนะนำระบบ", teaches: "ส่วนหลักของร้าน" }), { id: "00-overview", lesson: true });
    assert.deepEqual(addTopic(p.clips, { kind: "task", title: "คืนของ", slug: "Return-Item", after: "01-in" }), { id: "03-return-item", lesson: false });
    const { plan, problems } = parsePlan(read(p, "plan.md"));
    assert.deepEqual(problems, []);
    assert.deepEqual(plan.toc.map((t) => t.id), ["00-overview", "01-in", "03-return-item", "02-buy"]);
    assert.match(read(p, "plan.md"), /^1\. 00-overview — แนะนำระบบ\n   - สอน: ส่วนหลักของร้าน\n2\. 01-in — เข้าสู่ระบบ\n   - สอน: เข้าใช้งาน\n3\. 03-return-item — คืนของ\n4\. 02-buy/m);
    const data = load(p.clips);
    assert.deepEqual(data.problems, [], "the overview's lesson is a valid one");
    const ov = data.lessons[0];
    assert.equal(ov.status, "draft");
    assert.equal(ov.steps[0].slide, "slides/picture-1.png");
    assert.match(ov.steps[0].brief, /ส่วนหลักของร้าน/);
    assert.equal(data.lessons[2].status, "topic");
    assert.equal(addTopic(p.clips, { kind: "overview", title: "อีก", slug: "more" }).id, "04-more", "00 is taken: the next number, still first");
    assert.equal(parsePlan(read(p, "plan.md")).plan.toc[0].id, "04-more");
    assert.equal(addTopic(p.clips, { kind: "task", title: "ซ้ำ", slug: "more", after: "02-buy" }).id, "05-more", "the same words get a new number");
    assert.equal(parsePlan(read(p, "plan.md")).plan.toc.at(-1).id, "05-more", "after the last lesson: at the end");
    assert.throws(() => addTopic(p.clips, { title: "x", slug: "ไทย" }), /English lower-case words/);
    assert.throws(() => addTopic(p.clips, { title: "" }), /needs a title/);
    assert.throws(() => addTopic(p.clips, { title: "x", slug: "x", after: "09-none" }), /no lesson 09-none/);
    assert.throws(() => addTopic(p.clips, { title: "x", slug: "x", app: "web" }), /not under '## แอป'/);
  } finally { p.cleanup(); }
});

test("add a topic to a plan of several apps: its app is asked for and written", () => {
  const plan = "# Shop\n\n## แอป\n\n### web — เว็บ\n- ชนิด: web\n\n### admin — หลังร้าน\n- ชนิด: web\n\n## สารบัญ\n\n1. 01-in — เข้า\n   - แอป: web\n";
  const p = project({ "clips/plan.md": plan });
  try {
    assert.throws(() => addTopic(p.clips, { title: "แนะนำ", kind: "overview" }), /which app: web, admin/);
    addTopic(p.clips, { title: "แนะนำ", kind: "overview", app: "admin" });
    assert.match(read(p, "plan.md"), /1\. 00-overview — แนะนำ\n   - แอป: admin\n2\. 01-in/);
    assert.deepEqual(parsePlan(read(p, "plan.md")).problems, []);
  } finally { p.cleanup(); }
});

test("the page: a picture step shows its picture or how to get one; the live page inserts, removes and adds", () => {
  const p = project();
  try {
    insertSlideStep(p.clips, "01-in", 1, { title: "ภาพรวม", brief: "diagram ระบบ" });
    let html = renderPage(load(p.clips));
    assert.match(html, /class="step slide-step" id="01-in-2"/);
    assert.match(html, /ยังไม่มีรูป — กด "สร้างรูป"/);
    assert.match(html, new RegExp(`data-target="01-in ขั้น 2" data-text="${SLIDE_REQUEST}"`));
    assert.match(html, /<p class="brief"><span>รูป<\/span>diagram ระบบ<\/p>/);
    assert.doesNotMatch(html, /class="ins"|id="insBox"|id="addTopic"|data-act="remove-step"/, "a page opened as a file changes nothing itself");
    fs.mkdirSync(path.join(p.clips, "01-in", "slides"));
    fs.writeFileSync(path.join(p.clips, "01-in", "slides", "picture-1.png"), "png");
    html = renderPage(load(p.clips), new Date(), { live: { token: "t" } });
    assert.match(html, /<img loading="lazy" src="01-in\/slides\/picture-1\.png"/);
    assert.match(html, />สร้างรูปใหม่</);
    assert.equal((html.match(/class="ins" data-id="01-in"/g) ?? []).length, 4, "after the opening card and after each of the 3 steps");
    assert.match(html, /data-act="remove-step" data-id="01-in" data-step="2"/);
    assert.doesNotMatch(html, /data-act="remove-step" data-id="01-in" data-step="1"/, "a step in the app is not removed from the page");
    assert.match(html, /data-f="brief"/);
    assert.match(html, /id="insBox"[\s\S]*id="topicBox"[\s\S]*<option value="01-in">ต่อจาก 01/);
    assert.match(html, /id="addTopic"/);
  } finally { p.cleanup(); }
});

test("a picture made again after the recording: the lesson needs recording again", () => {
  const p = project();
  try {
    insertSlideStep(p.clips, "01-in", 2, { title: "ภาพรวม" });
    const pic = path.join(p.clips, "01-in", "slides", "picture-1.png");
    fs.mkdirSync(path.dirname(pic));
    fs.writeFileSync(pic, "one");
    for (const f of ["c.mp4", "c.srt", "c.json"]) fs.writeFileSync(path.join(p.root, f), "x");
    makeVersion(p.clips, "01-in", { mp4: path.join(p.root, "c.mp4"), srt: path.join(p.root, "c.srt"), timing: path.join(p.root, "c.json") });
    assert.ok(fs.existsSync(path.join(p.clips, "01-in", "v1", "slides", "picture-1.png")), "the version keeps its pictures");
    assert.equal(load(p.clips).lessons[0].status, "recorded");
    fs.writeFileSync(pic, "two");
    const l = load(p.clips).lessons[0];
    assert.equal(l.status, "changed");
    assert.ok(l.slidesChanged);
    assert.match(renderPage(load(p.clips)), /รูปประกอบเปลี่ยนหลัง v1/);
  } finally { p.cleanup(); }
});

test("the manual: a picture step's PNG is a figure; an SVG needs a PNG of it", () => {
  const p = project();
  try {
    insertSlideStep(p.clips, "01-in", 1, { title: "ภาพรวม" });
    insertSlideStep(p.clips, "01-in", 2, { title: "ขั้นตอน" });
    fs.mkdirSync(path.join(p.clips, "01-in", "slides"));
    fs.writeFileSync(path.join(p.clips, "01-in", "slides", "picture-1.png"), "png");
    fs.writeFileSync(path.join(p.clips, "01-in", "lesson.md"), read(p, "01-in/lesson.md").replace("slides/picture-2.png", "slides/picture-2.svg"));
    fs.writeFileSync(path.join(p.clips, "01-in", "slides", "picture-2.svg"), "<svg/>");
    let m = buildModel(load(p.clips), p.clips);
    assert.deepEqual(m.chapters[0].steps[1].figures.map((f) => f.rel), ["../01-in/slides/picture-1.png"]);
    assert.match(m.missing.join("\n"), /clips\/01-in\/slides\/picture-2\.png \(the manual needs a PNG of slides\/picture-2\.svg\)/);
    fs.writeFileSync(path.join(p.clips, "01-in", "slides", "picture-2.png"), "png");
    m = buildModel(load(p.clips), p.clips);
    assert.deepEqual(m.chapters[0].steps[2].figures.map((f) => f.rel), ["../01-in/slides/picture-2.png"]);
  } finally { p.cleanup(); }
});

test("the live server: insert (and ask for the picture), remove, add a topic; an SVG is served inert", async () => {
  const p = project();
  const token = "t".repeat(48);
  let port = 0;
  const server = http.createServer(createHandler({ clips: p.clips, token, speak: () => [], port: () => port, env: {} }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const call = (method, where, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: where, headers: { Host: `127.0.0.1:${port}`, "Content-Type": "application/json", "X-Mclip-Token": token } }, (res) => {
      const parts = []; res.on("data", (c) => parts.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
  try {
    let r = await call("POST", "/api/step-insert", { id: "01-in", after: 2, title: "ภาพรวม", brief: "diagram", ask: true });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(JSON.parse(r.text), { n: 3, slide: "slides/picture-1.png" });
    assert.deepEqual(readRequests(p.clips).map((x) => [x.target, x.text]), [["01-in ขั้น 3", SLIDE_REQUEST]]);
    r = await call("POST", "/api/narration", { id: "01-in", step: 3, caption: "ภาพรวมระบบ", brief: "diagram ใหม่", text: "" });
    assert.equal(r.status, 200, r.text);
    assert.equal(parseLesson(read(p, "01-in/lesson.md")).lesson.steps[2].brief, "diagram ใหม่");
    r = await call("POST", "/api/step-remove", { id: "01-in", step: 1 });
    assert.equal(r.status, 400);
    assert.match(JSON.parse(r.text).error, /does something in the app/);
    r = await call("POST", "/api/topic", { kind: "overview", title: "แนะนำระบบ", after: "" });
    assert.equal(JSON.parse(r.text).id, "00-overview");
    r = await call("POST", "/api/step-remove", { id: "01-in", step: 3 });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(readRequests(p.clips), []);
    fs.mkdirSync(path.join(p.clips, "01-in", "slides"), { recursive: true });
    fs.writeFileSync(path.join(p.clips, "01-in", "slides", "picture-1.svg"), "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    r = await call("GET", "/01-in/slides/picture-1.svg");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/svg+xml");
    assert.match(r.headers["content-security-policy"], /default-src 'none'.*sandbox/);
  } finally {
    await new Promise((r) => server.close(r));
    p.cleanup();
  }
});

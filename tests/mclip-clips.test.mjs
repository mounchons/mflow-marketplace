// clips.mjs, the clip plan of a project: plan.md with its apps and contents, lessons, topics without a lesson yet,
// the page (left menu grouped by app, the phone switch, nothing from the plan read as HTML), versions and picture
// comparison (with a stand-in for ffmpeg). Throwaway folders only: no browser, no ffmpeg.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = path.join(REPO, "plugins", "mclip", "scripts", "clips.mjs");
const { parsePlan, parseLesson, load, renderPage, makeVersion, compareLesson, platformOf, makeVoice, SHOTS_REQUEST, VOICE_REQUEST } = await import(`file://${CLIPS.replace(/\\/g, "/")}`);

const PLAN = `# Shop — how to use it

- ระบบ: a shop with a back office
- รูปแบบ: caption + voice

## แอป

### web-admin — Back office
- ชนิด: web
- url: http://localhost:5080

### mobile — Shop app
- ชนิด: ios, android
- e2e: mobile/.maestro

## สารบัญ

1. 01-sign-in — Sign in
   - แอป: web-admin
   - ที่มา: e2e/sign-in.spec.ts
2. 02-order — Order from the phone
   - แอป: mobile
   - สอน: place an order
3. 03-approve — Approve an order
   - แอป: mobile, web-admin
`;

const LESSON = `# Sign in

- บทบาท: admin

## 1. Open the page
- ทำ: go to /login
- บนจอ: Open the sign-in page
- รูป: screen/01-open.jpg

## 2. Sign in
- ทำ: type and press Sign in
- บนจอ: Press 'Sign in'
- พูด: กดเข้าสู่ระบบค่ะ
`;

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-clips-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return { root, clips: path.join(root, "clips"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const cli = (...args) => spawnSync(process.execPath, [CLIPS, ...args], { encoding: "utf8" });

test("plan.md: fields, apps with their kinds, and contents entries with their apps", () => {
  const { plan, problems } = parsePlan(PLAN);
  assert.deepEqual(problems, []);
  assert.equal(plan.title, "Shop — how to use it");
  assert.deepEqual(plan.fields.map((f) => f.key), ["ระบบ", "รูปแบบ"]);
  assert.deepEqual(plan.apps.map((a) => [a.key, a.kinds]), [["web-admin", ["web"]], ["mobile", ["ios", "android"]]]);
  assert.equal(plan.apps[0].url, "http://localhost:5080");
  assert.deepEqual(plan.toc.map((t) => [t.id, t.apps]), [["01-sign-in", ["web-admin"]], ["02-order", ["mobile"]], ["03-approve", ["mobile", "web-admin"]]]);
  assert.equal(plan.toc[1].teaches, "place an order");
  assert.equal(plan.toc[0].sources, "e2e/sign-in.spec.ts");
});

test("plan.md problems: an unknown kind or app, a missing app, a bad id, a duplicate", () => {
  const { problems } = parsePlan(`# X

## แอป

### web — Web
- ชนิด: web, desktop

### phone — Phone
- ชนิด: ios

## สารบัญ

1. 01-a — A
   - แอป: tablet
2. 02-b — B
3. 2-c — C
4. 01-a — A again
`);
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `${re} in ${JSON.stringify(problems)}`);
  has(/kind 'desktop'/);
  has(/01-a names app 'tablet'/);
  has(/02-b has no '- แอป:'/);
  has(/lesson id '2-c'/);
  has(/01-a is listed twice/);
});

test("a plan without apps, or with one, needs no '- แอป:' on its entries", () => {
  assert.deepEqual(parsePlan("# X\n\n## สารบัญ\n\n1. 01-a — A\n").problems, []);
  const one = parsePlan("# X\n\n## แอป\n\n### web — Web\n- ชนิด: web\n\n## สารบัญ\n\n1. 01-a — A\n");
  assert.deepEqual(one.problems, []);
  assert.deepEqual(one.plan.toc[0].apps, ["web"]);
});

test("lesson.md: fields and steps; a step needs what is done and the words on screen", () => {
  const { lesson, problems } = parseLesson(LESSON);
  assert.deepEqual(problems, []);
  assert.equal(lesson.steps.length, 2);
  assert.deepEqual(lesson.steps[0].images, ["screen/01-open.jpg"]);
  assert.equal(lesson.steps[1].narration, "กดเข้าสู่ระบบค่ะ");
  const bad = parseLesson("# T\n\n## 1. A\n- ทำ: x\n- รูป: pictures/a.gif\n\n## 3. C\n- บนจอ: y\n").problems;
  assert.ok(bad.some((p) => /step 1 has no '- บนจอ:'/.test(p)));
  assert.ok(bad.some((p) => /screen\/<name>\.jpg/.test(p)));
  assert.ok(bad.some((p) => /step 3 follows step 1/.test(p)));
});

test("a contents entry without lesson.md is a topic, not a problem", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": LESSON });
  try {
    const data = load(p.clips);
    assert.deepEqual(data.problems, []);
    assert.deepEqual(data.lessons.map((l) => l.status), ["draft", "topic", "topic"]);
    assert.deepEqual(data.lessons[2].kinds.sort(), ["android", "ios", "web"]);
    const r = cli("check", "--clips", p.clips);
    assert.equal(r.status, 0, r.stdout);
    assert.deepEqual(JSON.parse(r.stdout).lessons.map((l) => l.apps), [["web-admin"], ["mobile"], ["mobile", "web-admin"]]);
  } finally { p.cleanup(); }
});

test("a lesson folder the contents do not name is a problem, so a mistyped id does not hide it", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-signin/lesson.md": LESSON });
  try {
    const data = load(p.clips);
    assert.equal(data.lessons[0].status, "topic");
    assert.ok(data.problems.some((x) => /clips\/01-signin\/lesson\.md: not in the contents/.test(x)), JSON.stringify(data.problems));
  } finally { p.cleanup(); }
});

test("the page: menu groups by app, positions stay global, phone lessons get the switch and the web-only note", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": LESSON,
    "clips/02-order/lesson.md": "# Order\n\n## 1. Open\n- ทำ: tap Order\n- บนจอ: Tap 'Order'\n- รูป: screen/01-open-ios.jpg\n- รูป: screen/01-open-android.jpg\n" });
  try {
    const html = renderPage(load(p.clips), new Date("2026-11-23T00:00:00Z"));
    const groups = [...html.matchAll(/<div class="group">([^<]*)<\/div>/g)].map((m) => m[1]);
    assert.deepEqual(groups, ["Back office", "Shop app", "Shop app + Back office"]);
    // lesson n is slide n + 2 (cover, scope, contents first), whatever its group
    assert.match(html, /<a class="item lesson" data-go="5"><b>03<\/b>/);
    assert.match(html, /<a class="item lesson" data-go="4"><b>02<\/b>/);
    assert.match(html, /figure class="missing" data-plat="ios"/);
    assert.match(html, /data-plat="android">Android<\/button>/);
    assert.match(html, /mclip รุ่นนี้อัดคลิปได้เฉพาะเว็บ/);
    assert.match(html, /\/mclip:plan lesson 03-approve/);
    assert.equal(platformOf("screen/01-open-ios.jpg"), "ios");
    assert.equal(platformOf("screen/01-open.jpg"), null);
  } finally { p.cleanup(); }
});

test("the page shows the plan's words as text, never as HTML or a replacement pattern", () => {
  const p = project({ "clips/plan.md": "# A <b>bold</b> $& plan\n\n## สารบัญ\n\n1. 01-a — <img src=x onerror=alert(1)>\n" });
  try {
    const html = renderPage(load(p.clips));
    assert.ok(html.includes("A &lt;b&gt;bold&lt;/b&gt; $&amp; plan"));
    assert.ok(!html.includes("<img src=x"));
  } finally { p.cleanup(); }
});

test("page writes index.html and a .gitignore once; exit 1 and a problems slide when the plan has problems", () => {
  const p = project({ "clips/plan.md": "# X\n\n## สารบัญ\n\n1. 01-a — A\n", "clips/01-a/lesson.md": "# A\n\n## 1. S\n- ทำ: x\n" });
  try {
    const r = cli("page", "--clips", p.clips);
    assert.equal(r.status, 1, r.stdout);
    const html = fs.readFileSync(path.join(p.clips, "index.html"), "utf8");
    assert.match(html, /ปัญหาในไฟล์แผน/);
    assert.match(fs.readFileSync(path.join(p.clips, ".gitignore"), "utf8"), /^\*\.mp4$/m);
    assert.equal(cli("page", "--clips", path.join(p.root, "none")).status, 2);
  } finally { p.cleanup(); }
});

test("a version snapshots the lesson; editing the lesson afterwards marks it to record again", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": LESSON, "clips/01-sign-in/screen/01-open.jpg": "jpg",
    "rec/a.mp4": "mp4", "rec/a.srt": "srt", "rec/a.timing.json": "{}" });
  try {
    const rec = (f) => path.join(p.root, "rec", f);
    const v = makeVersion(p.clips, "01-sign-in", { mp4: rec("a.mp4"), srt: rec("a.srt"), timing: rec("a.timing.json"), mode: "caption" });
    assert.equal(v.code, 0);
    assert.equal(v.version, 1);
    for (const f of ["lesson.md", "clip.mp4", "clip.srt", "timing.json", "version.json", "screen/01-open.jpg"]) assert.ok(fs.existsSync(path.join(v.dir, f)), f);
    assert.equal(load(p.clips).lessons[0].status, "recorded");
    fs.appendFileSync(path.join(p.clips, "01-sign-in", "lesson.md"), "- หมายเหตุ: changed\n");
    assert.equal(load(p.clips).lessons[0].status, "changed");
    assert.equal(makeVersion(p.clips, "02-order", { mp4: rec("a.mp4"), srt: rec("a.srt"), timing: rec("a.timing.json") }).code, 2, "a topic has no lesson to snapshot");
    assert.equal(makeVersion(p.clips, "01-sign-in", { mp4: rec("none.mp4"), srt: rec("a.srt"), timing: rec("a.timing.json") }).code, 2);
  } finally { p.cleanup(); }
});

test("compare marks a lesson whose screens changed since its last version", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": LESSON, "clips/01-sign-in/screen/01-open.jpg": "a",
    "rec/a.mp4": "", "rec/a.srt": "", "rec/a.timing.json": "{}" });
  try {
    const rec = (f) => path.join(p.root, "rec", f);
    assert.equal(compareLesson(p.clips, "01-sign-in").code, 2, "nothing to compare before a version");
    makeVersion(p.clips, "01-sign-in", { mp4: rec("a.mp4"), srt: rec("a.srt"), timing: rec("a.timing.json") });
    fs.writeFileSync(path.join(p.clips, "01-sign-in", "screen", "02-new.jpg"), "b");
    const r = compareLesson(p.clips, "01-sign-in", { measure: () => 0.5 });
    assert.deepEqual(r.changed.map((c) => c.image), ["screen/01-open.jpg"]);
    assert.deepEqual(r.added, ["screen/02-new.jpg"]);
    assert.equal(load(p.clips).lessons[0].status, "changed");
    compareLesson(p.clips, "01-sign-in", { measure: () => 0.99 });
    assert.equal(load(p.clips).lessons[0].status, "recorded");
  } finally { p.cleanup(); }
});

test("a version.json cannot set the version number or put HTML in the page", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": LESSON,
    "clips/01-sign-in/v1/version.json": JSON.stringify({ n: "<script>x</script>", date: { a: 1 }, appCommit: "<b>c</b>" }) });
  try {
    const data = load(p.clips);
    const l = data.lessons[0];
    assert.equal(l.versions[0].n, 1);
    assert.equal(l.versions[0].date, undefined);
    const html = renderPage(data);
    assert.ok(!html.includes("<script>x"), "no script from version.json");
    assert.ok(!html.includes("<b>c"), "the commit is escaped");
    assert.match(html, /v1 · &lt;b&gt;c/);
  } finally { p.cleanup(); }
});

// a stand-in for the voice: each line becomes a file holding its words, durations 1 s, 2 s, ...
function stubVoice() {
  const calls = [];
  const speak = (lines, outDir) => {
    calls.push(lines);
    return lines.map((t, i) => { const f = path.join(outDir, `${i}.mp3`); fs.writeFileSync(f, t); return { file: f, durationMs: 1000 * (i + 1) }; });
  };
  return { calls, speak };
}
const VOICED = `# Add a user

## 1. Open
- ทำ: open /users
- บนจอ: Open the users page

## 2. Add
- ทำ: press Add
- บนจอ: Press 'Add'
- พูด: กดปุ่มเพิ่มค่ะ
- รูป: screen/02-add.jpg

## 3. Save
- ทำ: press Save
- บนจอ: Press 'Save'
- พูด: กดบันทึกค่ะ
- รูป: screen/03-save.jpg
`;

test("voice: one step, then the lesson speaks only what changed; the page plays it and marks a voice of old words", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": VOICED });
  const v = stubVoice();
  const voiceDir = path.join(p.clips, "01-sign-in", "voice");
  try {
    let r = makeVoice(p.clips, "01-sign-in", { step: 2, speak: v.speak });
    assert.deepEqual([r.code, r.spoken, r.unchanged], [0, [2], []]);
    assert.equal(fs.readFileSync(path.join(voiceDir, "02.mp3"), "utf8"), "กดปุ่มเพิ่มค่ะ");
    r = makeVoice(p.clips, "01-sign-in", { speak: v.speak });
    assert.deepEqual([r.spoken, r.unchanged, r.seconds], [[3], [2], 2]);
    assert.deepEqual(v.calls, [["กดปุ่มเพิ่มค่ะ"], ["กดบันทึกค่ะ"]], "step 2 is not spoken twice");
    assert.ok(!fs.existsSync(path.join(voiceDir, ".speaking")), "the working folder is gone");

    let l = load(p.clips).lessons[0];
    assert.deepEqual(l.steps.map((s) => s.voice?.file ?? null), [null, "voice/02.mp3", "voice/03.mp3"]);
    let html = renderPage(load(p.clips));
    assert.match(html, /<audio controls preload="none" src="01-sign-in\/voice\/02\.mp3">/);
    assert.match(html, /class="play-all"/);

    fs.writeFileSync(path.join(p.clips, "01-sign-in", "lesson.md"), VOICED.replace("กดปุ่มเพิ่มค่ะ", "กดปุ่มเพิ่มผู้ใช้ค่ะ").replace("- พูด: กดบันทึกค่ะ\n", ""));
    l = load(p.clips).lessons[0];
    assert.equal(l.steps[1].voice.stale, true);
    html = renderPage(load(p.clips));
    assert.match(html, /เสียงของคำพูดเดิม/);
    assert.match(html, /เสียง 1 ขั้นเป็นของคำพูดเดิม/);

    r = makeVoice(p.clips, "01-sign-in", { speak: v.speak });
    assert.deepEqual(r.spoken, [2]);
    assert.ok(!fs.existsSync(path.join(voiceDir, "03.mp3")), "a step that no longer speaks loses its audio");
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(voiceDir, "voice.json"), "utf8")).steps), ["2"]);
    assert.equal(makeVoice(p.clips, "01-sign-in", { force: true, speak: v.speak }).spoken.length, 1);
  } finally { p.cleanup(); }
});

test("voice refuses a topic, a step without words, a bad speed; a failed voice leaves the other audio alone", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": VOICED });
  const v = stubVoice();
  try {
    assert.equal(makeVoice(p.clips, "02-order", { speak: v.speak }).code, 2);
    assert.match(makeVoice(p.clips, "01-sign-in", { step: 1, speak: v.speak }).error, /no '- พูด:'/);
    assert.match(makeVoice(p.clips, "01-sign-in", { step: 9, speak: v.speak }).error, /no step 9/);
    assert.equal(makeVoice(p.clips, "01-sign-in", { speed: 2, speak: v.speak }).code, 2);
    assert.equal(makeVoice(p.clips, "01-sign-in", { step: 2, speak: v.speak }).code, 0);
    const r = makeVoice(p.clips, "01-sign-in", { step: 3, speak: () => { throw new Error("no python"); } });
    assert.deepEqual([r.code, r.error], [2, "no python"]);
    assert.ok(fs.existsSync(path.join(p.clips, "01-sign-in", "voice", "02.mp3")));
    const cliR = cli("voice", "01-sign-in", "--step", "3", "--tts", path.join(p.root, "no-tts"), "--clips", p.clips);
    assert.equal(cliR.status, 2);
    assert.match(JSON.parse(cliR.stdout).error, /no voice at/);
    assert.equal(cli("voice", "01-sign-in", "--step", "x", "--clips", p.clips).status, 2);
  } finally { p.cleanup(); }
});

test("pictures the recorder took are told from the user's own; a stopped run shows; buttons only where they work", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": VOICED,
    "clips/01-sign-in/screen/02-add.jpg": "jpg", "clips/01-sign-in/screen/03-save.jpg": "jpg",
    "clips/01-sign-in/shots.json": JSON.stringify({ pictures: { "screen/02-add.jpg": { date: "2026-11-23T03:00:00Z", scenarioStep: 2 } }, failed: { step: 4, message: "<b>no target</b>" } }),
    "clips/02-order/lesson.md": "# Order\n\n## 1. Open\n- ทำ: tap Order\n- บนจอ: Tap 'Order'\n- พูด: แตะสั่งซื้อค่ะ\n- รูป: screen/01-open-ios.jpg\n" });
  try {
    const data = load(p.clips);
    const s = data.lessons[0].steps;
    assert.equal(s[1].made["screen/02-add.jpg"].date, "2026-11-23T03:00:00Z");
    assert.equal(s[2].made["screen/03-save.jpg"], null);
    const html = renderPage(data);
    const [web, phone] = html.split('<section class="slide lesson"').slice(1);
    assert.match(web, /AI ถ่าย 2026-11-23<\/i> screen\/02-add\.jpg/);
    assert.match(web, /รูปที่ใส่เอง<\/i> screen\/03-save\.jpg/);
    assert.match(web, /หยุดที่ขั้น 4 ของ scenario\.yaml — &lt;b&gt;no target/);
    assert.ok(web.includes(`data-target="01-sign-in ขั้น 2" data-text="${SHOTS_REQUEST}"`));
    assert.ok(web.includes(`data-target="01-sign-in" data-text="${SHOTS_REQUEST}"`));
    assert.ok(!web.includes(`data-target="01-sign-in ขั้น 1" data-text="${VOICE_REQUEST}"`), "a step with no words gets no voice button");
    assert.ok(!phone.includes(SHOTS_REQUEST), "a phone lesson's pictures are the user's");
    assert.ok(phone.includes(VOICE_REQUEST));
  } finally { p.cleanup(); }
});

test("check counts each lesson's pictures there and steps with a current voice, for /mclip:help", () => {
  const p = project({ "clips/plan.md": PLAN, "clips/01-sign-in/lesson.md": VOICED, "clips/01-sign-in/screen/02-add.jpg": "jpg" });
  try {
    makeVoice(p.clips, "01-sign-in", { step: 3, speak: stubVoice().speak });
    const r = cli("check", "--clips", p.clips);
    const l = JSON.parse(r.stdout).lessons.find((x) => x.id === "01-sign-in");
    assert.deepEqual([l.pictures, l.picturesThere, l.spoken, l.voiced], [2, 1, 2, 1]);
    const topic = JSON.parse(r.stdout).lessons.find((x) => x.id === "02-order");
    assert.deepEqual([topic.pictures, topic.spoken], [0, 0]);
  } finally { p.cleanup(); }
});

test("page adds the lines missing from an existing clips/.gitignore, once", () => {
  const p = project({ "clips/plan.md": "# X\n\n## สารบัญ\n\n1. 01-a — A\n", "clips/.gitignore": "index.html\n*.mp4" });
  try {
    cli("page", "--clips", p.clips);
    cli("page", "--clips", p.clips);
    assert.equal(fs.readFileSync(path.join(p.clips, ".gitignore"), "utf8"), "index.html\n*.mp4\nvoice/\nmanual/*.docx\nmanual/*.pdf\nmanual/.work/\n");
  } finally { p.cleanup(); }
});

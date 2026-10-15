// mreq discussion docs: the registry lives in mreq/discuss/, the agenda starts with the four foundation
// topics, `readyToApprove` gates approve, and `cited` finds what an approve already wrote.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mreq-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const ok = (r) => {
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

const FRONT = "---\nid: 01\nslug: tech-stack\ntitle: Tech stack\nstatus: draft\nrevision: 1\n---\n";
const body = (decisions) => `
# 01 Tech stack

## 1. เรื่องที่ต้องการยืนยัน

ระบบมีแอปอะไรบ้าง

## 2. สิ่งที่ Claude เข้าใจตอนนี้

- มีเว็บหลังบ้านหนึ่งตัว [ที่มา: tor.md §2]

## 3. แบบที่เสนอ

ตารางแอป [เสนอ]

## 4. ข้อที่ต้องตัดสินใจ

${decisions}

## 5. สิ่งที่จะดูตอนทดสอบใช้งาน

ไม่มี

## 6. ไม่รวมในเรื่องนี้

ไม่มี

## 7. เมื่ออนุมัติจะนำไปใส่ที่ไหน

- AGENTS.md ## Stack
`;
const D1 = (answer) => `### D1: เว็บหน้าบ้านใช้เฟรมเวิร์กอะไร
- a) React + Vite: นักพัฒนาหาง่าย / ต้องมี API
- b) MVC + Razor: เรียบง่าย / โต้ตอบน้อย
- **Claude แนะนำ:** a
- **เลือก:**${answer}
`;

test("agenda init creates the four foundation topics, not started", () => {
  p = project();
  const r = ok(run(p, "discuss.mjs", ["agenda", "init"]));
  assert.equal(r.created, true);
  assert.equal(r.file, "mreq/discuss/AGENDA.md");
  assert.deepEqual(r.topics.map((t) => t.slug), ["tech-stack", "code-structure", "nfr", "security-privacy"]);
  assert.ok(r.topics.every((t) => t.status === "ยังไม่เริ่ม"));
  assert.deepEqual(r.warnings, []);
});

test("new creates the next doc from the template and marks it on the agenda", () => {
  p = project();
  ok(run(p, "discuss.mjs", ["agenda", "init"]));
  const r = ok(run(p, "discuss.mjs", ["new", "tech-stack", "--title", "Tech stack"]));
  assert.equal(r.created, "mreq/discuss/01-tech-stack.md");
  assert.equal(r.onAgenda, true);
  assert.match(p.read("mreq/discuss/01-tech-stack.md"), /\/mreq:discuss 01 approve/);
  assert.match(p.read("mreq/discuss/AGENDA.md"), /\| กำลังคุย `01` \|/);
  // a second draft on the same topic is refused
  const again = run(p, "discuss.mjs", ["new", "tech-stack"]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /still a draft/);
});

test("a fresh doc from the template is not ready: its placeholders are reported", () => {
  p = project();
  ok(run(p, "discuss.mjs", ["new", "nfr"]));
  const doc = ok(run(p, "discuss.mjs", ["check", "01"]));
  assert.ok(doc.placeholderLines.length > 0);
  assert.equal(doc.readyToApprove, false);
});

test("a complete doc with every decision answered is ready; an empty answer keeps it open", () => {
  p = project();
  p.write("mreq/discuss/01-tech-stack.md", FRONT + body(D1(" a")));
  assert.equal(ok(run(p, "discuss.mjs", ["check", "01"])).readyToApprove, true);
  p.write("mreq/discuss/01-tech-stack.md", FRONT + body(D1("")));
  const open = ok(run(p, "discuss.mjs", ["check", "01"]));
  assert.equal(open.openDecisions.length, 1);
  assert.equal(open.readyToApprove, false);
});

test("an answer letter that is not an option, or a pending note, blocks approval", () => {
  p = project();
  p.write("mreq/discuss/01-tech-stack.md", FRONT + body(D1(" c")));
  assert.match(ok(run(p, "discuss.mjs", ["check", "01"])).decisionProblems[0], /not one of its options/);
  p.write("mreq/discuss/01-tech-stack.md", FRONT + body(D1(" a")) + "\n> ความเห็น: ขอดู API ด้วย\n");
  const doc = ok(run(p, "discuss.mjs", ["check", "01"]));
  assert.equal(doc.pendingNotes.length, 1);
  assert.equal(doc.readyToApprove, false);
});

test("cited finds what an approve wrote outside the discussion folder", () => {
  p = project();
  p.write("mreq/discuss/01-tech-stack.md", FRONT.replace("draft", "approved") + body(D1(" a")));
  p.write("AGENTS.md", "## Stack\n| Web.Backend | React | (mreq/discuss/01-tech-stack.md) |\n");
  p.write("mreq/discuss/AGENDA.md", "mentions mreq/discuss/01-tech-stack.md but is skipped\n");
  const r = ok(run(p, "discuss.mjs", ["cited", "01"]));
  assert.deepEqual(r.cited.map((c) => c.file), ["AGENTS.md"]);
});

test("the agenda status follows the newest doc of its slug", () => {
  p = project();
  ok(run(p, "discuss.mjs", ["agenda", "init"]));
  p.write("mreq/discuss/01-tech-stack.md", FRONT.replace("draft", "approved") + body(D1(" a")));
  const r = ok(run(p, "discuss.mjs", ["agenda"]));
  assert.equal(r.topics[0].status, "อนุมัติแล้ว `01`");
  assert.ok(r.written >= 1);
});

test("outside an mreq project the script refuses", () => {
  p = project({ marker: false });
  const r = run(p, "discuss.mjs", ["list"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/mreq:init/);
});

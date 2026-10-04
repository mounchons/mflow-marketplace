// Discussion readiness: `readyToApprove` gates /mflow:discuss approve, so it must not pass a doc that is
// missing its content or an answer, and examples inside code fences must not count as answers.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const FRONT = "---\nid: 01\nslug: access-control\ntitle: สิทธิ์การใช้งาน\nstatus: draft\nrevision: 1\n---\n";
const body = (decisions) => `
# 01 สิทธิ์การใช้งาน

## 1. เรื่องที่ต้องการยืนยัน

ใครเห็นข้อมูลของสาขาไหน

## 2. สิ่งที่ Claude เข้าใจตอนนี้

- หัวหน้าสาขาเห็นเฉพาะสาขาตัวเอง [ที่มา: tor.md §3]

## 3. แบบที่เสนอ

ตารางบทบาท [เสนอ]

## 4. ข้อที่ต้องตัดสินใจ

${decisions}

## 5. สิ่งที่จะดูตอนทดสอบใช้งาน

ไม่มี

## 6. ไม่รวมในเรื่องนี้

ไม่มี

## 7. เมื่ออนุมัติจะนำไปใส่ที่ไหน

- roles.json
`;
const D1 = (answer) => `### D1: ผู้จัดการเขตเห็นกี่สาขา
- a) ทุกสาขาในเขต: เห็นภาพรวม / ข้อมูลเยอะ
- b) เฉพาะสาขาที่ดูแล: ตรงงาน / ต้องตั้งค่าเพิ่ม
- **Claude แนะนำ:** a
${answer === undefined ? "" : `- **เลือก:**${answer}`}
`;
const check = (text, file = "docs/discuss/01-access-control.md") => {
  p.write(file, text);
  const r = run(p, "discuss.mjs", ["check", "01"]);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

test("a complete doc with every decision answered is ready", () => {
  p = project();
  const doc = check(FRONT + body(D1(" a")));
  assert.deepEqual(doc.openDecisions, []);
  assert.equal(doc.answeredDecisions, 1);
  assert.equal(doc.readyToApprove, true);
});

test("a complete doc whose section 4 says ไม่มี is ready", () => {
  p = project();
  assert.equal(check(FRONT + body("ไม่มี")).readyToApprove, true);
});

test("an empty answer line keeps the decision open", () => {
  p = project();
  const doc = check(FRONT + body(D1("")));
  assert.equal(doc.openDecisions.length, 1);
  assert.equal(doc.readyToApprove, false);
});

test("a doc with only frontmatter is not ready (T01)", { todo: "F02" }, () => {
  p = project();
  assert.equal(check(FRONT).readyToApprove, false);
});

test("a decision with no answer line is open (T02)", { todo: "F02" }, () => {
  p = project();
  const doc = check(FRONT + body(D1(undefined)));
  assert.equal(doc.openDecisions.length, 1);
  assert.equal(doc.readyToApprove, false);
});

test("markers inside a nested code fence are examples, not answers (T08)", { todo: "F02" }, () => {
  p = project();
  const example = "````markdown\n```\n### D9: ตัวอย่าง\n- **เลือก:**\n```\n````\n";
  const doc = check(FRONT + body(D1(" a") + "\n" + example));
  assert.deepEqual(doc.openDecisions, []);
  assert.equal(doc.readyToApprove, true);
});

test("a CRLF doc reads the same as an LF one", () => {
  p = project();
  const doc = check((FRONT + body(D1(""))).replace(/\n/g, "\r\n"));
  assert.equal(doc.openDecisions.length, 1);
  assert.equal(doc.status, "draft");
});

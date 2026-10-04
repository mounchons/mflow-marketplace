// Discussion readiness: `readyToApprove` gates /mflow:discuss approve, so it must not pass a doc that is
// missing its content or an answer, and examples inside code fences must not count as answers.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

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

test("a doc with only frontmatter is not ready (T01)", () => {
  p = project();
  assert.equal(check(FRONT).readyToApprove, false);
});

test("a decision with no answer line is open (T02)", () => {
  p = project();
  const doc = check(FRONT + body(D1(undefined)));
  assert.equal(doc.openDecisions.length, 1);
  assert.equal(doc.readyToApprove, false);
});

test("markers inside a nested code fence are examples, not answers (T08)", () => {
  p = project();
  const example = "````markdown\n```\n### D9: ตัวอย่าง\n- **เลือก:**\n```\n````\n";
  const doc = check(FRONT + body(D1(" a") + "\n" + example));
  assert.deepEqual(doc.openDecisions, []);
  assert.equal(doc.readyToApprove, true);
});

test("a missing or empty section is named, and the doc is not ready", () => {
  p = project();
  const doc = check(FRONT + body(D1(" a")).replace("## 6. ไม่รวมในเรื่องนี้\n\nไม่มี\n", "").replace("ใครเห็นข้อมูลของสาขาไหน", ""));
  assert.deepEqual(doc.missingSections, [6]);
  assert.deepEqual(doc.emptySections, [1]);
  assert.equal(doc.readyToApprove, false);
});

test("a section holding only a picture is not empty", () => {
  p = project();
  const doc = check(FRONT + body(D1(" a")).replace("ตารางบทบาท [เสนอ]", "```mermaid\nflowchart TD\n  A --> B\n```"));
  assert.deepEqual(doc.emptySections, []);
  assert.equal(doc.readyToApprove, true);
});

test("missing title, status or revision is named", () => {
  p = project();
  const doc = check("---\nid: 01\nslug: access-control\n---\n" + body(D1(" a")));
  assert.deepEqual(doc.missingMetadata, ["title", "status", "revision"]);
  assert.equal(doc.readyToApprove, false);
});

test("two answer lines, a reused D number and an unlisted option letter are problems", () => {
  p = project();
  const two = D1(" a") + "- **เลือก:** b\n";
  const reused = D1(" b").replace("ผู้จัดการเขตเห็นกี่สาขา", "อีกเรื่อง");
  const unlisted = D1(" e").replace("D1", "D2");
  const doc = check(FRONT + body(two + reused + unlisted));
  assert.equal(doc.decisionProblems.length, 3, JSON.stringify(doc.decisionProblems));
  assert.match(doc.decisionProblems.join("\n"), /more than one answer line/);
  assert.match(doc.decisionProblems.join("\n"), /D1 is used for two decisions/);
  assert.match(doc.decisionProblems.join("\n"), /answer e\) is not one of its options a\) b\)/);
  assert.equal(doc.readyToApprove, false);
});

test("a free-text answer is not read as an option letter", () => {
  p = project();
  const doc = check(FRONT + body(D1(" ทุกสาขา แต่ไม่เห็นต้นทุน")));
  assert.deepEqual(doc.decisionProblems, []);
  assert.equal(doc.readyToApprove, true);
});

test("a tilde fence closes only on tildes", () => {
  p = project();
  const example = "~~~text\n```\n### D9: ตัวอย่าง\n- **เลือก:**\n~~~\n";
  const doc = check(FRONT + body(D1(" a") + "\n" + example));
  assert.deepEqual(doc.openDecisions, []);
  assert.equal(doc.unclosedFenceLine, null);
});

/** A doc and the places an approve of it may have written, plus places that must not count. */
function approvedPartway() {
  p = project();
  p.write("docs/discuss/01-access-control.md", FRONT + body(D1(" a")));
  p.write("AGENTS.md", "# Agents\n\n- Data scope is enforced in the query (docs/discuss/01-access-control.md)\n");
  p.write("backlog/tasks/task-7 - ทดสอบใช้งาน.md", "---\nid: task-7\nreferences:\n  - docs/discuss/01-access-control.md\n---\n");
  p.write("docs/vision.md", "# Vision\n\nNothing from the doc yet.\n");
  p.write("docs/discuss/02-menus.md", "See docs/discuss/01-access-control.md\n");
  p.write("docs/ai-inbox/2026-10-04-codex-discuss-01-r1.md", "About docs/discuss/01-access-control.md\n");
}
const citing = () => {
  const r = run(p, "discuss.mjs", ["cited", "01"]);
  assert.equal(r.status, 0, r.stderr);
  return r.json.cited.map((c) => `${c.file}:${c.line}`).sort();
};

test("cited lists what an approve already wrote, and not the discussion folder or the inbox", () => {
  approvedPartway();
  assert.deepEqual(citing(), ["AGENTS.md:3", "backlog/tasks/task-7 - ทดสอบใช้งาน.md:4"]);
});

test("cited reads git's file list when there is one, leaving ignored files out", { skip: !hasGit && "git not installed" }, () => {
  approvedPartway();
  p.write(".gitignore", "scratch/\n");
  p.write("scratch/notes.md", "docs/discuss/01-access-control.md\n");
  git(p, "init", "-q");
  assert.deepEqual(citing(), ["AGENTS.md:3", "backlog/tasks/task-7 - ทดสอบใช้งาน.md:4"]);
});

test("a CRLF doc reads the same as an LF one", () => {
  p = project();
  const doc = check((FRONT + body(D1(""))).replace(/\n/g, "\r\n"));
  assert.equal(doc.openDecisions.length, 1);
  assert.equal(doc.status, "draft");
});

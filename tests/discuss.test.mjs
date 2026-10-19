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
const check = (text, file = "docs/decisions/discuss/01-access-control.md") => {
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

test("a ถ้าผิด line is neither an answer nor an option, and an answer taken from the recommendation reads as its letter", () => {
  p = project();
  const costed = (answer) => D1(answer).replace("- **Claude แนะนำ:**", "- **ถ้าผิด:** แก้ยาก — ขอบเขตข้อมูลของทุกหน้าจอ\n- **Claude แนะนำ:**");
  const doc = check(FRONT + body(costed(" a (ตามคำแนะนำ)") + costed(" a + b (ตามคำแนะนำ)").replace("D1", "D2")));
  assert.deepEqual(doc.openDecisions, []);
  assert.deepEqual(doc.decisionProblems, []);
  assert.equal(doc.readyToApprove, true);
  assert.equal(check(FRONT + body(costed(""))).openDecisions.length, 1);
});

test("a new doc's ถ้าผิด line stays a placeholder until it is filled", () => {
  p = project();
  const r = run(p, "discuss.mjs", ["new", "access-control", "--title", "สิทธิ์การใช้งาน"]);
  assert.equal(r.status, 0, r.stderr);
  const lines = p.read("docs/decisions/discuss/01-access-control.md").split(/\r?\n/);
  const costLine = lines.findIndex((l) => l.startsWith("- **ถ้าผิด:**")) + 1;
  assert.ok(costLine > 0, "the template has a ถ้าผิด line");
  assert.ok(run(p, "discuss.mjs", ["check", "01"]).json.placeholderLines.includes(costLine));
});

test("an open decision without a ถ้าผิด line is a warning that never blocks approval; an answered one is left alone", () => {
  p = project();
  const costed = D1("").replace("- **Claude แนะนำ:**", "- **ถ้าผิด:** แก้ทีหลังได้ — เปลี่ยนตัวกรองใน change ถัดไป\n- **Claude แนะนำ:**");
  const doc = check(FRONT + body(D1("") + costed.replace("D1", "D2") + D1(" b").replace("D1", "D3")));
  assert.deepEqual(doc.costMissing, ["D1: ผู้จัดการเขตเห็นกี่สาขา"]);
  assert.deepEqual(check(FRONT + body(D1(" a"))).costMissing, []);
  assert.equal(check(FRONT + body(D1(" a"))).readyToApprove, true);
});

test("a doc past ~200 lines of prose gets a lengthWarning; fences, table rows and frontmatter do not count", () => {
  p = project();
  const fence = "```text\n" + "wireframe line\n".repeat(300) + "```\n";
  const table = "| a | b |\n|---|---|\n" + "| x | y |\n".repeat(300);
  const short = check(FRONT + body(D1(" a")) + fence + table);
  assert.equal(short.lengthWarning, null);
  assert.ok(short.proseLines < 40, String(short.proseLines));
  const long = check(FRONT + body(D1(" a")) + "- ข้อความ\n".repeat(200));
  assert.match(long.lengthWarning, /lines of prose, past the ~200/);
  assert.equal(long.readyToApprove, true, "a warning only");
});

/** A Backlog task as the backlog CLI writes it, with its acceptance criteria. */
const task = (id, title, status, refs, ac) => `---
id: ${id}
title: '${title}'
status: ${status}
labels:
  - prototype
references:
${refs.map((r) => `  - ${r}`).join("\n")}
---

## Acceptance Criteria
<!-- AC:BEGIN -->
${ac.join("\n")}
<!-- AC:END -->
`;

test("checks lists the open ทดสอบใช้งาน tasks with their unticked criteria, for a doc or for the docs a change cites", () => {
  p = project();
  const doc = (n) => `docs/decisions/discuss/${n}.md`;
  p.write("backlog/tasks/task-7 - a.md", task("TASK-7", "ทดสอบใช้งาน: สิทธิ์", "To Do", [doc("01-access-control")], ["- [x] #1 เห็นสาขาตัวเอง", "- [ ] #2 ไม่เห็นต้นทุน"]));
  p.write("backlog/tasks/task-8 - b.md", task("TASK-8", "ทดสอบใช้งาน: เลขเอกสาร", "Done", [doc("02-numbering")], ["- [x] #1 รันเลข"]));
  p.write("backlog/tasks/task-9 - c.md", task("TASK-9", "สร้างหน้ารายการ", "To Do", [doc("01-access-control")], ["- [ ] #1 แสดงรายการ"]));
  p.write("backlog/tasks/task-10 - d.md", task("TASK-10", "ทดสอบใช้งาน: แจ้งเตือน", "In Progress", [doc("03-notifications")], ["- [ ] #1 ส่งอีเมล"]));
  p.write("openspec/changes/archive/2026-10-01-branch-scope/proposal.md", `Follows ${doc("01-access-control")}.\n`);
  const checks = (...args) => {
    const r = run(p, "discuss.mjs", ["checks", ...args]);
    assert.equal(r.status, 0, r.stderr);
    return r.json;
  };
  assert.deepEqual(checks().open.map((t) => t.task), ["TASK-10", "TASK-7"], "not Done, titled ทดสอบใช้งาน, citing a doc");
  const scoped = checks("--change", "branch-scope");
  assert.deepEqual(scoped.docs, [doc("01-access-control")]);
  assert.deepEqual(scoped.open.map((t) => [t.task, t.ticked, t.unticked]), [["TASK-7", 1, ["#2 ไม่เห็นต้นทุน"]]]);
  assert.deepEqual(checks("3").open.map((t) => t.task), ["TASK-10"]);
  assert.notEqual(run(p, "discuss.mjs", ["checks", "--change", "nothing-here"]).status, 0);
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
  p.write("docs/decisions/discuss/01-access-control.md", FRONT + body(D1(" a")));
  p.write("AGENTS.md", "# Agents\n\n- Data scope is enforced in the query (docs/decisions/discuss/01-access-control.md)\n");
  p.write("backlog/tasks/task-7 - ทดสอบใช้งาน.md", "---\nid: task-7\nreferences:\n  - docs/decisions/discuss/01-access-control.md\n---\n");
  p.write("docs/vision.md", "# Vision\n\nNothing from the doc yet.\n");
  p.write("docs/decisions/discuss/02-menus.md", "See docs/decisions/discuss/01-access-control.md\n");
  p.write("docs/ai/inbox/2026-10-04-codex-discuss-01-r1.md", "About docs/decisions/discuss/01-access-control.md\n");
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
  p.write("scratch/notes.md", "docs/decisions/discuss/01-access-control.md\n");
  git(p, "init", "-q");
  assert.deepEqual(citing(), ["AGENTS.md:3", "backlog/tasks/task-7 - ทดสอบใช้งาน.md:4"]);
});

test("a CRLF doc reads the same as an LF one", () => {
  p = project();
  const doc = check((FRONT + body(D1(""))).replace(/\n/g, "\r\n"));
  assert.equal(doc.openDecisions.length, 1);
  assert.equal(doc.status, "draft");
});

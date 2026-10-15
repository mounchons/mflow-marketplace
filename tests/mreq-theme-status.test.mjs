// The UI kit's Status and Revision lines change only through theme-status.mjs: init never overwrites,
// approve dates the status, and bump adds a revision with its reason while the status stays.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { project, run } from "./mreq-helpers.mjs";

let p;
afterEach(() => p?.cleanup());

const ok = (r) => {
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};
const ts = (...args) => run(p, "theme-status.mjs", [...args, "--date", "2026-10-13"]);
const README = "mreq/ui/theme/README.md";

test("before init the kit does not exist and every kit file is missing", () => {
  p = project();
  const s = ok(ts("status"));
  assert.equal(s.exists, false);
  assert.ok(s.missing.includes("mreq/ui/theme/index.html"));
  assert.ok(s.missing.includes("mreq/ui/data/users.json"));
  assert.ok(s.missing.includes(".claude/rules/ui.md"));
});

test("init creates a draft at revision 1 and never overwrites", () => {
  p = project();
  const s = ok(ts("init"));
  assert.equal(s.created, true);
  assert.equal(s.status, "draft");
  assert.equal(s.revision, 1);
  assert.deepEqual(s.problems, []);
  assert.match(p.read(README), /- rev 1 \(2026-10-13\): ร่างแรก/);
  p.write(README, p.read(README) + "\nของโปรเจกต์\n");
  assert.equal(ok(ts("init")).created, false);
  assert.match(p.read(README), /ของโปรเจกต์/);
});

test("approve dates the status and logs it; bump adds a revision and keeps approved", () => {
  p = project();
  ok(ts("init"));
  const a = ok(ts("approve"));
  assert.equal(a.status, "approved");
  assert.equal(a.approvedOn, "2026-10-13");
  const b = ok(run(p, "theme-status.mjs", ["bump", "--note", "เพิ่ม shell หน้าบ้าน   ตาม tech-stack", "--date", "2026-10-20"]));
  assert.equal(b.revision, 2);
  assert.equal(b.status, "approved");
  assert.equal(b.approvedOn, "2026-10-13");
  const text = p.read(README);
  assert.match(text, /^Status: approved 2026-10-13$/m);
  assert.match(text, /^Revision: 2$/m);
  const log = text.slice(text.indexOf("## บันทึกการแก้ไข"));
  assert.deepEqual(log.split(/\r?\n/).filter((l) => l.startsWith("- rev")), [
    "- rev 1 (2026-10-13): ร่างแรก",
    "- rev 1 (2026-10-13): อนุมัติแล้ว",
    "- rev 2 (2026-10-20): เพิ่ม shell หน้าบ้าน ตาม tech-stack",
  ]);
});

test("bump without a note is refused", () => {
  p = project();
  ok(ts("init"));
  const r = ts("bump");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--note/);
});

test("Windows line endings survive an edit", () => {
  p = project();
  ok(ts("init"));
  p.write(README, p.read(README).replace(/\r?\n/g, "\r\n"));
  ok(ts("approve"));
  const text = p.read(README);
  assert.match(text, /^Status: approved 2026-10-13\r$/m);
  assert.equal(text.split("\r\n").length, text.split("\n").length);
});

test("contracts copies the references a builder needs, with links to the others made plain", () => {
  p = project();
  const first = ok(run(p, "theme-status.mjs", ["contracts"]));
  assert.deepEqual(first.changed, [
    "mreq/ui/contracts/component-contracts.md", "mreq/ui/contracts/responsive.md", "mreq/ui/contracts/access-data.md",
  ]);
  const text = p.read("mreq/ui/contracts/component-contracts.md");
  assert.match(text, /^<!-- Copied by \/mreq:theme from the mreq plugin \d+\.\d+\.\d+/);
  assert.match(text, /\]\(access-data\.md\)/, "a link to a copied file stays a link");
  assert.doesNotMatch(text, /\]\(visual-direction\.md\)/, "a link to a file not copied becomes a plain name");
  assert.deepEqual(ok(run(p, "theme-status.mjs", ["contracts"])).changed, []);
  assert.ok(!ok(ts("status")).missing.some((f) => f.startsWith("mreq/ui/contracts/")));
});

test("a README without its Status line is reported and left alone", () => {
  p = project();
  ok(ts("init"));
  p.write(README, p.read(README).replace(/^Status:.*$/m, ""));
  assert.match(ok(ts("status")).problems[0], /Status/);
  const before = p.read(README);
  assert.equal(ts("approve").status, 1);
  assert.equal(p.read(README), before);
});

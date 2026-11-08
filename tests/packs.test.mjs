// Packs: the team's settled answers that /mflow:discuss applies (packs.mjs). The shipped packs must pass
// their own check (format, requires, nothing of one customer), and a project's selection must resolve
// what each pack requires and where approved packs are written.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { LINES } from "../plugins/mflow/scripts/openspec-config.mjs";
import { project, run, SCRIPTS } from "./helpers.mjs";

let p;
let tmp;
afterEach(() => {
  p?.cleanup();
  p = undefined;
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

const SHIPPED = path.join(SCRIPTS, "..", "packs");

/** A minimal pack that passes check, with parts replaced through `over`. */
function writePack(dir, name, over = {}) {
  const prefix = over.prefix || name.toUpperCase().replace(/-/g, "");
  const files = {
    "pack.md": `---\nname: ${name}\nversion: 1\ntitle: แพ็กทดสอบ ${name}\nprefix: ${prefix}\nrequires: [${(over.requires || []).join(", ")}]\ntopics: [${(over.topics || [`${name}-topic`]).join(", ")}]\norigin: test\n---\n\n## ครอบคลุม\n\nเรื่องทดสอบ\n\n## คำของโปรเจกต์\n\n- \`{portal}\` พอร์ทัล\n`,
    "decisions.md": over.decisions ?? `### ${prefix}-D01: คำถามทดสอบ\n- **คำตอบ:** ก\n- **เหตุผล:** ข\n- **ถ้าผิด:** แก้ทีหลังได้ — แก้ใน change ถัดไป\n- **ถามเมื่อ:** ไม่ถาม\n`,
    "params.md": `| ค่า | key | เริ่มต้น | ช่วง | หมายเหตุ |\n|---|---|---|---|---|\n| ครั้ง | ${name}.tries | 5 | 1–10 | |\n`,
    "requirements.md": over.requirements ?? `### Requirement: Try\nThe {portal} SHALL allow {${name}.tries} tries (${prefix}-D01).\n\n#### Scenario: Fifth try\n- **WHEN** a user tries\n- **THEN** it works\n`,
    "data.md": `## thing\n\n| Column | Type | Rule |\n|---|---|---|\n| id | uuid | key |\n`,
    "screens.md": "| หน้าจอ | ใช้ทำอะไร |\n|---|---|\n| ทดสอบ | ทดสอบ |\n",
    "checks.md": "1. ลองทดสอบ\n",
  };
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name, f), text);
}

function packsDir() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mflow-packs-"));
  return tmp;
}

const check = (dir, ...names) => {
  p ??= project();
  return run(p, "packs.mjs", ["check", ...names, "--dir", dir]);
};

test("every shipped pack passes its check", () => {
  p = project();
  const r = run(p, "packs.mjs", ["check"]);
  assert.equal(r.status, 0, JSON.stringify(r.json?.problems?.slice(0, 10), null, 2) || r.stderr);
  assert.ok(r.json.checked.length >= 5, `packs checked: ${r.json.checked.join(", ")}`);
});

test("the shipped packs are the core thirteen, each topic served by one pack", () => {
  p = project();
  const r = run(p, "packs.mjs", ["list"]);
  assert.equal(r.status, 0, r.stderr);
  const byName = Object.fromEntries(r.json.packs.map((x) => [x.name, x]));
  for (const n of ["audit", "auth", "users", "permission", "mail", "settings", "api", "upload", "shell", "foundation", "jobs", "import-export", "integration"]) assert.ok(byName[n], `${n} missing`);
  assert.deepEqual(byName.foundation.topics, ["tech-stack", "code-structure"]);
  assert.deepEqual(byName.auth.topics, ["sign-in"]);
  assert.deepEqual(byName.permission.topics, ["access-control"]);
  assert.deepEqual(byName.settings.topics, ["system-settings"]);
  assert.ok(byName.auth.requires.includes("settings"), "auth values live on the settings page");
  assert.ok(byName.mail.requires.includes("settings"), "SMTP values live on the settings page");
  assert.ok(fs.existsSync(path.join(SHIPPED, "README.md")));
});

test("a stack that matches the template is confirmed topic by topic before anything starts", () => {
  const decisions = fs.readFileSync(path.join(SHIPPED, "foundation", "decisions.md"), "utf8");
  assert.ok((decisions.match(/^## \S/gm) || []).length >= 4, "foundation decisions are grouped by topic");
  const refs = path.join(SHIPPED, "..", "skills", "discuss", "references");
  const packs = fs.readFileSync(path.join(refs, "packs.md"), "utf8");
  assert.match(packs, /## A stack that matches the template: confirm first/);
  assert.match(packs, /before writing any file/);
  assert.match(packs, /an unattended run does not start the topic/);
  assert.match(fs.readFileSync(path.join(refs, "topics.md"), "utf8"), /Pack: `foundation`\. When the stack matches the template, confirm first/);
  assert.match(fs.readFileSync(path.join(refs, "..", "SKILL.md"), "utf8"), /wait for the user's yes/);
});

test("every shipped pack has its .NET stack file", () => {
  p = project();
  const r = run(p, "packs.mjs", ["list"]);
  for (const x of r.json.packs) assert.deepEqual(x.stacks, ["dotnet"], `${x.name} has no stack/dotnet.md`);
});

test("auth: tokens for clients a cookie cannot serve, the OTP switch on the settings page", () => {
  const read = (f) => fs.readFileSync(path.join(SHIPPED, "auth", f), "utf8");
  assert.match(read("pack.md"), /^version: 3$/m);
  assert.match(read("decisions.md"), /### AUTH-D31:/);
  assert.match(read("decisions.md"), /### AUTH-D32:/);
  assert.match(read("params.md"), /`auth\.otp_enabled`/);
  assert.match(read("params.md"), /`auth\.access_token_minutes`/);
  assert.doesNotMatch(read("requirements.md"), /AUTH_OTP_<PORTAL>/);
  assert.match(read("stack/dotnet.md"), /AddIdentityCore<TUser>/);
});

// The user's choice of 2026-11-08 after comparing cookie sessions with JWT: every web on the API's origin holds a
// cookie (React, Vue and Angular included); tokens are for clients a cookie cannot serve.
test("auth: a web on the API's origin holds a cookie; a mobile app, another system or a web on another origin holds tokens", () => {
  const read = (f) => fs.readFileSync(path.join(SHIPPED, "auth", f), "utf8");
  const d09 = /### AUTH-D09:[\s\S]*?(?=### AUTH-D10:)/.exec(read("decisions.md"))[0];
  assert.match(d09, /เว็บที่อยู่ origin เดียวกับ API/);
  assert.match(d09, /React, Vue, Angular/);
  assert.match(d09, /คนละ site แพ็กนี้ไม่รองรับ/);
  assert.doesNotMatch(d09, /profile `react-vite`/);
  const req = read("requirements.md");
  assert.match(req, /a web on the API's origin, whether rendered on the server or a browser app that calls the API, SHALL hold it in a random cookie/);
  assert.match(req, /a mobile app, another system acting for a user, and a browser app on another origin of the same site SHALL hold a short access token/);
  assert.match(req, /#### Scenario: A browser app on the API's origin holds a cookie/);
  assert.match(req, /This requirement applies to sessions held with tokens/);
  const stack = read("stack/dotnet.md");
  const section = /## react-vite\n([\s\S]*?)(?=\n## Pitfalls)/.exec(stack.replace(/\r\n/g, "\n"))[1];
  assert.match(section, /^- A web on the API's origin \(the default\)/m);
  assert.match(section, /X-CSRF-Token/);
  assert.match(section, /Only for a web on another origin of the same site/);
  const shell = fs.readFileSync(path.join(SHIPPED, "shell", "requirements.md"), "utf8");
  assert.match(shell, /For a session held with tokens, an expired access token \(`TOKEN_EXPIRED`\) is not an expired session/);
  const rule = fs.readFileSync(path.join(SHIPPED, "..", "skills", "discuss", "references", "packs.md"), "utf8");
  assert.match(rule, /a `custom` profile that names it/);
  assert.match(rule, /a browser app that calls the API: `## react-vite`, with React read as the project's framework/);
});

test("a valid pack passes", () => {
  const dir = packsDir();
  writePack(dir, "base");
  const r = check(dir);
  assert.equal(r.status, 0, JSON.stringify(r.json, null, 2));
  assert.deepEqual(r.json.checked, ["base"]);
});

test("check refuses what belongs to one customer or one project", () => {
  const dir = packsDir();
  writePack(dir, "base", {
    requirements: "### Requirement: Lock\nPer SRS NFR-SEC-11 and DR009 (decision-17, TASK-14), template #14 goes to ops@stem.co.th on 172.16.1.5 as พี่ใหญ่ said.\n\n#### Scenario: S09-01\n- **WHEN** x\n- **THEN** y\n",
  });
  const r = check(dir);
  assert.equal(r.status, 1);
  const found = r.json.problems.map((x) => x.problem).join("\n");
  for (const what of ["customer screen ID", "customer requirement ID", "customer document name", "test-case ID", "project decision number", "project task number", "numbered template", "IP address", "e-mail address", "personal name"]) {
    assert.ok(found.includes(what), `not caught: ${what}\n${found}`);
  }
});

test("a stack file passes when it names its pack and stack and cites real decisions", () => {
  const dir = packsDir();
  writePack(dir, "base");
  fs.mkdirSync(path.join(dir, "base", "stack"));
  fs.writeFileSync(path.join(dir, "base", "stack", "dotnet.md"), "---\npack: base\nstack: dotnet\n---\n\n# base on ASP.NET Core\n\n## Decision by decision\n\n| Decision | .NET | Write yourself |\n|---|---|---|\n| BASE-D01 | x | y |\n");
  const r = check(dir);
  assert.equal(r.status, 0, JSON.stringify(r.json.problems));
  p ??= project();
  const l = run(p, "packs.mjs", ["list", "--dir", dir]);
  assert.deepEqual(l.json.packs[0].stacks, ["dotnet"]);
});

test("check refuses a stack file that is unknown, misnamed, cites a missing decision or carries a customer name", () => {
  const dir = packsDir();
  writePack(dir, "base");
  fs.mkdirSync(path.join(dir, "base", "stack"));
  fs.writeFileSync(path.join(dir, "base", "stack", "dotnet.md"), "---\npack: other\nstack: java\n---\n\n# base\n\n| BASE-D09 | as built for StemHub | |\n");
  fs.writeFileSync(path.join(dir, "base", "stack", "rails.md"), "---\npack: base\nstack: rails\n---\n");
  const r = check(dir);
  assert.equal(r.status, 1);
  const found = r.json.problems.map((x) => `${x.file}: ${x.problem}`).join("\n");
  for (const what of ["stack/rails.md: not a known stack file", "frontmatter pack must be", "frontmatter stack must be", "## Decision by decision missing", "BASE-D09 is not a decision", "stack/dotnet.md: a customer or project name"]) {
    assert.ok(found.includes(what), `not caught: ${what}\n${found}`);
  }
});

test("check allows example.com addresses and the origin line", () => {
  const dir = packsDir();
  writePack(dir, "base", { requirements: "### Requirement: Mail\nMail goes to somchai@example.com (BASE-D01).\n\n#### Scenario: Sent\n- **WHEN** x\n- **THEN** y\n" });
  const text = fs.readFileSync(path.join(dir, "base", "pack.md"), "utf8").replace("origin: test", "origin: StemHub 2026-11");
  fs.writeFileSync(path.join(dir, "base", "pack.md"), text);
  const r = check(dir);
  assert.equal(r.status, 0, JSON.stringify(r.json.problems, null, 2));
});

test("check refuses a decision without its lines, a bad ID and a requirement without a scenario", () => {
  const dir = packsDir();
  writePack(dir, "base", {
    decisions: "### BASE-D01: ไม่ครบ\n- **คำตอบ:** ก\n- **ถ้าผิด:** ง่าย\n- **ถามเมื่อ:** ทุกโปรเจกต์\n\n### OTHER-D02: ผิด prefix\n- **คำตอบ:** ก\n- **เหตุผล:** ข\n- **ถ้าผิด:** แก้ยาก — ตาราง\n- **ถามเมื่อ:** ไม่ถาม\n",
    requirements: "### Requirement: Bare\nIt SHALL work (BASE-D09) with {base.nothing} on {region}.\n",
  });
  const r = check(dir);
  assert.equal(r.status, 1);
  const found = r.json.problems.map((x) => x.problem).join("\n");
  for (const what of ["**เหตุผล:** missing", "must start with \"แก้ยาก —\"", "**ตัวเลือกอื่น:** missing", "OTHER-D02: ID must be BASE-D", "has no #### Scenario", "BASE-D09 is not a decision", "{base.nothing} is not a key", "{region} is not a project term"]) {
    assert.ok(found.includes(what), `not caught: ${what}\n${found}`);
  }
});

test("check refuses a missing required pack, a cycle and a topic claimed twice", () => {
  const dir = packsDir();
  writePack(dir, "one", { requires: ["two"], topics: ["shared"] });
  writePack(dir, "two", { requires: ["one"], topics: ["shared"] });
  writePack(dir, "three", { requires: ["ghost"] });
  const r = check(dir);
  assert.equal(r.status, 1);
  const found = r.json.problems.map((x) => `${x.pack}: ${x.problem}`).join("\n");
  assert.match(found, /one: requires make a cycle/);
  assert.match(found, /topic "shared" is claimed by one and two/);
  assert.match(found, /three: requires "ghost", which is not a pack/);
});

test("use adds a pack with what it requires and keeps the rest of config.json", () => {
  const dir = packsDir();
  writePack(dir, "audit", { topics: ["audit-history"] });
  writePack(dir, "mail", { requires: ["audit"], topics: ["notifications"] });
  writePack(dir, "auth", { requires: ["audit", "mail"], topics: ["sign-in"] });
  p = project({ e2eMaxWorkers: 1 });
  const r = run(p, "packs.mjs", ["use", "auth", "--dir", dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.added, ["audit", "mail", "auth"]);
  const cfg = JSON.parse(p.read(".mflow/config.json"));
  assert.deepEqual(cfg.packs, ["audit", "mail", "auth"]);
  assert.equal(cfg.e2eMaxWorkers, 1);
  const again = run(p, "packs.mjs", ["use", "mail", "--dir", dir]);
  assert.deepEqual(again.json.added, []);
});

test("use refuses a pack that does not exist", () => {
  const dir = packsDir();
  writePack(dir, "audit");
  p = project();
  const r = run(p, "packs.mjs", ["use", "billing", "--dir", dir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no such pack: billing/);
});

test("selected maps topics, names missing requirements and puts filled packs beside the discuss folder", () => {
  const dir = packsDir();
  writePack(dir, "audit", { topics: ["audit-history"] });
  writePack(dir, "auth", { requires: ["audit"], topics: ["sign-in"] });
  p = project({ packs: ["auth", "billing"] });
  const r = run(p, "packs.mjs", ["selected", "--dir", dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.order, ["audit", "auth"]);
  assert.deepEqual(r.json.required, ["audit"]);
  assert.deepEqual(r.json.unknown, ["billing"]);
  assert.deepEqual(r.json.topics, { "audit-history": "audit", "sign-in": "auth" });
  assert.equal(r.json.available.notifications, undefined);
  writePack(dir, "mail", { requires: ["audit"], topics: ["notifications"] });
  const withMail = run(p, "packs.mjs", ["selected", "--dir", dir]);
  assert.equal(withMail.json.available.notifications, "mail", "a pack not chosen is still named");
  assert.equal(withMail.json.topics.notifications, undefined);
  assert.equal(r.json.projectDir, "docs/decisions/packs");
  assert.equal(r.json.packs.auth.filled, "docs/decisions/packs/auth.md");
  assert.equal(r.json.packs.auth.discuss.length, 3);
  assert.deepEqual(r.json.packs.auth.stack, {}, "no stack file, no stack entry");
  assert.equal(r.json.warnings.length, 2);

  const old = project({ discussDir: "docs/discuss" });
  try {
    const r2 = run(old, "packs.mjs", ["selected", "--dir", dir]);
    assert.equal(r2.json.projectDir, "docs/packs");
  } finally {
    old.cleanup();
  }
});

test("config.json packs must be a list of kebab-case names", () => {
  p = project({ packs: "auth" });
  const r = run(p, "packs.mjs", ["selected"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /"packs" must be a list of pack names/);
});

test("OpenSpec proposals start from a filled pack", () => {
  assert.ok(LINES["rules.proposal"].some((l) => l.includes("filled pack") && l.includes("{discuss}/")));
});

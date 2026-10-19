// Review units (/mflow:analyze units, unit:<name>): every tracked file sits in one unit or in a
// notReviewed group with its reason, specs are claimed, the facts file is lifted from the code, and a
// report's "Files read" is checked against the unit's files.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { git, hasGit, project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());
const needsGit = { skip: !hasGit && "git not installed" };

const units = (...args) => run(p, "review-units.mjs", args);
const ok = (...args) => {
  const r = units(...args);
  assert.equal(r.status, 0, r.stderr);
  return r.json;
};

/** A small two-layer app with a web front end, specs, docs and an image, all committed. */
function app() {
  p = project();
  p.write("api/Modules/Orders/OrdersController.cs", [
    "[ApiController]",
    "[Route(\"orders\")]",
    "public class OrdersController {",
    "    [HttpGet]",
    "    public IActionResult List() => Ok();",
    "    [HttpPost(\"{id}/cancel\")]",
    "    public IActionResult Cancel(int id) => Ok();",
    "}",
  ].join("\n"));
  p.write("api/Modules/Orders/OrderService.cs", "public class OrderService {}\n");
  p.write("api/Modules/Billing/InvoiceService.cs", "public class InvoiceService {}\n");
  p.write("api/Common/ErrorFormat.cs", "public static class ErrorFormat {}\n");
  p.write("api/Persistence/Migrations/AppDbContextModelSnapshot.cs", [
    "modelBuilder.Entity(\"Shop.Order\", b =>",
    "{",
    "    b.ToTable(\"order\", \"public\");",
    "});",
  ].join("\n"));
  p.write("tests/OrdersApiTests.cs", [
    "public class OrdersApiTests {",
    "    [Fact]",
    "    public async Task A_cancelled_order_cannot_be_paid() {}",
    "    [Theory]",
    "    [InlineData(1)]",
    "    [InlineData(2)]",
    "    public void Totals_add_up(int n) {}",
    "}",
  ].join("\n"));
  p.write("web/next.config.ts", "export default {};\n");
  p.write("web/src/app/(portal)/orders/[id]/page.tsx", "export default function P() {}\n");
  p.write("web/src/app/page.tsx", "export default function Home() {}\n");
  p.write("web/src/lib/orders.test.ts", "test('an order list shows the newest first', () => {});\nit(\"keeps Thai names\", () => {});\n");
  p.write("openspec/specs/orders/spec.md", "# orders\n");
  p.write("openspec/specs/billing/spec.md", "# billing\n");
  p.write("openspec/changes/refunds/specs/refunds/spec.md", "# refunds\n");
  p.write("openspec/changes/archive/old/specs/legacy/spec.md", "# legacy\n");
  p.write("docs/notes.md", "notes\n");
  p.write("web/public/logo.png", "png");
  git(p, "init", "-q");
  git(p, "add", "-A");
  git(p, "commit", "-q", "-m", "app");
}

const PLAN = {
  version: 1,
  units: [
    { name: "orders", kind: "feature", globs: ["api/Modules/Orders/**", "tests/Orders*", "web/src/app/**/orders/**", "web/src/lib/orders*"], specs: ["orders", "refunds"], neighbours: ["shared"] },
    { name: "billing", kind: "feature", globs: ["api/Modules/Billing/**"], specs: ["billing"] },
    { name: "shared", kind: "shared", globs: ["api/Common/**", "api/Persistence/**", "web/next.config.ts", "web/src/app/page.tsx"] },
    { name: "joins", kind: "joins", flows: [{ name: "cancel then refund", units: ["orders", "billing"] }] },
  ],
  notReviewed: [
    { globs: ["openspec/**", "docs/**", ".mflow/**"], reason: "documents and settings" },
    { globs: ["**/*.png"], reason: "images" },
  ],
};
const plan = (over = {}) => p.write(".mflow/review-units.json", JSON.stringify({ ...PLAN, ...over }, null, 2));

test("a complete plan checks clean: every file in one unit or a reasoned group, every spec claimed", needsGit, () => {
  app();
  plan();
  git(p, "add", "-A");
  const c = ok("check");
  assert.equal(c.ok, true, JSON.stringify(c, null, 2));
  assert.deepEqual(c.unassigned, []);
  assert.deepEqual(c.specs.unmapped, []);
  assert.deepEqual(c.specs.all.sort(), ["billing", "orders", "refunds"], "archived change specs are not counted");
  assert.equal(c.units.find((u) => u.name === "orders").files, 5);
  assert.equal(c.units.find((u) => u.name === "joins").files, null);
});

test("check names what is missing: a file in no unit, a file in two, a group without a reason, an unclaimed spec", needsGit, () => {
  app();
  p.write("api/Jobs/Nightly.cs", "class Nightly {}\n");
  git(p, "add", "-A");
  plan({
    units: [
      { ...PLAN.units[0], specs: ["orders", "nope"] },
      { ...PLAN.units[1], globs: ["api/Modules/Billing/**", "api/Common/**"] },
      PLAN.units[2],
      { name: "joins", kind: "joins", flows: [{ name: "x", units: ["orders", "ghost"] }] },
    ],
    notReviewed: [{ globs: ["openspec/**", "docs/**", ".mflow/**"] }, PLAN.notReviewed[1]],
  });
  const c = ok("check");
  assert.equal(c.ok, false);
  assert.deepEqual(c.unassigned, ["api/Jobs/Nightly.cs"]);
  assert.deepEqual(c.overlaps, [{ file: "api/Common/ErrorFormat.cs", units: ["billing", "shared"] }]);
  assert.deepEqual(c.notReviewedWithoutReason, [0]);
  assert.deepEqual(c.specs.unmapped, ["refunds"]);
  assert.deepEqual(c.specs.unknown, [{ unit: "orders", spec: "nope" }]);
  assert.deepEqual(c.badFlows, [{ unit: "joins", flow: "x", missing: "ghost" }]);
});

test("files lists one unit; a joins unit gets the files of the units its flows name", needsGit, () => {
  app();
  plan();
  assert.deepEqual(ok("files", "billing").files, ["api/Modules/Billing/InvoiceService.cs"]);
  const joins = ok("files", "joins");
  assert.equal(joins.kind, "joins");
  assert.ok(joins.files.includes("api/Modules/Billing/InvoiceService.cs") && joins.files.includes("tests/OrdersApiTests.cs"));
  const r = units("files", "nope");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no unit nope.*units: orders, billing, shared, joins/);
});

test("a malformed or missing plan stops with what to fix", needsGit, () => {
  app();
  let r = units("check");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no \.mflow\/review-units\.json: run \/mflow:analyze units first/);
  plan({ units: [{ name: "Orders", globs: ["x/**"] }] });
  r = units("check");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lower-case name/);
});

test("draft finds module folders, matches tests and web files by name prefix, and suggests notReviewed groups", needsGit, () => {
  app();
  const d = ok("draft");
  const orders = d.units.find((u) => u.name === "orders");
  assert.ok(orders, JSON.stringify(d.units));
  assert.deepEqual(d.units.map((u) => u.name).sort(), ["billing", "orders"]);
  assert.ok(orders.byNamePrefix.includes("tests/OrdersApiTests.cs"), JSON.stringify(orders.byNamePrefix));
  assert.ok(!orders.byNamePrefix.some((f) => f.startsWith("openspec/")), "specs are not code");
  assert.ok(d.notReviewedSuggested.some((g) => g.reason === "images" && g.files === 1));
  assert.ok(d.rest.some((r) => r.dir === "api/Common"));
});

test("facts lifts files, test names, routes and the schema from the code, and says where it came from", needsGit, () => {
  app();
  plan();
  const out = ".mflow/briefs/AN-001-r1.facts.md";
  const r = ok("facts", "orders", "--out", out);
  assert.equal(r.written, out);
  assert.equal(r.tests, 4);
  const md = p.read(out);
  assert.match(md, /^# Facts: unit orders/m);
  assert.match(md, /Generated by review-units\.mjs from commit [0-9a-f]{40}/);
  assert.match(md, /- A_cancelled_order_cannot_be_paid/);
  assert.match(md, /- Totals_add_up/, "[InlineData] rows between the attribute and the method do not hide it");
  assert.match(md, /- an order list shows the newest first/);
  assert.match(md, /- keeps Thai names/);
  assert.match(md, /`GET orders` — api\/Modules\/Orders\/OrdersController\.cs:4/);
  assert.match(md, /`POST orders\/\{id\}\/cancel` — api\/Modules\/Orders\/OrdersController\.cs:6/);
  assert.match(md, /`\/orders\/\[id\]` — web\/src\/app\/\(portal\)\/orders\/\[id\]\/page\.tsx/);
  assert.match(md, /`Shop\.Order` → `order`/);
  assert.match(md, /Not set: the project has no exported OpenAPI file/);
  assert.equal(units("facts", "orders", "--out", "../outside.md").status, 1, "the facts file stays inside the project");
});

test("facts reads extra patterns and the OpenAPI path from config, and says when nothing matched", needsGit, () => {
  app();
  p.write(".mflow/config.json", JSON.stringify({ version: 1, asBuilt: { openapi: "openapi.yaml", facts: { tests: ["^\\s*scenario\\(\"([^\"]+)\""] } } }));
  p.write("api/Modules/Billing/billing.feature.js", "scenario(\"an invoice is issued once\")\n");
  p.write("openapi.yaml", "openapi: 3.1.0\n");
  git(p, "add", "-A");
  plan({ notReviewed: [...PLAN.notReviewed, { globs: ["openapi.yaml"], reason: "exported API description" }] });
  ok("facts", "billing", "--out", ".mflow/briefs/b.facts.md");
  const md = p.read(".mflow/briefs/b.facts.md");
  assert.match(md, /- an invoice is issued once/);
  assert.match(md, /Read openapi\.yaml/);
  assert.match(md, /## Routes and endpoints \(0\)[\s\S]*None found in this unit's files/);
});

test("config refuses a pattern list that is not strings, or an OpenAPI path outside the project", needsGit, () => {
  app();
  plan();
  p.write(".mflow/config.json", JSON.stringify({ version: 1, asBuilt: { facts: { tests: [1] } } }));
  let r = units("facts", "orders", "--out", ".mflow/briefs/x.md");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /asBuilt\.facts\.tests/);
  p.write(".mflow/config.json", JSON.stringify({ version: 1, asBuilt: { openapi: "../api.yaml" } }));
  r = units("facts", "orders", "--out", ".mflow/briefs/x.md");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /asBuilt\.openapi/);
});

test("a unit analysis records its basis and unit, names its facts file, and refuses an unknown unit", needsGit, () => {
  app();
  plan();
  const s = run(p, "consult.mjs", ["new", "analyze", "--scope", "unit:orders", "--to", "codex,opencode"]).json;
  assert.equal(s.basis, "built");
  assert.equal(s.unit, "orders");
  assert.equal(s.facts, ".mflow/briefs/AN-001-r1.facts.md");
  assert.deepEqual(s.previous, []);
  const bad = run(p, "consult.mjs", ["new", "analyze", "--scope", "unit:nope"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no unit nope/);
  assert.equal(run(p, "consult.mjs", ["new", "design", "--scope", "unit:orders"]).status, 1);
  const sys = run(p, "consult.mjs", ["new", "analyze", "--scope", "system", "--basis", "built"]).json;
  assert.equal(sys.basis, "built");
  assert.equal(sys.unit, null);
  assert.equal(sys.facts, undefined);
  assert.equal(run(p, "consult.mjs", ["new", "analyze", "--scope", "x", "--basis", "docs"]).status, 1);
});

test("a later analysis of the same unit lists the summarized ones before it", needsGit, () => {
  app();
  plan();
  run(p, "consult.mjs", ["new", "analyze", "--scope", "unit:orders", "--to", "codex"]);
  p.write(".mflow/briefs/AN-001-r1.md", "# brief\n");
  p.write("docs/ai/inbox/AN-001-r1-codex.md", "---\nfrom: codex\n---\n# r\n");
  p.write("docs/ai/analysis/AN-001/summary.md", "---\nid: AN-001\nrevision: 2\nreports: docs/ai/inbox/AN-001-r1-codex.md\n---\n# s\n");
  const s = run(p, "consult.mjs", ["new", "analyze", "--scope", "unit:orders"]).json;
  assert.equal(s.id, "AN-002");
  assert.deepEqual(s.previous, [{ id: "AN-001", summary: "docs/ai/analysis/AN-001/summary.md", revision: 2 }]);
});

test("inbox-normalize --unit lists the unit's files the report did not read; a folder counts for its files", needsGit, () => {
  app();
  plan();
  const report = p.write("docs/ai/inbox/AN-001-r1-codex.md", [
    "---", "from: codex", "---", "## Understanding", "x", "## Files read",
    "- `api/Modules/Orders/` (all)", "- tests/OrdersApiTests.cs:1-40", "## Findings", "",
  ].join("\n"));
  const r = run(p, "inbox-normalize.mjs", [report, "--unit", "orders"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.coverage.files, 5);
  assert.equal(r.json.coverage.read, 3);
  assert.deepEqual(r.json.coverage.unread.sort(), ["web/src/app/(portal)/orders/[id]/page.tsx", "web/src/lib/orders.test.ts"]);
  const none = run(p, "inbox-normalize.mjs", [report, "--unit", "ghost"]).json;
  assert.match(none.coverage.error, /no unit ghost/);
});

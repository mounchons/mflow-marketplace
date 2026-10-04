// Briefs for other AI tools: the context pack stays inside the project and flags likely secrets, and
// rendered commands keep every path literal in both PowerShell and Bash. Commands are rendered, never run.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { project, run } from "./helpers.mjs";

let p;
afterEach(() => p?.cleanup());

test("a pack holds the project files it was given", () => {
  p = project();
  p.write("docs/vision.md", "# Vision\n");
  p.write("src/Job.cs", "public class Job { public string Password { get; set; } }\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs", "src"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.files, 2);
  assert.deepEqual(r.json.skipped, []);
  assert.match(p.read(".mflow/briefs/x.pack.md"), /## docs\/vision\.md/);
});

test("a config file with a password is skipped", () => {
  p = project();
  p.write("appsettings.json", '{ "ConnectionStrings": { "Db": "Server=x;Password=Synthetic123;" } }\n');
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "appsettings.json"]);
  assert.equal(r.json.files, 0);
  assert.match(r.json.skipped.join("\n"), /may contain secrets/);
});

test("a path outside the project is not packed (T04)", () => {
  p = project();
  p.write("../outside.md", "# outside\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "../outside.md"]);
  assert.equal(r.json?.files ?? 0, 0);
  assert.doesNotMatch(p.exists(".mflow/briefs/x.pack.md") ? p.read(".mflow/briefs/x.pack.md") : "", /# outside/);
});

test("a token in a Markdown file is flagged (T04)", () => {
  p = project();
  p.write("docs/notes.md", "api_token: SYNTHETIC-SECRET-123456\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs/notes.md"]);
  assert.notDeepEqual(r.json.skipped, []);
});

test("a folder link to outside the project is not followed out", () => {
  p = project();
  p.write("../shared/secret-plan.md", "# outside plan\n");
  p.write("docs/vision.md", "# Vision\n");
  fs.symlinkSync(path.join(p.base, "shared"), p.file("docs/shared"), "junction");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.manifest.map((m) => m.file), ["docs/vision.md"]);
  assert.match(r.json.skipped.join("\n"), /docs\/shared \(outside the project, a link to/);
  assert.doesNotMatch(p.read(".mflow/briefs/x.pack.md"), /outside plan/);
});

test("a folder outside the project named with --allow is packed", () => {
  p = project();
  p.write("../shared/Money.cs", "public record Money(decimal Amount);\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "--allow", "../shared", "../shared"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.manifest.map((m) => m.file), ["../shared/Money.cs"]);
});

test("an input given twice, or the pack itself, is packed once or not at all", () => {
  p = project();
  p.write("docs/vision.md", "# Vision\n");
  p.write(".mflow/briefs/x.pack.md", "old pack\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs", "docs/vision.md", ".mflow/briefs"]);
  assert.deepEqual(r.json.manifest.map((m) => m.file), ["docs/vision.md"]);
  assert.match(r.json.manifest[0].sha256, /^[0-9a-f]{16}$/);
});

test("a selection over the budget stops before anything is read or written", () => {
  p = project();
  p.write("docs/big.md", "x".repeat(2 * 1024 * 1024 + 10));
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Too much for one pack/);
  assert.equal(p.exists(".mflow/briefs/x.pack.md"), false);
});

test("code with a secret literal is skipped; a Password property or a token type is not", () => {
  p = project();
  p.write("src/Settings.cs", 'public static class Settings { public const string ApiKey = "synthetic0123456789"; }\n');
  p.write("src/LoginViewModel.cs", "public class LoginViewModel { public string Password { get; set; } }\n");
  p.write("web/auth.ts", "export interface Session { token: string; apiKey: string }\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "src", "web"]);
  assert.deepEqual(r.json.manifest.map((m) => m.file).sort(), ["src/LoginViewModel.cs", "web/auth.ts"]);
  assert.match(r.json.skipped.join("\n"), /src\/Settings\.cs \(may contain secrets/);
});

test("a file holding a ```` fence cannot close its block early", () => {
  p = project();
  p.write("docs/example.md", "````markdown\n```\ncode\n```\n````\n");
  run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs"]);
  assert.match(p.read(".mflow/briefs/x.pack.md"), /^`````md$/m);
});

test("paths with spaces and Thai survive in both shells", () => {
  p = project();
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "codex", "--brief", ".mflow/briefs/งาน ใหม่.md", "--out", "docs/ai-inbox/r.md"]);
  assert.equal(r.status, 0, r.stderr);
  const brief = p.file(".mflow/briefs/งาน ใหม่.md");
  assert.ok(r.json.bash.includes(brief), r.json.bash);
  assert.ok(r.json.pwsh.includes(brief), r.json.pwsh);
});

test("a $ in a path stays literal in both shells (T05)", { todo: "F04" }, () => {
  p = project();
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "codex", "--brief", ".mflow/briefs/$MFlowProbe.md", "--out", "docs/ai-inbox/r.md"]);
  const brief = p.file(".mflow/briefs/$MFlowProbe.md");
  // Single quotes are literal in both Bash and PowerShell; double quotes expand $name in both.
  assert.ok(r.json.bash.includes(`'${brief}'`), r.json.bash);
  assert.ok(r.json.pwsh.includes(`'${brief}'`), r.json.pwsh);
});

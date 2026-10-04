// Briefs for other AI tools: the context pack stays inside the project and flags likely secrets, and
// rendered commands keep every path literal in both PowerShell and Bash. Commands are rendered, never run.
import assert from "node:assert/strict";
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

test("a path outside the project is not packed (T04)", { todo: "F03" }, () => {
  p = project();
  p.write("../outside.md", "# outside\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "../outside.md"]);
  assert.equal(r.json?.files ?? 0, 0);
  assert.doesNotMatch(p.exists(".mflow/briefs/x.pack.md") ? p.read(".mflow/briefs/x.pack.md") : "", /# outside/);
});

test("a token in a Markdown file is flagged (T04)", { todo: "F03" }, () => {
  p = project();
  p.write("docs/notes.md", "api_token: SYNTHETIC-SECRET-123456\n");
  const r = run(p, "context-pack.mjs", ["--out", ".mflow/briefs/x.pack.md", "docs/notes.md"]);
  assert.notDeepEqual(r.json.skipped, []);
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

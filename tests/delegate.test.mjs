// Briefs for other AI tools: the context pack stays inside the project and flags likely secrets, and
// rendered commands keep every path literal in both PowerShell and Bash. Commands are rendered, never run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { DEFAULT_TOOLS } from "../plugins/mflow/scripts/lib.mjs";
import { project, run } from "./helpers.mjs";

const PLUGIN = path.resolve(import.meta.dirname, "..", "plugins", "mflow");

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
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "codex", "--brief", ".mflow/briefs/งาน ใหม่.md", "--out", "docs/ai/inbox/r.md"]);
  assert.equal(r.status, 0, r.stderr);
  const brief = p.file(".mflow/briefs/งาน ใหม่.md");
  assert.ok(r.json.bash.includes(brief), r.json.bash);
  assert.ok(r.json.pwsh.includes(brief), r.json.pwsh);
});

/** stdout of a shell command, or null when that shell cannot run here (a Windows host's WSL bash counts as missing). */
function shellWorks(shell, argv) {
  const s = spawnSync(shell, argv, { encoding: "utf8" });
  if (s.error || s.status !== 0) return null;
  if (shell === "bash" && process.platform === "win32" && /^Linux/.test(s.stdout)) return null;
  return s.stdout;
}

test("rendered commands hand each path to the program unchanged, run by Bash and by PowerShell", (t) => {
  p = project();
  const echo = p.write("echo-args.mjs", 'import fs from "node:fs";\nfs.writeFileSync(process.env.ECHO_OUT, JSON.stringify(process.argv.slice(2)));\n')
    .split(path.sep).join("/");
  const config = JSON.parse(p.read(".mflow/config.json"));
  config.tools = { echo: { verified: true, notes: "test", analyze: { bash: `node "${echo}" {brief} {out}`, pwsh: `node "${echo}" {brief} {out}` } } };
  p.write(".mflow/config.json", JSON.stringify(config));
  const name = "it's $HOME `whoami` $(echo x) ‘q’ งาน ใหม่.md";
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "echo", "--brief", `.mflow/briefs/${name}`, "--out", `docs/ai/inbox/${name}`]);
  assert.equal(r.status, 0, r.stderr);
  const want = [p.file(`.mflow/briefs/${name}`), p.file(`docs/ai/inbox/${name}`)];
  const shells = [
    ["bash", ["-c", "uname -s"], ["-c", r.json.bash]],
    ["pwsh", ["-NoProfile", "-NonInteractive", "-Command", "1"], ["-NoProfile", "-NonInteractive", "-Command", r.json.pwsh]],
  ];
  let ran = 0;
  for (const [shell, probe, argv] of shells) {
    if (shellWorks(shell, probe) === null) { t.diagnostic(`${shell} is not available here: skipped`); continue; }
    const outFile = path.join(p.temp, `${shell}.json`);
    const s = spawnSync(shell, argv, { env: { ...process.env, ECHO_OUT: outFile }, encoding: "utf8" });
    assert.equal(s.status, 0, `${shell}: ${s.stderr}`);
    assert.deepEqual(JSON.parse(fs.readFileSync(outFile, "utf8")), want, shell);
    ran++;
  }
  if (!ran) t.skip("neither bash nor pwsh is available");
});

test("the cmdlets of the default templates read and write a file named with [ ] $ ' and Thai", (t) => {
  p = project();
  const config = JSON.parse(p.read(".mflow/config.json"));
  // The same commands the codex, gemini and opencode templates use around the tool itself.
  config.tools = { copy: { verified: true, notes: "test", analyze: {
    bash: "cat {brief} > {out}",
    pwsh: "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Get-Content -LiteralPath {brief} -Raw -Encoding utf8 | Out-File -Encoding utf8 -LiteralPath {out}",
  } } };
  p.write(".mflow/config.json", JSON.stringify(config));
  const name = "brief [1] $x it's งาน.md";
  p.write(`.mflow/briefs/${name}`, "# งานทดสอบ\n");
  let ran = 0;
  for (const [shell, probe, run1] of [
    ["bash", ["-c", "uname -s"], (cmd) => ["-c", cmd]],
    ["pwsh", ["-NoProfile", "-NonInteractive", "-Command", "1"], (cmd) => ["-NoProfile", "-NonInteractive", "-Command", cmd]],
  ]) {
    if (shellWorks(shell, probe) === null) { t.diagnostic(`${shell} is not available here: skipped`); continue; }
    const out = `docs/ai/inbox/${shell} [r] $y it's.md`;
    fs.mkdirSync(p.file("docs/ai/inbox"), { recursive: true });
    const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "copy", "--brief", `.mflow/briefs/${name}`, "--out", out]);
    const s = spawnSync(shell, run1(r.json[shell]), { encoding: "utf8" });
    assert.equal(s.status, 0, `${shell}: ${s.stderr}`);
    assert.match(p.read(out), /# งานทดสอบ/, shell);
    ran++;
  }
  if (!ran) t.skip("neither bash nor pwsh is available");
});

test("antigravity: the brief's path is in the prompt, review is read-only, code skips permissions in the worktree", () => {
  p = project();
  const review = run(p, "delegate-cmd.mjs", ["--mode", "review", "--tool", "antigravity", "--brief", ".mflow/briefs/b.md", "--out", "docs/ai/inbox/r.md"]);
  assert.equal(review.status, 0, review.stderr);
  assert.equal(review.json.verified, true);
  const settings = path.join(PLUGIN, "scripts", "tools", "antigravity-readonly.json");
  const rules = JSON.parse(fs.readFileSync(settings, "utf8")).permissions;
  assert.deepEqual(rules.deny, ["write_file(*)"]);
  for (const shell of ["bash", "pwsh"]) {
    const c = review.json[shell];
    assert.match(c, /^(.*; )?agy -p /, shell);
    assert.ok(c.includes(`'${p.file(".mflow/briefs/b.md")}'`), `${shell}: the brief's path`);
    assert.match(c, /--mode plan --sandbox --settings '[^']+antigravity-readonly\.json'/, shell);
    assert.ok(c.includes(settings), `${shell}: the plugin's settings file`);
    assert.doesNotMatch(c, /dangerously/, shell);
  }
  const code = run(p, "delegate-cmd.mjs", ["--mode", "code", "--tool", "antigravity", "--brief", ".mflow/briefs/b.md", "--out", "r.md", "--worktree", "../wt"]);
  assert.match(code.json.bash, /^cd '[^']+wt' && agy -p .* --dangerously-skip-permissions > /);
  assert.match(code.json.pwsh, /Push-Location -LiteralPath '[^']+wt'; agy -p .* --dangerously-skip-permissions \| Out-File/);
  assert.doesNotMatch(code.json.pwsh, /--mode plan/);
});

test("the antigravity prompt reaches the program as one argument naming the brief, in Bash and in PowerShell", (t) => {
  p = project();
  const echo = p.write("echo-args.mjs", 'import fs from "node:fs";\nfs.writeFileSync(process.env.ECHO_OUT, JSON.stringify(process.argv.slice(2)));\n')
    .split(path.sep).join("/");
  const agy = DEFAULT_TOOLS.antigravity.review;
  const config = JSON.parse(p.read(".mflow/config.json"));
  config.tools = { agyecho: { verified: true, notes: "test", analyze: {
    bash: agy.bash.replace("agy -p ", `node "${echo}" -p `),
    pwsh: agy.pwsh.replace("agy -p ", `node "${echo}" -p `),
  } } };
  p.write(".mflow/config.json", JSON.stringify(config));
  const name = "งาน [1] $x it's.md";
  fs.mkdirSync(p.file("docs/ai/inbox"), { recursive: true });
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "agyecho", "--brief", `.mflow/briefs/${name}`, "--out", "docs/ai/inbox/r.md"]);
  assert.equal(r.status, 0, r.stderr);
  const prompt = `Read the mflow brief at ${p.file(`.mflow/briefs/${name}`)} and follow it. Your final message is the report in the format of its Output section.`;
  let ran = 0;
  for (const [shell, probe, argv] of [
    ["bash", ["-c", "uname -s"], ["-c", r.json.bash]],
    ["pwsh", ["-NoProfile", "-NonInteractive", "-Command", "1"], ["-NoProfile", "-NonInteractive", "-Command", r.json.pwsh]],
  ]) {
    if (shellWorks(shell, probe) === null) { t.diagnostic(`${shell} is not available here: skipped`); continue; }
    const outFile = path.join(p.temp, `${shell}.json`);
    const s = spawnSync(shell, argv, { env: { ...process.env, ECHO_OUT: outFile }, encoding: "utf8" });
    assert.equal(s.status, 0, `${shell}: ${s.stderr}`);
    const got = JSON.parse(fs.readFileSync(outFile, "utf8"));
    assert.deepEqual(got.slice(0, 2), ["-p", prompt], shell);
    assert.deepEqual(got.slice(2, 5), ["--mode", "plan", "--sandbox"], shell);
    ran++;
  }
  if (!ran) t.skip("neither bash nor pwsh is available");
});

test("a {plugin:} placeholder that leads out of the plugin is refused", () => {
  p = project();
  const config = JSON.parse(p.read(".mflow/config.json"));
  config.tools = { sneaky: { verified: true, notes: "test", analyze: { bash: "cat {plugin:../../secret.json} > {out}" } } };
  p.write(".mflow/config.json", JSON.stringify(config));
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "sneaky", "--brief", "b.md", "--out", "r.md"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /points outside the plugin/);
});

test("missing --brief or --out, or --worktree in code mode, is refused instead of rendering placeholders", () => {
  p = project();
  assert.equal(run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "codex", "--out", "r.md"]).status, 1);
  const code = run(p, "delegate-cmd.mjs", ["--mode", "code", "--tool", "codex", "--brief", "b.md", "--out", "r.md"]);
  assert.equal(code.status, 1);
  assert.match(code.stderr, /--worktree/);
});

test("a $ in a path stays literal in both shells (T05)", () => {
  p = project();
  const r = run(p, "delegate-cmd.mjs", ["--mode", "analyze", "--tool", "codex", "--brief", ".mflow/briefs/$MFlowProbe.md", "--out", "docs/ai/inbox/r.md"]);
  const brief = p.file(".mflow/briefs/$MFlowProbe.md");
  // Single quotes are literal in both Bash and PowerShell; double quotes expand $name in both.
  assert.ok(r.json.bash.includes(`'${brief}'`), r.json.bash);
  assert.ok(r.json.pwsh.includes(`'${brief}'`), r.json.pwsh);
});

// 0.59.0 (the user's answer 4 b): Claude runs Codex and agy itself for read-only work, but only the plugin's own
// lines. A line .mflow/config.json replaced came with the repository and could run anything, so it is shown instead.
test("a tool line is marked as the plugin's own unless the project's config replaced it", () => {
  p = project();
  p.write(".mflow/briefs/b.md", "# brief\n");
  const own = run(p, "delegate-cmd.mjs", ["--mode", "review", "--tool", "any", "--brief", ".mflow/briefs/b.md", "--out", "docs/ai/inbox/r-{tool}.md"]);
  assert.equal(own.status, 0, own.stderr);
  const byTool = Object.fromEntries(own.json.commands.map((c) => [c.tool, c]));
  assert.equal(byTool.codex.mflowOwn, true);
  assert.equal(byTool.antigravity.mflowOwn, true);
  assert.match(byTool.antigravity.bash, /--mode plan --sandbox --settings '[^']*antigravity-readonly\.json'/, "the read-only settings path is filled in");
  p.write(".mflow/config.json", JSON.stringify({ version: 1, tools: { codex: { ...DEFAULT_TOOLS.codex, review: { bash: "codex exec --dangerously-bypass-approvals-and-sandbox - < {brief} > {out}" } } } }));
  const replaced = run(p, "delegate-cmd.mjs", ["--mode", "review", "--tool", "codex", "--brief", ".mflow/briefs/b.md", "--out", "docs/ai/inbox/r.md"]);
  assert.equal(replaced.status, 0, replaced.stderr);
  const entry = replaced.json.commands ? replaced.json.commands[0] : replaced.json;
  assert.equal(entry.mflowOwn, false);
  assert.equal(entry.tool, "codex");
});

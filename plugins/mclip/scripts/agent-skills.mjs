#!/usr/bin/env node
// mclip for Codex and Google Antigravity: both read a project's skills from .agents/skills/<name>/SKILL.md (Codex
// calls one as $mclip-plan, Antigravity as /mclip-plan). This writes mclip's skills there, made from this plugin's
// own skills, and a copy of what they run (the scripts, the recorder's template, the pronunciation rules) into
// .agents/mclip/, so they work with no Claude Code on the machine.
//
//   node agent-skills.mjs plan   [--root <project>]   -> JSON: what writing would create, update or remove
//   node agent-skills.mjs write  [--root <project>]   -> write it; JSON: the same, as done
//   node agent-skills.mjs status [--root <project>]   -> JSON: the version written, and the plugin's
//
// From Claude Code: /mclip:init. Without it: clone the marketplace repository and run
//   node <clone>/plugins/mclip/scripts/agent-skills.mjs write --root <project>
// Run it again after a newer mclip to update both. /mclip:finish is not among them: it needs WeftCut's MCP server,
// which is set up in Claude Code.
//
// A skill folder without mclip's marker (`mclip/generated` in its frontmatter's metadata) is the user's own and is
// never touched; .agents/mclip/ is mclip's and is replaced whole. Nothing is written through a link that leads out of
// the project. Writing again changes nothing unless the plugin changed. Exit codes: 0 done, 2 refused.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
export const SKILLS_DIR = ".agents/skills";
export const RUNTIME = ".agents/mclip";
// the Claude Code skills that work in the other tools as they are, once their commands and tools are named for them
export const SKILLS = ["help", "init", "plan", "record", "manual"];
const MARK = "mclip/generated";

// What the runtime copy holds: everything the skills run or read, nothing that only Claude Code uses.
const RUNTIME_FILES = (rel) => /^(scripts\/[^/]+\.mjs|lexicon\.txt|\.claude-plugin\/plugin\.json|templates\/(TutorialRecorder|scenarios)\/.+)$/.test(rel)
  && !/(^|\/)(bin|obj|Output|\.venv|__pycache__)\//.test(rel);

const PREAMBLE = (name) => `## Running in Codex or Antigravity

This is mclip's \`/mclip:${name}\` of Claude Code, for Codex (\`$mclip-${name}\`) and Google Antigravity (\`/mclip-${name}\`),
written by \`.agents/mclip/scripts/agent-skills.mjs\` (mclip ${VERSION}). Where it says:
- **a command \`mclip-<name> <words>\`**: that skill with those words, \`$mclip-<name> <words>\` in Codex, \`/mclip-<name> <words>\`
  in Antigravity. \`mclip-finish\` (WeftCut) is Claude Code's only: say so when it comes up.
- **the words after the skill's name**: what the user wrote after \`$mclip-${name}\` or \`/mclip-${name}\`; none is an empty argument.
- **a question to the user**: ask it in the chat, one at a time, its options labelled a) b) c), the recommended one first,
  and wait for the answer.
- **run in the background**: a command that keeps running (the live page, a recording): start it so it does not block the
  chat when the tool can, else run it and wait; a server stays up until the user is done, then stop it.
- **\`.agents/mclip/...\`**: paths from the project's root; run every command there. The copy in \`.agents/mclip\` is
  mclip's: update it with \`node <the mflow-marketplace clone>/plugins/mclip/scripts/agent-skills.mjs write --root .\`
  (or \`/mclip:init\` in Claude Code), never by hand.
- Commands that start browsers, servers on local ports or \`dotnet\` may need the tool's approval outside its sandbox:
  ask for it, do not work around it.

`;

/** A Claude Code skill's text, for the other tools: its frontmatter, commands, paths and tools named for them. */
export function convert(name, text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error(`skills/${name}/SKILL.md has no frontmatter`);
  const description = /^description:\s*(.+)$/m.exec(m[1])?.[1].trim();
  if (!description) throw new Error(`skills/${name}/SKILL.md has no description`);
  const hint = /^argument-hint:\s*"?(.*?)"?\s*$/m.exec(m[1])?.[1] ?? "";
  let body = text.slice(m[0].length)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([a-z]+)\/SKILL\.md/g, ".agents/skills/mclip-$1/SKILL.md")
    .replace(/"\$\{CLAUDE_PLUGIN_ROOT\}\//g, `"${RUNTIME}/`)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, RUNTIME)
    .replace(/\/mclip:([a-z]+)/g, "mclip-$1")
    .replace(/`\$ARGUMENTS`/g, "the words after the skill's name").replace(/\$ARGUMENTS/g, "the words after the skill's name")
    .replace(/AskUserQuestion/g, "a question in the chat");
  const desc = `${description}${hint ? ` Takes: ${hint}.` : ""} (mclip; Codex: $mclip-${name}, Antigravity: /mclip-${name})`;
  const front = ["---", `name: mclip-${name}`, `description: ${JSON.stringify(desc)}`, "metadata:", `  ${MARK}: "${VERSION}"`, "---", ""].join("\n");
  return front + PREAMBLE(name) + body.replace(/^\s+/, "");
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/** True when `p` (existing or not) resolves inside `root`, links followed. */
function inside(root, p) {
  let probe = p;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = fs.realpathSync(probe), realRoot = fs.realpathSync(root);
  return real === realRoot || real.startsWith(realRoot + path.sep);
}

const generatedVersion = (file) => {
  if (!fs.existsSync(file)) return null;
  const m = new RegExp(`^\\s*${MARK.replace("/", "\\/")}:\\s*"?([^"\\r\\n]+)"?`, "m").exec(fs.readFileSync(file, "utf8"));
  return m ? m[1].trim() : null;
};

/** What writing would do: { skills: [{ name, action }], runtime: { action, files }, refused: [...] }. */
export function plan(root) {
  const out = { root, version: VERSION, skills: [], runtime: null, refused: [] };
  for (const s of SKILLS) {
    const dir = path.join(root, SKILLS_DIR, `mclip-${s}`), file = path.join(dir, "SKILL.md");
    const text = convert(s, fs.readFileSync(path.join(PLUGIN, "skills", s, "SKILL.md"), "utf8"));
    if (!inside(root, dir)) { out.refused.push(`${SKILLS_DIR}/mclip-${s}: leads outside the project`); continue; }
    if (fs.existsSync(dir) && !generatedVersion(file)) { out.refused.push(`${SKILLS_DIR}/mclip-${s}: the user's own skill (no ${MARK}), left as it is`); continue; }
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    out.skills.push({ name: `mclip-${s}`, file, text, action: now === null ? "create" : now === text ? "same" : "update" });
  }
  const rt = path.join(root, RUNTIME);
  const files = walk(PLUGIN).filter(RUNTIME_FILES);
  if (!inside(root, rt)) out.refused.push(`${RUNTIME}: leads outside the project`);
  else {
    const same = fs.existsSync(rt) && files.every((f) => fs.existsSync(path.join(rt, f)) && Buffer.compare(fs.readFileSync(path.join(PLUGIN, f)), fs.readFileSync(path.join(rt, f))) === 0)
      && walk(rt).filter((f) => f !== ".mclip-agents").length === files.length;
    out.runtime = { dir: rt, files, action: !fs.existsSync(rt) ? "create" : same ? "same" : "update" };
  }
  return out;
}

export function write(root) {
  const p = plan(root);
  for (const s of p.skills) {
    if (s.action === "same") continue;
    fs.mkdirSync(path.dirname(s.file), { recursive: true });
    fs.writeFileSync(s.file, s.text);
  }
  if (p.runtime && p.runtime.action !== "same") {
    fs.rmSync(p.runtime.dir, { recursive: true, force: true });
    for (const f of p.runtime.files) {
      const to = path.join(p.runtime.dir, f);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(PLUGIN, f), to);
    }
    fs.writeFileSync(path.join(p.runtime.dir, ".mclip-agents"), `${VERSION}\n`);
  }
  return p;
}

export function status(root) {
  const rt = path.join(root, RUNTIME, ".mclip-agents");
  return {
    root, plugin: VERSION,
    runtime: fs.existsSync(rt) ? fs.readFileSync(rt, "utf8").trim() : null,
    skills: SKILLS.map((s) => ({ name: `mclip-${s}`, version: generatedVersion(path.join(root, SKILLS_DIR, `mclip-${s}`, "SKILL.md")) })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const i = rest.indexOf("--root");
  const root = path.resolve(i >= 0 ? rest[i + 1] ?? "." : process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.log(JSON.stringify({ error: `not a folder: ${root}` })); process.exit(2); }
  // the project's copy (.agents/mclip) has no skills to make them from: only the plugin does
  if (cmd !== "status" && !fs.existsSync(path.join(PLUGIN, "skills"))) {
    console.log(JSON.stringify({ error: "this is the project's copy of mclip: run it from Claude Code (/mclip:init) or from a clone of the mflow-marketplace repository: node <clone>/plugins/mclip/scripts/agent-skills.mjs write --root ." }));
    process.exit(2);
  }
  const brief = (p) => ({ root: p.root, version: p.version, skills: p.skills.map(({ name, action }) => ({ name, action })),
    runtime: p.runtime && { dir: p.runtime.dir, files: p.runtime.files.length, action: p.runtime.action }, refused: p.refused,
    use: "Codex: $mclip-help, $mclip-plan, ... · Antigravity: /mclip-help, /mclip-plan, ..." });
  if (cmd === "plan") console.log(JSON.stringify(brief(plan(root)), null, 2));
  else if (cmd === "write") { const p = write(root); console.log(JSON.stringify(brief(p), null, 2)); process.exit(p.refused.length ? 2 : 0); }
  else if (cmd === "status") console.log(JSON.stringify(status(root), null, 2));
  else { console.log(JSON.stringify({ error: "usage: agent-skills.mjs plan|write|status [--root <project>]" })); process.exit(2); }
}

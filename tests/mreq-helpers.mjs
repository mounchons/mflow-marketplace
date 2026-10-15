// Shared fixtures for the mreq regression tests. Every test builds a throwaway mreq project under the
// OS temp folder and runs the plugin scripts as separate processes, the way hooks and skills do.
// Synthetic data only; nothing here talks to another service.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN = path.join(REPO, "plugins", "mreq");
export const SCRIPTS = path.join(PLUGIN, "scripts");

/** A new mreq project (with .mreq/config.json unless `marker` is false) and its own temp dir. */
export function project({ marker = true, config = {} } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mreq-test-"));
  const root = path.join(base, "proj");
  const temp = path.join(base, "temp");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(temp);
  if (marker) {
    fs.mkdirSync(path.join(root, ".mreq"));
    fs.writeFileSync(path.join(root, ".mreq", "config.json"), JSON.stringify({ version: 1, ...config }, null, 2) + "\n");
  }
  return {
    base,
    root,
    temp,
    file: (rel) => path.join(root, rel),
    write(rel, text) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
      return full;
    },
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

// GIT_CEILING_DIRECTORIES stops git from finding a repository above the test project.
const scriptEnv = (p, env) => ({
  ...process.env, CLAUDE_PROJECT_DIR: p.root, TEMP: p.temp, TMP: p.temp, TMPDIR: p.temp, GIT_CEILING_DIRECTORIES: p.base, ...env,
});

function result(status, stdout, stderr) {
  let json = null;
  try { json = JSON.parse(stdout); } catch { /* not JSON */ }
  return { status, stdout, stderr, json };
}

/** Run a plugin script from `cwd` (default: the project root) with CLAUDE_PROJECT_DIR set to the root. */
export function run(p, script, args = [], { input, cwd, env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: cwd || p.root,
    input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: scriptEnv(p, env),
    timeout: 60_000,
  });
  return result(r.status, r.stdout, r.stderr);
}

/** Start a long-running plugin script; resolves with the child and its first line of output. */
export function start(p, script, args = [], { env = {} } = {}) {
  const child = spawn(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: p.root, env: scriptEnv(p, env) });
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.stdout.on("data", (d) => {
      out += d;
      const nl = out.indexOf("\n");
      if (nl >= 0) resolve({ child, line: out.slice(0, nl) });
    });
    child.on("exit", (code) => reject(new Error(`${script} exited with ${code}: ${err}`)));
  });
}

/** Every file under `dir`, relative to it with forward slashes. */
export function walk(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

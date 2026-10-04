// Shared fixtures for the mflow regression tests. Every test builds a throwaway mflow project under
// the OS temp folder and runs the plugin scripts as separate processes, the way hooks and skills do.
// Synthetic data only; nothing here talks to another service.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins", "mflow", "scripts");

/** A new mflow project (with .mflow/config.json) and its own temp dir for session state. */
export function project(config = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mflow-test-"));
  const root = path.join(base, "proj");
  const temp = path.join(base, "temp");
  fs.mkdirSync(path.join(root, ".mflow"), { recursive: true });
  fs.mkdirSync(temp);
  fs.writeFileSync(path.join(root, ".mflow", "config.json"), JSON.stringify({ version: 1, ...config }, null, 2) + "\n");
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

/**
 * Run a plugin script from `cwd` (default: the project root) with CLAUDE_PROJECT_DIR set to the root
 * and TEMP/TMP pointed at the project's temp dir, so session state never touches the real one.
 */
export function run(p, script, args = [], { input, cwd, env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: cwd || p.root,
    input: input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: p.root, TEMP: p.temp, TMP: p.temp, TMPDIR: p.temp, ...env },
    timeout: 60_000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export const hasGit = spawnSync("git", ["--version"]).status === 0;

/** git with a fixed identity, run in the project root. */
export function git(p, ...args) {
  const r = spawnSync("git", ["-c", "user.name=mflow-test", "-c", "user.email=test@example.invalid", ...args], {
    cwd: p.root, encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

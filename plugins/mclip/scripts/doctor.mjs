#!/usr/bin/env node
// Read-only check of what mclip needs, on this machine and in this project. Each check is ok, warn or fail, with the
// fix (on Windows a winget line, so a new machine can be set up from the list).
//
//   node doctor.mjs [--root <project>]     prints JSON { root, plugin, status, checks: [{ id, status, detail, fix }] }
//
// Machine: Node 20+, Git, .NET SDK 10, PowerShell 7, ffmpeg (fail when missing: no recording without them), Playwright's
// Chromium and Python 3.10+ for the Thai voice (warn). Project: the recorder in tools/TutorialRecorder (its version
// against the plugin's, built, secrets file, stack script, voice venv) and the plan in clips/ (its problems).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, keyStatus, ENGINES } from "./clips.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORDER = path.join("tools", "TutorialRecorder");

/** Runs a command and returns its output (stdout, else stderr), or null when it cannot run or fails. */
function runCmd(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 20000, windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || r.stderr || "").trim();
}

const win = process.platform === "win32";
const FIX = {
  node: win ? "winget install OpenJS.NodeJS" : "install Node.js 20 or newer (nodejs.org)",
  git: win ? "winget install Git.Git" : "install git",
  dotnet: win ? "winget install Microsoft.DotNet.SDK.10" : "install the .NET 10 SDK (dot.net)",
  pwsh: win ? "winget install Microsoft.PowerShell" : "install PowerShell 7 (aka.ms/powershell)",
  ffmpeg: win ? "winget install Gyan.FFmpeg (then open a new terminal)" : "apt install ffmpeg, or brew install ffmpeg",
  python: win ? "winget install Python.Python.3.13" : "install Python 3.10 or newer",
};
const major = (v) => Number(/(\d+)\./.exec(v ?? "")?.[1] ?? NaN);

/** Where Playwright keeps its browsers on this machine. */
export function playwrightCache(env = process.env, home = os.homedir()) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") return env.PLAYWRIGHT_BROWSERS_PATH;
  if (win) return path.join(env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "ms-playwright");
  if (process.platform === "darwin") return path.join(home, "Library", "Caches", "ms-playwright");
  return path.join(home, ".cache", "ms-playwright");
}

export function checkMachine({ run = runCmd, nodeVersion = process.version, env = process.env, home = os.homedir() } = {}) {
  const checks = [];
  const add = (id, status, detail, fix = null) => checks.push({ id, status, detail, fix });

  if (major(nodeVersion.replace(/^v/, "") + ".") >= 20) add("node", "ok", `Node ${nodeVersion}`);
  else add("node", "fail", `Node ${nodeVersion}: 20 or newer is needed`, FIX.node);

  const git = run("git", ["--version"]);
  add("git", git ? "ok" : "fail", git ?? "git not found", git ? null : FIX.git);

  const sdks = run("dotnet", ["--list-sdks"]);
  const ten = (sdks ?? "").split(/\r?\n/).map((l) => l.trim().split(" ")[0]).filter((v) => major(v) >= 10);
  if (ten.length) add("dotnet", "ok", `.NET SDK ${ten.at(-1)}`);
  else add("dotnet", "fail", sdks === null ? "dotnet not found" : `no .NET SDK 10 (have: ${sdks.split(/\r?\n/).map((l) => l.split(" ")[0]).join(", ") || "none"})`, FIX.dotnet);

  const pwsh = run("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
  if (pwsh && major(pwsh) >= 7) add("pwsh", "ok", `PowerShell ${pwsh}`);
  else add("pwsh", "fail", pwsh ? `PowerShell ${pwsh}: 7 or newer is needed` : "pwsh (PowerShell 7) not found: the test stack's reset.ps1 needs it", FIX.pwsh);

  const ffmpeg = run("ffmpeg", ["-hide_banner", "-version"]);
  add("ffmpeg", ffmpeg ? "ok" : "fail", ffmpeg ? ffmpeg.split(/\r?\n/)[0] : "ffmpeg not found: the mp4, the voice mix and picture comparison need it", ffmpeg ? null : FIX.ffmpeg);

  const cache = playwrightCache(env, home);
  const chromium = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium/.test(d)) : [];
  const builds = chromium.filter((d) => /^chromium-\d+$/.test(d));
  if (chromium.length) add("chromium", "ok", `Playwright Chromium in ${cache} (${builds.length ? builds.join(", ") : chromium[0]})`);
  else add("chromium", "warn", `no Playwright Chromium in ${cache}`, "dotnet build tools/TutorialRecorder, then pwsh tools/TutorialRecorder/bin/Debug/net10.0/playwright.ps1 install chromium (/mclip:init does it)");

  const py = (win ? [["py", ["-3", "--version"]], ["python", ["--version"]]] : [["python3", ["--version"]], ["python", ["--version"]]])
    .map(([c, a]) => run(c, a)).find(Boolean);
  const pyOk = py && /Python 3\.(\d+)/.exec(py) && Number(/Python 3\.(\d+)/.exec(py)[1]) >= 10;
  if (pyOk) add("python", "ok", `${py} (for the Thai voice)`);
  else add("python", "warn", `${py ?? "Python not found"}: the Thai voice needs Python 3.10 or newer (optional)`, FIX.python);
  return checks;
}

const semver = (v) => (/^(\d+)\.(\d+)\.(\d+)/.exec(v ?? "") ?? []).slice(1).map(Number);
const older = (a, b) => { const [x, y] = [semver(a), semver(b)]; for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); return false; };

export function checkProject(root, pluginVersion) {
  const checks = [];
  const add = (id, status, detail, fix = null) => checks.push({ id, status, detail, fix });
  const rec = path.join(root, RECORDER);
  const at = (...p) => path.join(rec, ...p);
  if (!fs.existsSync(rec)) add("recorder", "warn", "no recorder in tools/TutorialRecorder", "/mclip:init");
  else {
    const stamp = fs.existsSync(at(".mclip-version")) ? fs.readFileSync(at(".mclip-version"), "utf8").trim() : null;
    if (!stamp) add("recorder", "warn", "tools/TutorialRecorder was not installed by mclip (no .mclip-version)", "/mclip:init adopts it");
    else if (older(stamp, pluginVersion)) add("recorder", "warn", `recorder ${stamp}, the plugin is ${pluginVersion}${older(stamp, "0.3.0") ? " (no --shots for AI pictures)" : ""}`, "/mclip:init --update");
    else add("recorder", "ok", `recorder ${stamp}`);
    const built = fs.existsSync(at("bin")) && fs.readdirSync(at("bin"), { recursive: true }).some((f) => String(f).endsWith("TutorialRecorder.dll"));
    if (!built) add("recorder-build", "warn", "the recorder is not built", "dotnet build tools/TutorialRecorder");
    if (!fs.existsSync(at("tutorial.secrets.json"))) add("secrets", "warn", "no tutorial.secrets.json (the test users)", "/mclip:init writes it from tutorial.secrets.example.json");
    if (!fs.existsSync(at("stack", "reset.ps1"))) add("stack", "warn", "no stack/reset.ps1 (the throwaway test stack to record on)", "/mclip:init writes it");
    // the API keys' file must never reach a commit (a recorder from before 0.6 does not ignore it)
    if (fs.existsSync(at("tts", "keys.json"))) {
      const rel = path.join(RECORDER, "tts", "keys.json");
      const r = spawnSync("git", ["check-ignore", "-q", rel], { cwd: root });
      if (r.status === 1) add("keys-ignored", "fail", `${rel} is not git-ignored: a commit would publish the API keys`,
        `add the line tts/keys.json to ${path.join(RECORDER, ".gitignore")} (/mclip:plan serve and /mclip:plan voice add it)`);
      else if (r.status === 0) add("keys-ignored", "ok", `${rel} is git-ignored`);
    }
    const venv = win ? at("tts", ".venv", "Scripts", "python.exe") : at("tts", ".venv", "bin", "python");
    if (fs.existsSync(venv)) add("voice", "ok", "Thai voice ready (tts/.venv)");
    else add("voice", "warn", "no Thai voice (tts/.venv): /mclip:plan voice and recording with voice need it (optional)",
      `py -3.13 -m venv ${path.join(RECORDER, "tts", ".venv")}, then its python -m pip install pythaitts==1.0.0 soundfile`);
  }
  const clips = path.join(root, "clips");
  if (!fs.existsSync(path.join(clips, "plan.md"))) add("plan", "warn", "no clips/plan.md", "/mclip:plan");
  else {
    const { lessons, problems, voice } = load(clips);
    if (problems.length) add("plan", "warn", `clips/plan.md: ${lessons.length} lessons, ${problems.length} problem(s): ${problems[0]}`, "/mclip:plan (the page lists them on its last slide)");
    else add("plan", "ok", `clips/plan.md: ${lessons.length} lessons`);
    // an API voice needs its key: said set or not, never its value
    if (voice && voice.engine !== "paradee") {
      const name = ENGINES[voice.engine].key;
      if (keyStatus(at("tts"))[name]) add("voice-key", "ok", `${name} is set (the plan's voice: ${voice.spec})`);
      else add("voice-key", "fail", `the plan's voice is ${voice.spec}, and ${name} is not set`,
        `write ${path.join(RECORDER, "tts", "keys.json")} yourself as {"${name}": "<your key>"} (git-ignored), or set ${name} in the environment`);
    }
  }
  return checks;
}

export function doctor(root, opts = {}) {
  const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
  const checks = [...checkMachine(opts), ...checkProject(root, plugin)];
  const status = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  return { root, plugin, status, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const root = path.resolve(i >= 0 ? args[i + 1] ?? "." : process.env.CLAUDE_PROJECT_DIR || process.cwd());
  process.stdout.write(JSON.stringify(doctor(root), null, 2) + "\n");
}

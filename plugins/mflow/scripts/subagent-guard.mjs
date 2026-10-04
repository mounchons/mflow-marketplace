#!/usr/bin/env node
// PreToolUse hook on the Agent tool: deny the mflow:dev subagent unless this project switched it on
// (/mflow:subagent on). Other subagents pass untouched. Fails closed: if anything goes wrong while
// deciding, the call is denied, because the user asked for the subagent to stay off until turned on.
// No process.exit after writing: on Windows a pipe write is asynchronous and exit could cut the
// denial short, which Claude Code would read as no decision, letting the call through.
import { readStdinJson, findRoot } from "./lib.mjs";
import { AGENT, resolve } from "./apply-subagent.mjs";

const HOW = "Implement the task yourself without pausing to ask.";

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `${reason} ${HOW}` },
  }));
}

function main() {
  let input;
  try {
    input = readStdinJson();
  } catch {
    return; // cannot tell which agent is called: not ours to judge
  }
  // Malformed input also lands here with no subagent_type; denying it would block every subagent.
  if (String(input?.tool_input?.subagent_type || "").trim() !== AGENT) return;
  try {
    const root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    if (!root) return deny(`${AGENT} is off: this is not an mflow project.`);
    if (!resolve(root).enabled) {
      return deny(`The apply subagent ${AGENT} is off in this project (it stays off until /mflow:subagent on).`);
    }
  } catch (err) {
    return deny(`${AGENT} is off: its setting in .mflow/local.json or .mflow/config.json could not be read (${String(err.message || err)}).`);
  }
}

main();
process.exitCode = 0;

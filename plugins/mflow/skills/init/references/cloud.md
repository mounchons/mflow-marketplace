# mflow on Claude Code on the web

Claude Code on the web (claude.ai/code) starts each session in a fresh machine with the repository cloned,
and installs no plugins: neither those installed on the user's machine nor those `.claude/settings.json`
names (https://code.claude.com/docs/en/cloud-environments.md, "What carries over from your setup"). What a
web session does load is what the repository holds under `.claude/`: its skills, agents, commands and the
hooks of `.claude/settings.json`.

So mflow goes into the repository as a copy, `.claude/skills/mflow/`, with its `.claude-plugin/plugin.json`.
On a machine, such a folder loads as the plugin itself (`mflow@skills-dir`, with its skills, agents and
hooks, `${CLAUDE_PLUGIN_ROOT}` pointing at it), and a machine with mflow installed keeps the installed one
and leaves the copy unloaded. **On the web this is not yet proven**: the docs do not say whether a plugin
folder under `.claude/skills/` loads there. The first web session is that test.

## What init does

- `vendor.mjs plan` lists the files of the copy (the skills, scripts, hooks, agents, packs, templates and
  `compat.json`; not the README); `vendor.mjs write` writes them and `.mflow-vendor.json` (the version and
  a hash per file). A `.claude/skills/mflow/` without that file is the project's own and is never touched.
- After every mflow upgrade, `/mflow:init` refreshes the copy; the session briefing and
  `/mflow:help check setup` say when it lags.
- mflow's own scans (discussion references, the doctor, review units, the Stop guard) leave the copy out,
  and a review leaves it out of the code it checks.

## What the user does

1. Commit `.claude/skills/mflow/` in a commit of its own and push it, so no change's review range holds it.
2. On claude.ai/code, make an environment for the repository:
   - **Network:** Trusted (the default) reaches npm, NuGet, the Ubuntu archive, GitHub and Docker Hub. The
     browsers Playwright downloads may need their host added (Custom) or Full.
   - **Setup script:** it runs as root on Ubuntu 24.04 before Claude Code starts, and is cached when it
     takes under about five minutes. Docker and docker compose are already there; the .NET SDK is not.
     A starting point (versions follow the project, such as `global.json` and `.nvmrc`; check each line in
     the first session before relying on it):

     ```bash
     #!/bin/bash
     set -e
     apt-get update
     # .NET, when the project uses it (not on the image): the Ubuntu packages, or Microsoft's dotnet-install.sh
     apt-get install -y dotnet-sdk-10.0
     # mflow's command-line tools
     npm i -g @fission-ai/openspec@1.13.2 backlog.md@1.53.0
     # E2E only: Playwright's browser, from the folder of the E2E tests
     # (cd tests/e2e && npm ci && npx playwright install --with-deps chromium)
     ```
3. In each web session, choose the **Auto** permission mode for long work: the web offers Accept edits,
   Plan and Auto, not bypass.
4. In the first web session, type `/mflow:help`. When it answers and the session started with an "mflow
   briefing", the copy loaded with its hooks. When it did not, the fallback is to ask the session to read
   `.claude/skills/mflow/skills/<command>/SKILL.md` and follow it, with `${CLAUDE_PLUGIN_ROOT}` standing for
   `.claude/skills/mflow`; the hooks (the briefing, the Stop guard, the browser cap) do not run then.

## Limits to plan around

- A web machine pauses after a few minutes without activity and can be reclaimed; a reclaimed one keeps
  only the conversation (https://code.claude.com/docs/en/claude-code-on-the-web.md, "Environment expired").
  Push what must not be lost: `/mflow:night` pushes after every commit on the web, and a run cut short goes
  on in a new session started on the branch it pushed, from the step its run file names.
- A foreground command waits 2 minutes by default and at most 10; the test parts of about 8 minutes that
  `/mflow:test` keeps fit.
- Containers a session starts are not cached: a compose stack is started in each session that needs it.
- Pushes may update any branch name but cannot delete a branch or push a tag. Protect the default branch
  with a GitHub ruleset when a session must not push to it.

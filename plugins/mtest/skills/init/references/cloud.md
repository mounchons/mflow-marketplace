# mtest on Claude Code on the web

Claude Code on the web (claude.ai/code) starts each session in a fresh container with the repository
checked out, and installs no plugins. A folder `.claude/skills/mtest/` that holds `.claude-plugin/plugin.json`
loads there as the plugin itself, with its skills and hooks, and `${CLAUDE_PLUGIN_ROOT}` points at that
folder. On a machine where mtest is installed, the installed plugin keeps the name and the copy is not
loaded a second time.

**Not yet proven on the web.** The route works locally; whether a web session loads a plugin folder from
the repository has not been tested yet. Treat the first web session as that test.

## What init does

- `vendor.mjs plan` shows the files of the copy; `vendor.mjs write` writes them and `.mtest-vendor.json`
  (the version and a hash per file). A `.claude/skills/mtest/` without that file is the project's own and
  is never touched.
- After every mtest upgrade, `vendor.mjs write` refreshes the copy; the session briefing and the doctor
  say when it lags.

## What the user does

1. Commit `.claude/skills/mtest/` with `.mtest/`, `mtest/`, AGENTS.md and CLAUDE.md, and push.
2. In the environment settings of claude.ai/code, give the environment a setup script that installs what
   the parts call. init prints one for the stack it found; it cannot set it itself. A starting point for
   .NET, Node and PostgreSQL on the Ubuntu image (versions follow the project: `global.json`, `.nvmrc`;
   check each line against the image before relying on it):

   ```bash
   #!/bin/bash
   set -e
   apt-get update
   apt-get install -y dotnet-sdk-10.0 postgresql
   service postgresql start
   su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
   # E2E only, when the user wants it on the web: browsers for Playwright
   # (cd tests/<Project>.E2E && npm ci && npx playwright install --with-deps chromium)
   ```

3. In the first web session, type `/mtest:help`. When it answers and the session started with an
   "mtest briefing", the copy loaded. When it did not, the fallback is to ask the session to read
   `.claude/skills/mtest/skills/<command>/SKILL.md` and follow it, reading `${CLAUDE_PLUGIN_ROOT}` as
   `.claude/skills/mtest`; tell the plugin's author what happened.

## Records from the web

Run records (`mtest/runs/`) and review reports (`mtest/reviews/`) are plain files: commit them with the
work, so the next session, on the web or on a machine, starts from them. Logs stay in `.mtest/logs/`,
which is not committed. A record made on the web names the commit it tested like any other, so a local
review can rely on it.

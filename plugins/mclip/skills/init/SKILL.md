---
name: init
description: Put the tutorial recorder in a web project — copy it to tools/TutorialRecorder, write the throwaway test stack it records on, the test users' secrets file, build it and install its browser, and the Thai voice-over when wanted. Rerun after a plugin upgrade to update the recorder's code.
disable-model-invocation: true
argument-hint: "[--update]"
---

Set this project up to record how-to clips. The recorder is a .NET console app (Microsoft.Playwright) that lives in the
project at `tools/TutorialRecorder/`; its README there is the reference for scenarios, actions, targets and options.
The recorder signs in, clicks and saves for real, so it only ever runs against a throwaway copy of the app with test
data: never point it at a copy that holds real data, and say so if the project gives no way to run one.

The user's answers are the customer's: act on them without asking again. `$ARGUMENTS` may hold `--update`.

## 1. Inventory (read only)

Look before asking. Find and report in one compact list:
- `tools/TutorialRecorder/.mclip-version`: a rerun. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs --project <root>`
  (it changes nothing without `--update`) and report what differs; with `--update` in the arguments go to step 3.
- `tools/TutorialRecorder/` without `.mclip-version` (a recorder copied by hand before mclip): when its `Program.cs`
  and `Overlay/overlay.js` are this recorder's, ask whether to adopt it; on yes write the stamp (`0.0.0`) and run the
  install with `--update`, which keeps its settings, secrets, stack and scenarios. Anything else there: stop and say so.
- How the app runs: `docker-compose*.yml` (services, ports, volumes, seed switches), `launchSettings.json`, `package.json`
  scripts, the README's run section. Which copy holds real data (a production or customer database, mounted folders of
  real files) and must never be the target.
- Test data: seed code or SQL, demo users and roles, fake providers for external services (mail, AI, payment).
- Sign-in: the login page's URL, its email / password / submit controls and their labels, and any `data-tour` /
  `data-testid` attributes already there.
- Tools: `dotnet --list-sdks` (the recorder targets net10.0), `ffmpeg -version`, `pwsh -v`, and for the voice-over
  Python 3.10+ (`py -0` on Windows).

Done when: the inventory is reported.

## 2. Ask, one question at a time

AskUserQuestion, one question per call, options `a)` `b)` `c)` with the recommended one first; put what the question
rests on in the question itself:
1. **The test stack**: a table of what `stack/reset.ps1` will do — how the copy starts (for Compose: its own project
   name, the override's port, seed switches, fake services, what is left unmounted), its URL, and the health path it
   waits for. a) as shown, b) change it.
2. **The test users**: one row per role the clips need (key such as `Admin`, which seeded user, its role). Their emails
   and passwords go only into the git-ignored `tutorial.secrets.json`, never into chat or a committed file. a) as shown.
3. **Thai voice-over** (a Python venv of about 260 MB): PyThaiTTS MakHam Paradee, female, on this machine with a model
   downloaded on first use; the same venv also speaks with a Google Gemini or ElevenLabs voice, chosen later on the
   plan's live page, which costs what that account is charged: a) yes, b) later.
4. **Codex and Google Antigravity**: mclip's skills for them too, in `.agents/skills/mclip-*` (both read that folder;
   Codex calls one `$mclip-plan`, Antigravity `/mclip-plan`) with a copy of what they run in `.agents/mclip/` (about
   400 KB, committed with the project so others get them): a) yes, b) no. Already there (`.agents/mclip/.mclip-agents`):
   no question, they are updated in step 3.

Done when: each question has an answer.

## 3. Install

1. `node ${CLAUDE_PLUGIN_ROOT}/scripts/install.mjs --project <root>` (add `--update` on a rerun). It refuses a
   `tools/TutorialRecorder` that mclip did not install; it never overwrites the settings, the secrets, the stack script
   or scenarios.
2. **Stack**: copy `stack/reset.example.ps1` to `stack/reset.ps1` and fill in its project name, URL and health path; for
   Compose write `stack/docker-compose.tutorial.yml` (test seed on, fake external services, real-data volumes
   overridden, the port bound to 127.0.0.1). Without Docker, write a `reset.ps1` that does the same three calls
   `stack/README.md` lists. Put the scenario example's `baseUrl` on that URL.
3. **Secrets**: `tutorial.secrets.json` from the example with the seeded test users (it is git-ignored by the
   recorder's `.gitignore`; check with `git check-ignore`). Do not echo the values.
4. **Build**: `dotnet build tools/TutorialRecorder`, then its browser:
   `pwsh tools/TutorialRecorder/bin/Debug/net10.0/playwright.ps1 install chromium` (about 450 MB; skipped when that
   Chromium build is already in the Playwright cache).
5. **Voice** (when 3a): `py -3.13 -m venv tools/TutorialRecorder/tts/.venv` (or any 3.10+), then
   `tools/TutorialRecorder/tts/.venv/Scripts/python -m pip install pythaitts==1.0.0 soundfile`. For an API voice, copy
   `tts/keys.example.json` to `tts/keys.json` (git-ignored: check with `git check-ignore`) and tell the user to put
   their `GEMINI_API_KEY` or `ELEVENLABS_API_KEY` in it themselves. Never ask for a key in chat, and never read, print
   or copy that file once it may hold one.
6. **Check**: `pwsh tools/TutorialRecorder/stack/reset.ps1 -Build` prints `ready: <url>`, and
   `dotnet run --project tools/TutorialRecorder -- scenarios/example.yaml --check` lists the example's steps.
7. **Codex and Antigravity** (when 4a, or already there): `node ${CLAUDE_PLUGIN_ROOT}/scripts/agent-skills.mjs write
   --root <root>`. It writes the skills and the copy, and never touches a skill folder of the user's own (`refused`
   says which). This needs the plugin itself: in Codex or Antigravity, tell the user to run it from Claude Code, or
   from a clone of the mflow-marketplace repository with `node <clone>/plugins/mclip/scripts/agent-skills.mjs write --root .`.

Done when: the stack answers and `--check` passes. Leave the stack up for `/mclip:record`.

## 4. Report

What was installed (version), the stack's URL and how to stop it (`reset.ps1 -Down`), where the secrets are, whether
the voice is ready, and the files to commit: `tools/TutorialRecorder/` (its `.gitignore` keeps `bin/`, `obj/`,
`Output/`, the venv, the secrets and `tts/keys.json` out) and `scenarios/`, and with 4a `.agents/skills/mclip-*` and
`.agents/mclip/` (how to call them: `$mclip-help` in Codex, `/mclip-help` in Antigravity). Do not commit unless the user asks. Next: `/mclip:record
<the flow to teach>`.

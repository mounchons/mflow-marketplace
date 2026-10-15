---
name: help
description: Which mreq command to use for the situation at hand, or a read-only check of the project's setup.
disable-model-invocation: true
argument-hint: "[describe your situation | check setup]"
---

If `$ARGUMENTS` describes a situation, recommend the one command that fits and the next one after it. Otherwise print the path and the table below. Invoke no other command yourself.

**The usual path.** Print it above the table when `$ARGUMENTS` is empty or asks where to begin. No step is required; any command can run when it is needed.
`/mreq:init` → `/mreq:discuss tech-stack` → `/mreq:discuss code-structure` → `/mreq:discuss nfr` → `/mreq:theme` → try the kit (`/mreq:theme open`) → `/mreq:theme approve` → `/mreq:discuss security-privacy` before the first handoff.

**Where things stand.** When `$ARGUMENTS` asks what to do next, read `mreq/project/STATUS.md`, `node "${CLAUDE_PLUGIN_ROOT}/scripts/discuss.mjs" list` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/theme-status.mjs" status`, then name one command: a draft discussion doc waiting for the user first, then the next not-started agenda topic before the kit, then the kit.

**Checking the setup.** When `$ARGUMENTS` asks to check the setup, says something is broken or missing, or follows an mreq upgrade, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`. It is read-only. Report every `fail` and `warn` with its `fix`, worst first, then the one command that fixes the most.

| Situation | Command |
|---|---|
| New repo, or first time using mreq here | `/mreq:init [display name]` |
| After an mreq upgrade, or something seems missing | `/mreq:help check setup`, then usually `/mreq:init` to take the changed templates |
| Agree the apps, frameworks, libraries, database and environments | `/mreq:discuss tech-stack [@files]` |
| Agree the project name in code, the app names and the folder layout (several web apps or APIs included) | `/mreq:discuss code-structure` |
| Agree the number of users, data volume, speed, backup, devices and languages | `/mreq:discuss nfr` |
| Agree login, SSO, MFA and personal data (PDPA) | `/mreq:discuss security-privacy` |
| Any other topic to settle with a document (roles, numbering, a workflow…) | `/mreq:discuss <topic> [@files]` |
| Which topics should be discussed? | `/mreq:discuss` shows the agenda; `/mreq:discuss agenda` builds or refreshes it |
| Skip a recommended topic | `/mreq:discuss agenda skip <slug> <reason>` |
| Replied inside a discussion doc, or want it changed | `/mreq:discuss <NN> [what to change]` |
| A discussion doc matches what you think | `/mreq:discuss <NN> approve` |
| Changed your mind after approving | `/mreq:discuss <same topic>`: a new doc that replaces the approved one |
| Build the UI kit (colors, fonts, menus, components, sample pages) | `/mreq:theme [brand notes \| @logo \| @CI-guide]` |
| Look at the kit in a browser | `/mreq:theme open` |
| The kit matches what you want | `/mreq:theme approve` |
| Change colors, fonts, a component, or add a shell for another kind of app (also after approval) | `/mreq:theme update <what to change>` |

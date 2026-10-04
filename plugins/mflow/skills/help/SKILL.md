---
name: help
description: Which mflow command to use for the situation at hand.
disable-model-invocation: true
argument-hint: "[describe your situation]"
---

If `$ARGUMENTS` describes a situation, recommend the one command that fits and the next one after it. Otherwise print this table. Invoke nothing yourself.

| Situation | Command |
|---|---|
| New repo, or first time using mflow here (it asks which stack first) | `/mflow:init` |
| Change the stack before `/mflow:theme` has built the kit | edit AGENTS.md `## Stack`, or rerun `/mflow:init` to be asked again |
| Customer sent a document or a new version (TOR, Excel, Word) | `/mflow:capture @file` |
| Check that Claude's understanding or design of a topic matches yours (roles, permissions, menus, data visibility…) before screens depend on it | `/mflow:discuss <topic> [@files]` |
| Replied inside a discussion doc, or want it changed | `/mflow:discuss <NN> [what to change]` |
| Design the tables, columns and data dictionary of one aggregate (after the screen inventory) | `/mflow:discuss <aggregate> data model [@files]` |
| Have other AI tools analyze a discussion doc too, then choose yourself | `/mflow:discuss <NN> consult [--to <tool>,…]` → run the commands → `/mflow:discuss <NN>` |
| A discussion doc matches what you think | `/mflow:discuss <NN> approve` |
| Before building any screen | `/mflow:theme` |
| Agree the look and the responsive menu before the app exists | `/mflow:theme preview` → approve → `/mflow:theme port` (inside the change that scaffolds the app) |
| Change colors, fonts or a shared component | `/mflow:theme update <what>` |
| The kit has no ☰ menu, or pages do not reflow on small windows (kits built before 0.11) | `/mflow:theme update responsive` |
| Which topics should be discussed before building? | `/mflow:discuss` shows the agenda; `/mflow:discuss agenda` builds or refreshes it |
| The kit lacks the pager, optional header search, date picker, Button, Card, Dialog, SidePanel, Alert, Tabs, Dropdown, Tooltip, Loading or DetailView (kits built before 0.14) | `/mflow:theme update components` |
| Change the date format (pattern or ค.ศ./พ.ศ.) or get the English and Thai date picker | `/mflow:theme update date-picker` |
| List the screens for a release | `/mflow:screen inventory` |
| Build or change a prototype screen | `/mflow:screen <name> <what>` |
| Just met the customer about the prototype | `/mflow:review-notes @notes` |
| A rule crosses screens or is costly if wrong | `/mflow:hotspot <idea> [@files]` |
| Continue working out a rule | `/mflow:hotspot <slug>` |
| Customer's spreadsheet should prove a rule | `/mflow:golden @file.xlsx <slug>` |
| Clear, small change to build | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` |
| Have apply hand its code changes to the Sonnet 5.5 subagent (`mflow:dev`, off by default), or stop it | `/mflow:subagent on` then `/clear` / `off` (`--shared` for the whole team, `status` to check); while on, skip it for one run by saying so in the `/opsx:apply` message |
| Customer asks for a change after approval | `/mflow:change-request <request>` |
| Hand work, analysis or review to another AI | `/mflow:delegate <id> --mode analyze/review/code [--to <tool>]` |
| Another AI's analysis or review came back | `/mflow:assess @docs/ai-inbox/<file>` |
| Check code before merging | `/mflow:review <branch>` |
| End of day, or switching to another tool | `/mflow:handoff [--for <tool>]` |

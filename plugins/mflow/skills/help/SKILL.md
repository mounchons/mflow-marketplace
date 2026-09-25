---
name: help
description: Which mflow command to use for the situation at hand.
disable-model-invocation: true
argument-hint: "[describe your situation]"
---

If `$ARGUMENTS` describes a situation, recommend the one command that fits and the next one after it. Otherwise print this table. Invoke nothing yourself.

| Situation | Command |
|---|---|
| New repo, or first time using mflow here | `/mflow:init` |
| Customer sent a document or a new version (TOR, Excel, Word) | `/mflow:source @file` |
| Before building any screen | `/mflow:theme` |
| Change colors, fonts or a shared component | `/mflow:theme update <what>` |
| List the screens for a release | `/mflow:screen inventory` |
| Build or change a prototype screen | `/mflow:screen <name> <what>` |
| Just met the customer about the prototype | `/mflow:review-notes @notes` |
| A rule crosses screens or is costly if wrong | `/mflow:hotspot <idea> [@files]` |
| Continue working out a rule | `/mflow:hotspot <slug>` |
| Customer's spreadsheet should prove a rule | `/mflow:golden @file.xlsx <slug>` |
| Clear, small change to build | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` |
| Customer asks for a change after approval | `/mflow:change-request <request>` |
| Hand work, analysis or review to another AI | `/mflow:delegate <id> --mode analyze/review/code [--to <tool>]` |
| Another AI's analysis or review came back | `/mflow:assess @docs/ai-inbox/<file>` |
| Check code before merging | `/mflow:review <branch>` |
| End of day, or switching to another tool | `/mflow:handoff [--for <tool>]` |

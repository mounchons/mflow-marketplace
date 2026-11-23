---
name: record
description: Record a how-to clip of a flow in the web app — write its scenario when there is none (proposing the data-tour attributes it needs, added once the user agrees), record it with real clicks, highlights, zoom and Thai captions or callouts, add the Thai voice-over, then check every page change in the video before reporting.
disable-model-invocation: true
argument-hint: "<lesson id from clips/plan.md | flow to teach | scenarios/<clip>.yaml> [caption|callout|both|clean] [voice]"
---

Make one clip. `$ARGUMENTS` names a lesson of the plan (`02-add-user`, from `clips/plan.md`, see `/mclip:plan`), the
flow in words (for example "a supervisor approves a leave request") or an existing `scenarios/<clip>.yaml`, and may add
a mode and `voice`. The recorder is `tools/TutorialRecorder/` (installed by
`/mclip:init`; without it, say so and stop); its README is the reference for the scenario format, actions, targets and
options. It records only on the throwaway test stack its scenario's `setup:` resets, never on a copy with real data.

The user's answers are the customer's: act on them without asking again.

## 1. The scenario

A lesson of the plan: its scenario is `clips/<id>/scenario.yaml`, and each recording becomes its next version.
- Its apps (`node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs check` lists them) must be one web app: mclip records web
  apps only. An iPhone or Android lesson, or one crossing two apps: say so and stop (the plan keeps its pictures). A
  plan without `## แอป` is one web app; its URL is the plan's `stack ทดสอบ` line, or ask for it once.
- No `clips/<id>/lesson.md` yet (a topic): say `/mclip:plan lesson <id>` writes it first, and stop.
- `scenario.yaml` there and older than `lesson.md`, or missing: write it from the lesson as in "A new one" below,
  with `clip: <id>`, the app's `url` as `baseUrl`, `setup: ../../tools/TutorialRecorder/stack/reset.ps1` (the setup
  runs in the scenario's folder), the lesson's title for the opening card, and per step its `ทำ` as the action and
  target, `บนจอ` as the caption and `พูด` as the narration. A scenario `/mclip:plan shots` wrote is updated, not
  replaced: keep its targets that worked and its `shot:` / `shotAt:` lines (recording ignores them).

An existing scenario: read it and go to step 2.

A new one:
1. Read the flow in the code: the pages or views it crosses, per role, and the controls a user touches on each (menu
   item, button, field, checkbox, dialog), with what each click opens or saves.
2. Propose, as one question (AskUserQuestion, a) recommended first): a table of the `data-tour` attributes to add (control, `file:line`, name such as
   `btn-add-user`, `field-email`, `nav-users`), reusing `data-tour` / `data-testid` already there; and the clip's steps
   in plain words (one line each: role, action, what the caption says). Options: a) as shown, b) change it.
3. Once agreed, add the attributes (attributes only, no other change to the UI) and write
   `scenarios/<clip>.yaml`, starting from `scenarios/example.yaml`:
   - An opening `title` (the introduction is spoken over the card) and a closing summary `title`.
   - An explicit `login` step for the first role, with a short line, so the sentence matches the typing.
   - Targets as `tour:<name>`; `role:` or `label:` only where no attribute fits.
   - Captions short and imperative (what to do on screen). Narration is spoken by a female voice: end sentences
     with ค่ะ, never ครับ. Values for test users come from secrets as `${users.<key>.<field>}`, never written out.
   - `zoom` on small targets, `waitFor` on what a click opens.
4. `dotnet run --project tools/TutorialRecorder -- <scenario> --check` passes (`<scenario>`: `clips/<id>/scenario.yaml`
   for a lesson, else `scenarios/<clip>.yaml`).

Done when: `--check` lists the steps.

## 2. Record

Run in the background (a clip takes a few minutes; the scenario's `setup:` resets the stack first):

```
dotnet run --project tools/TutorialRecorder -- <scenario> [--mode <mode>] [--voice]
```

Mode: the scenario's own unless the user named one (`caption` by default; `callout` for clips watched without sound;
`clean` for `/mclip:finish`, which lays captions and title cards in WeftCut). Add `--voice` when the user asked for it
or the scenario has narration and `tools/TutorialRecorder/tts/.venv` exists, with the same speed and words as the
plan's preview: `--speed <the plan's ความเร็วเสียง, else 0.85> --lexicon ${CLAUDE_PLUGIN_ROOT}/lexicon.txt` and, when
the project has one, `--lexicon clips/lexicon.txt` (later wins). A recorder older than 0.5.0
(`tools/TutorialRecorder/.mclip-version`) has no `--lexicon` and no pause after a sentence: `/mclip:init --update` first.

Exit 3 means a step could not find its target: read the message and `tools/TutorialRecorder/Output/<clip>/steps/failed-step-NN.png`, fix the
target (prefer a `data-tour` attribute), and run again. Exit 2 means the scenario or the stack setup is wrong.

Done when: the run prints `done:` with the mp4's length.

## 3. Check the video

`timing.json` lists every step with its `startMs` / `endMs`. For each step that changes the page or opens a dialog
(`login`, a `click` with `waitFor` or a `result`, the steps around a role change), take frames across the change with
ffmpeg and look at them:

```
ffmpeg -v error -ss <end-2s> -t 4 -i tools/TutorialRecorder/Output/<clip>.mp4 -vf "fps=2,scale=480:-1,tile=3x3" -frames:v 1 <scratch>/sheet-NN.jpg
```

(No `drawtext`: it needs fontconfig and crashes on Windows; frames run left to right, 0.5 s apart.) Check that:
- no highlight box, arrow or spotlight is left over the page or dialog that opened;
- the cursor reaches each target before its click;
- each caption or callout matches what is on screen, and Thai text renders whole (vowels and tone marks in place);
- with a voice, the run printed no warning of a sentence running past its step.

Fix in the scenario (a `waitFor`, a `holdMs`, a shorter line) and record again; at most three rounds, then report what
is still wrong.

## 4. A lesson's version

For a lesson of the plan, once the check passes, keep the recording as the lesson's next version, with the files the
run's `done:` line names:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs version <id> --mp4 <mp4> --srt <srt> --timing <timing.json> --mode <mode> [--voice] --recorder <version>
node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs page
```

`<version>` is the text in `tools/TutorialRecorder/.mclip-version` (for example `0.2.0`), not the file's path.
`clips/<id>/v<n>/` then holds the lesson, scenario, pictures, srt and timing (commit them) and `clip.mp4` (git-ignored).

## 5. Report

The files in `tools/TutorialRecorder/Output/`: `<clip>.mp4` (its length), `.srt`, `<clip>/review.html` (the video beside
its steps), with `--voice` the `<clip>-voice/` lines, in callout mode `<clip>/manual.md`. What the check found, the
`data-tour` attributes added (files), and what to commit (the scenario and those UI files; `Output/` is git-ignored).
Next: watch `review.html`, or `/mclip:finish <clip>` to finish it in WeftCut.

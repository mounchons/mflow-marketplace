---
name: record
description: Record a how-to clip of a flow in the web app — write its scenario when there is none (proposing the data-tour attributes it needs, added once the user agrees), record it with real clicks, highlights, zoom and Thai captions or callouts, add the Thai voice-over, then check every page change in the video before reporting.
disable-model-invocation: true
argument-hint: "<flow to teach | scenarios/<clip>.yaml> [caption|callout|both|clean] [voice]"
---

Make one clip. `$ARGUMENTS` names the flow in words (for example "a supervisor approves a leave request") or an
existing `scenarios/<clip>.yaml`, and may add a mode and `voice`. The recorder is `tools/TutorialRecorder/` (installed by
`/mclip:init`; without it, say so and stop); its README is the reference for the scenario format, actions, targets and
options. It records only on the throwaway test stack its scenario's `setup:` resets, never on a copy with real data.

The user's answers are the customer's: act on them without asking again.

## 1. The scenario

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
4. `dotnet run --project tools/TutorialRecorder -- scenarios/<clip>.yaml --check` passes.

Done when: `--check` lists the steps.

## 2. Record

Run in the background (a clip takes a few minutes; the scenario's `setup:` resets the stack first):

```
dotnet run --project tools/TutorialRecorder -- scenarios/<clip>.yaml [--mode <mode>] [--voice]
```

Mode: the scenario's own unless the user named one (`caption` by default; `callout` for clips watched without sound;
`clean` for `/mclip:finish`, which lays captions and title cards in WeftCut). Add `--voice` when the user asked for it
or the scenario has narration and `tools/TutorialRecorder/tts/.venv` exists.

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

## 4. Report

The files in `tools/TutorialRecorder/Output/`: `<clip>.mp4` (its length), `.srt`, `<clip>/review.html` (the video beside
its steps), with `--voice` the `<clip>-voice/` lines, in callout mode `<clip>/manual.md`. What the check found, the
`data-tour` attributes added (files), and what to commit (the scenario and those UI files; `Output/` is git-ignored).
Next: watch `review.html`, or `/mclip:finish <clip>` to finish it in WeftCut.

# TutorialRecorder

Records a how-to clip of the web app from a YAML script (scenario): real clicks and typing, highlight boxes, arrows,
spotlight, a simulated cursor (an orange arrow with a white rim, a yellow halo, fading ghost arrows behind it while it
moves, a double ripple on a click), smooth zoom, and captions or callouts. A step's boxes, arrows and spotlight go as
soon as its action runs, so none is left over the dialog or page that opens. Rerun it whenever the UI changes.

Installed by the mclip plugin (`/mclip:init`); `.mclip-version` names the plugin version it came from. Tested on one
React app with a Docker Compose stack, on Windows; other stacks and Linux/macOS are not tried yet.

Output (in `tools/TutorialRecorder/Output/`, git-ignored):

| File | What |
|---|---|
| `<clip>.mp4` | H.264 1920×1080, 30 fps (`<clip>.failed.mp4` when a step stopped the run) |
| `<clip>.srt` | subtitles from the captions / callouts and their times |
| `<clip>.timing.json` | every step: index, scenarioStep, caption, narration, startMs, endMs, holdMs, caption/callout/result spans, the target's box, zoom |
| `<clip>/review.html` | open in a browser: the video with subtitles beside the list of steps; click a step to jump there |
| `<clip>/steps/NN.png`, `<clip>/manual.md` | callout / both mode: a picture per callout and a manual from the same script |
| `<clip>/steps/failed-step-NN.png` | the screen when a step could not find its target |
| `<clip>.narration.txt` / `.narration.json` | every step's narration, one line each (the TTS input), and the step each line belongs to |
| `<clip>-voice/NNN.wav`, `manifest.json` | with `--voice`: each line spoken (PyThaiTTS, MakHam Paradee), with its length |

## Install (once)

```powershell
# .NET 10 SDK and ffmpeg on PATH (ffmpeg -version)
dotnet build tools/TutorialRecorder
pwsh tools/TutorialRecorder/bin/Debug/net10.0/playwright.ps1 install chromium
Copy-Item tools/TutorialRecorder/tutorial.secrets.example.json tools/TutorialRecorder/tutorial.secrets.json   # then fill it
# for --voice (Thai voice-over): Python 3.10+, a venv beside the TTS script; the model (Apache-2.0) downloads on first use
py -3.13 -m venv tools/TutorialRecorder/tts/.venv
tools/TutorialRecorder/tts/.venv/Scripts/python -m pip install pythaitts==1.0.0 soundfile
```

`tutorial.secrets.json` is git-ignored. Each role in a scenario names a `userKey`; its `email` and `password` come from
that file or from environment variables `TUTORIAL_<KEY>_EMAIL` / `TUTORIAL_<KEY>_PASSWORD` (which win). Other values
are read in a step's `value` as `${users.<key>.<field>}`, so no password is written in a scenario.

## Record

Record only on a throwaway copy of the app with test data, never on one that holds real data. `stack/` holds the
script that recreates it (see `stack/README.md`; `/mclip:init` writes it for the project):

```powershell
pwsh tools/TutorialRecorder/stack/reset.ps1 -Build   # first time, or after the app changed: rebuild the images
dotnet run --project tools/TutorialRecorder -- scenarios/my-clip.yaml
pwsh tools/TutorialRecorder/stack/reset.ps1 -Down    # remove the stack and its volumes when done
```

A scenario's `setup:` runs `reset.ps1` before every recording (fresh database), so a rerun gives the same clip.

`--mode clean` records the screen, the cursor, the highlights and the zoom only: no caption bar, no callouts and no title
cards (the page stays behind a title step for its time). Every step is timed as in caption mode and its caption still
goes to the `.srt`, so the voice-over fits and an editor such as WeftCut lays the captions and title cards over the video
(`import_media` the `.mp4` and `.srt`, then `apply_subtitles`).

Options: `--check` (validate the scenario and list its steps, no browser), `--mode caption|callout|both|clean` (overrides the
scenario; its files are then named `<clip>-<mode>.*`, so both recordings are kept), `--voice` (see below),
`--speed 0.85` (voice speed, 0.7–1.0), `--headed` (watch the browser), `--no-setup`, `--no-shots`, `--keep-webm`,
`--secrets <file>`, `--durations <file.json>` (`{"3": 4200}` sets step 3's reading time by hand).

### Voice-over (`--voice`)

```powershell
dotnet run --project tools/TutorialRecorder -- scenarios/my-clip.yaml --voice
dotnet run --project tools/TutorialRecorder -- scenarios/my-clip.yaml --mode callout --voice
```

Each step's `narration` is spoken by PyThaiTTS (`tts/tts_paradee.py`, voice MakHam Paradee, female, speed 0.85) into
`Output/<clip>-voice/`; it is spoken again only when a narration or the speed changed. Every narrated step then holds
as long as its sentence (+ `voiceTailMs`, 300 ms) before acting, and the sentence is mixed into the mp4 (AAC) where
the step's caption appears; `timing.json` gives each step's `audio` span, and the run warns when a sentence runs past
its step or into the next one. The voice is female: write narration with ค่ะ, not ครับ. Put the introduction on an opening `title`
card and a short line on the explicit `login` step, so each sentence matches what is on screen.

The TTS script works on its own too:
`tts/.venv/Scripts/python tts/tts_paradee.py --input lines.txt --out out_dir --speed 0.85 [--mp3] [--merge]`
(one sentence per line, `#` lines skipped; writes `001.wav` …, `manifest.json`, and with `--merge` `merged.wav`).

Exit codes: 0 done, 2 the scenario or its setup is wrong, 3 a step failed (partial clip, screenshot, message naming the
step and its target).

### Reference pictures (`--shots`)

```powershell
dotnet run --project tools/TutorialRecorder -- clips/02-add-user/scenario.yaml --shots
dotnet run --project tools/TutorialRecorder -- clips/02-add-user/scenario.yaml --shots --only screen/03-save.jpg
```

Walks the steps as fast as the page allows (no reading time, no cursor travel, no typing delay, no video, no captions)
and writes the picture each step's `shot:` names, at 1920×1080 into the scenario's folder: `shotAt: before` (default)
with the target marked and the cursor on it, `after` once the action has settled (no cursor). `--only` takes the named
pictures and stops after the last of them. `shots.json` beside the scenario lists the pictures the recorder made and
the step it stopped at; a picture already there that it did not make is the user's own and is kept, unless `--only`
names it. The last recording in `Output/` is left alone; a failed step's screenshot goes to `Output/<clip>-shots/`.

## Write a scenario

```yaml
clip: add-user                   # file names: a-z, 0-9, '-'
title: เพิ่มผู้ใช้ใหม่และกำหนดสิทธิ์
baseUrl: http://localhost:5080   # the throwaway test copy of the app
mode: caption                    # caption (default) | callout | both | clean
setup: ../tools/TutorialRecorder/stack/reset.ps1   # run from the scenario's folder before recording
roles:
  admin:   { userKey: Admin,   label: ผู้ดูแลระบบ }
  newUser: { userKey: NewUser, label: ผู้ใช้ใหม่ }
login:                           # how to sign in (these are the defaults)
  url: /login
  email: "label:อีเมล"
  password: "label:รหัสผ่าน"
  submit: "role:button|เข้าสู่ระบบ"
  caption: "เข้าสู่ระบบในฐานะ{role}"
steps:
  - role: admin                  # a new role signs out (cookies and storage cleared) and signs in, on screen
    action: click
    target: "role:button|เพิ่มผู้ใช้"
    highlight: box               # box | arrow | spotlight | none
    zoom: 1.6                    # zoom in before this step (stays until zoom-out)
    caption: "กดปุ่ม 'เพิ่มผู้ใช้'"  # caption bar at the bottom (caption / both)
    narration: "กดปุ่มเพิ่มผู้ใช้ที่มุมขวาบน"   # for the TTS round; shown in review.html
    callout: "กดปุ่มนี้เพื่อเพิ่มผู้ใช้ใหม่"      # bubble at the target (callout / both; callout mode uses caption when absent)
    result:                      # after the action, a green bubble (callout / both)
      target: "role:dialog"      # optional; the same target when absent
      text: "ระบบเปิดฟอร์มให้กรอกข้อมูล"
    placement: auto              # auto | top | bottom | left | right
    waitFor: "role:dialog"       # wait for this after the action (on top of the network settling)
    holdMs: 3000                 # optional: reading time instead of the computed one
    shot: screen/03-add-user.jpg # --shots: the lesson's reference picture of this step (screen/<name>.jpg or .png)
    shotAt: before               # before (default, target marked) | after (once the action settled)
  - action: zoom-out
```

### Actions

| action | needs | does |
|---|---|---|
| `navigate` | `url` | goes to the URL (relative to baseUrl), then shows the caption |
| `click` | `target` | moves the cursor there, ripple, clicks |
| `fill` | `target`, `value` | types letter by letter (`fast: true` fills at once) |
| `select` | `target`, `value` | picks the option with that label in a native `<select>` |
| `check` / `uncheck` | `target` | clicks and waits until the box is (un)ticked, also when the server ticks it |
| `upload` | `target` (the file input), `files` | sets the files (paths relative to the scenario); points at the input's parent |
| `press` | `key`, `target` optional | presses a key (e.g. `Enter`) |
| `wait` | `target` optional, `value` ms optional | shows the caption (and highlight) for the reading time |
| `title` | `caption` (the title), `subtitle` optional, `url` optional | a full-screen title card for an opening, a section or a summary; before any sign-in it opens the sign-in page behind the card, so the opening narration is spoken over the card, not over the typing |
| `zoom` | `target`, `zoom` | zooms to the target, no action |
| `zoom-out` | | back to 100% |
| `login` / `logout` | `role` for login | sign in on screen / sign out (a role change does both by itself) |

### Targets

| form | finds |
|---|---|
| `tour:btn-add-user` | `[data-tour="btn-add-user"]`: preferred, survives text and CSS changes |
| `testid:approve-button` | `[data-testid="approve-button"]` |
| `label:อีเมล` | the field labelled exactly so |
| `label~:^รหัสผ่านใหม่อย่าง` | the field whose label matches a regex (for a label that holds a hint too) |
| `role:button\|เพิ่มผู้ใช้` | a role with that accessible name (exact); `role:dialog` alone for any |
| `text:ผู้ใช้และสิทธิ์` | exact visible text |
| `placeholder:...` | by placeholder |
| anything else | a Playwright selector as is |

Join parts with ` >> ` to look inside the previous one: `role:dialog >> label:ชื่อที่แสดง`.

### Reading time

Caption mode holds a step `max(captionMinMs, characters × captionMsPerChar)` (1.5 s, 80 ms); callout mode
`max(calloutMinMs, characters × calloutMsPerChar)` (2 s, 90 ms). These and the zoom, cursor and typing speeds are in
`tutorial.settings.json`.

## How it works

- Chromium through Microsoft.Playwright, viewport 1920×1080 at device scale 2, recorded by Playwright's video
  (`RecordVideoSize` 1920×1080), converted by ffmpeg to H.264 with the blank lead-in cut.
- `Overlay/overlay.js` is added to every document (`AddInitScript`); nothing in it takes a click (`pointer-events: none`).
- Zoom is a CSS transform on `<html>` (translate + scale), so the app's shell and its dialogs (fixed elements) zoom
  with the page; the overlay root carries the inverse transform and keeps drawing in screen pixels. Playwright clicks
  through the transform (it reads the element's transformed box and hit-tests the point), so the page stays zoomed
  while the action runs; there is no need to zoom back to 100% before a click.
- Times are taken from the moment the page (and the video) starts and moved to the trimmed mp4.

## Finishing in WeftCut (optional)

`--mode clean` (above) gives a video without captions or title cards; `/mclip:finish` lays the `.srt` and the title
cards over it in the WeftCut editor, where they stay editable. WeftCut's captions are white text with a thin outline and
no backing box, harder to read over a light page than this recorder's caption bar: keep caption mode for clips that
must read well as they are.

## Later (designed for, not built)

- Highlights drawn in WeftCut from `timing.json` (each step's box and zoom) instead of in the page.
- Several clips: run each file in `scenarios/` in turn (one browser at a time).

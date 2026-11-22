---
name: finish
description: Finish a recorded clip in the WeftCut video editor — take the clean recording (no captions drawn), lay its captions from the .srt and its title cards as editable layers in a WeftCut project, check the composition and the frames, and export the mp4 when asked.
disable-model-invocation: true
argument-hint: "<clip> [export]"
---

Finish clip `$ARGUMENTS` in WeftCut, where its captions and title cards stay editable without recording again. Needs the
WeftCut desktop app and its MCP server (`weftcut_status`; when it is not running, `launch_weftcut`; when the tools are
missing, say WeftCut's MCP is not connected and stop). Read WeftCut's own skill first (`read_project` view `skill`, or
`skill://weftcut/SKILL.md`) and follow it for sessions, tacks and checks; this skill adds only what is particular to
mclip's clips.

The user's answers are the customer's: act on them without asking again.

Say once, before building: WeftCut's captions are white text with a thin outline and no backing box, harder to read
over a light page than the recorder's caption bar. For a clip that must read well as it is, the recorder's caption
mode (`/mclip:record`) is the better choice; WeftCut is for clips whose words or titles will be edited.

## 1. The clean recording

`tools/TutorialRecorder/Output/<clip>-clean.mp4` and `.srt` and `.timing.json` (or `<clip>.*` when the scenario's own
mode is `clean`). Missing or older than the scenario: record it with `/mclip:record`'s steps 2 and 3 in `clean` mode,
with `--voice` when the scenario has narration and the venv exists. Copy the mp4 and srt to a scratch name per take
(`<clip>-clean-<n>.mp4`): WeftCut pools media by content, and a rerecorded file under the same name is easy to confuse.

## 2. The project

The project open in WeftCut (`project://session`) when it is this clip's; otherwise ask once where to create it, a)
`tools/TutorialRecorder/Output/<clip>-weftcut/` (git-ignored), recommended, b) another folder, and `create_project`
there at 1920×1080, 30 fps.

## 3. Build (inside a work session)

`begin_agent_session`, then:
1. `import_media` the mp4, the srt and `${CLAUDE_PLUGIN_ROOT}/templates/weftcut/card-plate.svg` (the title card's
   background; WeftCut 0.8.1 rasterises it to 2048×1152).
2. The mp4 on the A-roll track from 0 to its length, `audio: linked` (the voice-over is in it).
3. `apply_subtitles` the srt; then delete the caption cues that cover a `title` step (`timing.json`: action `title`).
4. For each `title` step, over its span (on the frame grid): the plate image (`graphic_role: plate`, x 960, y 540,
   scale 0.9375); a text layer with the step's `caption` (`graphic_role: title`); one with its `subtitle`
   (`graphic_role: lower_third`). Then `update_layer_params`: title `align Left`, `anchor_x 0`, `anchor_y 0.5`, x 160,
   y 525, `box_w 1600`, weight 700, 76 px, `outline_width 0`, `shadow null`; subtitle the same at y 622, weight 500,
   34 px, colour #DBE5FF, intro `FadeIn`. `font_family`: a Thai face the machine has (Leelawadee UI on Windows; the
   recorder's own order is Noto Sans Thai, Sarabun, Leelawadee UI). WeftCut 0.8.1 echoes the font fields as null in its
   answer: look at a rendered frame instead.
5. `check_composition`. Long Thai captions trip `caption-cue-max` and `caption-line-length` (a step's caption stays up
   for the whole step, and Thai vowel and tone marks count as characters): leave one tack over their range saying so,
   rather than splitting the cues away from the voice. The title layers' `token-drift` is meant (they match the
   recorder's cards).
6. `render_frames` the middle of each title card and three or four caption cues at 1920 wide: Thai renders whole, the
   card matches the recorder's, the captions can be read over the page.
7. `end_agent_session`.

## 4. Export and report

Export only when the user asked (`export` in the arguments or later): `start_export`, then `get_export_status` with a
wait, and report the output path. Report the project's folder, what was placed (cues, title cards with their times),
the tacks left, and what the frames showed.

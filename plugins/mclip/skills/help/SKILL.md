---
name: help
description: List the mclip commands with where the project's clips stand (lessons by status, pictures and voice still missing, the recorder's version) and the next command to run, or check that this machine and project have everything mclip needs.
disable-model-invocation: true
argument-hint: "[check setup]"
---

Read only: change no file. Answer in the user's language.

## No argument

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs" check` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`.
`check` exits 2 with no `clips/plan.md` and 1 when the plan has problems; both are answers, not errors.

Three short parts:

1. **Where it stands:** the lessons per status (หัวข้อ = topic, ร่าง = draft, พร้อมอัด = ready, อัดแล้ว = recorded,
   ต้องอัดใหม่ = changed), with the ids of those that need something; per lesson the pictures still missing
   (`pictures` − `picturesThere`) and the steps without a current voice (`spoken` − `voiced`); the plan's problems,
   if any; the recorder's version against the plugin's and any `fail` from the doctor (one line, `check setup` for
   the rest). No plan: say so in one line.
2. **The commands:**

| Command | What it does |
|---|---|
| `/mclip:init` | Puts the recorder in the project (`tools/TutorialRecorder`), writes the throwaway test stack it records on and the test users' secrets file, builds it, installs its Chromium and, when wanted, the Thai voice; `--update` after a plugin upgrade |
| `/mclip:plan` | Reads the project's apps (web, iPhone, Android), e2e tests, tests and code and drafts the topics in `clips/plan.md`; builds the plan page `clips/index.html` (slides, left menu, ✎ แก้ buttons) |
| `/mclip:plan lesson <id>\|all` | Writes a topic's steps, words on screen, narration and picture names in `clips/<id>/lesson.md` |
| `/mclip:plan shots <id>\|all [ขั้น <n>]` | The AI takes a web lesson's reference pictures in the test stack, the whole lesson or one step; the user's own pictures are kept |
| `/mclip:plan voice <id>\|all [ขั้น <n>]` | Speaks the narration in the Thai voice to listen to on the plan page (▶ ฟังทั้งบท); only changed lines are spoken again |
| `/mclip:plan shots voice <id>` | Both |
| `/mclip:plan serve` | The live plan page (127.0.0.1): edit a step's narration and hear it at once, make a lesson's voice, set the speed and the project's words (`clips/lexicon.txt`) |
| `/mclip:plan edit ...` | Applies the requests copied from the plan page (✎ แก้, ถ่ายรูป, สร้างเสียง) |
| `/mclip:record <id>\|<flow>` | Records a lesson (or a flow in words) as a video with clicks, highlights, zoom, Thai captions and voice, checks the frames, and keeps it as the lesson's next version `clips/<id>/v<n>/` |
| `/mclip:finish <clip>` | Lays captions and title cards over the clean video in WeftCut, as layers that stay editable |
| `/mclip:manual [pdf]` | Exports the user manual from the lessons and their pictures: `clips/manual/manual.md`, `.docx` (Word) and with `pdf` a `.pdf` (made by Microsoft Word) |
| `/mclip:help` | This list; `check setup` checks the machine and the project |

3. **The next command**, with one line on why, the first that applies: a doctor `fail` → `/mclip:help check setup`;
   no recorder, or one older than the plugin → `/mclip:init` (`--update`); no plan → `/mclip:plan`; plan problems →
   `/mclip:plan` (the page lists them); topics → `/mclip:plan lesson all`; a web lesson with pictures missing or a
   lesson without voice → `/mclip:plan shots voice <id>`; a ready or changed lesson → `/mclip:record <id>`; lessons with
   their pictures and no manual yet (`clips/manual/manual.md` missing or older than a lesson) → `/mclip:manual pdf`;
   else open `clips/index.html`.

## `check setup`

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"` and report each `fail` and `warn` with its `fix` as a command to
copy, then the `ok` ones in one line. `fail` stops recording (Node, Git, .NET SDK 10, PowerShell 7, ffmpeg); `warn` is
what one step needs (Chromium, the recorder, its secrets or stack, the Thai voice, the plan). Add one more line:
WeftCut, for `/mclip:finish` only, is ready when this session has the WeftCut tools (`mcp__weftcut__weftcut_status`
answers); otherwise install the WeftCut app and connect its MCP server (`/mcp` shows it).

On a new machine the order is: the `fail` fixes (on Windows each is one `winget install` line; open a new terminal
after), then `/mclip:init` in the project, which builds the recorder and installs Chromium and the voice.

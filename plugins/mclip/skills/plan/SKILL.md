---
name: plan
description: Plan a project's how-to clips before any recording — read the project's apps (web, iPhone, Android), their e2e tests, tests and code, and draft the teaching topics in clips/plan.md; write a topic's steps, on-screen words, narration and reference pictures in clips/<id>/lesson.md; take a web lesson's reference pictures in the test stack and speak its narration to listen to, per lesson or per step; apply edit requests pasted from the plan page; and build clips/index.html, the plan as slides with a left menu and edit buttons.
disable-model-invocation: true
argument-hint: "[scan | lesson <id>|all | shots|voice|shots voice <id>|all [ขั้น <n>] | serve | edit <requests pasted from the page>]"
---

Plan the project's clips in `clips/`, the folder of the project's own repository that the clips are taught from. The
format is in the header of `${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs`. Every run ends by building the page:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs page --open
```

It writes `clips/index.html` (git-ignored with `*.mp4` and `voice/` by `clips/.gitignore`, whose missing lines it adds) and exits 1 when
the plan files have problems: the page still shows them, on its last slide; fix them before reporting.

The user's answers are the customer's: act on them without asking again.

`$ARGUMENTS`:
- empty: no `clips/plan.md` yet: **1. Draft the topics**. With a plan: build the page and report each lesson's status.
- `scan`: **1. Draft the topics** again, adding what the project gained since (new apps, flows, tests); keep every
  entry already in the plan, its number and its lesson.
- `lesson <id>` or `lesson all`: **2. Write a lesson** (`all`: every entry still a topic).
- `shots <id> [ขั้น <n>]`: **4. Take the reference pictures** of a lesson, or of one step (`all`: every web lesson).
- `voice <id> [ขั้น <n>]`: **5. Speak the narration** of a lesson, or of one step (`all`: every lesson).
- `shots voice <id> [ขั้น <n>]`: both, pictures first.
- `serve`: **6. The live page**, where the user edits narration and hears it at once, sets the speed and the words.
- `edit ...`: **3. Apply edit requests**.

A topic named by `shots` or `voice` has no steps yet: write its lesson first (**2**), then go on.

## 1. Draft the topics

The contents first, the steps later: agreeing on what to teach is cheaper than rewriting lessons.

1. **The apps.** Find each app the users touch, by its manifest:
   - web: `package.json` with a UI framework (react, vue, angular, svelte, next, nuxt, vite), a `.csproj` with
     `Microsoft.NET.Sdk.Web` and Razor pages, views or Blazor components, or another server that renders pages;
   - iPhone: `*.xcodeproj` / `*.xcworkspace`, an `ios/` folder of React Native or Flutter, a MAUI `-ios` target;
   - Android: `build.gradle(.kts)` with `com.android.application`, `AndroidManifest.xml`, an `android/` folder of
     React Native or Flutter, a MAUI `-android` target.
   One codebase that builds both phones (React Native, Flutter, MAUI) is one app, `- ชนิด: ios, android`: its lessons
   are written once, with a picture per phone. Separate iPhone and Android apps are two apps; a task the same in both
   is still one topic naming both (`- แอป: ios-app, android-app`), its pictures one per phone. An API with no screens is not an app; its rules still feed the topics.
   Note each app's code, unit and integration tests, e2e folder and, for a web, the URL of its test stack.
   Several apps, or one you are unsure of: ask once (AskUserQuestion) which go in the plan, a) all of them
   (recommended), b) only some (say which).
2. **The flows, per app, from three sources in this order.** Read them; never run e2e tests or a browser for this.
   - e2e tests (Playwright, Cypress, Selenium, Maestro `.yaml` flows, Detox, XCUITest `*UITests`, Espresso or
     UIAutomator `androidTest`, Appium, Flutter `integration_test`): each test that walks a user through a task is a
     candidate topic, and its steps the lesson's steps later.
   - unit and integration tests: the rules a user meets (who may do what, required fields, limits, error messages),
     which become notes and words in the lessons.
   - code: the routes, pages or screens, the navigation menu, and the role or permission checks. A feature reached from
     the menu but covered by no e2e test is still a topic; its `ที่มา` says so.
3. **The topics.** One topic is one task a user sets out to do, one to three minutes. Per app, in the order a user
   learns it: signing in and finding the way, the daily tasks, then settings and administration. A task that crosses
   apps (the client sends from the portal, the office approves in the back office) is one topic naming both apps.
   Number them `01`, `02`, ... across the whole plan, not per app.
4. **Write `clips/plan.md`** (`scan`: add to it, keeping what is there):

   ```
   # <system> — <what the clips teach>

   - ระบบ: <one line on the system>
   - ผู้ชม: <who watches, per app>
   - เป้าหมาย: <what a viewer can do afterwards>
   - ขอบเขต: <what is taught>
   - ไม่รวม: <what is left out, and why when it is not obvious>
   - รูปแบบ: <caption or callout, voice, 1920×1080, length per lesson>
   - stack ทดสอบ: <where recordings run; never a copy with real data>

   ## แอป

   ### web-admin — <the app's name for its users>
   - ชนิด: web
   - โค้ด: <folder>
   - เทสต์: <folder>
   - e2e: <folder>
   - url: <the test stack's URL>

   ## สารบัญ

   1. 01-sign-in — <topic title>
      - แอป: web-admin
      - สอน: <one line: what the viewer can do after it>
      - ที่มา: <the e2e test, tests and code it came from>
   ```

   A project with a single app may leave out `## แอป` and every `- แอป:` line. Write no `lesson.md` yet: an entry
   without one is shown as a topic (หัวข้อ).
5. Build the page and report: the apps found (kind, folder), the topics per app, which came from an e2e test and which
   from the code alone, and what was left out. Next: read the page, press ✎ แก้ on whatever should change and paste the
   copied `/mclip:plan edit ...` here; when the topics are right, `/mclip:plan lesson all`.

## 2. Write a lesson

For each topic named (`all`: each without `lesson.md`), read its `ที่มา` files and the screens they reach, then write
`clips/<id>/lesson.md`:

```
# <title>

- บทบาท: <the role the viewer plays>
- ก่อนเริ่ม: <what is done beforehand, e.g. signed in (lesson 01)>
- ข้อมูลที่ใช้: <test data; never a real person's>

## 1. <step title>
- ทำ: <what is done on screen, for the recording>
- บนจอ: <short and imperative: what the viewer does>
- พูด: <the narration; a female voice, so sentences end with ค่ะ, never ครับ>
- รูป: screen/01-<words>.jpg
- หมายเหตุ: <a rule or a warning from the tests, when there is one>
- คู่มือ: <optional: the step explained for the user manual, one to three sentences, when บนจอ is too short for it>
```

- One step is one thing the viewer does or sees change. `ทำ` and `บนจอ` are required on every step.
- Pictures are named in the order of the steps. A lesson of an app built for both phones names one per phone:
  `screen/01-<words>-ios.jpg` and `screen/01-<words>-android.jpg`; the page shows them side by side, with a switch.
- Test users and passwords are never written out: name the role (ผู้ดูแลสำนักงาน), not the account.

Reference pictures: for a lesson of one web app, the AI takes them (**4**); the user may drop their own into
`clips/<id>/screen/` under the names in the lesson instead, and those are kept. mclip records and photographs web apps
only; for iPhone and Android this plan and the user's pictures are what there is, and the page says so on those
lessons. A picture not there yet shows as an empty frame.

Build the page; report the lessons written (steps each) and the pictures still missing. Next:
`/mclip:plan shots voice <id>` to see and hear the lesson before recording.

## 3. Apply edit requests

`$ARGUMENTS` is what the page copied: `edit (หน้าแผนสร้างเมื่อ <time> UTC)` and one line per request,
`- <target> ("<the words now>"): <the request>`. Targets: `plan` (the whole plan), `plan <field>`, `plan สารบัญ`,
`plan แอป <key>`, `plan คำอ่าน` (the words the voice says wrong), `<id>` (a lesson or topic), `<id> ขั้น <n>` (one step).

1. Read the files the targets name. A file changed since the page was built (its time is later): read it as it is now,
   and when a request's quoted words are no longer there, apply it to the nearest text and say so in the report.
2. Apply each request to the files: `plan.md` for the plan, its apps and its contents; `<id>/lesson.md` for a lesson.
   - `ถ่ายรูปอ้างอิงใหม่` (the page's ถ่ายรูป button) on `<id>` or `<id> ขั้น <n>`: **4** for that lesson or step;
     `สร้างเสียงให้ฟัง` (สร้างเสียง): **5**. Do them after the other requests, so the pictures and voice show the
     edited lesson.
   - `plan คำอ่าน`: add or change `<written> = <spoken>` lines in `clips/lexicon.txt` (this project's words). A word
     every project shares belongs in the plugin's `lexicon.txt` (in the mflow-marketplace repository; it reaches
     projects with the next mclip release): say so, and put it in `clips/lexicon.txt` meanwhile.
   - `plan ความเร็วเสียง`: the plan's `- ความเร็วเสียง: <0.70 to 1.00>` line.
   - Renumbering or reordering the contents renames each moved lesson's folder (`git mv` when tracked); never reuse
     the number of a lesson that has versions (`v1/`, ...).
   - Removing a lesson that has versions: ask first (AskUserQuestion), a) remove it from the contents and keep its
     folder (recommended), b) delete the folder too.
   - A request that needs a choice the user did not make (two ways to read it): ask that one, with the reading you
     recommend first.
3. Build the page; report each request with what was changed (file and line), or why it was not.

A lesson changed after it was recorded shows as ต้องอัดใหม่ until `/mclip:record` records its next version. A step
whose voice no longer fits it (its `พูด`, the speed or a word it uses changed) shows ต้องสร้างใหม่ with the reason:
offer `/mclip:plan voice <id>`, which speaks only those steps.

## 4. Take the reference pictures

The recorder (`tools/TutorialRecorder`, installed by `/mclip:init`) walks the lesson in the test stack and photographs
each picture the lesson names, at 1920×1080: before an action with its target marked and the cursor on it, or once the
action has settled. No video, no voice; a lesson takes seconds.

1. **Can it be photographed.** One web app (`clips.mjs check` lists the lesson's apps), on the test stack (the app's
   `url`, or the plan's `stack ทดสอบ`), never a copy with real data. An iPhone or Android lesson, or one crossing two
   apps: say its pictures are the user's and skip it. No recorder, or `tools/TutorialRecorder/.mclip-version` older
   than 0.3.0 (no `--shots`): say `/mclip:init` installs or updates it, and stop.
2. **The scenario.** `clips/<id>/scenario.yaml`, missing or older than `lesson.md`: write it as
   `${CLAUDE_PLUGIN_ROOT}/skills/record/SKILL.md` section 1 says (the flow read in the code, targets that exist,
   `data-tour` attributes proposed first when none fits). On the scenario step that shows each picture of the lesson,
   put `shot: <the picture's name from the lesson's รูป line>`, and `shotAt: after` when the picture shows what the
   action opened or saved (a dialog, a saved row) rather than what to press. Every picture of the lesson is on one
   step; a picture of a phone (`-ios`, `-android`) is not. `--check` passes.
3. **Take them**, in the background (the scenario's `setup:` resets the stack first):

   ```
   dotnet run --project tools/TutorialRecorder -- clips/<id>/scenario.yaml --shots [--only screen/03-x.jpg,screen/03-y.jpg]
   ```

   A whole lesson: no `--only`. One step: `--only` its pictures (the run still walks the steps before it, and stops
   after it). Which pictures are replaced: the recorder's own from an earlier run always; one the user put there
   (not in `clips/<id>/shots.json`) only when `--only` names it, so a whole-lesson run keeps the user's pictures and
   lists them as kept. Exit 3: a target was not found; the step and its screenshot (`Output/<id>-shots/`) are in the
   message and on the page; fix the scenario and run again.
4. **Look at every picture written** (read the files): it shows what the step's `บนจอ` says, on the right screen,
   with the marked target the one to press, and no test password in a field. Fix the scenario and take that step
   again; at most two rounds, then report what is still wrong. A target inside a native modal `<dialog>` shows no box
   and no cursor (the browser draws the dialog above the recorder's marks): not a scenario fault, say so and go on.
5. Build the page; a picture of the lesson still empty after a run with no failure is a `shot:` name that does not
   match its `รูป:` line: fix it. Report the pictures written and kept per lesson, and what to commit
   (`scenario.yaml`, `screen/`, `shots.json`, and any `data-tour` attributes added).

## 5. Speak the narration

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs voice <id> [--step <n>]
```

Each step's `พูด` line, in the recorder's Thai voice (PyThaiTTS, a female voice), becomes `clips/<id>/voice/NN.mp3`
(NN = the step), recorded in `voice/voice.json`; the page plays it under the step, and ▶ ฟังทั้งบท plays the lesson's
steps one after another.
- **Speed**: the plan's `- ความเร็วเสียง:` (0.70 slow to 1.00 normal), else 0.85.
- **Words the voice says wrong**: `<written> = <spoken>` rules, the plugin's `lexicon.txt` (every project) then the
  project's `clips/lexicon.txt` (wins for the same word); only what is spoken changes, never captions or the manual.
- **Sentences**: a line is spoken sentence by sentence, cut after a closing particle (ค่ะ, คะ, ครับ, ...) followed by a
  space, with a pause between them and silence after the last word, so no particle is run into what follows.
- A step is spoken again only when its words, the speed, a rule it uses or the voice itself changed (`--force`: anyway);
  a whole-lesson run removes the audio of steps that no longer speak.

It needs the recorder's voice (`tools/TutorialRecorder/tts/.venv`): exit 2 names how to set it up. `voice/` is
git-ignored: it is a preview to listen to; `/mclip:record ... voice` speaks the scenario's narration again, with the
same speed and words.

Build the page; report the steps spoken (seconds each). A word the user says is read wrong: add it to
`clips/lexicon.txt` (spelled as it is said, in Thai letters) and speak again.

## 6. The live page

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs --open
```

Run it in the background: it prints `{"url": ...}` and serves until stopped. Give the user the URL (it carries the
page's token: it is the only way in) and say what the page does there: each step's narration in a box with บันทึกคำพูด
and บันทึกและสร้างเสียง (the voice is made at once and plays on the page), สร้างเสียงทั้งบทตอนนี้ on a lesson, and on
ขอบเขตและรูปแบบ the speed and the project's words. It listens on 127.0.0.1 only and writes only the narration lines,
the speed line, `clips/lexicon.txt` and the voice. Stop it when the user is done (or says so), and report the lessons
whose narration changed: their scenarios and recordings follow at the next `/mclip:record`.

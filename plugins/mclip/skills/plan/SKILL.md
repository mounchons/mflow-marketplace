---
name: plan
description: Plan a project's how-to clips before any recording — read the project's apps (web, iPhone, Android), their e2e tests, tests and code, and draft the teaching topics in clips/plan.md; write a topic's steps, on-screen words, narration and reference pictures in clips/<id>/lesson.md; apply edit requests pasted from the plan page; and build clips/index.html, the plan as slides with a left menu and edit buttons.
disable-model-invocation: true
argument-hint: "[scan | lesson <id>|all | edit <requests pasted from the page>]"
---

Plan the project's clips in `clips/`, the folder of the project's own repository that the clips are taught from. The
format is in the header of `${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs`. Every run ends by building the page:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs page --open
```

It writes `clips/index.html` (git-ignored, with `*.mp4`, by the `clips/.gitignore` it writes once) and exits 1 when
the plan files have problems: the page still shows them, on its last slide; fix them before reporting.

The user's answers are the customer's: act on them without asking again.

`$ARGUMENTS`:
- empty: no `clips/plan.md` yet: **1. Draft the topics**. With a plan: build the page and report each lesson's status.
- `scan`: **1. Draft the topics** again, adding what the project gained since (new apps, flows, tests); keep every
  entry already in the plan, its number and its lesson.
- `lesson <id>` or `lesson all`: **2. Write a lesson** (`all`: every entry still a topic).
- `edit ...`: **3. Apply edit requests**.

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
```

- One step is one thing the viewer does or sees change. `ทำ` and `บนจอ` are required on every step.
- Pictures are named in the order of the steps. A lesson of an app built for both phones names one per phone:
  `screen/01-<words>-ios.jpg` and `screen/01-<words>-android.jpg`; the page shows them side by side, with a switch.
- Test users and passwords are never written out: name the role (ผู้ดูแลสำนักงาน), not the account.

Reference pictures: the user's own, dropped into `clips/<id>/screen/` under the names in the lesson. mclip records
web apps only (`/mclip:record`); for iPhone and Android this plan and the user's pictures are what there is, and the
page says so on those lessons. A picture not there yet shows as an empty frame.

Build the page; report the lessons written (steps each) and the pictures still missing.

## 3. Apply edit requests

`$ARGUMENTS` is what the page copied: `edit (หน้าแผนสร้างเมื่อ <time> UTC)` and one line per request,
`- <target> ("<the words now>"): <the request>`. Targets: `plan` (the whole plan), `plan <field>`, `plan สารบัญ`,
`plan แอป <key>`, `<id>` (a lesson or topic), `<id> ขั้น <n>` (one step).

1. Read the files the targets name. A file changed since the page was built (its time is later): read it as it is now,
   and when a request's quoted words are no longer there, apply it to the nearest text and say so in the report.
2. Apply each request to the files: `plan.md` for the plan, its apps and its contents; `<id>/lesson.md` for a lesson.
   - Renumbering or reordering the contents renames each moved lesson's folder (`git mv` when tracked); never reuse
     the number of a lesson that has versions (`v1/`, ...).
   - Removing a lesson that has versions: ask first (AskUserQuestion), a) remove it from the contents and keep its
     folder (recommended), b) delete the folder too.
   - A request that needs a choice the user did not make (two ways to read it): ask that one, with the reading you
     recommend first.
3. Build the page; report each request with what was changed (file and line), or why it was not.

A lesson changed after it was recorded shows as ต้องอัดใหม่ until `/mclip:record` records its next version.

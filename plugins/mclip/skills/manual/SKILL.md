---
name: manual
description: Export the project's user manual from the clip plan — one chapter per lesson with its steps, the reference pictures and the notes — as clips/manual/manual.md, manual.docx (Word, Thai font, cover, contents, header, page numbers) and, with pdf, manual.pdf; then look at every page before reporting.
disable-model-invocation: true
argument-hint: "[pdf]"
---

The manual is built from the plan itself, `clips/plan.md` and each `clips/<id>/lesson.md` with its pictures, so the
manual and the clips never tell two stories: to change the manual, change the lessons (`/mclip:plan edit ...`), then
build it again. Never edit `manual.md` or the `.docx` by hand; they are rebuilt.

The user's answers are the customer's: act on them without asking again.

## 1. Before building

`node ${CLAUDE_PLUGIN_ROOT}/scripts/clips.mjs check` (exit 2: no plan, say `/mclip:plan` comes first, stop):
- Topics (no `lesson.md`) are left out of the manual: name them; `/mclip:plan lesson <id>` writes them.
- Pictures still missing (`pictures` − `picturesThere`): name the lessons. For a web lesson offer
  `/mclip:plan shots <id>` first; the user may build without them (the step then has no figure).
- Each step's manual text is its `- คู่มือ:` line, else its `- บนจอ:` line (short, written for the clip). When most
  steps only have a few words on screen, offer to write `คู่มือ:` lines: one to three sentences per step, telling the
  reader what to do, where, and what they see after it, from the code and the pictures (the field names and the
  rules a user meets). Write them as `/mclip:plan` writes lessons (polite Thai, the reader as คุณ, names of buttons
  and menus exactly as on screen; no test values, no URLs of the test stack, no class or table names).

## 2. Build

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/manual.mjs [--pdf]
```

`--pdf` when `$ARGUMENTS` says pdf. It writes `clips/manual/manual.md`, `manual.docx` and with `--pdf` `manual.pdf`.
The PDF is made by Microsoft Word (Windows), which also fills in the contents' page numbers in the `.docx`; without
Word it exits 2 with the `.md` and `.docx` written: say so, and that opening the `.docx` in Word or LibreOffice and
saving it as PDF gives the same (accept the prompt to update fields, or press F9 on the contents).

The output lists `skipped` topics, `missing` pictures and the plan's `problems`.

## 3. Look at the pages (with a PDF)

Render them small, into the session's scratch folder, and look at every page:

```
pdftoppm -r 50 -png clips/manual/manual.pdf <scratch>/page
```

Check: the cover; the contents has page numbers; Thai text is whole (vowels and tone marks in place, no boxes);
every figure is whole and its step's heading is on the same page; tables fit the page. A full-screen picture at page
width shows small text: when a step's point is a small control, say which steps would read better with a closer
picture. No `pdftoppm`: say the pages were not looked at.

## 4. Report

The files and the page count, the chapters, the topics left out, the pictures missing, what the page check found,
and what to commit: `clips/manual/manual.md` (the `.docx` and `.pdf` are git-ignored; send them as files).

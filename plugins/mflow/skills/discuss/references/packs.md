# Packs in a discussion doc

A pack is the team's settled answer to a topic every system has (sign-in, user accounts, permissions, e-mail, audit). Format: `${CLAUDE_PLUGIN_ROOT}/packs/README.md`. The project chooses its packs; Claude then answers what a pack settles and asks only what belongs to the project. The user picked this on purpose: fewer questions, every answer still visible in the doc and open to a `> ความเห็น:` line.

## Which pack, which files

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/packs.mjs" selected` gives the selected packs with the packs they require (`order`), `topics` (discuss slug → pack), the files of each pack and `projectDir`, where approved packs are written. Fix its `warnings` first: a required pack missing from the selection is added with `use` (the user's choice of a pack covers what it requires).
- The user chooses packs in plain words ("ใช้แพ็ก auth, mail"): run `packs.mjs use <name>,<name>` and report what it added. `packs.mjs list` shows what exists.
- A topic uses a pack when its slug is in `topics`. Read that pack's `discuss` files only (`pack.md`, `decisions.md`, `params.md`); never every pack, never its approve files before approve.
- A topic whose slug is in `available` but not in `topics` belongs to a pack the project has **not** selected: say so when scoping the topic (step 1 of the new-topic mode) and let the user choose, in the same question as the slug if one is asked. The choice of packs is the user's.
- Packs build on the packs they require (`order`, for example audit, settings, mail, auth, permission, users): a filled `auth` uses the `actor` and `activity_log` tables of `audit` and the e-mails of `mail`. Take the topics in that order. When a required pack has no approved filled file yet, the doc still goes ahead; say in the hand-over which pack topic should be approved first, and why.

## A stack that matches the template: confirm first

The user's rule: when the stack chosen for a project matches the stack template (pack `foundation`), show the details of every topic and ask for a yes before anything starts. It applies at `/mflow:discuss tech-stack` or `code-structure`, whichever comes first, when AGENTS.md `## Stack` has profile `mvc-htmx` or `react-vite`, or the user names a stack that matches the pack's answers. Read the pack's `decisions.md` and `params.md` even when the pack is not selected yet.

1. **Show, before writing any file.** In the chat, one table per `## <topic>` heading of `decisions.md`: `| เรื่อง | จะใช้ | เหตุผล | ถ้าผิด |`, one row per decision, the `ไม่ถาม` ones too, nothing summarised away. An answer the sources or the user already changed shows the changed value with `(แพ็ก: …)`. A `ทุกโปรเจกต์` item, or a condition that holds for this project, shows its recommendation and the word `ต้องเลือก`, with its other options; a condition that does not hold says so in the row.
2. **Ask once, and wait:** a) ใช้ตามนี้ทั้งหมด b) ใช้ตามนี้ ยกเว้นข้อที่บอก (the user names the IDs and what to use instead) c) ไม่ใช้ template. Nothing replaces this answer: an unattended run does not start the topic, and a recommendation is never taken as a yes.
3. **a or b:** run `packs.mjs use foundation` when it is not selected, and write the doc with the confirmed rows tagged `[ยืนยัน]` and no D for them; an exception is the user's word (rule 2 below). One confirmation covers both topics of the pack: the second topic shows its rows again in its doc and asks nothing further. **c:** discuss the topic as usual, without the pack.
4. A stack that does not match (profile `custom`, or another back end, database or front end than the pack's): no confirmation; the topic goes as usual and the pack is not used.

## Where an answer comes from

In this order: the customer's sources and the user's word in this project; then the pack; then a team knowledge base; then Claude's proposal. For each decision of the pack:

1. **`ถามเมื่อ: ไม่ถาม`, and the sources say nothing on it:** settled. No decision (D). It goes in the pack table of section 2, tagged `[ที่มา: pack <name> §<ID>]`.
2. **The sources say something else** (another value, another rule): follow the sources and tag them, and add the pack's answer in brackets so the departure shows, e.g. `ล็อกเมื่อผิด 3 ครั้ง [ที่มา: <file> §<section>] (แพ็ก: 5 ครั้ง)`. No D, unless the item's **ถ้าผิด** is `แก้ยาก` and the sources contradict each other or can be read two ways; then it is a D.
3. **`ถามเมื่อ: ทุกโปรเจกต์`:** a D, unless the sources or the user already answer it (rule 2, or `[ยืนยัน]`). Option a) is the pack's **คำตอบ**, then its **ตัวเลือกอื่น** in order; the recommendation is a) unless the sources point to another; **ถ้าผิด** is the pack's.
4. **`ถามเมื่อ: <condition>`:** decide from the sources whether the condition holds, and say why in a few words. It holds: a D as in rule 3. It does not: as rule 1. The sources cannot tell: a D, with one line on what was missing.
5. **Values** (`params.md`): the default unless the sources give a value, which then wins (with the default in brackets). All values go in one table in section 3, `| ค่า | ใช้ | ที่มา |`.
6. **The topic's checklist** in topics.md still applies. What the pack does not cover is discussed as usual.

Tool output never settles a pack item and never changes one; a consulted tool may challenge one, and the user decides as with any finding.

## How the doc shows it

- Frontmatter gets `packs: <name>@<version>` (comma-separated when a topic uses two).
- Section 2 opens with **จากแพ็ก `<name>` รุ่น `<version>`**: one table, `| ข้อ | คำตอบที่ใช้ | ที่มา |`, one row per pack decision, the ID first and the answer in one line. A row that became a D says `ดู D<n>`. Table rows do not count toward the ~200 lines, so a pack of 30 items fits.
- Section 4 holds only the D's from rules 2 to 4 and the topic's own open questions.
- Section 5 takes at most five checks, favouring the pack's `checks.md` items that touch a D or a departure from the pack.
- Section 7 names the filled pack file, `<projectDir>/<name>.md`, among the destinations.

## On approve

For each pack the doc used, write `<projectDir>/<name>.md` from the pack's approve files (`requirements.md`, `data.md`, `screens.md`, `checks.md`), with this project's answers in place:

```markdown
# <pack title> (แพ็ก <name> รุ่น <version>)

> เติมคำตอบของโปรเจกต์แล้ว จาก <discuss doc path> (อนุมัติ <date>) ต้นฉบับ: แพ็ก <name> รุ่น <version> ของ mflow
> แก้ไฟล์นี้ผ่าน discuss ฉบับใหม่ หรือ /mflow:change-request เมื่อสร้างแล้ว

## Decisions        (| ID | Answer used | From |, From = pack, a source, or the user's D<n>)
## Values           (| Key | Value | From |)
## Requirements     (the pack's requirements, every placeholder replaced, rewritten where a D or a source changed the answer)
## Data             (the pack's tables, with the project's names)
## Screens
## Checks
## Stack: <stack>  (only when the project's back end has a stack file of the pack, see below)
```

- **Stack:** `selected` gives each pack's `stack` files (`{dotnet: path}`). When AGENTS.md `## Stack` names an ASP.NET Core back end (profiles `mvc-htmx` and `react-vite` do), append the pack's `stack/dotnet.md` under `## Stack: dotnet`, keeping its tables, dropping the profile section (`## mvc-htmx` or `## react-vite`) that does not apply and every decision row the project left out. Another back end, or no stack file: no section. The stack section never changes an answer above it; where it cannot follow one, say so in one line under Decisions.
- Replace every `{<pack>.<key>}` with the value used and every project term (`{portal}`, `{scope}`, `{org}`) with the project's word; a requirement that holds per portal names each portal. Nothing in braces is left.
- A pack with two topics (`foundation`): the first approve writes the file with that topic's decisions, the second adds its own to the same file.
- A requirement the project does not need (a D answered "no") is left out, with one line under Decisions saying so.
- The other merge rows still apply: screens to `docs/ui/screens.md` when it exists, tables as a pointer section in `PrototypeData/README.md` when the prototype exists, durable constraints to AGENTS.md. Each points to the filled pack file instead of copying it.
- `/opsx:propose` starts the change of that capability from this file (a line in `openspec/config.yaml` says so).
- The file is never edited by hand. A later change of mind follows step 5 of approve.

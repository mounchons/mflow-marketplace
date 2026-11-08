# Packs

A pack is the team's standard answer to a topic that every system has: sign-in, user accounts, permissions, e-mail, audit, system settings, API conventions, file upload, the web shell, the stack and code structure, background jobs, Excel import and export, external integrations. It holds the decisions already settled, the requirement text, the data dictionary, the screens and the checks, so `/mflow:discuss` answers what the pack settles and asks the user only what belongs to the project. A pack is documents only: no code. Its seven files hold no stack, except `foundation`, whose subject is the stack; an optional stack layer (below) says how to build it on one back end. Design: `docs/mflow-pack-proposal.md` in the marketplace repo.

A project chooses its packs in `.mflow/config.json` (`"packs": [...]`, written by `node scripts/packs.mjs use <name>,…`). How discuss applies them: `skills/discuss/references/packs.md`.

## Files

One folder per pack, `packs/<name>/`, seven files. The first three are what `/mflow:discuss` reads; the last four are merged into the project's filled pack file when a discuss doc that used the pack is approved.

| File | Language | Holds |
|---|---|---|
| `pack.md` | Thai body | frontmatter, what the pack covers, what it leaves out |
| `decisions.md` | Thai | the settled decisions, one `### <ID>:` block each |
| `params.md` | Thai | the default values and their ranges, one table |
| `requirements.md` | English | OpenSpec requirements with scenarios, placeholders in braces |
| `data.md` | English | the data dictionary: one table per stored table |
| `screens.md` | Thai | the screens the pack needs, one table |
| `checks.md` | Thai | what to try in use, numbered; each becomes a test or an acceptance criterion |

### pack.md

```markdown
---
name: auth
version: 1
title: เข้าสู่ระบบ รหัสผ่าน เซสชัน และ OTP
prefix: AUTH
requires: [audit, mail]
topics: [sign-in]
origin: StemHub 2026-11
---

## ครอบคลุม
## ไม่รวม
```

- `name` is the folder name, ASCII kebab-case. `prefix` is the decision ID prefix, upper case.
- `requires` lists packs that must be selected with this one; the graph has no cycle.
- `topics` are the discuss slugs that use this pack. A slug belongs to one pack only.
- `version` is a whole number. Raise it when a decision's answer, a default value or a requirement changes; a project keeps the version its approved doc used.

### decisions.md

```markdown
### AUTH-D01: ใช้อะไรเป็นชื่อเข้าระบบ
- **คำตอบ:** อีเมล ส่วนชื่อผู้ใช้เก็บไว้เป็นชื่อที่แสดง
- **เหตุผล:** อีเมลใช้ส่ง OTP ลิงก์ตั้งรหัส และแจ้งเตือนได้ในตัว
- **ถ้าผิด:** แก้ยาก — คีย์ค้นบัญชี หน้า sign-in และอีเมลเชิญเปลี่ยนทั้งหมด
- **ถามเมื่อ:** เอกสารลูกค้าระบุชื่อผู้ใช้ หรือมีผู้ใช้กลุ่มที่ไม่มีอีเมล
- **ตัวเลือกอื่น:** b) ชื่อผู้ใช้ c) อีเมลหรือชื่อผู้ใช้ก็ได้
```

- IDs are `<prefix>-D<two digits>`, unique within the pack, never reused once released.
- **คำตอบ** is the team's answer. **ถ้าผิด** starts with `แก้ยาก —` or `แก้ทีหลังได้ —`, as in discuss docs.
- **ถามเมื่อ** is either `ไม่ถาม` (a team standard that the customer's documents may still override), `ทุกโปรเจกต์` (the answer is only the recommendation; the project must choose), or a condition the customer's documents or the project make true or false.
- **ตัวเลือกอื่น** is required unless **ถามเมื่อ** is `ไม่ถาม`: it gives the options a discuss doc offers when the item becomes a decision, the pack's answer being option a).

### params.md

One table: `| ค่า | key | เริ่มต้น | ช่วง | หมายเหตุ |`. A `key` is `<pack>.<name>` in snake_case after the dot, used by requirements as `{auth.lock_failures}`. A value the customer's documents state replaces the default.

### requirements.md

OpenSpec spec text: `### Requirement: <name>` with SHALL statements, and at least one `#### Scenario:` with `- **WHEN**` / `- **THEN**` lines under each. Placeholders in braces: a parameter key (`{auth.lock_minutes}`) or a project term the pack names in `pack.md` (`{portal}`, `{scope}`). Each requirement names the decisions it rests on in brackets at its end, e.g. `(AUTH-D01, AUTH-D04)`.

### data.md

One `## <table>` per stored table, then `| Column | Type | Rule |`. Types are neutral (`text`, `int`, `bigint`, `bool`, `timestamptz`, `uuid`, `jsonb`); the stack chooses the real ones.

## Stack layer

`stack/<stack>.md` (English, optional) says how the pack is built on one back end: which framework feature carries each decision and what has to be written by hand. It is guidance for `/opsx:propose` and apply, not code to paste. Known stacks: `dotnet` (ASP.NET Core back end: profiles `mvc-htmx` and `react-vite`, and a `custom` profile that names it, which keeps the section that fits its kind of web). discuss never reads it; approve appends it to the filled pack file when the project's back end matches (`skills/discuss/references/packs.md`).

```markdown
---
pack: auth
stack: dotnet
---

# auth on ASP.NET Core
## Building blocks          (| Concern | Use | Note |)
## Decision by decision     (| Decision | .NET | Write yourself |, required)
## mvc-htmx                 (only where the profile differs)
## react-vite
## Pitfalls
```

- `pack` is the folder name and `stack` the file name; another file in `stack/` is refused.
- Decision IDs must be of the pack or a pack it requires. Name packages and APIs exactly, checked against the vendor's documentation or a project the team built; mark the rest `(unverified)`.
- A stack file changes no decision. When the stack cannot follow a decision, the decision changes (a new pack version), not the stack file.

## Content rules

A pack is published with the plugin, in a public repository, and serves any customer. `packs.mjs check` refuses, in the seven files and the stack files:

- customer and project names (the `origin` line excepted), customer document IDs (`DR001`, `NFR-SEC-01`, SRS, SDS, UAT case IDs), project decision and task numbers (`decision-12`, `TASK-34`), numbered templates (`#14`);
- IP addresses, e-mail addresses other than `example.com` and `example.org`, and personal names or nicknames;
- a decision without its five lines, an ID outside the prefix, a `requires` that names a missing pack or makes a cycle, a topic claimed by two packs, a requirement without a scenario.

Write the team's answer, not one project's history: no "until screen X exists", no "for now", no change names. A value one customer asked for is a default in `params.md`, not a rule.

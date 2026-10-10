# mflow

Workflow สำหรับทำระบบโดยให้ AI ช่วย dev: ทำหน้าจอก่อน → จับโลจิกใหญ่ (hotspot) ให้ชัด → แปลงเป็น OpenSpec change → สร้างทีละ slice โดยมี test เป็นหลักฐาน และมีชั้นความจำ (AGENTS.md + STATUS.md + OpenSpec + Backlog.md) ให้ Claude Code และ Codex อ่านเหมือนกันทุก session

## ใครใช้ และใครตัดสินใจ

ผู้ใช้ mflow คือคนที่ต้องการทำระบบ เช่น SA, PM หรือเจ้าของระบบ

- **คำตอบหรือคำสั่งของคุณคือคำสั่งของลูกค้าโดยตรง** Claude ทำต่อได้ทันที ไม่ต้องรอถามลูกค้าอีก และคำสั่งให้ทำคือการอนุมัติเรื่องนั้นแล้ว
- **ทำก่อน ทดสอบใช้งาน แล้วจึงปรับเพิ่ม** (หลักเดียวกับที่ใช้กับ OpenSpec) ข้อที่ยังไม่แน่ใจก็ตอบไปก่อนได้ แล้วดูตอนทดสอบ สิ่งที่ต้องแก้หลังทดสอบกลายเป็นเอกสาร discuss ฉบับใหม่ หรือ OpenSpec change ถัดไป
- ข้อยกเว้นเดียว: ความเห็นของ AI ตัวอื่นไม่มีน้ำหนักแบบนี้ ถ้าขัดกับเอกสารลูกค้า Claude คงข้อความจากเอกสารไว้

## ติดตั้ง

ต้องมี Node 20+ และ git (แนะนำ Node 22 หรือ 24: Node 20 หมดระยะซัพพอร์ตเมื่อ 30 เมษายน 2026 แต่ยังใช้ได้และอยู่ใน CI) ตรวจเครื่องและโปรเจกต์ได้ด้วย `/mflow:help check setup` ซึ่งรัน doctor แบบอ่านอย่างเดียว

```bash
npm i -g @fission-ai/openspec@latest backlog.md

# ทดลองแบบไม่ติดตั้ง (โหลดจากโฟลเดอร์)
claude --plugin-dir ./mflow-marketplace/plugins/mflow

# หรือเพิ่มเป็น marketplace แล้วติดตั้ง (ใน Claude Code)
/plugin marketplace add mounchons/mflow-marketplace   # หรือ path ของโฟลเดอร์ในเครื่อง
/plugin install mflow@mflow-marketplace
```

แนะนำให้ติดตั้งคู่กัน (ไม่บังคับ): `/plugin install frontend-design@claude-plugins-official` ถ้ามี `/mflow:theme` จะใช้ช่วยกำหนดหน้าตาของ kit (สี ฟอนต์ ความแน่น รูปทรง) ให้เป็นแบบ back-office สมัยใหม่ที่ทำมาเพื่อลูกค้ารายนั้น และ `/mflow:screen` ใช้ช่วยจัดวางข้อมูลและถ้อยคำบนหน้าจอ ถ้าไม่ได้ติดตั้ง (หรือใช้ Codex) mflow ทำตามขั้นตอนเดียวกันจาก `skills/theme/references/visual-direction.md`

ตรวจความถูกต้องหลังแก้ไฟล์: `claude plugin validate ./plugins/mflow`

## คำสั่ง (v0.21)

ไม่แน่ใจว่าใช้คำสั่งไหน: `/mflow:help <สถานการณ์>` ทุกคำสั่งจบด้วยสรุปว่าอะไรเปลี่ยน กับคำสั่งถัดไปหนึ่งคำสั่ง (เขียนลงส่วน Now ของ STATUS.md ด้วย)

| กลุ่ม | คำสั่ง | ทำอะไร |
|---|---|---|
| ตั้งต้น | `/mflow:init [ชื่อ]` | ตั้งค่า repo ครั้งแรก: ถามเลือก stack ก่อน, ต่อ OpenSpec + Backlog.md, สร้าง `docs/decisions/discuss/AGENDA.md` (มี `tech-stack` และ `code-structure` นำหน้า), คัดแยกเอกสารเดิม |
| เอกสารลูกค้า | `/mflow:capture [@ไฟล์] [--replaces @เก่า]` | ลงทะเบียน/คัดแยกเอกสาร อ่านเฉพาะไฟล์ใหม่หรือเปลี่ยน, ฉบับเก่าเป็น superseded, เพิ่มหัวข้อที่ควร discuss ลง AGENDA.md |
| ยืนยันความเข้าใจ | `/mflow:discuss <หัวข้อ> [@ไฟล์]` | เขียนความเข้าใจ/แบบที่เสนอ (สิทธิ์, เมนู, การมองเห็นข้อมูล, ตาราง/column/data dictionary …) เป็น `docs/decisions/discuss/NN-<slug>.md` ให้คุณอ่าน พร้อมแผนภาพ Mermaid, wireframe หรือภาพหน้าจอจริง |
| | `/mflow:discuss <NN> consult [--to <tool>,…]` | ให้ AI ตัวอื่น (Codex, OpenCode, Gemini, chat) ช่วยวิเคราะห์เอกสารเดียวกัน ได้ brief + คำสั่งที่คุณรันเอง |
| | `/mflow:discuss <NN> [สิ่งที่อยากแก้]` / `<NN> approve` | รวมความเห็นของทุก AI + ปรับตามที่คุณตอบจนตรงกัน → อนุมัติแล้วนำแต่ละข้อไปรวมกับ flow หลัก |
| | `/mflow:discuss tech-stack` / `code-structure` | สองหัวข้อแรกของทุกโปรเจกต์ (ก่อน `/mflow:theme`): แยก web / API / mobile, framework, library ที่เป็น open source และตรวจ licence แล้ว, PostgreSQL + EF Core, Docker, ตัวเสริมที่ใส่ภายหลัง (Redis, queue) และโครง solution แยก layer ตามมาตรฐานของทีม (อ่านจาก knowledge base เช่น Graph Brain ถ้าเชื่อมไว้) |
| | `/mflow:discuss agenda [skip <slug> <เหตุผล>]` | สร้างหรือเรียง `docs/decisions/discuss/AGENDA.md` ใหม่: หัวข้อที่ควร discuss พร้อมเหตุผล ที่มา และควรคุยก่อนขั้นไหน (capture และ screen inventory เพิ่มให้เอง สถานะอัปเดตเอง) เป็นคำแนะนำ ไม่บังคับ |
| หน้าจอ | `/mflow:theme [แบรนด์]` / `update <อะไร>` | tokens, layout แบบ responsive (เมนูเต็ม/ไอคอน/drawer ที่เปิดด้วย ☰), components (ตารางแบ่งหน้าที่ server พร้อม pager ‹ 1 … 4 5 6 … 20 ›, header search เปิดเฉพาะคอลัมน์ที่ต้องการ, คอลัมน์ไอคอนที่เทียบกันระหว่างแถว, `QuickView` ดูรายละเอียดใน Dialog หรือ SidePanel โดยไม่เปลี่ยนหน้า, DatePicker ปฏิทินอังกฤษ/ไทยที่ตั้ง format ได้, Button, Card, Dialog, SidePanel, Alert, Tabs, Dropdown …), หน้าตาแบบ back-office สมัยใหม่ (ใช้ skill `frontend-design` ถ้าติดตั้งไว้), หน้า style guide, กฎ UI สำหรับ agent; `update look` ทำหน้าตาใหม่, `update responsive` สำหรับ kit ก่อน 0.11, `update components` สำหรับ kit ก่อน 0.14 และก่อน 0.21 |
| | `/mflow:theme preview` / `port` | ทำ kit เป็น static preview (HTML/CSS/JS) ใน `docs/ui/theme/` ให้อนุมัติก่อนมีโค้ดแอป แล้ว `port` เข้า stack จริงและ freeze preview ไว้เป็นหลักฐาน |
| | `/mflow:screen inventory` | รายการหน้าจอจาก story map → `docs/ui/screens.md` |
| | `/mflow:screen <ชื่อ> <สิ่งที่ต้องการ>` | สร้าง/ปรับหน้าจอจาก kit + ข้อมูล JSON กลาง รายการเปิดรายละเอียดของแถวใน `QuickView` (Dialog หรือ SidePanel) โดยไม่เปลี่ยนหน้า |
| | `/mflow:review-notes @โน้ต` | คัดแยกผลทดสอบหรือรีวิว + สรุปสิ่งที่ตกลง (+ ร่างอีเมลแจ้งผู้เกี่ยวข้องถ้าต้องการ) |
| โลจิก | `/mflow:hotspot [<ไอเดีย> \| <slug> [TASK-ID [คำตอบ]]]` | chart และแก้กฎใหญ่ทีละตั๋ว → graduate เป็น OpenSpec change จบแต่ละตั๋วบอก readiness bar ตั๋วถัดไป และคำสั่งถัดไป ตั๋ว `ask` ตอบในคำสั่งได้ |
| | `/mflow:golden @xlsx <slug>` | Excel จริงของลูกค้า → golden data + unit test ตาม stack (xUnit สำหรับ .NET) |
| ขอบเขต | `/mflow:change-request <คำขอ>` | จัดประเภท defect / clarification / new scope, ประเมินและบันทึกผลกระทบ แล้วทำต่อเมื่อคุณสั่ง (ร่างตอบลูกค้าเมื่อขอ) |
| หลาย AI | `/mflow:delegate <id> --mode analyze/review/code [--to <tool>]` | สร้าง brief ให้ AI ตัวอื่น + คำสั่ง PowerShell/Bash จากทะเบียน tool |
| | `/mflow:analyze <system \| "หัวข้อ" \| @ไฟล์> [--focus …] [--to …]` | (ไม่บังคับ) ให้ AI หลายตัววิเคราะห์ระบบ แล้วตรวจหลักฐานและรวมเป็นสรุปเดียวที่ `docs/ai/analysis/AN-NNN/` งานหลักไม่ต้องรอ |
| | `/mflow:design "หัวข้อ" [--from @ไฟล์] [--focus …] [--to …]` | (ไม่บังคับ) ให้ AI หลายตัวเสนอแบบ แล้วรวมเป็นแบบเสนอเดียวพร้อมทางเลือกและข้อที่ต้องตัดสินใจที่ `docs/ai/design/DS-NNN/` ไม่ต้องผ่าน analyze ก่อน |
| | `/mflow:challenge @ไฟล์ [--focus …] [--to …]` | (ไม่บังคับ) ให้ AI หลายตัวหาจุดที่แบบหรือเอกสารจะพัง (สถานการณ์ที่ผิดพลาด สมมติฐานที่อ่อน) ก่อนสร้างจริง แล้วรวมผลที่ `docs/ai/challenge/CH-NNN/` |
| | `/mflow:assess @docs/ai/inbox/<ไฟล์>` | ตรวจความเข้าใจ + ไฟล์ที่อ่านก่อน แล้วตรวจ finding ทีละข้อกับโค้ด/spec จริง |
| | `/mflow:review [branch]` | รีวิวโค้ดกับ spec, AGENTS.md, UI kit, domain rules + รัน test |
| สร้างจริง | `/mflow:subagent [on \| off \| status] [--shared]` | เปิดหรือปิด subagent `mflow:dev` (Sonnet 5.5, xhigh) ที่ `/opsx:apply` ส่งงานเขียนโค้ดให้ **ค่าเริ่มต้นคือปิด** จนกว่าจะสั่ง `on` เฉพาะเครื่องนี้ หรือทั้งทีมด้วย `--shared` |
| ส่งต่อ | `/mflow:handoff [--for <tool>]` | STATUS.md ฉบับละเอียด (+ brief ให้ tool อื่นทำต่อ) |

## Stack

`/mflow:init` ถามก่อนเขียนไฟล์ใดๆ ว่าโปรเจกต์ใช้ stack แบบไหน ตอบด้วยตัวอักษรตัวเดียว:

| ตัวเลือก | Profile | รองรับ |
|---|---|---|
| a) | `mvc-htmx`: ASP.NET Core MVC + Razor + Bootstrap 5 + HTMX | เต็ม (แนะนำเมื่อ repo ยังว่าง) |
| b) | `react-vite`: React + Vite + ASP.NET Core Web API | contract เดียวกันในรูป React component |
| c) | `custom`: stack อื่น เช่น Next.js, Laravel, Django | Claude เติมตาราง mapping ให้ยืนยันก่อน ยังไม่ได้ทดสอบกับ mflow |

คำตอบบันทึกไว้ที่ `## Stack` ใน AGENTS.md ที่เดียว แล้ว `theme`, `screen`, `golden`, `review` อ่าน path และชื่อจากตรงนั้น profile นี้เป็นแค่จุดเริ่ม: หัวข้อ `tech-stack` (หัวข้อแรกใน AGENDA.md) ตกลงรายละเอียดทั้งแอป library ที่ตรวจ licence ฐานข้อมูล Docker และตัวเสริมที่ใส่ภายหลัง แล้วเติมตาราง Apps, Libraries และบรรทัด Later ใน `## Stack` โปรเจกต์ที่ init ก่อน 0.10 จะถูกถามเมื่อใช้คำสั่งเหล่านี้ครั้งแรก รายละเอียดอยู่ใน `skills/init/references/stacks.md`

## Hooks (ทำงานเฉพาะ repo ที่มี `.mflow/config.json`)

- **SessionStart**: ฉีด briefing เข้า context ทุกครั้งที่เริ่ม/resume/clear/compact: ส่วน Now ของ STATUS.md, log ล่าสุด, OpenSpec change ที่ค้าง, task ที่ In Progress, hotspot ที่ยัง active พร้อมจำนวน ticket ที่หยิบได้, เอกสารลูกค้าที่ยังไม่ได้ประมวลผล, ผลจาก AI อื่นที่ยังไม่ได้ assess, เอกสาร discuss ที่รอคุณอ่าน และส่วนแยก "Discussion agenda (optional)" ที่บอกหัวข้อแนะนำที่ยังไม่เริ่ม
- **Stop**: ถ้ามีไฟล์เปลี่ยนหลัง STATUS.md ถูกเขียนครั้งล่าสุด (แก้ เพิ่ม ลบ เปลี่ยนชื่อ หรือ commit ไปแล้วใน session นี้) จะให้ Claude เขียน handoff ก่อนหยุด ไม่ถามใน 10 นาทีแรกของ session และถามซ้ำไม่เกินทุก 30 นาที ปรับได้ใน `.mflow/config.json`:

```json
{ "stopGuard": { "enabled": true, "graceMinutes": 10, "repeatMinutes": 30 } }
```

- **PreToolUse** (เครื่องมือ Agent): ปฏิเสธการเรียก subagent `mflow:dev` เมื่อโปรเจกต์ยังไม่ได้เปิดด้วย `/mflow:subagent on` (ค่าเริ่มต้นคือปิด) subagent ตัวอื่นผ่านตามปกติ ถ้าอ่านค่าไม่ได้จะปฏิเสธไว้ก่อน และ hook นี้ทำงานในทุกโปรเจกต์ที่เปิด plugin ไว้ โปรเจกต์ที่ไม่ใช่ mflow จึงใช้ `mflow:dev` ไม่ได้เลย

Codex ไม่มี hook: ทำตามส่วน "Session ritual" ใน AGENTS.md แทน

## Subagent ตอน apply

**ค่าเริ่มต้นคือปิด** จนกว่าจะสั่ง `/mflow:subagent on` ระหว่างที่ปิด `/opsx:apply` ให้ Claude ตัวหลักทำเองทุก task เมื่อเปิดแล้ว guidance ที่ `/mflow:init` เติมใน `operations.apply.guidance` ของ `openspec/config.yaml` จะให้ `/opsx:apply` ส่งงานเขียนโค้ดของแต่ละ task ให้ subagent `mflow:dev` ตัวใหม่ (`agents/dev.md`, `model: claude-sonnet-5-5`, `effort: xhigh`) ทีละ task ตามลำดับใน `tasks.md` ตัวถัดไปได้รายงานของ task ก่อนหน้า (ไฟล์ที่แก้ ผล test) ไปด้วย ส่วน Claude ตัวหลักยังถือ `tasks.md` ตรวจ diff กับผล test แล้วค่อยติ๊ก `- [x]` ก่อนเริ่ม task ถัดไป

ยังไม่รันหลาย subagent พร้อมกัน เพราะ task ส่วนใหญ่ต่อจากกัน (migration → entity → service → API → หน้าจอ) migration ซ้อนกันไม่ได้ และ `dotnet build` สองตัวใน checkout เดียวกันชนกันที่ `obj/` `bin/`

- ไม่ต้องแก้ไฟล์ของ OpenSpec: `openspec update` สร้าง skill และ command ใหม่ทุกครั้ง แต่ไม่แตะ `config.yaml`
- Codex อ่าน guidance เดียวกัน แต่ไม่มี subagent นี้ จึงทำ task เอง
- เป็นคำแนะนำที่ OpenSpec ส่งให้ AI ไม่ใช่การบังคับ ถ้า Claude ทำเองโดยไม่ส่งต่อ ให้บอกในแชต
- เปิดหรือปิด: `/mflow:subagent on` เขียน `{"applySubagent": {"enabled": true}}` ใน `.mflow/local.json` (เฉพาะเครื่องนี้ และเพิ่มไฟล์ลง `.gitignore` ให้) `--shared` เขียน key เดียวกันใน `.mflow/config.json` ให้ทั้งทีม ค่าใน `local.json` ทับค่าของทีมบนเครื่องนั้น `off` ตั้งเป็น `false` และ `status` บอกสถานะกับไฟล์ที่ตัดสิน
- ค่าอยู่ที่ root ของโปรเจกต์ จะเปิด Claude Code ที่โฟลเดอร์ไหนในโปรเจกต์ก็ได้ผลเดียวกัน
- ปิดมีผลทันที เพราะ hook PreToolUse ตรวจทุกครั้งที่เรียก ส่วนเปิดมีผลตั้งแต่ session ใหม่หรือหลัง `/clear` เพราะ guidance ส่งงานให้ subagent เฉพาะเมื่อ briefing ของ session นั้นมีบรรทัด "apply subagent mflow:dev is ON" ซึ่งแสดงเฉพาะตอนเปิด
- กฎ deny `Agent(mflow:dev)` ใน settings ของ Claude Code (เช่น `~/.claude/settings.json`) ยังปิดได้เสมอไม่ว่า mflow จะตั้งอะไร `status` และ briefing บอกให้ ต้องลบเองด้วยมือ
- ไม่ใช้ subagent แค่รอบเดียวระหว่างที่เปิดอยู่: บอกในข้อความ `/opsx:apply` เช่น `/opsx:apply <change> รอบนี้ไม่ใช้ subagent`
- guidance สั่งให้ตัดสินจาก session ปัจจุบันเท่านั้น ไม่เชื่อบันทึกจาก session ก่อน (เช่น `.remember/` ที่อาจยังเขียนว่าปิดหรือเปิดอยู่)
- เปลี่ยนโมเดลที่บรรทัด `model:` ของ `agents/dev.md` (เช่น `sonnet` เพื่อตามรุ่นล่าสุด) ถ้าเครื่องตั้ง `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` ไว้ ค่าใน `CLAUDE_CODE_SUBAGENT_MODEL` จะทับบรรทัดนี้

## Flow ประจำวัน

1. ครั้งแรก: `/mflow:init` → `/mflow:discuss tech-stack` → `/mflow:discuss code-structure` (แนะนำก่อน theme ไม่บังคับ)
2. เอกสารลูกค้าเข้า `docs/source/` → `/mflow:capture` (เพิ่มหัวข้อลง `docs/decisions/discuss/AGENDA.md`)
3. ดูหัวข้อแนะนำใน `docs/decisions/discuss/AGENDA.md` (เป็นคำแนะนำ จะคุยหรือข้ามก็ได้) → เรื่องที่ตีความได้หลายแบบ (สิทธิ์, เมนู, การมองเห็นข้อมูล …) → `/mflow:discuss <slug>` → (ถ้าอยากให้ AI หลายตัวช่วยคิด `/mflow:discuss <NN> consult` แล้วรันคำสั่งเอง) → คุณตอบในไฟล์หรือในแชต → `/mflow:discuss <NN> approve`
4. ครั้งแรกของโปรเจกต์: `/mflow:theme` (หรือ `/mflow:theme preview` ถ้ายังไม่มีโค้ดแอป แล้ว `port` ใน change ที่ scaffold แอป) → `/mflow:screen inventory` (เพิ่มหัวข้อ `<กลุ่ม>-data` ลง AGENDA.md) → ออกแบบข้อมูลทีละกลุ่ม `/mflow:discuss <กลุ่ม>-data` (ไม่บังคับ)
5. สร้างหน้าจอ `/mflow:screen <ชื่อ> ...` → ทดสอบใช้งานหรือรีวิว (สลับ role บนแถบ PROTOTYPE ให้ดูเมนูและข้อมูลของแต่ละ role) → `/mflow:review-notes`
6. กฎที่ตัดข้ามหน้าจอ → `/mflow:hotspot` ทีละตั๋ว (`/clear` ระหว่างตั๋ว) (+ `/mflow:golden`) → graduate
7. `/opsx:propose` → `/opsx:apply` (Claude ทำเอง หรือส่งงานเขียนโค้ดของแต่ละ task ให้ subagent `mflow:dev` บน Sonnet 5.5 เมื่อเปิดด้วย `/mflow:subagent on` หรือ `/mflow:delegate` ให้ tool อื่น) → `/mflow:review` → `/opsx:archive`
8. ขอเปลี่ยนสิ่งที่สร้างแล้ว → `/mflow:change-request` (บันทึกผลกระทบ แล้วทำต่อตามที่คุณสั่ง)
9. จบวัน → `/mflow:handoff`

หลังทุก `/opsx:archive` ให้เช็กว่า `openspec/specs/` เปลี่ยนจริง (`git diff --stat openspec/specs`)

## ภายใน plugin

```
mflow/
├─ .claude-plugin/plugin.json
├─ compat.json           ← รุ่นของ Node และเครื่องมือที่ plugin รุ่นนี้ทดสอบแล้ว
├─ agents/dev.md           ← subagent `mflow:dev` (Sonnet 5.5) ที่ /opsx:apply ส่งงานเขียนโค้ดให้
├─ hooks/hooks.json
├─ scripts/                ← Node ล้วน ไม่มี dependency (Windows/Linux)
│   ├─ lib.mjs             ← config + ทะเบียน tool ค่าเริ่มต้น
│   ├─ scaffold.mjs        ← วาง template ลงโปรเจกต์ (ลง folder ตามค่าตั้งใน .mflow/config.json)
│   ├─ migrate-layout.mjs  ← ย้ายเอกสารจากโครงก่อน 0.20 เข้าหมวด docs/decisions, docs/ai, docs/reviews
│   ├─ session-start.mjs   ← briefing + เอกสาร/ผล AI ที่ยังไม่ได้ประมวลผล
│   ├─ stop-guard.mjs
│   ├─ source-index.mjs    ← ทะเบียนเอกสารลูกค้า (hash)
│   ├─ discuss.mjs         ← เลขเอกสาร discuss + ตรวจข้อที่ยังค้างก่อนอนุมัติ + สถานะของ AGENDA.md
│   ├─ delegate-cmd.mjs    ← สร้างคำสั่ง PowerShell/Bash ของแต่ละ tool
│   ├─ apply-subagent.mjs  ← เปิด/ปิด mflow:dev (ค่าใน .mflow/, ค่าเริ่มต้นปิด)
│   ├─ subagent-guard.mjs  ← hook PreToolUse ที่ปฏิเสธ mflow:dev เมื่อปิดอยู่
│   ├─ doctor.mjs          ← ตรวจสุขภาพโปรเจกต์และเครื่องมือ (อ่านอย่างเดียว)
│   ├─ inbox-normalize.mjs ← ทำรายงานจาก AI อื่นให้พร้อมตรวจ
│   ├─ consult.mjs         ← สถานะของ analyze/design/challenge (ไม่บังคับ) อ่านจากไฟล์จริง
│   └─ context-pack.mjs    ← รวมไฟล์เป็นไฟล์เดียวให้ chat UI
├─ skills/<คำสั่ง>/SKILL.md (+ references/, assets/)
└─ templates/              ← ไฟล์ที่ init วางลงโปรเจกต์
```

เอกสารที่ mflow เขียนลงโปรเจกต์ (ตั้งแต่ 0.20.0) อยู่ใต้ `docs/` ห้าหมวด: `source/` (เอกสารลูกค้า), `decisions/` (`discuss/`, `hotspots/`), `ui/`, `reviews/` (สรุปรีวิว, `code/`, `change-requests/`) และ `ai/` (`inbox/`, `analysis/`, `design/`, `challenge/`) กับ `docs/vision.md` โปรเจกต์ที่สร้างก่อนนั้นย้ายด้วย `/mflow:init` ซึ่งแสดงแผนจาก `migrate-layout.mjs` ก่อน และย้ายเมื่อคุณตอบ yes

## เพิ่มคำสั่งใหม่

1. สร้าง `skills/<ชื่อ>/SKILL.md` ใส่ frontmatter `name`, `description`, `disable-model-invocation: true` (ให้เรียกด้วยมือเท่านั้น ไม่กิน context)
2. เขียนเป็นขั้นตอน แต่ละขั้นจบด้วยเงื่อนไข "Done when" ที่ตรวจได้
3. อะไรที่ต้องได้ผลเหมือนเดิมทุกครั้ง (สร้างไฟล์, parse, เช็กสถานะ) เขียนเป็น script ใน `scripts/` แล้วให้ skill เรียก อย่าให้ AI ทำด้วยมือ
4. ทุก script มี test ใน `tests/` ของ repo (`node --test` ที่ root) ข้อบกพร่องที่รู้แต่ยังไม่แก้เขียนเป็น test แบบ `todo`
5. ปล่อยรุ่น: เพิ่ม version ใน plugin.json แล้วแก้เลขรุ่นใน `docs/requirement.md`, `docs/manual.md` (หัวเอกสารและหัวข้อ 8) และหัวข้อคำสั่งของ README เมื่อทดสอบกับเครื่องมือรุ่นใหม่ ให้แก้ `compat.json` กับตารางหัวข้อ 12 ของ requirement พร้อมกัน จากนั้น `node --test` (`tests/release.test.mjs` ตรวจว่าทุกที่ตรงกัน) และ `claude plugin validate` ทั้ง plugin และ marketplace

กติกา: เพิ่มคำสั่งหลังจากทำเรื่องเดิมด้วยมือซ้ำ 2 ถึง 3 ครั้งแล้วเท่านั้น

## ทำงานกับ AI ตัวอื่น

OpenSpec บอกว่า "สร้างอะไร" (change: proposal, specs, tasks) และ AI ทุกตัวอ่านได้ ส่วน mflow ดูแลว่า "ใครทำ, ส่งมอบยังไง, ตรวจยังไง":

1. `/mflow:delegate <subject> --mode analyze|review|code [--to <tool>]` (ใน Claude Code) → brief ใน `.mflow/briefs/` + คำสั่งให้คุณรันเอง
2. ไม่ใส่ `--to` = brief กลาง ใช้กับ tool ไหนก็ได้ และได้คำสั่งของทุก tool ในทะเบียน
3. ทุก tool ตอบรายงานเป็น "ข้อความสุดท้าย" ที่มี `Understanding` + `Files read` นำหน้า แล้วคำสั่งบันทึกลง `docs/ai/inbox/`
4. `/mflow:assess` ตรวจความเข้าใจและไฟล์ที่อ่านก่อน แล้วค่อยตรวจ finding ทีละข้อ
5. โหมด code ทำใน worktree/branch `agent/<tool>/<id>` → `/mflow:review` → merge เมื่อ approve และคุณตกลง

### ทะเบียน tool

ค่าเริ่มต้นใน plugin: `codex` (ตรวจกับ codex-cli 0.156.1 แล้ว), `opencode` และ `gemini` (ให้เช็ก `--help` ก่อน), `chat` (วาง brief ใน chat UI + แนบ context pack)

brief ถูกส่งทาง stdin หรือแนบเป็นไฟล์เสมอ ไม่ส่งเป็น argument เพราะ PowerShell 5.1 ตัดเครื่องหมายคำพูดออก และ shim `.cmd` ของ npm ตัดข้อความที่บรรทัดแรก

เพิ่ม tool ใหม่หรือแก้คำสั่งใน `.mflow/config.json`:

```json
{
  "tools": {
    "zcode": {
      "verified": false,
      "notes": "…",
      "analyze": { "bash": "zcode … {brief} … {out}", "pwsh": "…" }
    }
  }
}
```

`{brief}` `{out}` `{worktree}` ถูกแทนด้วย path แบบ absolute ที่ครอบ single quote ตามกฎของแต่ละ shell (Bash และ PowerShell) `$` backtick ช่องว่าง และ `'` ใน path จึงไม่ถูกตีความ ใน template ไม่ต้องใส่เครื่องหมายคำพูดเอง และ cmdlet ของ PowerShell ให้รับ path ผ่าน `-LiteralPath` เพราะ `[ ]` ใน `-Path` เป็น wildcard script ไม่ยอมสร้างคำสั่งถ้าไม่มี `--brief` หรือ `--out` หรือไม่มี `--worktree` ใน mode code และ `{tool}` ใน path ผลลัพธ์ถูกแทนด้วยชื่อ tool เพื่อให้หลาย tool ตอบ brief เดียวกันได้โดยไม่ทับไฟล์กัน ถ้าเรียก tool ที่ยังไม่มีในทะเบียน `/mflow:delegate` จะถามคำสั่งแล้วบันทึกให้

PowerShell: คำสั่งที่สร้างให้ตั้ง UTF-8 ทั้งขาเข้า (`$OutputEncoding` สำหรับ brief ที่ pipe เข้า tool) และขาออก (`[Console]::OutputEncoding` สำหรับคำตอบที่ tool พิมพ์ออกมา) ถ้าตั้งแค่ขาเข้า คำตอบภาษาไทยจะเพี้ยนทั้งใน PowerShell 5.1 และ 7 เมื่อ console ใช้ code page อื่นที่ไม่ใช่ UTF-8

Context pack ข้ามไฟล์ config (`.json` `.config` `.xml` `.yaml` …) ที่ดูเหมือนมีรหัสผ่าน, connection string ที่มี password, API key หรือ private key และแสดงไว้ในรายการ `skipped`

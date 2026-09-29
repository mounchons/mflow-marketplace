# mflow

Workflow ของพี่ปูสำหรับงานที่ AI ช่วย dev: ทำหน้าจอก่อน → จับโลจิกใหญ่ (hotspot) ให้ชัด → แปลงเป็น OpenSpec change → สร้างทีละ slice โดยมี test เป็นหลักฐาน และมีชั้นความจำ (AGENTS.md + STATUS.md + OpenSpec + Backlog.md) ให้ Claude Code และ Codex อ่านเหมือนกันทุก session

## ติดตั้ง

ต้องมี Node 20+ และ git

```bash
npm i -g @fission-ai/openspec@latest backlog.md

# ทดลองแบบไม่ติดตั้ง (โหลดจากโฟลเดอร์)
claude --plugin-dir ./mflow-marketplace/plugins/mflow

# หรือเพิ่มเป็น marketplace แล้วติดตั้ง (ใน Claude Code)
/plugin marketplace add mounchons/mflow-marketplace   # หรือ path ของโฟลเดอร์ในเครื่อง
/plugin install mflow@mflow-marketplace
```

ตรวจความถูกต้องหลังแก้ไฟล์: `claude plugin validate ./plugins/mflow`

## คำสั่ง (v0.12)

ไม่แน่ใจว่าใช้คำสั่งไหน: `/mflow:help <สถานการณ์>`

| กลุ่ม | คำสั่ง | ทำอะไร |
|---|---|---|
| ตั้งต้น | `/mflow:init [ชื่อ]` | ตั้งค่า repo ครั้งแรก: ถามเลือก stack ก่อน, ต่อ OpenSpec + Backlog.md, คัดแยกเอกสารเดิม |
| เอกสารลูกค้า | `/mflow:capture [@ไฟล์] [--replaces @เก่า]` | ลงทะเบียน/คัดแยกเอกสาร อ่านเฉพาะไฟล์ใหม่หรือเปลี่ยน, ฉบับเก่าเป็น superseded |
| ยืนยันความเข้าใจ | `/mflow:discuss <หัวข้อ> [@ไฟล์]` | เขียนความเข้าใจ/แบบที่เสนอ (สิทธิ์, เมนู, การมองเห็นข้อมูล, ตาราง/column/data dictionary …) เป็น `docs/discuss/NN-<slug>.md` ให้พี่ปูอ่าน พร้อมแผนภาพ Mermaid, wireframe หรือภาพหน้าจอจริง |
| | `/mflow:discuss <NN> consult [--to <tool>,…]` | ให้ AI ตัวอื่น (Codex, OpenCode, Gemini, chat) ช่วยวิเคราะห์เอกสารเดียวกัน ได้ brief + คำสั่งที่พี่ปูรันเอง |
| | `/mflow:discuss <NN> [สิ่งที่อยากแก้]` / `<NN> approve` | รวมความเห็นของทุก AI + ปรับตามที่พี่ปูตอบจนตรงกัน → อนุมัติแล้วนำแต่ละข้อไปรวมกับ flow หลัก |
| หน้าจอ | `/mflow:theme [แบรนด์]` / `update <อะไร>` | tokens, layout แบบ responsive (เมนูเต็ม/ไอคอน/drawer ที่เปิดด้วย ☰), components, หน้า style guide, กฎ UI สำหรับ agent; `update responsive` สำหรับ kit ก่อน 0.11 |
| | `/mflow:theme preview` / `port` | ทำ kit เป็น static preview (HTML/CSS/JS) ใน `docs/ui/theme/` ให้อนุมัติก่อนมีโค้ดแอป แล้ว `port` เข้า stack จริงและ freeze preview ไว้เป็นหลักฐาน |
| | `/mflow:screen inventory` | รายการหน้าจอจาก story map → `docs/ui/screens.md` |
| | `/mflow:screen <ชื่อ> <สิ่งที่ต้องการ>` | สร้าง/ปรับหน้าจอจาก kit + ข้อมูล JSON กลาง |
| | `/mflow:review-notes @โน้ต` | คัดแยกผลรีวิวกับลูกค้า + ร่างอีเมลสรุปภาษาไทย |
| โลจิก | `/mflow:hotspot [...]` | chart และแก้กฎใหญ่ทีละตั๋ว → graduate เป็น OpenSpec change |
| | `/mflow:golden @xlsx <slug>` | Excel จริงของลูกค้า → golden data + unit test ตาม stack (xUnit สำหรับ .NET) |
| ขอบเขต | `/mflow:change-request <คำขอ>` | จัดประเภท defect / clarification / new scope, ประเมิน, ร่างตอบลูกค้า |
| หลาย AI | `/mflow:delegate <id> --mode analyze/review/code [--to <tool>]` | สร้าง brief ให้ AI ตัวอื่น + คำสั่ง PowerShell/Bash จากทะเบียน tool |
| | `/mflow:assess @docs/ai-inbox/<ไฟล์>` | ตรวจความเข้าใจ + ไฟล์ที่อ่านก่อน แล้วตรวจ finding ทีละข้อกับโค้ด/spec จริง |
| | `/mflow:review [branch]` | รีวิวโค้ดกับ spec, AGENTS.md, UI kit, domain rules + รัน test |
| ส่งต่อ | `/mflow:handoff [--for <tool>]` | STATUS.md ฉบับละเอียด (+ brief ให้ tool อื่นทำต่อ) |

## Stack

`/mflow:init` ถามก่อนเขียนไฟล์ใดๆ ว่าโปรเจกต์ใช้ stack แบบไหน ตอบด้วยตัวอักษรตัวเดียว:

| ตัวเลือก | Profile | รองรับ |
|---|---|---|
| a) | `mvc-htmx`: ASP.NET Core MVC + Razor + Bootstrap 5 + HTMX | เต็ม (แนะนำเมื่อ repo ยังว่าง) |
| b) | `react-vite`: React + Vite + ASP.NET Core Web API | contract เดียวกันในรูป React component |
| c) | `custom`: stack อื่น เช่น Next.js, Laravel, Django | Claude เติมตาราง mapping ให้ยืนยันก่อน ยังไม่ได้ทดสอบกับ mflow |

คำตอบบันทึกไว้ที่ `## Stack` ใน AGENTS.md ที่เดียว แล้ว `theme`, `screen`, `golden`, `review` อ่าน path และชื่อจากตรงนั้น โปรเจกต์ที่ init ก่อน 0.10 จะถูกถามเมื่อใช้คำสั่งเหล่านี้ครั้งแรก รายละเอียดอยู่ใน `skills/init/references/stacks.md`

## Hooks (ทำงานเฉพาะ repo ที่มี `.mflow/config.json`)

- **SessionStart**: ฉีด briefing เข้า context ทุกครั้งที่เริ่ม/resume/clear/compact: ส่วน Now ของ STATUS.md, log ล่าสุด, OpenSpec change ที่ค้าง, task ที่ In Progress, hotspot ที่ยัง active พร้อมจำนวน ticket ที่หยิบได้, เอกสารลูกค้าที่ยังไม่ได้ประมวลผล, ผลจาก AI อื่นที่ยังไม่ได้ assess และเอกสาร discuss ที่รอพี่ปูอ่าน
- **Stop**: ถ้ามีไฟล์เปลี่ยนหลัง STATUS.md ถูกเขียนครั้งล่าสุด จะให้ Claude เขียน handoff ก่อนหยุด ไม่ถามใน 10 นาทีแรกของ session และถามซ้ำไม่เกินทุก 30 นาที ปรับได้ใน `.mflow/config.json`:

```json
{ "stopGuard": { "enabled": true, "graceMinutes": 10, "repeatMinutes": 30 } }
```

Codex ไม่มี hook: ทำตามส่วน "Session ritual" ใน AGENTS.md แทน

## Flow ประจำวัน

1. เอกสารลูกค้าเข้า `docs/source/` → `/mflow:capture`
2. เรื่องที่ตีความได้หลายแบบ (สิทธิ์, เมนู, การมองเห็นข้อมูล …) → `/mflow:discuss <หัวข้อ>` → (ถ้าอยากให้ AI หลายตัวช่วยคิด `/mflow:discuss <NN> consult` แล้วรันคำสั่งเอง) → พี่ปูตอบในไฟล์หรือในแชต → `/mflow:discuss <NN> approve`
3. ครั้งแรกของโปรเจกต์: `/mflow:theme` (หรือ `/mflow:theme preview` ถ้ายังไม่มีโค้ดแอป แล้ว `port` ใน change ที่ scaffold แอป) → `/mflow:screen inventory` → ออกแบบข้อมูลทีละกลุ่ม `/mflow:discuss <กลุ่มข้อมูล> data model` (ไม่บังคับ)
4. สร้างหน้าจอ `/mflow:screen <ชื่อ> ...` → รีวิวกับลูกค้า (สลับ role บนแถบ PROTOTYPE ให้ดูเมนูและข้อมูลของแต่ละ role) → `/mflow:review-notes`
5. กฎที่ตัดข้ามหน้าจอ → `/mflow:hotspot` (+ `/mflow:golden`) → graduate
6. `/opsx:propose` → `/opsx:apply` (Claude หรือ `/mflow:delegate` ให้ tool อื่น) → `/mflow:review` → `/opsx:archive`
7. ลูกค้าขอเปลี่ยนหลังอนุมัติ → `/mflow:change-request`
8. จบวัน → `/mflow:handoff`

หลังทุก `/opsx:archive` ให้เช็กว่า `openspec/specs/` เปลี่ยนจริง (`git diff --stat openspec/specs`)

## ภายใน plugin

```
mflow/
├─ .claude-plugin/plugin.json
├─ hooks/hooks.json
├─ scripts/                ← Node ล้วน ไม่มี dependency (Windows/Linux)
│   ├─ lib.mjs             ← config + ทะเบียน tool ค่าเริ่มต้น
│   ├─ scaffold.mjs
│   ├─ session-start.mjs   ← briefing + เอกสาร/ผล AI ที่ยังไม่ได้ประมวลผล
│   ├─ stop-guard.mjs
│   ├─ source-index.mjs    ← ทะเบียนเอกสารลูกค้า (hash)
│   ├─ discuss.mjs         ← เลขเอกสาร discuss + ตรวจข้อที่ยังค้างก่อนอนุมัติ
│   ├─ delegate-cmd.mjs    ← สร้างคำสั่ง PowerShell/Bash ของแต่ละ tool
│   ├─ inbox-normalize.mjs ← ทำรายงานจาก AI อื่นให้พร้อมตรวจ
│   └─ context-pack.mjs    ← รวมไฟล์เป็นไฟล์เดียวให้ chat UI
├─ skills/<คำสั่ง>/SKILL.md (+ references/, assets/)
└─ templates/              ← ไฟล์ที่ init วางลงโปรเจกต์
```

## เพิ่มคำสั่งใหม่

1. สร้าง `skills/<ชื่อ>/SKILL.md` ใส่ frontmatter `name`, `description`, `disable-model-invocation: true` (ให้เรียกด้วยมือเท่านั้น ไม่กิน context)
2. เขียนเป็นขั้นตอน แต่ละขั้นจบด้วยเงื่อนไข "Done when" ที่ตรวจได้
3. อะไรที่ต้องได้ผลเหมือนเดิมทุกครั้ง (สร้างไฟล์, parse, เช็กสถานะ) เขียนเป็น script ใน `scripts/` แล้วให้ skill เรียก อย่าให้ AI ทำด้วยมือ
4. เพิ่ม version ใน plugin.json → `claude plugin validate`

กติกา: เพิ่มคำสั่งหลังจากทำเรื่องเดิมด้วยมือซ้ำ 2 ถึง 3 ครั้งแล้วเท่านั้น

## ทำงานกับ AI ตัวอื่น

OpenSpec บอกว่า "สร้างอะไร" (change: proposal, specs, tasks) และ AI ทุกตัวอ่านได้ ส่วน mflow ดูแลว่า "ใครทำ, ส่งมอบยังไง, ตรวจยังไง":

1. `/mflow:delegate <subject> --mode analyze|review|code [--to <tool>]` (ใน Claude Code) → brief ใน `.mflow/briefs/` + คำสั่งให้พี่ปูรันเอง
2. ไม่ใส่ `--to` = brief กลาง ใช้กับ tool ไหนก็ได้ และได้คำสั่งของทุก tool ในทะเบียน
3. ทุก tool ตอบรายงานเป็น "ข้อความสุดท้าย" ที่มี `Understanding` + `Files read` นำหน้า แล้วคำสั่งบันทึกลง `docs/ai-inbox/`
4. `/mflow:assess` ตรวจความเข้าใจและไฟล์ที่อ่านก่อน แล้วค่อยตรวจ finding ทีละข้อ
5. โหมด code ทำใน worktree/branch `agent/<tool>/<id>` → `/mflow:review` → merge เมื่อ approve และพี่ปูตกลง

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

`{brief}` `{out}` `{worktree}` ถูกแทนด้วย path แบบ absolute ที่ใส่เครื่องหมายคำพูดแล้ว และ `{tool}` ใน path ผลลัพธ์ถูกแทนด้วยชื่อ tool เพื่อให้หลาย tool ตอบ brief เดียวกันได้โดยไม่ทับไฟล์กัน ถ้าเรียก tool ที่ยังไม่มีในทะเบียน `/mflow:delegate` จะถามคำสั่งแล้วบันทึกให้

PowerShell: คำสั่งที่สร้างให้ตั้ง UTF-8 ทั้งขาเข้า (`$OutputEncoding` สำหรับ brief ที่ pipe เข้า tool) และขาออก (`[Console]::OutputEncoding` สำหรับคำตอบที่ tool พิมพ์ออกมา) ถ้าตั้งแค่ขาเข้า คำตอบภาษาไทยจะเพี้ยนทั้งใน PowerShell 5.1 และ 7 เมื่อ console ใช้ code page อื่นที่ไม่ใช่ UTF-8

Context pack ข้ามไฟล์ config (`.json` `.config` `.xml` `.yaml` …) ที่ดูเหมือนมีรหัสผ่าน, connection string ที่มี password, API key หรือ private key และแสดงไว้ในรายการ `skipped`

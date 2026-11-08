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

## คำสั่ง (v0.44)

ไม่แน่ใจว่าใช้คำสั่งไหน: `/mflow:help <สถานการณ์>` ทุกคำสั่งจบด้วยสรุปว่าอะไรเปลี่ยน กับคำสั่งถัดไปหนึ่งคำสั่ง (เขียนลงส่วน Now ของ STATUS.md ด้วย)

| กลุ่ม | คำสั่ง | ทำอะไร |
|---|---|---|
| ตั้งต้น | `/mflow:init [ชื่อ]` | ตั้งค่า repo ครั้งแรก: ถามเลือก stack และชื่อโปรเจกต์ในโค้ด (เสนอให้สามชื่อ) ก่อน, ต่อ OpenSpec + Backlog.md, สร้าง `docs/decisions/discuss/AGENDA.md` (มี `tech-stack` และ `code-structure` นำหน้า), คัดแยกเอกสารเดิม, (เลือกได้, 0.38.1) เขียนสำเนา plugin ที่ `.claude/skills/mflow/` สำหรับ Claude Code on the web ซึ่งไม่ติดตั้ง plugin ให้ |
| เอกสารลูกค้า | `/mflow:capture [@ไฟล์] [--replaces @เก่า]` | ลงทะเบียน/คัดแยกเอกสาร อ่านเฉพาะไฟล์ใหม่หรือเปลี่ยน, ฉบับเก่าเป็น superseded, เพิ่มหัวข้อที่ควร discuss ลง AGENDA.md |
| ยืนยันความเข้าใจ | `/mflow:discuss <หัวข้อ> [@ไฟล์]` | เขียนความเข้าใจ/แบบที่เสนอ (สิทธิ์, เมนู, การมองเห็นข้อมูล, ตาราง/column/data dictionary …) เป็น `docs/decisions/discuss/NN-<slug>.md` ให้คุณอ่าน พร้อมแผนภาพ Mermaid, wireframe หรือภาพหน้าจอจริง |
| | `/mflow:discuss <NN> consult [--to <tool>,…]` | ให้ AI ตัวอื่น (Codex, OpenCode, Gemini, chat) ช่วยวิเคราะห์เอกสารเดียวกัน ได้ brief + คำสั่งที่คุณรันเอง |
| | `/mflow:discuss <NN> [สิ่งที่อยากแก้]` / `<NN> approve` | รวมความเห็นของทุก AI + ปรับตามที่คุณตอบจนตรงกัน → อนุมัติแล้วนำแต่ละข้อไปรวมกับ flow หลัก |
| | `/mflow:discuss <หัวข้อ>` กับแพ็ก (0.37) | หัวข้อที่มีแพ็กที่โปรเจกต์เลือก (`sign-in`, `user-accounts`, `access-control`, `notifications`, `audit-history`, `system-settings`, `api-conventions`, `file-upload`, `web-shell`, `background-jobs`, `import-export-print`, `integration`, `tech-stack`, `code-structure`) ตอบข้อที่แพ็กตัดสินไว้แล้วเอง ถามเฉพาะข้อของโปรเจกต์ เลือกแพ็กด้วยการบอกในแชต เช่น "ใช้แพ็ก auth, users" (ดูหัวข้อแพ็กด้านล่าง) |
| | `/mflow:discuss tech-stack` / `code-structure` | สองหัวข้อแรกของทุกโปรเจกต์ (ก่อน `/mflow:theme`): แยก web / API / mobile, framework, library ที่เป็น open source และตรวจ licence แล้ว, PostgreSQL + EF Core, Docker, ตัวเสริมที่ใส่ภายหลัง (Redis, queue) และโครง solution แยก layer ตามมาตรฐานของทีม (อ่านจาก knowledge base เช่น Graph Brain ถ้าเชื่อมไว้) |
| | `/mflow:discuss agenda [skip <slug> <เหตุผล>]` | สร้างหรือเรียง `docs/decisions/discuss/AGENDA.md` ใหม่: หัวข้อที่ควร discuss พร้อมเหตุผล ที่มา และควรคุยก่อนขั้นไหน (capture และ screen inventory เพิ่มให้เอง สถานะอัปเดตเอง) เป็นคำแนะนำ ไม่บังคับ |
| หน้าจอ | `/mflow:theme [แบรนด์]` / `update <อะไร>` | tokens, layout แบบ responsive (เมนูเต็ม/ไอคอน/drawer ที่เปิดด้วย ☰), components (ตารางแบ่งหน้าที่ server พร้อม pager ‹ 1 … 4 5 6 … 20 ›, header search เปิดเฉพาะคอลัมน์ที่ต้องการ, คอลัมน์ไอคอนที่เทียบกันระหว่างแถว, `QuickView` ดูรายละเอียดใน Dialog หรือ SidePanel โดยไม่เปลี่ยนหน้า, DatePicker ปฏิทินอังกฤษ/ไทยที่ตั้ง format ได้, Button, Card, Dialog, SidePanel, Alert, Tabs, Dropdown …), หน้าตามาตรฐานของ mflow (house style: sidebar สีกรมท่า, top bar สีขาวมีช่องค้นหา กระดิ่ง ป้ายสาขา และผู้ใช้, สีฟ้า `#0ea5e9`, ชุดสีสด 10 เฉดให้สถานะ avatar การ์ด KPI และไอคอนประเภท, ฟอนต์ Inter + Noto Sans Thai, ไอคอน Font Awesome 6) ปรับสีตาม CI ของลูกค้าได้ (ใช้ skill `frontend-design` ช่วยถ้าติดตั้งไว้), หน้า style guide, กฎ UI สำหรับ agent; `update look` ทำหน้าตาใหม่, `update responsive` และ `update components` เติมส่วนที่ kit ยังไม่มี |
| | `/mflow:theme preview` / `port` | ทำ kit เป็น static preview (HTML/CSS/JS) ใน `docs/ui/theme/` ให้อนุมัติก่อนมีโค้ดแอป แล้ว `port` เข้า stack จริงและ freeze preview ไว้เป็นหลักฐาน |
| | `/mflow:screen inventory` | รายการหน้าจอจาก story map → `docs/ui/screens.md` |
| | `/mflow:screen <ชื่อ> <สิ่งที่ต้องการ>` | สร้าง/ปรับหน้าจอจาก kit + ข้อมูล JSON กลาง รายการเปิดรายละเอียดของแถวใน `QuickView` (Dialog หรือ SidePanel) โดยไม่เปลี่ยนหน้า |
| | `/mflow:review-notes @โน้ต` | คัดแยกผลทดสอบหรือรีวิว + สรุปสิ่งที่ตกลง (+ ร่างอีเมลแจ้งผู้เกี่ยวข้องถ้าต้องการ) |
| โลจิก | `/mflow:hotspot [<ไอเดีย> \| <slug> [TASK-ID [คำตอบ]]]` | chart และแก้กฎใหญ่ทีละตั๋ว → graduate เป็น OpenSpec change จบแต่ละตั๋วบอก readiness bar ตั๋วถัดไป และคำสั่งถัดไป ตั๋ว `ask` ตอบในคำสั่งได้ |
| | `/mflow:golden @xlsx <slug>` | Excel จริงของลูกค้า → golden data + unit test ตาม stack (xUnit สำหรับ .NET) |
| ขอบเขต | `/mflow:change-request <คำขอ>` | จัดประเภท defect / clarification / new scope, ประเมินและบันทึกผลกระทบ แล้วทำต่อเมื่อคุณสั่ง (ร่างตอบลูกค้าเมื่อขอ) |
| หลาย AI | `/mflow:delegate <id> --mode analyze/review/code [--to <tool>]` | สร้าง brief ให้ AI ตัวอื่น + คำสั่ง PowerShell/Bash จากทะเบียน tool |
| | `/mflow:analyze <system \| "หัวข้อ" \| @ไฟล์> [--focus …] [--to …]` | (ไม่บังคับ) ให้ AI หลายตัววิเคราะห์ระบบ แล้วตรวจหลักฐานและรวมเป็นสรุปเดียวที่ `docs/ai/analysis/AN-NNN/` งานหลักไม่ต้องรอ |
| | `/mflow:analyze units` → `unit:<ชื่อ> [--to …]` | (ไม่บังคับ) ตรวจระบบที่ทำแล้ว "ตามที่ทำจริง" ทีละหน่วย: Claude แตกโค้ดเป็นหน่วยตรวจจากไฟล์ที่ git เก็บไว้ (`.mflow/review-units.json`, script ยืนยันว่าทุกไฟล์มีหน่วยหรือมีเหตุผลที่ไม่ตรวจ) แล้ว brief ให้ AI ตัวอื่นเข้าใจระบบจากข้อเท็จจริงที่ดึงจากโค้ด spec และโค้ด โดยห้ามอ่านเอกสารลูกค้าและ discuss |
| | `$mflow-test` / `$mflow-review` (Codex), `/mflow-test` / `/mflow-review` (OpenCode) | ให้ Codex หรือ OpenCode รัน test หรือรีวิว จาก skill ที่ `/mflow:init` สร้างใน `.agents/skills/` ผลใช้ร่วมกับ Claude ได้ (ไม่รัน E2E) |
| | `/mflow:analyze <AN-NNN> แก้ F1,F3; Q1=a; ที่เหลือตามแนะนำ` | เลือกข้อที่ให้แก้และตอบคำถามที่ต้องตัดสินก่อนในคำสั่งเดียว: ข้อที่ทำให้ spec เปลี่ยนเข้า OpenSpec change ของหน่วย (`<หน่วย>-review-fixes`), ข้อที่ spec ถูกอยู่แล้วเป็น task, คำถามที่แก้ยากไป `/mflow:discuss` |
| | `/mflow:design "หัวข้อ" [--from @ไฟล์] [--focus …] [--to …]` | (ไม่บังคับ) ให้ AI หลายตัวเสนอแบบ แล้วรวมเป็นแบบเสนอเดียวพร้อมทางเลือกและข้อที่ต้องตัดสินใจที่ `docs/ai/design/DS-NNN/` ไม่ต้องผ่าน analyze ก่อน |
| | `/mflow:challenge @ไฟล์ [--focus …] [--to …]` | (ไม่บังคับ) ให้ AI หลายตัวหาจุดที่แบบหรือเอกสารจะพัง (สถานการณ์ที่ผิดพลาด สมมติฐานที่อ่อน) ก่อนสร้างจริง แล้วรวมผลที่ `docs/ai/challenge/CH-NNN/` |
| | `/mflow:assess @docs/ai/inbox/<ไฟล์>` | ตรวจความเข้าใจ + ไฟล์ที่อ่านก่อน แล้วตรวจ finding ทีละข้อกับโค้ด/spec จริง |
| | `/mflow:review [branch \| pending [<change>]] [--short]` | รีวิวโค้ดกับ spec, AGENTS.md, UI kit, domain rules + ใช้ผล `/mflow:test` ที่ commit ที่ตรวจ หรือรัน `/mflow:test since` ต่อจากการรันทั้งชุดครั้งก่อน (ถามเฉพาะเมื่อต้องรันทั้งชุด) เต็มสำหรับกฎธุรกิจ สิทธิ์ data scope query migration การเชื่อมระบบอื่น หรือ startup, `--short` สำหรับโค้ดอื่นและรอบแก้หลัง review, ไม่ต้อง review ถ้าแก้แค่เอกสาร style หรือข้อความ label (0.39) แก้ blocker และ major เองโดยไม่ถาม (แถว pending แก้ใน `fix/<change>-review`) ข้อที่ต้องตัดสินใจเรื่องธุรกิจ minor และ nit รอคุณสั่ง |
| สร้างจริง | `/mflow:subagent [on \| off \| status] [--shared]` | เปิดหรือปิด subagent `mflow:dev` (Sonnet 5.5, xhigh) ที่ `/opsx:apply` ส่งงานเขียนโค้ดให้ **ค่าเริ่มต้นคือปิด** จนกว่าจะสั่ง `on` เฉพาะเครื่องนี้ หรือทั้งทีมด้วย `--shared` |
| | `/mflow:test [since \| unit \| e2e \| <ส่วน> \| <filter>]` | รัน test ทั้งชุด (ไม่รวม E2E) พร้อม build, format, lint และ `openspec validate` เมื่อคุณสั่ง ปกติบน main ครั้งเดียวสำหรับทุก change ใน `docs/reviews/pending.md` รันทีละส่วน ส่วนละไม่เกินราว 8 นาที แล้วบันทึกผลกับ commit ที่ `docs/reviews/tests/` (ระหว่าง `/opsx:apply` รันเฉพาะ test ของแต่ละ task และ test class ของโค้ดที่ task แก้) E2E ทั้งหมดรันเมื่อสั่ง `/mflow:test e2e` เท่านั้น |
| | `/mflow:e2e [<หน้าจอ> [สิ่งที่จะทดสอบ]] | flow <capability หรือค่าตั้ง>` | เขียนหรือปรับ E2E test (Playwright) ของหน้าจอเดียว หรือของ flow ที่ข้ามหลายหน้าและหลายฝ่าย (0.37: เชิญ supplier → ตอบ → กวาดข้อมูล → ส่งกลับ/เก็บเข้าคลัง → สร้าง doc → approve/reject/withdraw → acknowledge; 0.37.1: ค่าตั้งที่ตั้งบน admin web แล้วแสดงบน supplier web ทุกสถานะ; 0.38.3: flow ต่อเนื่องที่เริ่มจากข้อมูลของระบบภายนอก → job → admin approve → อีเมล → supplier acknowledge ใน test เดียวแบ่งด้วย `test.step`) แล้วรันเฉพาะไฟล์นั้น ใช้เมื่อหน้าจอนิ่งแล้วและคุณสั่งเอง เปิด browser พร้อมกันไม่เกิน 2 ตัว ไม่ใส่ชื่อหน้าจอ: บอกว่าหน้าไหนยังไม่มี test หรือแก้หลัง test ล่าสุด |
| | `/mflow:night [--until HH:MM] [--rounds n] [--no-e2e] [--stack]` | (0.38) สั่งเมื่อจะปล่อยเครื่องไว้ เวลาไหนก็ได้ (ชื่อ night เป็นแค่ชื่อ) แล้วรันเองจนจบโดยไม่มีใครดู: `/mflow:test` → แก้ test ที่ล้ม → `/mflow:review pending` → แก้ตาม review ใน `fix/<change>-review` แล้ว test และ review ซ้ำ (ไม่เกิน `--rounds` รอบ ค่าเริ่มต้น 3) → เขียน E2E ที่หน้าจอในช่อง E2E screens ยังขาด → `/mflow:test e2e` → ตรวจ → `/mflow:handoff` เป็นรายการให้ดูตอนกลับมา ไม่ merge เอง main ได้แค่ commit เอกสาร push เฉพาะบน web ไม่ใส่ `--until` รันจนจบทุกขั้น ใส่แล้วหยุดเมื่อถึงเวลานั้น (0.38.1) สถานะอยู่ที่ `docs/reviews/night/` ทำต่อจากขั้นที่ค้างได้ บนเครื่องเปิด session ด้วย `claude --permission-mode auto` `--stack` (0.38.2) เปิด stack ที่ E2E ต้องใช้ (เช่น `docker compose … up -d --build` ตาม `## Commands`) แล้วรอ health address ตอบ และปิดเฉพาะที่เปิดเองหลังจบ E2E (`down` ไม่ใส่ `-v` ข้อมูลยังอยู่) |
| | `/mflow:apply-all [<change> ...] [--rounds n]` | (0.44) สร้างทุก change ที่ propose ไว้แล้วใน `openspec/changes/` ต่อกันจนหมดโดยไม่มีใครดู ทีละ change: แตก branch `change/<change>` จาก main → `/opsx:apply` (archive และ commit) → `/mflow:test since` → `/mflow:review` แก้และ test กับ review ซ้ำไม่เกิน `--rounds` รอบ (ค่าเริ่มต้น 3) → merge เข้า main เมื่อด่านตรวจ `apply-all.mjs gate` ผ่าน แล้วทำ change ถัดไป change แรกที่ไม่ผ่านหยุดทั้งรอบ ไม่ push ไม่รัน E2E ต้องอยู่บน main และ tree สะอาด เปิด session ด้วย `claude --permission-mode auto` |
| ส่งต่อ | `/mflow:handoff [--for <tool>]` | STATUS.md ฉบับละเอียด ย้าย block เก่าของ `## Now` และ log เก่าไป `docs/status-log.md` คำต่อคำด้วย `status-trim.mjs` (0.36.1) (+ brief ให้ tool อื่นทำต่อ) |

## Stack

`/mflow:init` ถามก่อนเขียนไฟล์ใดๆ ว่าโปรเจกต์ใช้ stack แบบไหน และชื่อโปรเจกต์ในโค้ด ตอบด้วยตัวอักษรข้อละตัว (หรือพิมพ์ชื่อเอง):

| ตัวเลือก | Profile | รองรับ |
|---|---|---|
| a) | `mvc-htmx`: ASP.NET Core MVC + Razor + Bootstrap 5 + HTMX | เต็ม (แนะนำเมื่อ repo ยังว่าง) |
| b) | `react-vite`: React + Vite + ASP.NET Core Web API | contract เดียวกันในรูป React component |
| c) | `custom`: stack อื่น เช่น Next.js, Laravel, Django | Claude เติมตาราง mapping ให้ยืนยันก่อน ยังไม่ได้ทดสอบกับ mflow |

คำตอบบันทึกไว้ที่ `## Stack` ใน AGENTS.md ที่เดียว แล้ว `theme`, `screen`, `golden`, `review` อ่าน path และชื่อจากตรงนั้น profile นี้เป็นแค่จุดเริ่ม: หัวข้อ `tech-stack` (หัวข้อแรกใน AGENDA.md) ตกลงรายละเอียดทั้งแอป library ที่ตรวจ licence ฐานข้อมูล Docker และตัวเสริมที่ใส่ภายหลัง แล้วเติมตาราง Apps, Libraries และบรรทัด Later ใน `## Stack` รายละเอียดอยู่ใน `skills/init/references/stacks.md`

## Hooks (ทำงานเฉพาะ repo ที่มี `.mflow/config.json`)

- **SessionStart**: ฉีด briefing เข้า context ทุกครั้งที่เริ่ม/resume/clear/compact: ส่วน Now ของ STATUS.md, log ล่าสุด, OpenSpec change ที่ค้าง, task ที่ In Progress, hotspot ที่ยัง active พร้อมจำนวน ticket ที่หยิบได้, เอกสารลูกค้าที่ยังไม่ได้ประมวลผล, ผลจาก AI อื่นที่ยังไม่ได้ assess, เอกสาร discuss ที่รอคุณอ่าน และส่วนแยก "Discussion agenda (optional)" ที่บอกหัวข้อแนะนำที่ยังไม่เริ่ม
  briefing มีหัวข้อ "Not yet in STATUS.md" เมื่อมีไฟล์ที่เปลี่ยนหลัง entry ล่าสุดของ STATUS.md (เช่น session ก่อน `/clear` โดยไม่ได้ commit) (0.39)
- **PreToolUse** (Bash และ PowerShell, `git commit`, 0.39 แทน Stop hook เดิม): ถ้า commit มีงานที่ STATUS.md ยังไม่ครอบ (แก้ เพิ่ม ลบ เปลี่ยนชื่อ หรือ commit ไปแล้วใน session นี้ใน commit ที่ไม่มี STATUS.md) hook ขวาง commit หนึ่งครั้งให้ Claude เขียนบันทึกโดยไม่แตะ log เก่า ใส่ใน commit เดียวกัน แล้ว commit ใหม่ โดยไม่พูดถึงในคำตอบ บันทึกจึงเกิดก่อนคำตอบ ไม่ต่อท้ายคำตอบแบบ Stop hook เดิม ลองซ้ำที่ commit เดิมผ่านเสมอ ทุก commit ที่มีงานยังไม่ลงถามหนึ่งครั้ง และไม่ถามบน branch ที่มีแต่โค้ด (`fix/<change>-review`, `fix/night-…`, `e2e/night-…`) ปิดได้หรือเว้นช่วงเป็นนาทีใน `.mflow/config.json` (ชื่อเดิม `stopGuard` ยังเปิดปิดได้ ส่วนค่าเวลาของชื่อเดิมไม่ใช้แล้ว):

```json
{ "statusGuard": { "enabled": true, "repeatMinutes": 0 } }
```

- **PreToolUse** (เครื่องมือ Agent): ปฏิเสธการเรียก subagent `mflow:dev` เมื่อโปรเจกต์ยังไม่ได้เปิดด้วย `/mflow:subagent on` (ค่าเริ่มต้นคือปิด) subagent ตัวอื่นผ่านตามปกติ ถ้าอ่านค่าไม่ได้จะปฏิเสธไว้ก่อน และ hook นี้ทำงานในทุกโปรเจกต์ที่เปิด plugin ไว้ โปรเจกต์ที่ไม่ใช่ mflow จึงใช้ `mflow:dev` ไม่ได้เลย
- **PreToolUse** (Bash และ PowerShell): ปฏิเสธการรัน `playwright test` ที่ไม่ใส่ `--workers` หรือใส่เกินเพดาน (`e2eMaxWorkers` ใน `.mflow/config.json` ค่าเริ่มต้น 2) เพราะค่าเริ่มต้นของ Playwright เปิด browser เท่าครึ่งหนึ่งของ CPU thread จนเคยทำให้เครื่อง restart ดูเฉพาะคำสั่งที่ขึ้นต้นด้วย Playwright (หลัง `cd`, ตัวแปร env, `timeout`) การค้นข้อความอย่าง `grep "playwright test"` ผ่านได้ `--list` ผ่านได้ ถ้าอ่านค่าตั้งไม่ได้ hook ปล่อยผ่าน ไม่บล็อกคำสั่งอื่น

hook ของ mflow ทำงานเฉพาะใน Claude Code (Codex รุ่นใหม่มี hook ของตัวเอง แต่ mflow ไม่ได้ใช้): ใน Codex และ OpenCode ให้ทำตามส่วน "Session ritual" ใน AGENTS.md แทน skill `mflow-test` และ `mflow-review` ที่ mflow สร้างให้สองเครื่องมือนี้เขียนกฎข้อนี้ไว้ในตัว

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

## Test ระหว่าง apply และ `/mflow:test`

test ทั้งชุดของบางโปรเจกต์ใช้เวลาเป็นสิบนาทีขึ้นไป mflow จึงรันทั้งชุดตอนที่คุณสั่งเท่านั้น และตั้งแต่ 0.35 รันครั้งเดียวสำหรับทุก change ที่รอ แทนครั้งละ change

- **รายการรอ test และ review (0.35):** จบ `/opsx:apply` แล้ว Claude เพิ่มแถวของ change ลง `docs/reviews/pending.md` (branch, วันที่, ระดับ review ที่ต้องใช้พร้อมเหตุผล, หน้าจอที่ E2E ต้องตาม) แล้วบอกแค่ว่าพร้อม archive ไม่บอกให้สั่ง `/mflow:test` หรือ `/mflow:review` งานจึงเดินต่อ change ถัดไปได้ คุณสั่งเองทีหลังบน main: `/mflow:test` ครั้งเดียวเติมช่อง Test ให้ทุกแถวที่ commit นั้นมีงานของ change แล้ว (ดูจากประวัติ git ด้วย `scripts/pending.mjs`) แล้ว `/mflow:review pending` ตรวจทีละ change ตาม diff ของ change นั้น (ตั้งแต่ก่อน proposal ถึง archive) ใช้ผล test จากแถวนั้น แถวที่ผ่านทั้งสองอย่างย้ายไป `## Done` change ที่ archive แล้วแต่ไม่อยู่ในรายการ `/mflow:test` และ `/mflow:review pending` เพิ่มให้เองตั้งแต่วันที่ `Since:` session เริ่มใหม่ไม่เตือนเรื่องนี้
- **commit เอง (0.39, 0.40):** งานที่เสร็จทุกชิ้น commit บน branch ที่ checkout อยู่โดยไม่ถาม ทั้งงานของคำสั่งและงานที่สั่งเป็นข้อความธรรมดา เพิ่มไฟล์ด้วยชื่อ ไม่ใช้ `git add -A` ส่วน push, merge และ deploy ถามครั้งเดียวเป็นบรรทัดเดียวตอนจบงาน ไม่เป็นเมนูมีเลข (กติกาอยู่ใน briefing, template `CLAUDE.md` และ `AGENTS.md`) ถ้าโปรเจกต์เดิมเขียนกฎ commit ไว้ต่างจากนี้ `/mflow:init` แทนด้วยกฎของ plugin โดยไม่ถาม แล้วบอกหนึ่งบรรทัดว่าแทนบรรทัดไหน (0.42.1)
- **apply แล้ว archive ต่อเลย (0.40):** `/opsx:apply` archive change ใน turn เดียวกันแล้ว commit ครั้งเดียว เว้นแต่สั่งให้หยุดหลัง apply ส่วน task ที่ตั้งใจปล่อยไว้ไม่ติ๊ก (gate, E2E) ไม่ทำให้ archive หยุดถาม พิมพ์ "ทำ X ให้จบ" ได้ Claude ทำ propose → apply → archive ต่อกัน ถามเฉพาะข้อที่ต้องตัดสิน apply และ archive ได้กฎนี้ผ่าน `operations.apply.guidance` และ `operations.archive.guidance` ใน `openspec/config.yaml` โปรเจกต์เดิมสั่ง `/mflow:init` หลังอัปเกรด
- **งานเล็กไม่ต้องเปิด change (0.40):** งานที่ไม่เปลี่ยนพฤติกรรมที่ `openspec/specs/` เขียนไว้ (แก้บั๊กให้กลับไปตรง spec, label, style, ข้อความ, เอกสาร) บอก Claude ตรงๆ Claude แก้พร้อม unit test แล้ว commit และบอกหนึ่งบรรทัดว่าทำไมไม่เปิด change งานเหล่านี้ไม่มีแถวใน `docs/reviews/pending.md` อยากให้ review สั่ง `/mflow:review <branch>`

- `/opsx:apply` รันเฉพาะ build, unit test ทั้งหมด และ test ที่ task เพิ่มหรือแก้ (filter ไปที่ test เหล่านั้น) ไม่รันทั้งชุด และ `tasks.md` ไม่มี task สุดท้ายที่รันทั้งชุด (gate task) ถ้า change เดิมมีอยู่แล้ว apply จะปล่อยไว้ไม่ติ๊ก
- test ระหว่าง apply รันทีละคำสั่งโดยไม่ใช้เบื้องหลัง แต่ละคำสั่งให้จบในราว 8 นาที ถ้ายาวกว่านั้นแบ่งตามคลาส (0.34) เพราะ test ที่รันเบื้องหลังถูกหยุดได้เมื่อหน่วยความจำของเครื่องใกล้หมด แล้วไม่ได้ผลอะไรเลย
- **integration ระหว่าง apply (0.36):** หลังแต่ละ task รัน build, unit test ทั้งหมด (ไม่กี่วินาที) และ integration class ที่ task เพิ่มหรือแก้เอง ในคำสั่งเดียว ไม่รัน integration class อื่น เมื่อจบ task สุดท้าย ถ้า change แตะ migration หรือ data model, startup/DI, สิทธิ์ หรือ seed จะรัน `- Shared checks:` ใน `## Commands` ของ AGENTS.md (class ที่ตรวจทุกตาราง ทุก migration startup และ seed) รอบเดียว แล้วแก้ที่ล้มก่อนบอกว่าพร้อม archive ถ้า AGENTS.md ไม่มีบรรทัดนี้ Claude บอกหนึ่งบรรทัดว่าการตรวจนี้รอ `/mflow:test` ส่วน integration อื่นทั้งหมดรอ `/mflow:test` บน main ซึ่งครอบทุกอย่างที่ apply ไม่ได้รัน ที่มา: StemHub 2026-10-31 landing-content รัน integration 9 รอบใน 8 task รวม 22 นาที ในนั้น 15–17 นาทีเป็น class เดิมที่ whole suite บน main รันซ้ำอยู่แล้ว แต่ TemplateDatabaseTests ที่ล้มเพราะตารางใหม่ก็เจอระหว่าง apply จึงคงไว้เป็น shared checks ตอนจบ
- `/mflow:test` ตรวจว่า `- Test parts:` ครอบทุก test: นับ test ของ project (`--list-tests`) เทียบกับผลรวมของทุกส่วน ถ้าขาด แปลว่ามี class ใหม่ที่ไม่เข้าส่วนไหน จะรันเพิ่มในรอบนั้นและเติมชื่อลงส่วนของมัน (0.36)
- `/mflow:test` รัน build, test ทุกชุดใน `## Commands`, format และ lint แบบตรวจอย่างเดียว และ `openspec validate --strict` รันทีละส่วนให้จบในเวลาที่ shell รอได้ ไม่รันเบื้องหลังหรือหลายส่วนพร้อมกัน เพราะเคยทำให้หน่วยความจำไม่พอจนถูกหยุดกลางทาง ส่วนที่แบ่งไว้บันทึกเป็นบรรทัด `- Test parts:` ใน AGENTS.md ให้รอบหน้าใช้ต่อ
- ระหว่างรัน session นั้นทำอย่างอื่นไม่ได้ Claude จะแนะนำให้เปิดอีก session ในโฟลเดอร์โปรเจกต์เดียวกัน (terminal ใหม่ แล้วพิมพ์ `claude`) ไว้ทำงานที่เขียนแค่เอกสาร เช่น `/mflow:discuss`, `/mflow:capture`, `/mflow:hotspot`, `/mflow:review-notes`, `/opsx:explore`, `/opsx:propose` ส่วน `/opsx:apply`, `/mflow:screen`, `/mflow:e2e`, `/mflow:theme` และ `/mflow:golden` ต้องรอให้รันจบ เพราะแก้และ build โค้ดใน checkout เดียวกัน
- commit ที่ตามมาทีหลัง (เช่น แก้ตาม review) พิสูจน์ด้วย `/mflow:test since`: ใช้ผลรันทั้งชุดล่าสุดของ commit ก่อนหน้าเป็นฐาน แล้วดูไฟล์ที่เปลี่ยนตั้งแต่นั้น แก้แค่เอกสารไม่ต้องรันอะไร แก้โค้ดหรือ test รันส่วนที่เคยล้ม ไฟล์ test ที่แก้ และ test class ของโค้ดที่แก้ แก้ migration, startup/DI, ไฟล์ build หรือ package หรือโครงกลางของ test รันทั้งชุดใหม่
- ผลอยู่ที่ `docs/reviews/tests/<วันที่>-<commit>.md` (`Tested: <branch> at <commit>`, `Scope:`, `Changes:`, `Result:`, เวลาของแต่ละส่วน) ถ้าผ่านทั้งชุดที่ commit ที่ไม่มีงานค้าง จะเติมช่อง Test ใน `docs/reviews/pending.md` และติ๊ก gate task ของ change ให้
- `/mflow:review` ใช้ผลรันทั้งชุดหรือ `since` ที่ commit ที่ตรวจ ถ้าไม่มีแต่มีผลรันทั้งชุดของ commit ก่อนหน้า จะรัน `since` เอง (ปกติไม่กี่นาที) ถามเฉพาะเมื่อต้องรันทั้งชุด ว่าจะรันเลย หรือตรวจส่วนอื่นก่อนแล้วไปรัน `/mflow:test` ทีหลัง (คำตัดสิน `none` จนกว่าจะมีผล test) `approve` ต้องมีหลักฐานว่าทั้งชุดผ่านที่ commit ที่ตรวจเสมอ (รันทั้งชุดที่นั่น หรือ `since` ต่อจากการรันทั้งชุดครั้งก่อน)

## E2E test เขียนและรันเมื่อคุณสั่งเท่านั้น

E2E test ที่เขียนตอนหน้าจอยังเปลี่ยนอยู่ต้องตามแก้ทุกครั้งที่หน้าจอเปลี่ยน และการรันทั้งชุดเปิด browser หลายตัวพร้อมกัน ในโปรเจกต์จริง Playwright รัน 472 test ด้วย 10 workers (ค่าเริ่มต้นคือครึ่งหนึ่งของ CPU thread) แล้ว driver การ์ดจอของ notebook ล่มจนเครื่อง restart สองครั้งในวันเดียว

- task จบด้วย unit test เท่านั้น user flow พิสูจน์ด้วย unit test ของกฎและ service ที่อยู่เบื้องหลัง `/opsx:apply`, `mflow:dev`, `/mflow:screen` และ `/mflow:test` แบบทั้งชุดไม่เขียนและไม่รัน E2E test
- task เก่าที่สั่งให้รัน Playwright: apply ทำส่วนอื่นของ task แล้วเขียนต่อท้ายว่า `E2E on request (/mflow:e2e <หน้าจอ>)` task ที่มีแค่ E2E ปล่อยไว้ไม่ติ๊ก และบอกชื่อหน้าจอที่ change แตะ
- `/mflow:e2e <หน้าจอ>` เขียนหรือปรับ test ของหน้าจอเดียวตาม spec และ role ใน `docs/ui/screens.md` แล้วรันเฉพาะไฟล์นั้น `/mflow:e2e flow <capability>` (0.37) เขียน test ทีละเส้นทางของ flow ที่ข้ามหลายหน้าและหลายฝ่าย ในเทสเดียวใช้ browser context ต่อ role (ไม่เพิ่มจำนวน browser) ลิงก์เชิญจาก fake mailer ของระบบ ตรวจว่าฝั่งรับเห็นสิ่งที่ฝั่งส่งตั้งไว้ตรงกัน ทุกการตัดสินใจเห็นทั้งสองฝั่ง และ supplier คนที่สองไม่เห็นงานของคนแรก (list, ลิงก์ตรง, ไฟล์, การแจ้งเตือน) scenario ที่ spec ยังไม่มีรายงานเป็นสิ่งที่ขาด ไม่แต่งเอง ค่าตั้งที่ตั้งเว็บหนึ่งแล้วแสดงอีกเว็บ (0.37.1): แต่ละ role เปิดบนเว็บของตัวเอง (`baseURL` และ login ของเว็บนั้น จาก `## Commands`) ตรวจทุกสถานะของค่าตั้ง (ตั้งแล้วเห็นตรง ปิดแล้วหายรวมถึงลิงก์ตรง) ผู้ที่ค่าตั้งไปถึงและคนที่ไม่ควรเห็น และเวลาที่มีผลตาม spec ค่าตั้งที่ทั้งระบบใช้ร่วมกันรันแยกแบบ serial และคืนค่าเดิมแม้ test ล้ม (0.38) project ที่ mock API พิสูจน์ค่าตั้งข้ามเว็บเป็นสามท่อน: หน้า admin ส่งค่าถูก (E2E), API ส่งค่าที่บันทึกไปถึงฝั่งรับ (integration), หน้าฝั่งรับแสดงจาก mock ค่าเดียวกัน (E2E) และแสดงท่อนที่ยัง `missing` test ข้ามสองเว็บบน API จริงหนึ่งตัวต่อค่าตั้งใน project แบบ stack ข้อมูลที่ทุก test อ่าน (ค่าตั้ง สิทธิ์ template นาฬิกาทดสอบ) อยู่ใน project ที่รันหลัง test อ่านอย่างเดียว (`dependencies`, `workers: 1`) และคืนค่าใน `finally` `/mflow:test e2e` รันทั้งหมด ทั้งสองแบบเปิด browser พร้อมกันไม่เกิน 2 ตัว (`--workers=2`) และบันทึกผลที่ `docs/reviews/tests/` เป็น `Scope: e2e …` ซึ่งไม่นับเป็นการรันทั้งชุด
- test ที่ล้มเพราะหน้าจอเปลี่ยนโดยตั้งใจถูกปรับตามของใหม่ ถ้าล้มเพราะหน้าจอผิด spec test ยังยึด spec และรายงานเป็น defect `/mflow:e2e` แก้แค่ไฟล์ test
- `/mflow:review` ไม่นับการไม่มี E2E test เป็นข้อบกพร่อง แค่บอกหน้าจอที่ยังรอ (`E2E on request`)

## mflow เขียนอะไรลง OpenSpec

mflow คุม `/opsx:*` ผ่าน `openspec/config.yaml` ไฟล์เดียว (OpenSpec ส่งไฟล์นี้ให้ AI ทุกครั้ง และ `openspec update` ไม่เขียนทับ) ไม่แก้ skill, command หรือ schema ของ OpenSpec

- `scripts/openspec-config.mjs` เขียนบรรทัดของ mflow ใน `context`, `rules.proposal`, `rules.specs`, `rules.tasks` และ `operations.apply.guidance` `/mflow:init` รันแบบ `--dry-run` ให้ดูว่าจะลบและเพิ่มอะไรก่อน แล้วจึงเขียน
- บรรทัดของ mflow ใน list อยู่ระหว่าง `# mflow:begin <version>` กับ `# mflow:end` รุ่นถัดไปแทนเฉพาะช่วงนั้น บรรทัดที่มีถ้อยคำตรงกับของ mflow แต่อยู่นอก marker ถูกรวมเข้ามาด้วย บรรทัดที่โปรเจกต์ดัดแปลงเอง (path ของ data dictionary หรือหมายเหตุในวงเล็บ) นับเป็นของโปรเจกต์และ mflow ไม่เพิ่มของตัวเองซ้ำ ส่วน `context` เป็นข้อความก้อนเดียว (comment จะกลายเป็นเนื้อหา) จึงจำจากถ้อยคำเสมอ บรรทัดของโปรเจกต์เองและ comment ของ OpenSpec คงไว้ path ตาม folder ใน `.mflow/config.json`
- OpenSpec ทิ้ง `config.yaml` ทั้งไฟล์เมื่อ parse ไม่ได้ (เช่นมี `: ` ในบรรทัดของ list) script จึงใส่เครื่องหมายคำพูดให้บรรทัดที่ YAML จะอ่านผิด และรายงานบรรทัดของโปรเจกต์ที่เป็นแบบนั้น
- `/mflow:help check setup` เตือนเมื่อ `config.yaml` ยังมีบรรทัดรุ่นเก่า ขาดบรรทัดปัจจุบัน หรือยังไม่มี marker
- `rules.proposal` มีกฎขนาด change (0.35): หนึ่ง change คือหนึ่ง feature ทั้งฝั่ง server และหน้าจอ แยกเฉพาะเมื่อจะเกินราว 25 task หรือคุณสั่ง และแยกตาม feature (แต่ละส่วนมีทั้ง server และหน้าจอ) ไม่แยก API กับหน้าจอเป็นคนละ change ส่วนที่เหลือเขียนไว้ใต้ Later changes ให้คุณสั่ง propose ต่อ apply ที่ยาวไม่ต้องแยก เพราะ `/opsx:apply` ทำต่อใน session ใหม่จาก task แรกที่ยังไม่ติ๊ก (0.34 แยกเมื่อเกิน 15 task หรือแก้โค้ดกลางพร้อมหน้าจอ)
- `operations.apply.guidance` (0.35): จบ apply เพิ่มแถวลง `docs/reviews/pending.md` แทนการบอกให้สั่ง `/mflow:test`, `/mflow:review` หรือ `/mflow:e2e` ทั้งในคำตอบและใน STATUS.md
- คำถามที่ให้คุณเลือก (0.34.2) ทั้งตอน propose, ใน briefing ทุก session และใน AGENTS.md: มีเลขข้อ ตัวเลือกเป็น `a)` `b)` `c)` ไม่ใช่ ก ข ค ตอบบรรทัดเดียวแบบ `1 a, 2 b, 3 a` โดยไม่ต้องสลับภาษาแป้นพิมพ์
- `rules.proposal` (0.37): ถ้ามีแพ็กที่เติมคำตอบแล้ว (`docs/decisions/packs/<ชื่อ>.md`) จากเอกสาร discuss ที่อนุมัติ change ของเรื่องนั้นเริ่มจากไฟล์นี้ ไม่ถามซ้ำสิ่งที่ตัดสินแล้ว และบอกทุกจุดที่ต่างไปพร้อมเหตุผล
- `rules.specs` (0.37 และ 0.37.1): สิ่งที่ role หนึ่งตั้งหรือส่งให้อีกฝ่าย มี Scenario ของสิ่งที่ฝั่งรับเห็น และของฝ่ายภายนอกรายที่สองที่ไม่เห็นอะไรเลย ค่าตั้งที่ตั้งครั้งเดียวแล้วเปลี่ยนสิ่งที่ role หรือเว็บอื่นเห็น มี Scenario ของทุกสถานะ (ตั้งแล้วและล้างแล้ว เปิดและปิด) ของผู้ที่ค่าตั้งไปถึง (และคนอื่นไม่เห็น) และของเวลาที่มีผล ซึ่งเขียนเป็น Scenario ต่อค่าตั้ง หรือเป็นตารางเวลาที่มีผลของทุกค่าตั้งพร้อม Scenario ต่อแบบของเวลาก็ได้ (0.38)
- นอกจาก `config.yaml`: `/mflow:test` ติ๊ก gate task เก่าใน `tasks.md`, `/mflow:hotspot` ใส่ path ของ golden data ใน tasks ตอน graduate


## แพ็ก business logic (0.37, ชุดสองและชั้น .NET 0.41, ชุดสาม 0.42)

แพ็กคือคำตอบที่ทีมตัดสินไว้แล้วของเรื่องที่ทุกระบบมี (requirement template สำเร็จรูป) เป็นเอกสาร ไม่ใช่โค้ด จึงใช้ได้ทุก stack แต่ละแพ็กมีข้อตัดสินใจพร้อมเหตุผล ค่าตัวเลขเริ่มต้น requirement แบบ OpenSpec พจนานุกรมข้อมูล หน้าจอ และจุดทดสอบ ทำจาก spec ของ StemHub ที่สร้างและทดสอบแล้ว บวกคำสั่งของทีม (JWT สำหรับแอปที่เรียก API, ค่า SMTP และสวิตช์ OTP บนหน้าตั้งค่า) ทุกแพ็กมี `stack/dotnet.md` บอกวิธีสร้างบน ASP.NET Core (auth ใช้ ASP.NET Core Identity) ซึ่งต่อท้ายไฟล์แพ็กของโปรเจกต์ตอน approve เมื่อ back end เป็น .NET

| แพ็ก | เรื่อง | หัวข้อ discuss | ต้องมีก่อน |
|---|---|---|---|
| `foundation` | tech stack และโครงโค้ดมาตรฐาน: ถ้า stack ตรงกับ template จะแสดงทุกหัวข้อให้ยืนยันก่อนเริ่ม | `tech-stack`, `code-structure` | — |
| `audit` | ผู้ทำและเวลา, soft delete, Activity Log | `audit-history` | — |
| `settings` | หน้าตั้งค่าระบบ ชนิดค่า ค่าความลับ เวลาที่ค่ามีผล | `system-settings` | audit |
| `mail` | คิวอีเมล ตัวส่ง เทมเพลต ค่า SMTP บนจอ ปุ่มส่งทดสอบ | `notifications` | audit, settings |
| `auth` | เข้าระบบ รหัสผ่าน เซสชัน (cookie เมื่อเว็บอยู่ origin เดียวกับ API, JWT สำหรับ mobile ระบบอื่น และเว็บคนละ origin) OTP ทางอีเมล | `sign-in` | audit, mail, settings |
| `permission` | กลุ่ม สิทธิ์ต่อหน้าจอ เมนู ขอบเขตข้อมูล | `access-control` | auth, audit |
| `users` | จัดการบัญชี เชิญ รีเซ็ตรหัส Profile | `user-accounts` | auth, permission, audit, mail |
| `api` | route error body list แบ่งหน้า วันเวลา health OpenAPI log environment | `api-conventions` | — |
| `upload` | อัปโหลดและดาวน์โหลดไฟล์ ตรวจชนิดจริง พักก่อนผูก สิทธิ์ดาวน์โหลด | `file-upload` | audit, settings |
| `shell` | layout ภาษา วันเวลา ตาราง ฟอร์ม ข้อความ หน้า error | `web-shell` | — |
| `jobs` | งานเบื้องหลัง รอบเวลา การลองใหม่ จอติดตาม | `background-jobs` | audit |
| `import-export` | นำเข้าและส่งออก Excel ตรวจทั้งไฟล์ก่อนบันทึก รายงานแถวที่ผิด | `import-export-print` | audit, upload |
| `integration` | เรียกระบบภายนอก การลองใหม่ log จอติดตาม ระบบจำลอง | `integration` | audit, settings, jobs |

1. เลือกแพ็ก: บอกในแชต เช่น "ใช้แพ็ก auth, users" Claude รัน `packs.mjs use` ซึ่งเขียนลง `.mflow/config.json` (`packs`) และเพิ่มแพ็กที่ต้องมีก่อนให้เอง
2. `/mflow:discuss sign-in` (หรือหัวข้ออื่นในตาราง): ข้อที่แพ็กตัดสินไว้และเอกสารลูกค้าไม่พูดถึง Claude ตอบเองในตาราง "จากแพ็ก" ของหัวข้อ 2 พร้อมป้าย `[ที่มา: pack auth §AUTH-D01]` เอกสารลูกค้าที่ระบุต่างไปชนะเสมอ ถามคุณเฉพาะข้อที่เป็นของโปรเจกต์ (เช่น มีกี่พอร์ทัล เปิด OTP ไหม) แย้งข้อไหนก็ได้ด้วย `> ความเห็น:`
3. `/mflow:discuss <NN> approve`: เขียนแพ็กที่เติมคำตอบของโปรเจกต์แล้วไว้ที่ `docs/decisions/packs/<ชื่อ>.md` แล้ว `/opsx:propose` เริ่ม change จากไฟล์นั้น
4. ตรวจแพ็กหลังแก้: `node plugins/mflow/scripts/packs.mjs check` (รูปแบบ, requires, และคำที่ห้ามมีเพราะ repo เป็น public เช่น ชื่อลูกค้า เลขจอ เลขเอกสารลูกค้า IP อีเมลจริง)

ยังไม่มีคำสั่ง `/mflow:pack` จนกว่าจะใช้แพ็กครบสองโปรเจกต์ (เฟส 2: สร้างแพ็กใหม่จากโปรเจกต์ที่เสร็จแล้ว) ที่มาและแผน: `docs/mflow-pack-proposal.md` ใน repo ของ marketplace

## Flow ประจำวัน

1. ครั้งแรก: `/mflow:init` → `/mflow:discuss tech-stack` → `/mflow:discuss code-structure` (แนะนำก่อน theme ไม่บังคับ)
2. เอกสารลูกค้าเข้า `docs/source/` → `/mflow:capture` (เพิ่มหัวข้อลง `docs/decisions/discuss/AGENDA.md`)
3. ดูหัวข้อแนะนำใน `docs/decisions/discuss/AGENDA.md` (เป็นคำแนะนำ จะคุยหรือข้ามก็ได้) → เรื่องที่ตีความได้หลายแบบ (สิทธิ์, เมนู, การมองเห็นข้อมูล …) → `/mflow:discuss <slug>` → (ถ้าอยากให้ AI หลายตัวช่วยคิด `/mflow:discuss <NN> consult` แล้วรันคำสั่งเอง) → คุณตอบในไฟล์หรือในแชต → `/mflow:discuss <NN> approve`
4. ครั้งแรกของโปรเจกต์: `/mflow:theme` (หรือ `/mflow:theme preview` ถ้ายังไม่มีโค้ดแอป แล้ว `port` ใน change ที่ scaffold แอป) → `/mflow:screen inventory` (เพิ่มหัวข้อ `<กลุ่ม>-data` ลง AGENDA.md) → ออกแบบข้อมูลทีละกลุ่ม `/mflow:discuss <กลุ่ม>-data` (ไม่บังคับ)
5. สร้างหน้าจอ `/mflow:screen <ชื่อ> ...` → ทดสอบใช้งานหรือรีวิว (สลับ role บนแถบ PROTOTYPE ให้ดูเมนูและข้อมูลของแต่ละ role) → `/mflow:review-notes`
6. กฎที่ตัดข้ามหน้าจอ → `/mflow:hotspot` ทีละตั๋ว (`/clear` ระหว่างตั๋ว) (+ `/mflow:golden`) → graduate
7. `/opsx:propose` → `/opsx:apply` (Claude ทำเอง หรือส่งงานเขียนโค้ดของแต่ละ task ให้ subagent `mflow:dev` บน Sonnet 5.5 เมื่อเปิดด้วย `/mflow:subagent on` หรือ `/mflow:delegate` ให้ tool อื่น) → `/opsx:archive` → merge เมื่อคุณสั่ง → ภายหลังบน main ครั้งเดียวสำหรับทุก change ที่รอ: `/mflow:test` (เมื่อเครื่องว่าง) → `/mflow:review pending` → เมื่อหน้าจอนิ่งแล้ว `/mflow:e2e <หน้าจอ>` ทีละหน้า
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
│   ├─ session-start.mjs   ← briefing + เอกสาร/ผล AI ที่ยังไม่ได้ประมวลผล
│   ├─ status-trim.mjs     ← ย้าย block เก่าของ ## Now และ log เก่าจาก STATUS.md ไป docs/status-log.md คำต่อคำ
│   ├─ status-guard.mjs    ← hook ก่อน git commit: ขอ entry ของ STATUS.md ใน commit เดียวกัน (0.39)
│   ├─ source-index.mjs    ← ทะเบียนเอกสารลูกค้า (hash)
│   ├─ discuss.mjs         ← เลขเอกสาร discuss + ตรวจข้อที่ยังค้างก่อนอนุมัติ + สถานะของ AGENDA.md + task ทดสอบใช้งานที่ค้าง
│   ├─ delegate-cmd.mjs    ← สร้างคำสั่ง PowerShell/Bash ของแต่ละ tool
│   ├─ apply-subagent.mjs  ← เปิด/ปิด mflow:dev (ค่าใน .mflow/, ค่าเริ่มต้นปิด)
│   ├─ subagent-guard.mjs  ← hook PreToolUse ที่ปฏิเสธ mflow:dev เมื่อปิดอยู่
│   ├─ e2e-guard.mjs       ← hook PreToolUse ที่ปฏิเสธ Playwright ที่ไม่จำกัดจำนวน browser
│   ├─ openspec-config.mjs ← เขียนบรรทัดของ mflow ลง openspec/config.yaml (marker, แทนถ้อยคำรุ่นเก่า)
│   ├─ doctor.mjs          ← ตรวจสุขภาพโปรเจกต์และเครื่องมือ (อ่านอย่างเดียว)
│   ├─ inbox-normalize.mjs ← ทำรายงานจาก AI อื่นให้พร้อมตรวจ
│   ├─ consult.mjs         ← สถานะของ analyze/design/challenge (ไม่บังคับ) อ่านจากไฟล์จริง
│   ├─ review-units.mjs    ← หน่วยตรวจ: ร่าง, ตรวจว่าทุกไฟล์มีหน่วย, ไฟล์ข้อเท็จจริงที่ดึงจากโค้ด
│   ├─ pending.mjs         ← รายการรอ test และ review (docs/reviews/pending.md): range ของ change, ติ๊ก Test ตามประวัติ git, ติ๊ก Review
│   ├─ night.mjs           ← สถานะของ /mflow:night (docs/reviews/night/): ขั้นถัดไป, รอบต่อเป้าหมาย, เวลาที่เหลือ
│   ├─ apply-all.mjs       ← สถานะของ /mflow:apply-all (ระหว่างรันอยู่ใน .git จบแล้วที่ docs/reviews/apply-all/): ขั้นถัดไป, เพดานรอบ, ด่านตรวจก่อน merge
│   ├─ agent-skills.mjs    ← สร้าง skill mflow-test และ mflow-review ให้ Codex และ OpenCode ใน .agents/skills/
│   ├─ vendor.mjs          ← สำเนา plugin ใน .claude/skills/mflow/ สำหรับ Claude Code on the web: plan, write, status (0.38.1)
│   ├─ packs.mjs           ← แพ็ก business logic: list, check, selected, use (แพ็กที่โปรเจกต์เลือกใน .mflow/config.json)
│   └─ context-pack.mjs    ← รวมไฟล์เป็นไฟล์เดียวให้ chat UI
├─ skills/<คำสั่ง>/SKILL.md (+ references/, assets/)
├─ packs/<ชื่อ>/           ← แพ็ก business logic (13 แพ็ก) + stack/dotnet.md รูปแบบใน packs/README.md
└─ templates/              ← ไฟล์ที่ init วางลงโปรเจกต์
```

เอกสารที่ mflow เขียนลงโปรเจกต์อยู่ใต้ `docs/` ห้าหมวด: `source/` (เอกสารลูกค้า), `decisions/` (`discuss/`, `hotspots/`), `ui/`, `reviews/` (สรุปรีวิว, `pending.md`, `code/`, `tests/`, `change-requests/`) และ `ai/` (`inbox/`, `analysis/`, `design/`, `challenge/`) กับ `docs/vision.md`

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

Codex และ tool อื่นไม่ได้เรียก `/mflow:*` (คำสั่งเหล่านี้ทำงานใน Claude Code เท่านั้น) tool อื่นได้ทุกอย่างที่ต้องใช้จาก brief

### ตรวจระบบที่ทำแล้ว ตามที่ทำจริง

| ขั้น | ใคร | ทำอะไร |
|---|---|---|
| 1 | Claude Code | `/mflow:analyze units` แตกโค้ดเป็นหน่วยตรวจ แล้ว `review-units.mjs check` ยืนยันว่าทุกไฟล์มีหน่วย หรืออยู่ในกลุ่มที่ไม่ตรวจพร้อมเหตุผล และ spec ทุกด้านมีหน่วยรับ |
| 2 | คุณ | ดูแผน รวม แยก หรือเรียงลำดับหน่วย |
| 3 | Claude Code | `/mflow:analyze unit:<ชื่อ> --to codex,opencode` เขียน brief + ไฟล์ข้อเท็จจริง (รายชื่อไฟล์, ชื่อ test, route/endpoint, schema ที่ script ดึงจากโค้ด) แล้วแสดงคำสั่งของแต่ละ tool |
| 4 | คุณ | รันคำสั่งของ Codex / OpenCode |
| 5 | Codex / OpenCode | อ่าน brief แล้วอ่าน repo แบบอ่านอย่างเดียว เขียนรายงานลง `docs/ai/inbox/` (ห้ามเปิด `docs/source/`, `docs/decisions/`, `docs/vision.md`, STATUS.md, backlog) |
| 6 | Claude Code | `/mflow:analyze AN-NNN` ตรวจทุกข้อกับโค้ดจริง บอกไฟล์ของหน่วยที่ไม่มีรายงานไหนอ่าน แล้วเขียนสรุปที่บอกว่าแต่ละข้อ "ไปที่" ไหน พร้อม `## ต้องตัดสินก่อน` |
| 7 | คุณ | `/mflow:analyze AN-NNN แก้ F1,F3; Q1=a; ที่เหลือตามแนะนำ` |
| 8 | Claude Code | `/opsx:propose <หน่วย>-review-fixes` → `/opsx:apply` → `/mflow:test` → `/mflow:review` → `/opsx:archive` |

กฎว่าข้อไหนไปที่ไหน: "แก้แล้ว spec ยังพูดถูกโดยไม่ต้องแตะหรือไม่" ถ้าไม่ (โค้ดทำสิ่งที่ spec ไม่บอกแล้วเลือกเก็บ, bug ในกรณีที่ spec ไม่ได้พูดถึง, โลจิกใหม่) เข้า OpenSpec พร้อม delta spec ถ้าใช่ (bug ที่ spec บอกถูกอยู่แล้ว, test ที่ขาด, refactor) เป็น task ใน change เดียวกัน หรือใน Backlog ถ้าไม่มี change รวมเป็นชุดละหน่วยเพื่อให้ test ทั้งชุดรันครั้งเดียว คำถามระดับหนัก (schema, สิทธิ์, ข้อมูลที่ลูกค้าไม่ได้พูดถึง, การลบ, การส่งออกนอกระบบ) ไป `/mflow:discuss` และ change ของหน่วยทำต่อไปก่อนโดยไม่รวมข้อที่รอคำตอบ

ค่าเสริมใน `.mflow/config.json` (ไม่บังคับ): `asBuilt.openapi` path ของไฟล์ OpenAPI ที่โปรเจกต์ export ไว้ (mflow ไม่รันแอปเอง) และ `asBuilt.facts.tests` / `asBuilt.facts.routes` regular expression เพิ่มเติม (มี capture group เดียวเป็นชื่อ test หรือ route)


### ให้ Codex หรือ OpenCode รัน test และรีวิว

`/mflow:init` สร้าง `/mflow:test` และ `/mflow:review` เป็น skill ใน `.agents/skills/mflow-test/` และ `mflow-review/` (ถามก่อนเขียน) ซึ่ง Codex และ OpenCode อ่านจากโฟลเดอร์เดียวกัน:

| เครื่องมือ | เรียก |
|---|---|
| Claude Code | `/mflow:test`, `/mflow:review` (เหมือนเดิม) |
| Codex | `$mflow-test`, `$mflow-review` (หรือเลือกจาก `/skills`) |
| OpenCode | `/mflow-test`, `/mflow-review` |

- ผลใช้ข้ามเครื่องมือได้: record ของ test มี `By:` และ `/mflow:review` ของ Claude ใช้ record ที่ Codex หรือ OpenCode รันได้ตามกฎเดิม รายงาน review มี `Reviewer:` และ `Author:` ถ้า Codex หรือ OpenCode รีวิวโค้ดที่ตัวเองเขียน รายงานนั้นไม่นับเป็นเงื่อนไข merge
- E2E ไม่รันใน Codex และ OpenCode เพราะไม่มี hook จำกัดจำนวน browser ให้รัน `/mflow:test e2e` ใน Claude Code
- ตรวจกับ Codex จริงบนเครื่องไหนก็ได้ที่มี Codex CLI ที่ login แล้ว: ใน checkout ของ mflow-marketplace รัน `node tests/smoke/codex-skills.mjs` (กรณี `test`, `review`, `e2e`, `self` เลือกได้ด้วย `--cases`) script สร้างโปรเจกต์จำลองใน temp ให้ Codex รันแต่ละกรณีแล้วตรวจสิ่งที่ Codex เขียน ใช้ token ของ Codex ราว 30-40k ต่อกรณี จึงไม่อยู่ใน `node --test` และ CI
- อย่าแก้ไฟล์ใน `.agents/skills/mflow-*` เอง `/mflow:init` เขียนใหม่ทุกครั้งที่ plugin เปลี่ยน (`doctor` เตือนเมื่อสำเนาเก่า) skill ของคุณเองที่ชื่อซ้ำจะไม่ถูกแตะ
- Codex ต้องใช้ sandbox `workspace-write` สำหรับ test (build เขียนไฟล์) ตอนลองบน Windows sandbox บล็อกการหา path ของ Node ทั้งสองครั้ง แล้ว Codex รันคำสั่งนอก sandbox เองโดยไม่ถาม (โหมด `codex exec` กับค่า approval ของเครื่องนั้น) จะมีคำถามก่อนหรือไม่ขึ้นกับค่า approval ของ Codex ที่คุณตั้งไว้

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

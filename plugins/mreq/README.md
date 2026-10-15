# mreq

เก็บ requirement ของระบบให้ครบและตรงกันก่อนเริ่มสร้าง: คุยเรื่องพื้นฐานของการสร้างระบบ (tech stack, ชื่อโปรเจกต์, โครงโฟลเดอร์ที่รองรับหลายแอป, คุณภาพที่ต้องการ, ความปลอดภัยและ PDPA) ด้วยเอกสาร discuss ที่คุณตอบและอนุมัติ แล้ววาง UI kit เป็นหน้า HTML ที่เปิดดูได้โดยไม่ต้องมีแอป ทุกอย่างอยู่ในโฟลเดอร์ `mreq/` เป็นไฟล์ Markdown, JSON และ HTML ธรรมดา คนอ่านได้ และ AI ทุกตัวอ่านได้

mreq ไม่สร้างโค้ดของระบบ และไม่ต้องติดตั้งเครื่องมืออื่น ใช้แค่ Claude Code กับ Node 20+ ผู้สร้างจริง จะเป็นทีมพัฒนาหรือเครื่องมือเขียน spec ตัวไหนก็ได้ อ่าน requirement จาก `mreq/` ได้ทันที เพราะ AGENTS.md ชี้ไปที่ `mreq/project/README.md`

คำตอบและคำสั่งของคุณถือเป็นคำสั่งของลูกค้า ทำก่อน ทดสอบใช้งาน แล้วปรับเพิ่ม ของที่อนุมัติแล้วยังเปลี่ยนได้เสมอ: เรื่องที่ตกลงแล้วเปลี่ยนด้วยเอกสารฉบับใหม่ที่มาแทน ส่วน UI kit แก้ด้วย `/mreq:theme update` ซึ่งเพิ่ม revision และบันทึกเหตุผล

## ติดตั้ง

```
/plugin marketplace add mounchons/mflow-marketplace   # หรือ path ของโฟลเดอร์ในเครื่อง
/plugin install mreq@mflow-marketplace
```

แนะนำให้ติดตั้ง skill `frontend-design` ไว้ด้วย theme จะใช้ช่วยวางหน้าตาเมื่อมี: `/plugin install frontend-design@claude-plugins-official`

ใช้ mreq ในโปรเจกต์ที่ยังไม่ได้ใช้ workflow plugin อีกตัวของ marketplace นี้ ถ้าเจอ `.mflow/config.json` คำสั่งของ mreq จะหยุดและไม่เขียนอะไร

## คำสั่ง (v0.1)

| คำสั่ง | ทำอะไร |
|---|---|
| `/mreq:init [ชื่อ]` | ตั้งโปรเจกต์: สำรวจ ถามชื่อที่ใช้แสดงและชื่อโปรเจกต์ในโค้ด (เสนอให้สามชื่อ) แล้ววาง AGENTS.md, CLAUDE.md และ `mreq/` พร้อม AGENDA ที่มีสี่หัวข้อพื้นฐาน |
| `/mreq:discuss [<หัวข้อ> \| <NN> [ความเห็น] \| <NN> approve \| <NN> drop <เหตุผล> \| agenda]` | เขียนเอกสาร discuss ทีละหัวข้อ ให้คุณตอบข้อตัดสินใจ แก้จนตรงกัน แล้วอนุมัติ ข้อที่ตกลงจะไปอยู่ใน AGENTS.md (`## Stack`, `## Architecture`, `## Conventions`), `mreq/project/vision.md` และ `mreq/project/followups.md` |
| `/mreq:theme [ข้อมูลแบรนด์ \| @logo \| @CI]` | สร้าง UI kit ใน `mreq/ui/theme/`: token สี ฟอนต์ ขนาด, โครงหน้าแยกตามชนิดแอป (หลังบ้านและหน้าบ้าน), component, style guide, หน้าตัวอย่าง และตัวสลับผู้ใช้ตาม role |
| `/mreq:theme open` | เปิด `mreq/ui/` ที่ `127.0.0.1` แล้วให้ URL ไปดูใน browser |
| `/mreq:theme approve` | อนุมัติ kit (บันทึกวันที่) |
| `/mreq:theme update <สิ่งที่จะเปลี่ยน>` | แก้ kit ได้ทั้งก่อนและหลังอนุมัติ เพิ่ม revision และบันทึกเหตุผลใน `mreq/ui/theme/README.md` |
| `/mreq:help [สถานการณ์ \| check setup]` | บอกคำสั่งที่เหมาะ หรือตรวจโปรเจกต์แบบอ่านอย่างเดียว |

## Flow

1. `/mreq:init`
2. หัวข้อพื้นฐาน: `/mreq:discuss tech-stack` → `code-structure` → `nfr` (แนะนำก่อน theme ไม่บังคับ) ส่วน `security-privacy` คุยก่อนส่งมอบครั้งแรก
3. `/mreq:theme` → `/mreq:theme open` ลองดู → แก้ด้วย `update` → `/mreq:theme approve`
4. เปลี่ยนใจเมื่อไหร่ก็ได้: เรื่องที่ตกลงแล้วใช้ `/mreq:discuss <หัวข้อเดิม>` (เอกสารฉบับใหม่มาแทน) ส่วนหน้าตาใช้ `/mreq:theme update`

ตอนเริ่มทุก session จะมีสรุปสถานะ (STATUS.md, เอกสารที่รอคุณตอบ, หัวข้อที่ยังไม่ได้คุย, สถานะ kit) ให้ Claude อ่านก่อนทำงาน

## ไฟล์ในโปรเจกต์

```
<project>/
├─ AGENTS.md, CLAUDE.md        ← ข้อตกลงสำหรับ AI ทุกตัว: Stack, Architecture, Conventions, ที่อยู่ของ requirement
├─ .claude/rules/ui.md         ← กฎสร้างหน้าจอจาก kit (โหลดเมื่อเปิดไฟล์ใน mreq/ui/)
├─ .mreq/                      ← ค่าตั้งและบันทึกที่ script เขียน (config.json, templates.json)
└─ mreq/
   ├─ project/                 ← README (จุดเริ่มอ่าน), STATUS, vision, followups
   ├─ source/                  ← เอกสารลูกค้า (ต้นฉบับ ไม่แก้)
   ├─ discuss/                 ← AGENDA.md และเอกสาร NN-<slug>.md
   └─ ui/                      ← theme/ (UI kit), design-system.md, contracts/ (สัญญาของ component สำหรับผู้สร้าง), data/ (ผู้ใช้ตัวอย่างและ role)
```

## ภายใน plugin

```
mreq/
├─ .claude-plugin/plugin.json
├─ hooks/hooks.json            ← SessionStart
├─ scripts/                    ← Node ล้วน ไม่มี dependency (Windows/Linux)
│   ├─ lib.mjs                 ← หา root จาก .mreq/config.json, path คงที่ของ mreq/
│   ├─ scaffold.mjs            ← วาง template ไม่เขียนทับ
│   ├─ discuss.mjs             ← เลขเอกสาร, check, agenda, cited
│   ├─ theme-status.mjs        ← สถานะและ revision ของ kit
│   ├─ serve.mjs               ← เปิด mreq/ui/ ที่ 127.0.0.1
│   ├─ session-start.mjs       ← สรุปสถานะตอนเริ่ม session
│   └─ doctor.mjs              ← ตรวจโปรเจกต์ (อ่านอย่างเดียว)
├─ skills/<คำสั่ง>/SKILL.md (+ references/, assets/)
└─ templates/                  ← ไฟล์ที่ init วางลงโปรเจกต์
```

test อยู่ที่ `tests/mreq-*.test.mjs` ของ repo (`node --test` ที่ root) รวม test ที่ตรวจว่าไฟล์ใน plugin ไม่อ้างถึงเครื่องมือภายนอก และทุก path ที่ skill อ้างมีอยู่จริง

## รุ่นถัดไป

ตามแผนใน `docs/requirement-plugin-proposal.md` ของ repo: รับ requirement เพิ่มจากเอกสารหรือข้อความ (capture) และหัวข้อ discuss อื่น, หน้าจอตัวอย่างแยกตามแอปพร้อมกฎธุรกิจ (screen, hotspot, review-notes), และชุดส่งมอบที่ส่งได้หลายครั้งแบบส่วนต่าง (handoff)

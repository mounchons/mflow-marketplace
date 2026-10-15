# ข้อเสนอ: plugin `mreq` สำหรับเก็บ requirement ด้วย discuss, theme และ screen

วันที่: 2026-10-13 · Revision: 0.4 · สถานะ: เฟส 1 สร้างแล้วใน `plugins/mreq` (0.1.0) test ผ่าน ยังไม่ได้ทดลองกับโปรเจกต์จริง (หัวข้อ 8.7 ข้อ 8)

> ความคืบหน้า (2026-10-13): เฟส 1 ทำตามหัวข้อ 8 พร้อมสิ่งที่เพิ่มระหว่างสร้าง: `theme-status.mjs contracts` คัด `component-contracts.md`, `responsive.md` และ `access-data.md` ไปไว้ที่ `mreq/ui/contracts/` เพื่อให้ผู้สร้างที่ไม่มี plugin นี้มีสัญญาของ component ครบ, `.mreq/.gitignore` สำหรับไฟล์ชั่วคราว (`cache/`, `suggested/`) และ `/mreq:theme open` ที่เปิด `mreq/ui/` ด้วย `serve.mjs`

> วิธีตอบ: ถ้าอยากให้แก้ส่วนไหน ให้เขียนบรรทัด `> ความเห็น:` ไว้ใต้ส่วนนั้น หรือตอบในแชตก็ได้ ข้อตัดสินใจทั้งหมดอยู่ในหัวข้อ 11

## 1. สรุป

- `mreq` ใช้ในช่วงก่อนสร้างระบบจริง ทำสามอย่าง: คุย requirement ให้เข้าใจตรงกัน (discuss) วาง UI kit (theme) และทำหน้าจอตัวอย่าง (screen) แล้วรวมทั้งหมดเป็นชุด requirement ใน `mreq/` ให้คนหรือเครื่องมือใดก็ได้ไปสร้างต่อ
- ไม่เรียก ไม่ติดตั้ง และไม่ต้องมี OpenSpec, Spec Kit, Backlog.md หรือคำสั่ง `/opsx:*` ใช้แค่ Claude Code กับ Node 20 ขึ้นไป
- คำถามพื้นฐานของการสร้างระบบ (tech stack, ชื่อโปรเจกต์, ชื่อแอป, โครงโฟลเดอร์ที่รองรับหลายแอป, คุณภาพที่ต้องการ, ความปลอดภัยและ PDPA) อยู่ในชุด requirement ด้วย plugin ไม่สร้างโค้ดหรือโฟลเดอร์ตามคำตอบ แต่บันทึกไว้ให้ผู้สร้างจริงใช้ (หัวข้อ 7)
- ชุด requirement ไม่ได้ทำครั้งเดียวจบ รับ requirement เพิ่มได้ ปรับ theme และหน้าจอได้ตลอด และส่งมอบได้หลายครั้ง โดยครั้งหลังๆ ส่งเฉพาะส่วนที่เปลี่ยน (หัวข้อ 4)
- เนื้อหาของ skill คัดมาจาก mflow แล้วแยกกันไปเลย ไม่ต้องตรงกับ mflow อีก (D2 b)
- ทำทีละเฟส เฟส 1 คือพื้นฐานของ plugin, discuss สำหรับหัวข้อพื้นฐาน และ theme (หัวข้อ 8)

## 2. ผลลัพธ์: ชุด requirement ใน `mreq/`

ใน mflow สิ่งที่ถือเป็น "ความจริงปัจจุบัน" คือ `openspec/specs/` ซึ่งบอกว่าระบบสร้างอะไรไปแล้ว `mreq` ไม่มีโฟลเดอร์นี้ ผลลัพธ์ของ `mreq` คือชุด requirement ที่เป็นไฟล์ Markdown, JSON และ HTML ธรรมดา แยกโฟลเดอร์ตามหมวดใต้ `mreq/` ที่ root ของโปรเจกต์ ไม่อยู่ใต้ `docs/` (D3) คนเปิดอ่านได้ และ AI ทุกตัวก็อ่านได้ `.mreq/` เก็บค่าตั้งและสถานะที่ script เขียน ส่วน `mreq/` เก็บเนื้อหา

```
<project>/
├─ AGENTS.md                   ← (D5) ภาพรวม, ## Stack, ## Architecture, ข้อตกลง, ที่อยู่ของ requirement
├─ CLAUDE.md                   ← @AGENTS.md
├─ .claude/rules/ui.md         ← กฎสร้างหน้าจอ, paths: mreq/ui/**
├─ .mreq/                      ← config.json (marker), templates.json, handoffs.json (เฟส 4)
└─ mreq/
   ├─ project/
   │  ├─ README.md             ← สารบัญของชุด requirement และสถานะของแต่ละหมวด (จุดเริ่มอ่าน)
   │  ├─ STATUS.md             ← (D6) งานที่ทำอยู่, ขั้นถัดไป, log สั้นๆ
   │  ├─ vision.md             ← วัตถุประสงค์, ผู้ใช้และ role, story map, สิ่งที่ไม่รวม, คุณภาพที่ต้องการ
   │  └─ followups.md          ← (D7) งานให้ผู้สร้าง และสิ่งที่ต้องตรวจตอนทดสอบใช้งาน
   ├─ source/                  ← เอกสารลูกค้า, INDEX.md, requests/ (requirement ที่คุณพิมพ์เอง)
   ├─ discuss/                 ← AGENDA.md และเอกสาร NN-<slug>.md
   ├─ hotspot/                 ← INDEX.md และ <slug>/ (map, rules, ตัวอย่างผลลัพธ์)
   ├─ ui/
   │  ├─ README.md             ← วิธีเปิดดู
   │  ├─ design-system.md      ← component ไหนใช้กับงานแบบไหน, ควรทำและห้ามทำ
   │  ├─ theme/                ← UI kit (static preview)
   │  ├─ data/                 ← users.json, roles.json, README.md (data dictionary), JSON ของแต่ละ entity
   │  ├─ screens.md            ← รายการหน้าจอ แยกตามแอป
   │  └─ prototype/<App>/      ← หน้าจอตัวอย่างของแต่ละแอป
   ├─ reviews/                 ← ผลจากการให้คนลองใช้
   └─ handoff/                 ← v1.md, v2.md, … ชุดส่งมอบแต่ละครั้ง
```

| หมวด | สร้างโดย | เฟส |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md`, `project/` | init (แล้ว discuss เติม) | 1 |
| `discuss/` หัวข้อพื้นฐาน | discuss | 1 |
| `ui/theme/`, `ui/design-system.md`, `ui/data/users.json`, `roles.json` | theme | 1 |
| `source/`, `discuss/` หัวข้ออื่น | capture, discuss | 2 |
| `ui/screens.md`, `ui/prototype/`, `ui/data/` ของ entity, `hotspot/`, `reviews/` | screen, hotspot, review-notes | 3 |
| `handoff/` | handoff | 4 |

ความจริงปัจจุบันของ `mreq` ประกอบด้วยเอกสาร discuss ที่ `approved`, กฎใน hotspot ที่พร้อมแล้ว, kit ที่ `approved` และหน้าจอใน `screens.md` ตามสถานะของแต่ละหน้า `mreq/project/README.md` เป็นจุดเริ่มอ่านที่ชี้ไปยังทุกส่วน และ AGENTS.md ชี้มาที่ไฟล์นี้

## 3. ขอบเขต

ทำ:
- คุยและอนุมัติ requirement ทีละหัวข้อ เริ่มจากหัวข้อพื้นฐานของการสร้างระบบ
- วาง UI kit เป็นหน้า HTML ธรรมดาที่เปิดดูได้โดยไม่ต้องมีแอป (static preview) รองรับหลายแอป
- ทำหน้าจอตัวอย่างที่ใช้ข้อมูลปลอมและสลับ role ได้ แยกตามแอป
- จับกฎธุรกิจที่ซับซ้อน (hotspot) ให้ชัดก่อนส่งมอบ
- รับ requirement เพิ่มและปรับได้ตลอด แล้วส่งมอบเป็นรุ่น

ไม่ทำ:
- ไม่สร้างโค้ด production, solution หรือโฟลเดอร์ของแอป stack และโครงโฟลเดอร์เป็นข้อตัดสินใจที่บันทึกไว้ ส่วนการสร้างจริงเป็นงานของผู้สร้าง (D8)
- ไม่ต่อกับ OpenSpec, Spec Kit, Backlog.md หรือเครื่องมือเขียน spec ตัวไหน ชุดส่งมอบมีข้อความตั้งต้นให้เอาไปใช้กับเครื่องมือเหล่านั้นได้ แต่ `mreq` ไม่เรียกเครื่องมือเอง
- ไม่รัน AI tool อื่นแทนผู้ใช้
- ไม่ติดตามว่าผู้สร้างทำไปถึงไหนแล้ว
- ไม่ทำงานในโปรเจกต์ที่ใช้ mflow อยู่ ถ้าเจอ `.mflow/config.json` ให้บอกผู้ใช้แล้วหยุด

## 4. ส่ง requirement เพิ่ม และปรับ theme, screen ได้ตลอด

ชุด requirement เปลี่ยนได้เสมอ ลูกค้าอาจส่งเอกสารใหม่ คุณอาจนึกเรื่องใหม่ได้ หรือลองหน้าจอแล้วอยากเปลี่ยน ทุกกรณีมีทางเข้า คำสั่งของคุณถือเป็นการอนุมัติของลูกค้า (P10) จึงไม่ต้องอนุมัติซ้ำ และของที่อนุมัติไปแล้วก็ยังแก้ได้

### 4.1 รับ requirement เพิ่มและปรับของที่มีอยู่

| สิ่งที่เข้ามา | คำสั่ง | ผล | เฟส |
|---|---|---|---|
| ปรับ UI kit | `/mreq:theme update <สิ่งที่จะเปลี่ยน>` | เทียบกับของเดิม แสดงส่วนที่จะเปลี่ยน แล้วแก้ทันทีตามคำสั่ง ถ้า kit อนุมัติแล้ว สถานะยังเป็น `approved` แต่ rev ของ kit เพิ่มขึ้นหนึ่ง และมีบรรทัดในบันทึกการแก้ไขของ kit ทุกหน้าจอเปลี่ยนตามเองเพราะไม่มีหน้าไหนมีสไตล์ของตัวเอง | 1 |
| เปลี่ยนเรื่องที่ตกลงแล้ว | `/mreq:discuss <หัวข้อ>` | เขียนเอกสารฉบับใหม่มาแทน (supersede) ฉบับเดิม ส่วนฉบับเดิมไม่ถูกแก้และเก็บไว้เป็นเหตุผล | 1 |
| เอกสารลูกค้าฉบับใหม่หรือฉบับแก้ | วางไฟล์ใน `mreq/source/` แล้วสั่ง `/mreq:capture` | อ่านเฉพาะไฟล์ใหม่หรือไฟล์ที่เปลี่ยน แล้วแยกทีละข้อไปยังปลายทาง (4.2) | 2 |
| requirement ที่คุณพิมพ์เอง | `/mreq:capture <ข้อความ>` | บันทึกเป็น `mreq/source/requests/<วันที่>-<slug>.md` ก่อนเพื่อให้มีที่มาอ้างอิงได้ แล้วแยกเหมือนเอกสาร | 2 |
| ปรับหน้าจอ | `/mreq:screen <ชื่อ> <สิ่งที่จะเปลี่ยน>` | แก้หน้าจอ ข้อมูล และแถวใน `screens.md` สิ่งที่ kit ทำไม่ได้ให้ไป `theme update` แทนการใส่สไตล์ในหน้า | 3 |
| ผลจากการให้คนลองใช้ | `/mreq:review-notes @notes` | แยกเป็นการแก้หน้าจอ เรื่องที่ต้องคุย และกฎ | 3 |

### 4.2 ปลายทางของแต่ละข้อที่เข้ามา (capture)

| ข้อที่เข้ามา | ไปที่ |
|---|---|
| เรื่องที่ตีความได้หลายแบบ หรือเอกสารยังไม่บอก | แถวใหม่ใน `discuss/AGENDA.md` |
| ขัดกับเรื่องที่อนุมัติแล้ว และมาจากคำของคุณ | ทำตามคำของคุณ: เปิดเอกสาร discuss ฉบับใหม่ที่มาแทนฉบับเดิม |
| ขัดกับเรื่องที่อนุมัติแล้ว และมาจากเอกสารลูกค้า | ใส่หมายเหตุ **ทบทวน:** ในแถวของหัวข้อนั้นใน AGENDA แล้วให้คุณตัดสิน |
| หน้าจอใหม่หรือหน้าจอที่ต้องแก้ | แถวใน `ui/screens.md` แล้วตามด้วย `/mreq:screen` |
| หน้าตาหรือ component | `/mreq:theme update` |
| กฎธุรกิจที่ต้องตอบหลายข้อหรือต้องมีตัวอย่าง | แถวใน `hotspot/INDEX.md` |
| ขอบเขต หรือสิ่งที่ไม่ทำ | `project/vision.md` |
| งานที่ผู้สร้างต้องทำ | `project/followups.md` |

### 4.3 ส่ง requirement หลายครั้ง (เฟส 4)

- **ครั้งแรก** `/mreq:handoff` สร้าง `mreq/handoff/v1.md` ซึ่งมีสรุปชุด requirement ทั้งชุดพร้อมลิงก์ทุกไฟล์ งานแรกของผู้สร้าง (สร้าง solution และโฟลเดอร์ตาม `code-structure`) และข้อความตั้งต้นสำหรับเครื่องมือปลายทาง (OpenSpec, Spec Kit หรือทีม dev)
- `.mreq/handoffs.json` บันทึก hash ของทุกไฟล์ใน `mreq/` ตอนส่งแต่ละครั้ง ไม่ต้องพึ่ง git
- **ครั้งถัดไป** `v2.md`, `v3.md` … ส่งเฉพาะส่วนที่เปลี่ยน แยกตามหมวดเป็น เพิ่ม / เปลี่ยน / ถูกแทน / ยกเลิก แต่ละข้อมีลิงก์และบอกว่าผู้สร้างต้องทำอะไร script หาว่าไฟล์ไหนเปลี่ยนโดยเทียบ hash ส่วนสรุปของแต่ละข้อมาจากบันทึกการแก้ไขที่มีอยู่แล้ว (rev log ของเอกสาร discuss และของ kit)
- ส่งมอบแล้วยังแก้ได้ตามปกติ สิ่งที่แก้หลังส่งมอบจะไปอยู่ในรุ่นถัดไป และ briefing ตอนเริ่ม session จะบอกว่ามีอะไรเปลี่ยนไปแล้วบ้างตั้งแต่ส่งมอบครั้งล่าสุด
- ผู้สร้างนำส่วนต่างไปทำเป็น change ในเครื่องมือของตัวเอง `mreq` ไม่รู้ว่าผู้สร้างทำไปถึงไหน

### 4.4 ให้ OpenSpec หรือ Spec Kit อ่าน requirement จาก `mreq/`

ทั้งสองเครื่องมือทำงานผ่าน AI agent ที่รับข้อความอิสระและอ่านไฟล์ใน repo ได้ จึงสั่งให้อ่าน `mreq/` ได้ทันทีโดย `mreq` ไม่ต้องต่อกับเครื่องมือใด และโฟลเดอร์ไม่ชนกัน (`mreq/` กับ `.mreq/` เทียบกับ `openspec/` หรือ `.specify/` กับ `specs/`)

| ระดับ | OpenSpec | Spec Kit |
|---|---|---|
| ทุก session | AGENTS.md (D5) ชี้ไปที่ `mreq/project/README.md` | เหมือนกัน |
| ทุกคำสั่งของเครื่องมือ | `context:` ใน `openspec/config.yaml` ซึ่งเข้าไปอยู่ใน instruction ของ proposal, specs และ tasks ทุกครั้ง (mflow ใช้วิธีนี้อยู่แล้วกับ OpenSpec 1.13.2) และ `rules.proposal` ให้ลิงก์เอกสารใน `mreq/` ที่ change มาจาก | constitution (`memory/constitution.md` ตามเอกสารของ Spec Kit) ใส่หลักว่า requirement มาจาก `mreq/` เท่านั้น spec ต้องอ้างเอกสารต้นทาง และห้ามเพิ่ม requirement ที่ไม่มีใน `mreq/` |
| ทีละงาน | `/opsx:propose <change>` พร้อมข้อความว่าให้อ่านข้อไหนของ `mreq/handoff/vN.md` | `/speckit-specify` พร้อมข้อความว่าให้อ่านเอกสารไหน แล้วตามด้วย `/speckit-plan` ที่ใช้ stack จาก AGENTS.md `## Stack` |

ส่วนของ `mreq` ที่ไปอยู่ในแต่ละเครื่องมือ:

| ใน `mreq/` | OpenSpec | Spec Kit |
|---|---|---|
| เอกสาร discuss ที่อนุมัติ, กฎใน hotspot, หน้าจอ | proposal และ delta specs | `spec.md` |
| AGENTS.md `## Stack`, `## Architecture`, `nfr`, `security-privacy` | `context` และ design ของ change | constitution และ `plan.md` |
| `ui/data/README.md` (data dictionary) | specs ของ entity | `data-model.md` |
| `project/followups.md` | `tasks.md` | `tasks.md` |
| `handoff/v2.md` ขึ้นไป | change ใหม่หนึ่งตัวต่อหนึ่งข้อ | feature ใหม่หนึ่งตัวต่อหนึ่งข้อ |

ข้อควรรู้:
- **ขนาดงานต่างกัน:** `mreq` เก็บ requirement ของทั้งระบบ ส่วน change ของ OpenSpec หรือ feature ของ Spec Kit เป็นงานทีละชิ้น ชุดส่งมอบในเฟส 4 จึงแบ่งเป็นข้อๆ และมีข้อความตั้งต้นของแต่ละข้อให้ใช้ได้ทันที ถ้ายังไม่มีเฟส 4 ให้สั่งเองทีละชิ้นได้
- **ความจริงสองชุด:** หลังสร้างแล้ว `openspec/specs/` หรือ `specs/` บอกว่าสร้างอะไรไปแล้ว ส่วน `mreq/` บอกว่าต้องการอะไร ถ้า requirement เปลี่ยน ให้แก้ที่ `mreq/` ก่อน แล้วส่งเป็นส่วนต่างในการส่งมอบรุ่นถัดไป ถ้าแก้ที่ spec อย่างเดียว `mreq/` จะเก่าโดยไม่มีใครรู้
- **ชื่อคำสั่งของ Spec Kit เปลี่ยนไปตามรุ่น:** README ตอนนี้ (ตรวจเมื่อ 2026-10-13) เขียน `/speckit-specify`, `/speckit-plan` ส่วน `spec-driven.md` ยังเขียน `/speckit.specify` ให้ดูชื่อจากรุ่นที่ติดตั้งจริง
- **test ข้อ 2 ในหัวข้อ 8.7:** เฟส 4 จะมี template ข้อความตั้งต้นที่มีชื่อ OpenSpec และ Spec Kit อยู่ test จึงต้องยกเว้นไฟล์ template เหล่านั้นเมื่อถึงเฟส 4

## 5. จุดที่ mflow ผูกกับ OpenSpec และสิ่งที่ใช้แทน

| จุดใน mflow | ผูกกับ | ใน `mreq` |
|---|---|---|
| `init` ขั้น 1 (`openspec --version`, `backlog --version`) และขั้น 4 (`openspec init`, `config.yaml`, `backlog init`) | OpenSpec, Backlog.md | ตัดทิ้งทั้งหมด |
| `init` ขั้น 2 (stack profile และชื่อโปรเจกต์ในโค้ด) | stack | ยังถามชื่อโปรเจกต์ในโค้ด แต่ไม่มี stack profile เพราะไม่มี skill ไหนต้องหา path ไปสร้างโค้ด ส่วน stack ตกลงกันในเอกสาร `tech-stack` |
| `init` ขั้น 7 (`doctor.mjs`) และ `compat.json` (รุ่นขั้นต่ำของ openspec, backlog) | OpenSpec, Backlog.md | doctor ตัวเล็กที่ตรวจแค่รุ่น Node กับโครงไฟล์ |
| `theme/SKILL.md:20` (ยังไม่มีแอปให้ไป `/opsx:propose`) | OpenSpec | ไม่มีทางนี้ theme ทำเป็น preview เสมอ |
| `theme/references/preview.md:66` (`port` ต้องสร้างแอปผ่าน `/opsx:propose`) | OpenSpec | ไม่มี `port` การส่งต่อไปสร้างจริงอยู่ในชุดส่งมอบ |
| `theme` ขั้น 3–4 (production-safety test, parser test ด้วย xUnit) | stack | ตารางตรวจ parser ที่รันบนหน้า style guide |
| `discuss/SKILL.md:13, 17, 91, 112, 116, 123, 150` (`/opsx:explore`, `/opsx:propose`, `openspec/specs/`) | OpenSpec | เอกสารที่อนุมัติแล้วใช้แทน spec ส่วนเรื่องที่ต้องสร้างไปที่ `project/followups.md` และชุดส่งมอบ |
| ตารางปลายทางของ `discuss approve` (Backlog task, `backlog decision`) | Backlog.md | `project/followups.md` และ AGENTS.md (D5, D7) |
| `hotspot` ขั้น graduate (`/opsx:propose`, `openspec validate`) | OpenSpec | rules.md ที่ผ่านเกณฑ์ความพร้อมถือว่าพร้อมส่งมอบ แล้วเข้าไปในชุดส่งมอบรุ่นถัดไป |
| `screen/SKILL.md:16` (สร้างแอปผ่าน `/opsx:propose`) และ `:54` (หน้าจอที่ archive ใน `openspec/specs/`) | OpenSpec, stack | หน้าจอ static บน kit ใช้ข้อมูลจาก `mreq/ui/data/` |
| hook `session-start.mjs` (`openspec list`, งานใน backlog), `subagent-guard.mjs`, `stop-guard.mjs` | OpenSpec, Backlog.md | `session-start.mjs` ตัวใหม่ที่อ่านแค่ไฟล์ใน `mreq/` ไม่มี subagent-guard และไม่มี Stop hook (D6) |

## 6. สิ่งที่คงไว้จาก mflow และสิ่งที่ตัดออก

คงไว้ (เป็นข้อกำหนดที่คุณยืนยันแล้วใน mflow):
- คำตอบของคุณถือเป็นคำสั่งของลูกค้า หลักคือทำก่อน ทดสอบใช้งาน แล้วค่อยปรับเพิ่ม (P10) ไม่มีขั้นตอนไหนที่เก็บคำถามไว้รอลูกค้าตอบ
- ไม่ใส่ชื่อบุคคลใน skill, template และเอกสาร
- house style ใช้สีสดตาม UI kit ของคุณ และไม่ลดความสดของสี (hue)
- ทุก skill ตั้ง `disable-model-invocation: true` จึงเรียกได้ด้วยมือเท่านั้น
- ตัว skill เขียนเป็นภาษาอังกฤษ ข้อความที่คุณอ่านเป็นภาษาไทย และเรียกผู้ใช้ว่า "คุณ"
- งานที่ต้องได้ผลเหมือนเดิมทุกครั้งเขียนเป็น script (Node ล้วน ไม่มี dependency ใช้ได้ทั้ง Windows และ Linux) และมี test ใน `tests/`
- script ไม่เขียนทับไฟล์ที่มีอยู่แล้ว ใช้วิธีเดียวกับ `suggested/` ของ scaffold ใน mflow
- ทุกขั้นจบด้วยเงื่อนไข "Done when" ที่ตรวจได้ และบอกคำสั่งถัดไปหนึ่งคำสั่ง
- เอกสาร discuss ใช้รูปแบบเดิม: ติดป้ายที่มาให้ทุกข้อความ (`[ที่มา: …]`, `[ยืนยัน]`, `[อนุมาน]`, `[เสนอ]`), ข้อตัดสินใจเป็น `### D<n>` มีตัวเลือก `a)`–`d)` และช่อง `**เลือก:**`, ความเห็นใช้บรรทัด `> ความเห็น:` และเอกสารที่อนุมัติแล้วจะไม่ถูกแก้อีก
- hotspot ใช้วิธีเดิม: วาดแผนที่กฎ แล้วตอบทีละตั๋วทีละ session จนกฎผ่านเกณฑ์ความพร้อม ตัวอย่างผลลัพธ์จริงของลูกค้าเก็บเป็นตารางให้ผู้สร้างแปลงเป็น test

ตัดออก:
- ข้อความใน `theme update` ที่ใช้ย้าย kit รุ่นเก่า (ก่อน 0.5, 0.11, 0.14, 0.21, 0.23, 0.24) เพราะ `mreq` เริ่มที่ contract ปัจจุบันเลย
- theme แบบสร้างใน stack, `theme port`, stack profile (path ที่ skill ใช้สร้างโค้ด ไม่ใช่การตัดสินใจเรื่อง stack ซึ่งยังคงอยู่), production-safety test และ parser test ด้วย xUnit
- `subagent`, `delegate`, `assess`, `review` (รีวิวโค้ด), `analyze`, `design`, `challenge`, `change-request` และ golden test ที่ต้องรันกับโค้ด (จะคง consult ใน discuss ไว้หรือไม่ ค่อยตัดสินในเฟส 2)
- ส่วนของ doctor ที่ตรวจ openspec และ backlog

## 7. หัวข้อพื้นฐานของการสร้างระบบ

discuss ของ mflow มีหัวข้อ `tech-stack` และ `code-structure` อยู่แล้วใน `discuss/references/topics.md` และทั้งสองเป็นแถวแรกของ AGENDA ในทุกโปรเจกต์ `mreq` คัดมาทั้งหมดและเพิ่มอีกสองหัวข้อ (D10) ทั้งสี่หัวข้อเป็นแถวที่ 1 ถึง 4 ของ AGENDA ซึ่งเป็นคำแนะนำ คุณจะคุยหรือข้ามหัวข้อไหนก็ได้ ส่วนลำดับที่แนะนำคือคุยก่อน theme (D9)

| หัวข้อ | ครอบคลุม | ที่มา |
|---|---|---|
| `tech-stack` | แอปทุกตัวที่ deploy แยกกัน (web หลังบ้าน, web หน้าบ้านหรือ portal, API, mobile, worker, งานตั้งเวลา) และแต่ละตัวมีผู้ใช้กลุ่มไหน เข้าถึงผ่าน intranet หรือ internet ใช้บนอุปกรณ์อะไร และทำในรุ่นไหน; framework ของ web แต่ละตัว; API (runtime, authentication, versioning, รูปแบบ error); ฐานข้อมูลและ migration; ไฟล์และเอกสาร (upload, Excel, PDF, e-mail); Docker และ environment (dev, UAT, production) ว่ารันที่ไหน; test; licence ที่ตรวจแล้ว (ยึด open source และฟรีเป็นหลัก); ตัวเสริม (cache, queue, job) ตัดสินเป็นใช้ตอนนี้ / ใช้ภายหลัง / ไม่ต้องใช้ ตามหลักฐาน | mflow `topics.md:13-46` |
| `code-structure` | ชื่อโปรเจกต์ในโค้ด; ชื่อแอป `<ProjectName>.<Kind>.<Part>`; repo เดียวหรือหลาย repo และใช้ `src/` หรือ `apps/` กับ `packages/`; solution แยกตาม layer (Domain, Application, Infrastructure, แอป) และทิศทางการอ้างอิงที่ชี้เข้าด้านในเท่านั้น; module ต่อ bounded context; โครงภายในของ web และ mobile แต่ละตัว และ package ที่ใช้ร่วมกัน (`packages/ui`); test project; build settings (`global.json`, `Directory.Build.props`, `Directory.Packages.props`, `.editorconfig`, `.env.example`) | mflow `topics.md:48-99` |
| `nfr` (ใหม่) | จำนวนผู้ใช้ทั้งหมดและที่ใช้พร้อมกัน, ปริมาณข้อมูลต่อปี, เวลาตอบสนองที่รับได้, ช่วงเวลาที่ระบบต้องพร้อมใช้, backup และการกู้คืน, browser และอุปกรณ์, ภาษา (ไทย หรือไทยกับอังกฤษ) | `tech-stack` ใช้ตัวเลขชุดนี้เป็นหลักฐานตอนตัดสินว่าต้องใช้ตัวเสริมหรือไม่ |
| `security-privacy` (ใหม่) | วิธี login (บัญชีในระบบ, AD/LDAP, SSO, Google หรือ LINE), นโยบายรหัสผ่าน, MFA, PDPA (เก็บข้อมูลส่วนบุคคลอะไร, การขอความยินยอม, ระยะเวลาเก็บ, สิทธิ์ของเจ้าของข้อมูล), การเข้ารหัส, ข้อมูลเก็บอยู่ที่ไหน | ระบบที่เก็บข้อมูลส่วนบุคคลในไทยต้องคิดเรื่อง PDPA ตั้งแต่ต้น |

### 7.1 ชื่อโปรเจกต์และชื่อแอป

ใช้กฎเดียวกับ mflow 0.22 (`init/references/stacks.md` หัวข้อ Project name และ `topics.md:51-57`):

- **ชื่อโปรเจกต์ในโค้ด:** init เสนอสามชื่อและแนะนำหนึ่ง เช่น ระบบบริหารบุคลากรโรงเรียน → a) `SchoolHr` b) `SchoolHrSystem` c) `KruHub` หรือพิมพ์ชื่อเองก็ได้ ชื่อต้องเป็น PascalCase ตัวอักษร ASCII ไม่มีช่องว่าง ขีด หรือขีดล่าง ยาวไม่เกินประมาณ 20 ตัวอักษร ห้ามใช้ชื่อที่ชนกับ .NET หรืออ่านแล้วเหมือนชื่อ layer (`System`, `App`, `Web`, `Api`, `Core`, `Domain`) ถ้าจะใส่ชื่อบริษัทให้เขียนเป็น `Company.Product` ส่วนชื่อที่ใช้แสดงเป็นภาษาไทยได้และเป็นคนละชื่อกัน
- **ชื่อแอป:** `<ProjectName>.<Kind>` หรือ `<ProjectName>.<Kind>.<Part>` ใช้ชื่อเดียวกันทั้ง project, โฟลเดอร์ และ namespace
  - Kind: `Web` (เว็บที่เปิดใน browser), `Api`, `Worker`, `Mobile`
  - Part: `Backend` คือหลังบ้านของเจ้าหน้าที่, `Frontend` คือหน้าบ้านของลูกค้าหรือคนทั่วไป ผู้ใช้กลุ่มอื่นใช้ชื่อของกลุ่มนั้น (`Portal`, `Partner`)
  - ถ้า Kind เดียวกันมีมากกว่าหนึ่งแอป หรือวางแผนว่าจะมีในอนาคต ให้ใส่ Part ตั้งแต่แอปแรก จะได้ไม่ต้องเปลี่ยนชื่อทีหลัง ถ้ามีตัวเดียวและไม่มีแผนเพิ่ม ไม่ต้องใส่ Part (`SchoolHr.Api`)
  - แอปที่ไม่ใช่ .NET ใช้ชื่อโฟลเดอร์เดียวกัน ส่วนชื่อ package เป็นตัวเล็กคั่นด้วยขีด (`schoolhr-web-frontend`)

ตัวอย่างโครงที่รองรับหลายแอป (repo เดียว):

```text
src/
  SchoolHr.Domain/
  SchoolHr.Application/
  SchoolHr.Infrastructure/
  SchoolHr.Api/
  SchoolHr.Web.Backend/      ← หลังบ้าน (เจ้าหน้าที่ HR)
  SchoolHr.Web.Frontend/     ← หน้าบ้าน (ครู)
tests/
  SchoolHr.Domain.Tests/
  SchoolHr.Api.Tests/
  SchoolHr.ArchitectureTests/
SchoolHr.slnx
```

### 7.2 หลายแอปในหน้าจอตัวอย่าง (D11)

ตอนนี้ mflow ตั้งชื่อหลายแอปได้แล้ว แต่ theme กับ screen ยังสมมติว่ามี UI แอปเดียว (`topics.md:20`) `mreq` ทำหน้าจอเป็น static จึงรองรับหลายแอปได้ง่ายกว่า:

- มี kit ชุดเดียว (token และ component) ที่ทุกแอปใช้ร่วมกัน แต่โครงหน้า (shell) แยกตามชนิดแอป: หลังบ้านใช้ sidebar แบบ house style ส่วนหน้าบ้านใช้แถบเมนูด้านบนแบบเว็บทั่วไป
- theme สร้าง shell ให้ทุกชนิดแอปที่มี UI ตามเอกสาร `tech-stack` ที่อนุมัติแล้ว ถ้ายังไม่มีเอกสารนี้ให้สร้าง shell หลังบ้านไว้ก่อน ถ้าภายหลังมีแอปชนิดใหม่ ให้ใช้ `theme update` เพิ่ม shell
- `screens.md` มีคอลัมน์ App และหน้าจอของแต่ละแอปอยู่ใน `mreq/ui/prototype/<App>/`

### 7.3 คำตอบไปอยู่ที่ไหน (D5)

| หัวข้อที่อนุมัติ | ปลายทาง |
|---|---|
| `tech-stack` | AGENTS.md `## Stack`: ชื่อโปรเจกต์ในโค้ด, ตารางแอป, ตาราง library พร้อม licence, ตัวเสริมที่ใช้ภายหลังพร้อมเงื่อนไข |
| `code-structure` | AGENTS.md `## Architecture`: โครงโฟลเดอร์, ชื่อแอป, ทิศทางการอ้างอิง ส่วนการสร้าง solution จริงเป็นงานใน `mreq/project/followups.md` |
| `nfr` | `mreq/project/vision.md` หัวข้อ `## Quality expected` (คุณภาพที่ต้องการ) |
| `security-privacy` | ข้อที่ทุกคนต้องทำตามเขียนเป็นบรรทัดใน AGENTS.md `## Conventions` ส่วนรายละเอียดอยู่ในเอกสารที่อนุมัติแล้ว |

ทุกปลายทางเขียนข้อเท็จจริงสั้นๆ ตามด้วยลิงก์กลับไปที่เอกสาร ไม่คัดลอกทั้งเอกสาร หัวข้อใน AGENTS.md ใช้ชื่อเดียวกับ mflow เพื่อให้ย้ายไปใช้ mflow ได้ง่าย และ theme อ่านแอปที่มี UI, อุปกรณ์, ภาษา และ CSS ฐานจาก AGENTS.md กับ `mreq/project/vision.md`

## 8. เฟส 1: พื้นฐาน, หัวข้อพื้นฐาน และ theme

### 8.1 คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/mreq:init [ชื่อ]` | ตั้งโปรเจกต์: สำรวจ ถามคำถามสั้นๆ แล้ววางไฟล์ตั้งต้น |
| `/mreq:discuss [<หัวข้อ> \| <NN> [ความเห็น] \| <NN> approve \| <NN> drop <เหตุผล> \| agenda]` | คุยและอนุมัติหัวข้อพื้นฐานทั้งสี่ ด้วยเอกสาร discuss แบบเดียวกับ mflow ส่วนหัวข้ออื่นมาในเฟส 2 |
| `/mreq:theme [ข้อมูลแบรนด์ \| @logo \| @CI]` | สร้าง UI kit เป็น static preview |
| `/mreq:theme update <สิ่งที่จะเปลี่ยน>` | แก้ kit ได้ทุกสถานะ (หัวข้อ 4.1) |
| `/mreq:theme approve` | ตั้งสถานะ kit เป็น `approved <วันที่>` |
| `/mreq:help` | ดูสถานะจากไฟล์ แล้วบอกคำสั่งถัดไป |

### 8.2 init

1. **สำรวจ (อ่านอย่างเดียว):** มี `.mflow/` หรือไม่ (ถ้ามีให้หยุด) มีเอกสาร requirement เดิมไหม มีไฟล์ agent อะไรอยู่แล้ว (AGENTS.md, CLAUDE.md) และมี git หรือยัง
2. **ถามในข้อความเดียว:** ชื่อโปรเจกต์ที่ใช้แสดง (เป็นภาษาไทยได้), ชื่อโปรเจกต์ในโค้ด (เสนอสามชื่อและแนะนำหนึ่งชื่อ ตามหัวข้อ 7.1), ระบบนี้ทำอะไร และใครเป็นผู้ใช้หลัก ข้อที่ไม่ได้ตอบเขียนเป็น `TODO` ไว้
3. **วางไฟล์:** รัน scaffold แบบ dry-run ก่อน แสดงผลให้ดู แล้วจึงรันจริง ได้ไฟล์ตามหัวข้อ 8.5 รวมถึง `mreq/discuss/AGENDA.md` ที่มีหัวข้อพื้นฐานทั้งสี่เป็นแถวแรก ถ้ามี AGENTS.md หรือ CLAUDE.md อยู่แล้ว ให้ใส่ template ไว้ใน `.mreq/suggested/` แล้วรวมด้วยมือพร้อมแสดง diff ห้ามเขียนทับ
4. **เอกสารเดิม:** เสนอย้ายเข้า `mreq/source/` ด้วย `git mv` ส่วนการอ่านและคัดแยกเนื้อหารอ capture ในเฟส 2
5. **บอกคำสั่งถัดไป:** `/mreq:discuss tech-stack`

init ไม่ถาม stack profile และไม่ต่อเครื่องมือภายนอกใดๆ

### 8.3 discuss (หัวข้อพื้นฐาน)

คัดจาก `discuss/SKILL.md` ของ mflow เฉพาะโหมด overview, new topic, revise, approve, agenda และ drop ใช้ `topics.md` เฉพาะสี่หัวข้อในหัวข้อ 7 และใช้ `visuals.md` สำหรับภาพประกอบ (mermaid, โครงโฟลเดอร์) ต่างจาก mflow ตรงนี้:

- ที่มาของคำตอบเรียงตามเดิม: คำของคุณและเอกสารลูกค้าก่อน ถัดมาคือมาตรฐานของทีมเมื่อต่อคลังความรู้ไว้ (เช่น Graph Brain) แล้วจึงเป็นข้อเสนอของ Claude
- ตารางปลายทางของ approve ใช้หัวข้อ 7.3 ไม่มี Backlog ไม่มี OpenSpec
- consult (ให้ AI ตัวอื่นช่วยวิเคราะห์) ยังไม่มีในเฟส 1
- script `discuss.mjs` คัดมาจาก mflow (เลขเอกสาร, `check`, `agenda`, `cited`) และเปลี่ยน path เป็น `mreq/discuss/`

### 8.4 theme

ใช้ `theme/SKILL.md` กับ `references/preview.md` ของ mflow เป็นฐาน ต่างกันตรงนี้:

- **kit มีที่อยู่เดียว** คือ `mreq/ui/theme/` สถานะเป็น `draft` หรือ `approved <วันที่>` README ของ kit มีบันทึกการแก้ไขที่เพิ่ม rev ทุกครั้งที่ `update` (หัวข้อ 4.1)
- **ก่อนเริ่ม:** ถ้า `tech-stack` หรือ `code-structure` ยังไม่อนุมัติ ให้บอกหนึ่งครั้งเป็นคำแนะนำ คุณเลือกทำ theme ต่อได้ ถ้าอนุมัติแล้ว ให้เอาแอปที่มี UI, อุปกรณ์, ภาษา และ CSS ฐานมาใช้โดยไม่ถามซ้ำ
- **ขั้น 1 (ข้อมูลแบรนด์):** ถามเรื่องที่ยังไม่มีคำตอบให้ครบเหมือน mflow: โลโก้หรือ CI, หน้าตาที่ต้องการตามคำของคุณ, ความแน่นของหน้า, ฟอนต์ไทย, อุปกรณ์และขนาดจอที่ต้องผ่าน, รูปแบบวันที่และปี ใช้ house style ร่วมกับ skill `frontend-design` ถ้ามีใน session ถ้าลูกค้าไม่มี CI ให้เสนอสามแบบ
- **ขั้น 2 (tokens):** `tokens.css` เป็น house style สีสดแบบเดียวกับ mflow 0.24 และเชื่อมกับ Bootstrap 5.3 จาก CDN (D4)
- **ขั้น 3 (โครงแอป):** `shell.js` กับโครงหน้าของแต่ละชนิดแอป (หัวข้อ 7.2) ตัวสลับ role อ่าน `mreq/ui/data/users.json` และ `roles.json` โดยตรง ไม่คัดลอกลงใน `shell.js` แบบที่ mflow ทำ ระหว่างที่ยังไม่มีเอกสาร access-control ให้เอา role มาจากหัวข้อผู้ใช้ใน `mreq/project/vision.md` ถ้าไม่มีให้ใช้ผู้ใช้คนเดียวที่มีสิทธิ์ทุกอย่าง (เฟส 2 จะเพิ่ม `theme update access`)
- **ขั้น 4–5 (component และหน้า style guide):** component ชุดเดียวกับ `component-contracts.md` ของ mflow 0.24 โดยเขียนบรรทัดที่เป็นของ stack ใหม่ให้เป็นพฤติกรรมของ kit แบบ static และเพิ่ม contract ของ shell หน้าบ้าน หน้า style guide คือ `index.html` และมีหน้าตัวอย่าง `list.html`, `form.html` และ `dashboard.html` (ถ้าระบบมีหน้า dashboard)
- **parser ของ DatePicker:** แสดงตารางกรณีทดสอบบนหน้า style guide พร้อมผล ✓/✗ ใช้แทน unit test ของ stack
- **ขั้น 6 (กฎสำหรับ agent):** เขียน `mreq/ui/design-system.md`, `.claude/rules/ui.md` ที่ `paths:` เป็น `mreq/ui/**` และบรรทัดชี้ไปยังกฎ UI ใน AGENTS.md `## Conventions`
- **วิธีเปิดดู:** `serve.mjs` ของ plugin เปิด `mreq/ui/` ที่ `127.0.0.1` แล้วเข้า `http://127.0.0.1:8810/theme/` ไม่ต้องใช้ Python และ README ของ kit เขียนคำสั่งนี้ไว้
- **การตรวจที่ขนาดจอ:** ถ้า session มีเครื่องมือเปิด browser (เช่น Claude in Chrome) ให้ใช้ตรวจ ถ้าไม่มีให้รายงานว่า `(unverified)` และห้ามบอกว่าตรวจแล้วถ้ายังไม่ได้ดูจริง

Done when: preview เปิดได้ตามคำสั่งใน README, style guide แสดงทุก component ในทุกสถานะ, มี `SidebarMenu` ตัวอย่างสองชุดที่ใช้สิทธิ์ต่างกันและแสดงเมนูไม่เหมือนกัน (ถ้า `users.json` มีผู้ใช้มากกว่าหนึ่งคน การสลับผู้ใช้ต้องทำให้เมนูและปุ่มเปลี่ยนด้วย), มี shell ของทุกชนิดแอปที่มี UI, ตาราง parser ผ่านทุกแถว, ขนาดจอที่ต้องผ่านได้ตรวจแล้ว (หรือรายงาน `(unverified)`), มี design-system.md กับกฎ UI และคุณได้ URL ไปลองดูพร้อมคำสั่ง `/mreq:theme approve`

### 8.5 ไฟล์ที่ลงในโปรเจกต์หลังเฟส 1

```
<project>/
├─ AGENTS.md, CLAUDE.md
├─ .claude/rules/ui.md
├─ .mreq/config.json, templates.json
└─ mreq/
   ├─ project/      ← README.md, STATUS.md, vision.md, followups.md
   ├─ source/README.md
   ├─ discuss/AGENDA.md และเอกสารหัวข้อพื้นฐาน
   └─ ui/
      ├─ README.md, design-system.md
      ├─ theme/        ← index.html, list.html, form.html, (dashboard.html), tokens.css, app.css,
      │                  shell.js, datatable.js, datepicker.js, assets/, README.md (สถานะ + บันทึกการแก้ไข)
      └─ data/         ← users.json, roles.json, README.md
```

### 8.6 โครงของ plugin ใน repo

```
plugins/mreq/
├─ .claude-plugin/plugin.json      ← version 0.1.0
├─ README.md                       ← ภาษาไทย: ใช้ทำอะไร, คำสั่ง, flow
├─ hooks/hooks.json                ← SessionStart เท่านั้น
├─ scripts/
│   ├─ lib.mjs                     ← หา root จาก .mreq/config.json, อ่าน config
│   ├─ scaffold.mjs                ← วาง template, ไม่เขียนทับ
│   ├─ session-start.mjs           ← mreq/project/STATUS.md + สถานะจากไฟล์ใน mreq/
│   ├─ discuss.mjs                 ← เลขเอกสาร, check, agenda, cited
│   ├─ theme-status.mjs            ← อ่าน/ตั้งสถานะและ rev ของ kit, ตรวจไฟล์ที่ต้องมี
│   ├─ serve.mjs                   ← เปิด mreq/ui/ ที่ 127.0.0.1 เท่านั้น
│   └─ doctor.mjs                  ← รุ่น Node + โครงไฟล์ (อ่านอย่างเดียว)
├─ skills/
│   ├─ init/                       ← SKILL.md, references/project-name.md
│   ├─ discuss/                    ← SKILL.md, references/topics.md (สี่หัวข้อ), references/visuals.md,
│   │                                assets/discussion.md, assets/agenda.md
│   ├─ theme/                      ← SKILL.md, references/ (house-style, visual-direction,
│   │                                component-contracts, responsive), assets/ (tokens.css,
│   │                                design-system.md, ui-rule.md)
│   └─ help/SKILL.md
└─ templates/                      ← AGENTS.md, CLAUDE.md, mreq/project/ (README, STATUS, vision,
                                     followups), mreq/source/README, mreq/ui/README

tests/mreq-*.test.mjs              ← test ของ script ทุกตัว
.claude-plugin/marketplace.json    ← เพิ่มรายการ mreq 0.1.0
```

### 8.7 เกณฑ์รับเฟส 1

1. `node --test` ผ่านทั้งหมด และ `claude plugin validate` ผ่านทั้ง plugin และ marketplace
2. มี test ที่ยืนยันว่าใน `plugins/mreq/` ไม่มีคำว่า `openspec`, `/opsx:`, `speckit` หรือ `backlog` ยกเว้นในบรรทัดที่บอกว่าไม่รองรับ
3. ลองบนโฟลเดอร์ว่าง: `/mreq:init` วางไฟล์ครบ รันซ้ำแล้วไม่เขียนทับ ถ้ามี AGENTS.md อยู่แล้วก็รวมโดยไม่ลบของเดิม และถ้ามี `.mflow/` ก็หยุด
4. `/mreq:discuss` ทั้งสี่หัวข้อสร้างเอกสารที่ครอบคลุม checklist ครบ, `check` ไม่พบ placeholder และเมื่อ approve แล้วเขียนลงปลายทางตามหัวข้อ 7.3 ส่วน AGENDA ก็แสดงสถานะว่าอนุมัติแล้ว
5. `/mreq:theme` ได้ preview ตามเงื่อนไข Done when ในหัวข้อ 8.4
6. `/mreq:theme update` บน kit ที่อนุมัติแล้ว: rev เพิ่ม, มีบรรทัดในบันทึกการแก้ไข และสถานะยังเป็น `approved`
7. `/mreq:theme approve` เปลี่ยนสถานะได้ และ session ถัดไปเห็นสถานะใน briefing
8. ทดลองกับโปรเจกต์จริงหนึ่งโปรเจกต์ก่อนเริ่มเฟส 2

## 9. เฟสถัดไป (ภาพรวม ยังไม่ลงรายละเอียด)

- **เฟส 2: capture + discuss หัวข้ออื่น** capture รับทั้งไฟล์และข้อความที่คุณพิมพ์ (หัวข้อ 4.1–4.2) discuss เพิ่มหัวข้ออื่นจาก `topics.md` ของ mflow (access-control, data-model, org-structure, numbering ฯลฯ) และ `theme update access` จากนั้นตัดสินว่าจะคง consult ไว้หรือไม่
- **เฟส 3: screen + hotspot + review-notes** ทำ inventory แยกตามแอป แล้วสร้างหน้าจอ static บน kit ใน `mreq/ui/prototype/<App>/` ใช้ข้อมูลจาก `mreq/ui/data/` สลับ role ได้ และมี quick view ปรับหน้าจอได้ตลอด hotspot ใช้จับกฎธุรกิจจนผ่านเกณฑ์ความพร้อม review-notes ใช้แยกผลจากการให้คนลองใช้
- **เฟส 4: handoff** ส่งมอบครั้งแรกและครั้งถัดไปแบบส่วนต่าง (หัวข้อ 4.3) พร้อมทางย้ายไปใช้ mflow ซึ่ง mflow ตั้งค่าโฟลเดอร์ `source`, `discuss` และ `hotspots` ได้อยู่แล้วใน `.mflow/config.json` ส่วน `docs/ui/`, `docs/vision.md` และ STATUS.md ยังเป็น path ตายตัว จึงต้องย้ายไฟล์เหล่านั้นจาก `mreq/` หรือแก้ mflow เล็กน้อย

## 10. ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | ทางแก้ |
|---|---|---|
| kit ของ `mreq` กับของ mflow ค่อยๆ ต่างกัน (ยอมรับตาม D2 b) | ย้ายไปใช้ mflow แล้ว kit ไม่ตรงกับ contract ของ mflow | ตอนย้าย ใช้ `/mflow:theme update components` และ `update look` ซึ่งเทียบ kit กับ contract และแสดงรายการส่วนต่างก่อนแก้ |
| `component-contracts.md` ของ mflow มีประมาณ 22 บรรทัดที่เขียนสำหรับ stack และยังต้องเขียน contract ของ shell หน้าบ้านใหม่ | เฟส 1 ใช้เวลามากกว่าการคัดลอกไฟล์ | ประเมินงานเฟส 1 โดยนับรวมสองส่วนนี้ |
| preview แบ่งหน้าตารางใน browser แต่ของจริงแบ่งที่ server | คนสร้างจริงทำตาม preview | README และ design-system.md เขียนชัดว่า preview เป็นแค่ตัวอย่างพฤติกรรม ของจริงต้องแบ่งหน้าที่ server |
| การซ่อนปุ่มใน preview ไม่ได้กันสิทธิ์จริง | เข้าใจผิดว่าซ่อนปุ่มแล้วปลอดภัย | design-system.md เขียนว่าการกันสิทธิ์ต้องทำที่ endpoint ตอนสร้างจริง |
| แก้ requirement หลังส่งมอบ แต่ผู้สร้างไม่ได้รับส่วนต่าง | ระบบที่สร้างไม่ตรงกับ requirement ล่าสุด | briefing บอกทุก session ว่ามีอะไรเปลี่ยนตั้งแต่ส่งมอบครั้งล่าสุด และ `/mreq:help` แนะนำ `/mreq:handoff` |
| AGENTS.md ถูกเครื่องมือที่มาทีหลัง (OpenSpec, Spec Kit) เขียนเพิ่ม | หัวข้อของ `mreq` ถูกแก้หรือชนกับของเครื่องมืออื่น | `mreq` แก้เฉพาะหัวข้อของตัวเอง (`## Stack`, `## Architecture`, `## Conventions` และส่วนที่ชี้ไปยัง requirement) และไม่ลบหัวข้อของเครื่องมืออื่น |
| Bootstrap, ฟอนต์ และ icon โหลดจาก CDN | เปิดตอนไม่มีอินเทอร์เน็ตไม่ได้ | README บอกไว้ และ self-host เป็นทางเลือกภายหลัง |
| session ไม่มีเครื่องมือเปิด browser | ตรวจขนาดจอไม่ได้ | รายงาน `(unverified)` |

## 11. ข้อตัดสินใจ

ตอบในแชตเมื่อ 2026-10-13

| ข้อ | เรื่อง | ที่เลือก | ผลต่อแบบ |
|---|---|---|---|
| D1 | ชื่อ plugin | a) `mreq` | คำสั่งเป็น `/mreq:*` |
| D2 | ใช้เนื้อหา theme ร่วมกับ mflow อย่างไร | b) คัดลอกแล้วแยกกันไปเลย ไม่มี test เทียบ | kit ต่างจาก mflow ได้ (ความเสี่ยงข้อแรกในหัวข้อ 10) |
| D3 | โครงโฟลเดอร์ในโปรเจกต์ | c) (คำตอบของคุณ) `mreq/<หมวด>/` ที่ root ของโปรเจกต์ ไม่อยู่ใต้ `docs/` เช่น project, source, discuss, hotspot, ui ส่วนไฟล์ภาพรวมอยู่ใน `mreq/project/` | หัวข้อ 2 |
| D4 | CSS ฐานของ kit | a) Bootstrap 5.3 จาก CDN | CSS ของแอปจริงตัดสินในเอกสาร `tech-stack` และต่างจากนี้ได้ |
| D5 | ไฟล์ context ของ agent | b) เขียน AGENTS.md สั้นๆ แบบ mflow และ CLAUDE.md ที่ import AGENTS.md | หัวข้อ 7.3 |
| D6 | การบันทึกสถานะงานข้าม session | a) `mreq/project/STATUS.md` ที่ hook แสดงตอนเริ่ม session ไม่มี Stop hook | |
| D7 | Backlog.md | a) ไม่ใช้ ติดตามงานใน `mreq/project/followups.md`, AGENDA และ `screens.md` | |
| D8 | หน้าจอตัวอย่างอยู่ที่ไหน | a) static ตลอด | |
| D9 | คุยหัวข้อพื้นฐานเมื่อไหร่ | a) discuss เข้าเฟส 1 ลำดับเป็น init → หัวข้อพื้นฐาน → theme | หัวข้อ 8 |
| D10 | เพิ่ม `nfr` และ `security-privacy` | a) เพิ่มเป็นแถวที่ 3 และ 4 ของ AGENDA | หัวข้อ 7 |
| D11 | หลายแอปในหน้าจอตัวอย่าง | a) kit ชุดเดียว แต่ shell แยกตามชนิดแอป และแยกโฟลเดอร์หน้าจอตามแอป | หัวข้อ 7.2 |
| เพิ่ม | ส่ง requirement เพิ่มได้ และปรับ theme, screen ได้ | คำขอของคุณ ยืนยันแล้วว่าทำทั้งการรับเข้า (capture) และการส่งออกเป็นรุ่น (handoff) | หัวข้อ 4 |
| เพิ่ม | hotspot อยู่ในขอบเขต | ยืนยันแล้ว | เฟส 3 |

## บันทึกการแก้ไข

- rev 0.1 (2026-10-13): ฉบับแรก เขียนจากคำขอให้ทำ plugin เก็บ requirement ที่ไม่ขึ้นกับ OpenSpec และ Spec Kit โดยเริ่มจากพื้นฐานกับ theme
- rev 0.2 (2026-10-13): เพิ่มหัวข้อพื้นฐานของการสร้างระบบ (tech-stack, code-structure, ชื่อโปรเจกต์และชื่อแอป, หลายแอป) ตามคำขอให้มีคำถามเรื่อง file structure ที่รองรับหลายแอป การตั้งชื่อ project และเรื่องอื่นๆ เพิ่ม D9 ถึง D11
- rev 0.3 (2026-10-13): บันทึกคำตอบ D1–D11 ที่ตอบในแชต แล้วเขียนเอกสารใหม่ตามคำตอบ: path ทั้งหมดย้ายไปอยู่ใต้ `mreq/<หมวด>/` (D3 c), AGENTS.md กลับเข้ามา (D5 b), ไม่มี test เทียบ kit กับ mflow (D2 b), discuss ของหัวข้อพื้นฐานอยู่ในเฟส 1 (D9 a) เพิ่มหัวข้อ 4 (ส่ง requirement เพิ่ม ปรับ theme และ screen ได้ตลอด ส่งมอบเป็นรุ่นแบบส่วนต่าง) ตามคำขอ และนำ hotspot กลับเข้ามาในเฟส 3 เพราะคุณยกตัวอย่างโฟลเดอร์ hotspot ไว้
- rev 0.4 (2026-10-13): ปรับ D3 ตามคำของคุณ: ย้ายจาก `docs/mreq/` ไปเป็น `mreq/` ที่ root ของโปรเจกต์ และย้าย README, STATUS, vision, followups ไปไว้ใน `mreq/project/` ยืนยันแล้วว่าทำทั้งการรับ requirement เข้าและการส่งออกเป็นรุ่น และ hotspot อยู่ในเฟส 3 เพิ่มหัวข้อ 4.4 (ให้ OpenSpec หรือ Spec Kit อ่าน requirement จาก `mreq/`) ตามคำถามของคุณ

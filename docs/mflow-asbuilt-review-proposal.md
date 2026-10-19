# ข้อเสนอ: ให้ AI ตัวอื่นตรวจระบบ "ตามที่ทำจริง" แล้วส่งผลเข้า OpenSpec

- วันที่เสนอ: 2026-10-19
- สถานะ: อนุมัติ 2026-10-19 และสร้างแล้วใน mflow 0.32.0 (FR-213 ถึง FR-217) ยังไม่ได้ลองใน session จริง
- เป้าหมายเวอร์ชัน: mflow 0.32.0 (ต่อจาก 0.31.0 ที่ยังไม่ commit)
- อ้างอิง: `docs/mflow-multi-agent-design-proposal.md` (DOC-MFLOW-MULTI-AGENT-001), `docs/requirement.md` §13
- ข้อมูลประกอบ: StemHub (อ่านอย่างเดียว ไม่ได้แก้ไฟล์ใน StemHub)

## 1. สรุป

ผู้ใช้ต้องการให้ Codex, OpenCode หรือ AI ตัวอื่น เข้าใจระบบที่ทำเสร็จแล้วตามที่ทำจริง โดยไม่อ่านเอกสารลูกค้า (`docs/source/`, UAT) และไม่อ่าน discuss เพราะเอกสารเหล่านั้นเปลี่ยนไประหว่างทำ แล้วให้ตรวจโค้ดว่าทำงานถูก ครบทุกโลจิก หรือมีอะไรขาดหรือควรปรับ จากนั้นข้อที่ผู้ใช้เลือกแก้ต้องเข้า OpenSpec

ข้อเสนอนี้ต่อยอด `/mflow:analyze` ที่มีอยู่ ไม่เพิ่มคำสั่งใหม่ มี 4 ส่วน:

1. **`--basis built`**: brief ให้อ่านเฉพาะสิ่งที่สะท้อนระบบจริง (ข้อเท็จจริงที่ script ดึงจากโค้ด, spec ปัจจุบัน, โค้ด) และห้ามอ่านเอกสารต้นทาง
2. **หน่วยตรวจ (review units)**: Claude แตกหน่วยจาก `git ls-files` ไม่ใช่จากความจำของคน และ script พิสูจน์ได้ว่าทุกไฟล์มีหน่วยหรือมีเหตุผลที่ไม่ตรวจ
3. **Help และคู่มือ**: บอกว่าใครทำอะไร และย้ำว่า Codex ไม่ได้เรียก mflow
4. **ส่งผลเข้า OpenSpec**: ข้อที่ทำให้ spec ต้องเปลี่ยนเข้า OpenSpec change หนึ่งตัวต่อหน่วย ข้อที่ spec ถูกอยู่แล้วเป็น task ใน change เดียวกันหรือใน Backlog

พร้อม flow สำหรับข้อที่ผู้ใช้ต้องตัดสินก่อน (§7)

## 2. ใครทำอะไร (ทั้ง flow)

| ขั้น | ใคร | ทำอะไร |
|---|---|---|
| 1 | Claude Code | `/mflow:analyze units` สร้างหรือปรับแผนหน่วยตรวจ `.mflow/review-units.json` แล้วแสดงตาราง: หน่วย, จำนวนไฟล์, spec, test, ไฟล์ที่ไม่ตรวจพร้อมเหตุผล |
| 2 | ผู้ใช้ | ดูแผน ตัด รวม หรือเรียงลำดับ (ไม่ต้องจำว่าระบบมีส่วนไหนบ้าง) |
| 3 | Claude Code | `/mflow:analyze unit:<ชื่อ> --to codex,opencode` เขียน brief และไฟล์ข้อเท็จจริง แล้วพิมพ์บรรทัดคำสั่งของแต่ละ tool |
| 4 | ผู้ใช้ | รันบรรทัดคำสั่งนั้นใน terminal |
| 5 | Codex / OpenCode | อ่าน brief แล้วอ่าน repo แบบอ่านอย่างเดียว จากนั้นเขียนรายงานลง `docs/ai/inbox/` โดยไม่ได้เรียก mflow |
| 6 | Claude Code | `/mflow:analyze AN-NNN` ตรวจทุกข้อกับโค้ดจริง เทียบ `Files read` กับไฟล์ของหน่วย แล้วเขียน summary ภาษาไทยที่มีคอลัมน์ `ไปที่` และส่วน `## ต้องตัดสินก่อน` |
| 7 | ผู้ใช้ | เลือกข้อที่ให้แก้และตอบคำถาม ในคำสั่งเดียว (§7) |
| 8 | Claude Code | `/opsx:propose <หน่วย>-review-fixes` แล้ว `/opsx:apply` → `/mflow:test` → `/mflow:review` → `/opsx:archive` |
| 9 | วนซ้ำ | analyze หน่วยเดิมรอบใหม่ โดยใช้ spec ใหม่เป็นเกณฑ์ และ brief บอกข้อที่ตัดสินไปแล้ว |

## 3. ข้อจำกัดที่ต้องรักษา

มาจากเอกสาร multi-agent และ requirement:
- **ไม่บังคับ:** เป็นคำสั่งที่ผู้ใช้เรียกเอง ไม่มี hook หรือคำสั่งอื่นเริ่มให้ และไม่ขวาง flow หลัก (ข้อจำกัดใน `design_doc_list.json` ของ DOC-MFLOW-MULTI-AGENT-001)
- **ผู้ใช้เป็นคนรัน tool อื่น:** mflow เขียน brief และบรรทัดคำสั่งเท่านั้น (`requirement.md` §13)
- **`/mflow:*` ใช้ได้เฉพาะใน Claude Code:** tool อื่นทำงานผ่าน brief (`requirement.md` §13)
- **ไม่มีอะไรถูกแก้เพียงเพราะ tool เสนอ:** ข้อที่ยืนยันแล้วไม่ใช่คำสั่งให้แก้ ผู้ใช้เป็นคนเลือก (`consultation.md` ส่วน E)

## 4. ส่วนที่ 1: `--basis built`

ใช้กับ `unit:<ชื่อ>` โดยอัตโนมัติ และใช้กับ `system` หรือหัวข้ออื่นได้ด้วย `--basis built` ส่วน `system` แบบเดิม (อ่าน vision และ discuss ที่อนุมัติแล้ว) ยังอยู่ ไม่เปลี่ยน

### 4.1 Read first (เรียงตามความน่าเชื่อ)

| ชั้น | อะไร | ความน่าเชื่อ |
|---|---|---|
| ข้อเท็จจริงจากโค้ด | ไฟล์ข้อเท็จจริงที่ script สร้าง (§4.3) | ตรงกับโค้ดตอน commit ที่ระบุ |
| สิ่งที่ตกลงล่าสุด | `openspec/specs/<ด้าน>/spec.md` ที่ผูกกับหน่วย และ `openspec/changes/<ยังไม่ archive>/specs/` | เขียนด้วยมือ อาจตามโค้ดไม่ทัน |
| ภาพรวม | ส่วน architecture ใน `AGENTS.md`, `docs/ui/screens.md`, ไฟล์ data model ที่ AGENTS.md ชี้ | ช่วยให้เห็นภาพ |
| ตัวตัดสินสุดท้าย | ไฟล์ในหน่วย (Scope) และไฟล์ส่วนกลางที่หน่วยใช้ | ความจริง |

ถ้าไม่ใส่ delta spec ของ change ที่ยังไม่ archive tool จะรายงานงานที่เพิ่งทำว่าเป็นโค้ดที่ไม่มีเอกสาร

### 4.2 ส่วนห้ามอ่าน (ใส่ลง brief ตามนี้)

```
Do not open:
- docs/source/ — superseded by later changes; not the current system
- docs/decisions/ (discussion docs, hotspots, decision log)
- docs/vision.md
- docs/ai/inbox/ — other tools' reports; keep your view independent
- STATUS.md, backlog/ — work logs, not system behaviour
Specs cite sources in parentheses (e.g. "vision Q85", "UAT S15-06",
"docs/decisions/discuss/07-supplier-data.md"). They are labels: do not open them.
Where a spec and the code disagree, report it as a finding; neither side is assumed right.
```

path ในรายการนี้มาจาก config ของโปรเจกต์ (โฟลเดอร์ sources, decisions, inbox) ไม่ได้ใส่ค่าตายตัว

### 4.3 ไฟล์ข้อเท็จจริง (script สร้าง คนไม่ได้เขียน)

`.mflow/briefs/<id>-r<n>.facts.md` สร้างโดย `review-units.mjs facts <unit>` บรรทัดแรกบอกที่มา: ชื่อ script, commit, วันที่ และบอกว่าดึงด้วยรูปแบบใด

เนื้อหาดึงจากโค้ดตรงๆ โดยไม่มีการตีความ ทำให้ความเข้าใจของ tool ไม่ถูกความเข้าใจของ Claude ชี้นำ:
- **ชื่อ test** ของหน่วย (ชื่อ method ที่มี `[Fact]`/`[Theory]`, `it(`/`test(` ฯลฯ) จัดกลุ่มตามไฟล์
- **route หน้าเว็บ** (`app/**/page.tsx`, `pages/**`, `Controllers/*`, `*.cshtml` ฯลฯ)
- **รายชื่อ entity และตาราง** จาก schema ที่ tool สร้างไว้ (`*ModelSnapshot.cs`, `schema.prisma`, migration ล่าสุด)
- **OpenAPI** เฉพาะเมื่อ `.mflow/config.json` ระบุ path ของไฟล์ที่ export ไว้ (`asBuilt.openapi`) mflow ไม่รันแอปเอง

รูปแบบการค้นหาตาม stack มีค่าเริ่มต้นใน plugin และโปรเจกต์เพิ่มหรือแทนได้ที่ `asBuilt.facts` ใน `.mflow/config.json` ถ้าส่วนไหนหาไม่เจอ ไฟล์จะเขียนว่า "ไม่พบ (รูปแบบที่ลอง: …)" ไม่เดาเอง

### 4.4 สิ่งที่ให้ตรวจ (ใส่ลง Goal ของ brief)

| ประเภท | ความหมาย |
|---|---|
| a | spec บอกไว้ แต่โค้ดไม่ทำ |
| b | โค้ดทำ แต่ spec ไม่บอก |
| c | bug ในโลจิกเอง: การเช็กสิทธิ์, การเปลี่ยนสถานะ, transaction/rollback, การทำงานพร้อมกัน, validation, เส้นทางตอน error |
| d | scenario ที่ไม่มี test |
| e | จุดที่ควรปรับปรุง หรือโลจิกที่ขาด |

contract ของรายงานยังเป็น `consult-analyze` (Current behaviour, Findings, Recommendations, Not checked) เพิ่มแค่ช่อง `Type: a|b|c|d|e` ในแต่ละ finding

## 5. ส่วนที่ 2: หน่วยตรวจ

### 5.1 แผน `.mflow/review-units.json`

`/mflow:analyze units` ให้ Claude สร้างแผนจาก `git ls-files` ดังนี้:
- เริ่มจากรูปแบบโฟลเดอร์ (`*/Modules/<X>/`, โฟลเดอร์ feature ของเว็บ, ชื่อไฟล์ test ที่ขึ้นต้นด้วยชื่อหน่วย) แล้ว Claude ปรับแก้
- **ส่วนกลางเป็นหน่วยของตัวเอง:** persistence/migration, ส่วนกลางของ API, identity/security, integration/job, prototype/testing, UI kit, shell ของเว็บ
- **หน่วย `joins`:** flow ที่วิ่งข้ามหน่วย หาได้จาก call graph (codebase-memory-mcp `trace_path` ถ้ามี) และจาก spec ที่อ้างหลายด้าน
- แต่ละหน่วยระบุ: globs, spec ที่ผูก, ไฟล์ test, หน่วยข้างเคียงที่ใช้

### 5.2 ตรวจความครบที่ผู้ใช้อ่านเองได้

`review-units.mjs check` ทำงานแบบอ่านอย่างเดียว:
- ทุกไฟล์ที่ track ใน git ต้องอยู่ในหน่วย**เดียว** หรืออยู่ในกลุ่ม `notReviewed` ที่มี**เหตุผลเขียนไว้** เช่น lockfile, รูป, config ของ build
- ไม่ใช้ regex กรองทิ้งแบบเงียบๆ ผู้ใช้ต้องเห็นได้ว่าอะไรไม่ถูกตรวจและเพราะอะไร
- spec ทุกด้านและ change ที่ยังไม่ archive ต้องผูกกับอย่างน้อยหนึ่งหน่วย
- ผลเป็น JSON: `unassigned`, `overlaps`, `unmappedSpecs`, จำนวนไฟล์ต่อหน่วย ถ้ามีรายการใดไม่ว่าง `/mflow:analyze unit:…` จะเตือน แต่ไม่ขวาง

ตัวอย่างจาก StemHub: รายการ 10 module ที่ดูจากโฟลเดอร์ Api ครอบคลุม API แค่ 220 จาก 365 ไฟล์ อีก 145 ไฟล์ (~40%) เช่น Persistence 53, Common 48, Integrations/Jobs 11, Identity/Security 11 ไม่อยู่ในหน่วยไหนเลย

### 5.3 เทียบไฟล์ที่ tool อ่านจริง ตอนรวมผล

`inbox-normalize.mjs` อ่านส่วน `## Files read` อยู่แล้ว ให้เพิ่มการเทียบกับ globs ของหน่วย ไฟล์ของหน่วยที่ไม่มีรายงานไหนอ่าน จะเข้าหัวข้อ `## ยังตรวจไม่ได้` ใน summary พร้อมจำนวน

## 6. ส่วนที่ 4: ส่งผลเข้า OpenSpec

### 6.1 กฎตัดสิน

ถามคำถามเดียว: **"แก้เสร็จแล้ว spec ยังพูดถูกโดยไม่ต้องแตะหรือไม่"**

| คำตอบ | ประเภท | ไปที่ |
|---|---|---|
| ไม่ ต้องแก้ spec | b (ถ้าเลือกเก็บ), c, e | OpenSpec change ของหน่วย มี delta spec |
| ใช่ spec ถูกอยู่แล้ว | a, d, refactor, ปรับความเร็วโดยผลเหมือนเดิม | เป็น task ใน change ของหน่วยถ้ามีเปิดอยู่ ถ้าไม่มี เป็น Backlog task |

- ประเภท a ไม่บังคับให้เพิ่ม scenario เพราะ spec ถูกอยู่แล้ว
- ประเภท c ต้องเพิ่ม scenario ของกรณีนั้น เพื่อกันพังซ้ำ และให้รอบตรวจถัดไปรู้ว่าต้องเป็นแบบนี้
- OpenSpec ไม่รับ change ที่ไม่มี delta (`Change must have at least one delta`) ถ้ารอบนั้นมีแต่ประเภท a กับ d จึงไปที่ Backlog

### 6.2 รวมเป็นชุด

- **หนึ่ง change ต่อหน่วยต่อรอบ:** `<หน่วย>-review-fixes` เหมือนที่ StemHub ทำแล้วใน `library-review-fixes` และ `rounds-review-fixes` (proposal อ้างรายงานพร้อมเลขข้อ, `design.md` ชี้โค้ดปัจจุบัน, มี delta spec และ tasks)
- **หนึ่ง Backlog task ต่อชุด** ใช้ติดตามงาน และชี้ไปที่ change
- เหตุผล: gate test ทั้งชุดของ StemHub ใช้ประมาณ 40 นาที ถ้าแยกแก้ทีละเรื่องจะเสียเวลารอ gate ซ้ำ

### 6.3 ร้อยกลับ

- proposal อ้าง `docs/ai/analysis/AN-NNN/summary.md` (ระบุ revision) และเลขข้อ
- task แต่ละข้อบอกเลขข้อค้นพบที่แก้
- คอลัมน์ `สถานะ` ใน summary ชี้ไปที่ change หรือ Backlog task

### 6.4 ไฟล์ใน plugin ที่ต้องปรับ

- `skills/delegate/references/consultation.md` ส่วน E แถวแรก: จาก "fixes go to Backlog" เป็นกฎ §6.1 เมื่อ basis เป็น built
- `skills/change-request/SKILL.md` ขั้น 2: defect ไป Backlog bug task **หรือ** เข้า `<หน่วย>-review-fixes` ที่เปิดอยู่
- `skills/analyze/SKILL.md`: scope `units` และ `unit:<ชื่อ>`, summary มีคอลัมน์ `ไปที่` (OpenSpec / Backlog / ต้องตัดสิน / ไม่แก้) และส่วน `## ต้องตัดสินก่อน` กับ `## คำตัดสิน`

## 7. Flow เมื่อเจอเรื่องที่ผู้ใช้ต้องตัดสินก่อน

ใช้กลไกเดิมที่ 0.30.0 เพิ่งทำ ไม่สร้างกลไกใหม่

### 7.1 Claude แยกคำถามไว้ใน summary

ส่วน `## ต้องตัดสินก่อน` ใน summary ของขั้น 6 มีหนึ่งข้อต่อหนึ่งคำถาม:

```
### Q1 โค้ดส่งเมลเชิญซ้ำเมื่อนำเข้าไฟล์เดิมอีกครั้ง แต่ spec ไม่ได้บอก (F4)
- ข้อที่รอคำตอบนี้: F4, F9
- ก. เก็บไว้ แล้วเขียนลง spec
- ข. ตัดออก ส่งเฉพาะครั้งแรก
- **Claude แนะนำ:** ข. เพราะ …
- **ถ้าผิด:** ส่งเมลซ้ำถึง supplier จริง แก้ย้อนหลังไม่ได้
- ระดับ: หนัก (ส่งข้อมูลออกนอกระบบ)
```

คำถามเกิดจาก:
- ประเภท b ทุกข้อ (เก็บหรือตัด)
- spec กับโค้ดขัดกันแบบที่หลักฐานบอกไม่ได้ว่าฝั่งไหนถูก
- ประเภท e ที่มีหลายทางเลือก
- ข้อที่เข้าเกณฑ์ "แก้ยาก"

### 7.2 สองระดับ ใช้เกณฑ์ "แก้ยาก" เดิม

**หนัก** คือ schema, สิทธิ์, ข้อมูลที่ลูกค้าไม่ได้พูดถึง, การลบ หรือการส่งข้อมูลออกนอกระบบ (เกณฑ์เดียวกับ discuss และ `rules.proposal`) ที่เหลือเป็น**เบา**

| ระดับ | ทำอย่างไร |
|---|---|
| เบา | ตอบในคำสั่งถัดไปได้เลย: `/mflow:analyze AN-003 แก้ F1,F3,F7; Q1=ก; ที่เหลือตามแนะนำ` Claude บันทึกลง `## คำตัดสิน` (วันที่, คำถาม, คำตอบ) แล้วนำไปใช้ใน proposal |
| หนัก | `/mflow:discuss <หัวข้อ>` โดยใส่หลักฐานและตัวเลือกจาก summary ไว้ให้แล้ว |
| กฎธุรกิจยังไม่ชัด ต้องมีตัวอย่าง | `/mflow:hotspot <หัวข้อ>` |
| ต้องทดลองถึงจะรู้ | spike task ระบุสมมติฐานและผลที่จะใช้ตัดสิน |

### 7.3 ค่าเริ่มต้นเมื่อมีคำถามหนักค้าง

**propose change ของหน่วยโดยไม่รวมข้อที่รอคำตอบ** ข้อที่รอจะเป็น change ถัดไปหลัง discuss อนุมัติ คำถามข้อเดียวต้องไม่ทำให้งานแก้ทั้งหน่วยหยุด

- ต้นทุน: รัน gate เพิ่มหนึ่งรอบ
- ข้อยกเว้น: ถ้า discuss อนุมัติก่อน change แรกถึงขั้น apply ให้รวมเข้า change แรกได้

### 7.4 ตอน propose

`rules.proposal` (0.30.0) ถามข้อ "แก้ยาก" ก่อน propose อยู่แล้ว ให้ถามเฉพาะข้อที่**ยังไม่มี**ใน `## คำตัดสิน` ไม่ถามซ้ำ

### 7.5 รอบถัดไปไม่รายงานซ้ำ

- คำตัดสินที่เปลี่ยนพฤติกรรม จะเข้า spec ผ่าน change
- ข้อที่ "ไม่แก้" หรือ "เลื่อน" ลง Backlog พร้อมเหตุผล และ brief รอบถัดไปของหน่วยนั้นจะระบุว่าเป็นเรื่องที่รู้แล้ว ให้รายงานซ้ำเฉพาะเมื่อมีหลักฐานใหม่

## 8. ส่วนที่ 3: Help และคู่มือ

- `/mflow:help`: เพิ่มแถว "ให้ AI ตัวอื่นตรวจระบบที่ทำแล้วตามที่ทำจริง" → `/mflow:analyze units` → `/mflow:analyze unit:<ชื่อ> --to …` และแถว "ผลตรวจกลับมาแล้ว" → `/mflow:analyze AN-NNN`
- `docs/manual.md`: หัวข้อใหม่พร้อมตาราง §2 ตัวอย่างหนึ่งรอบเต็ม และคำตอบสำหรับ "Codex เรียก mflow ได้ไหม" (ไม่ได้ และไม่ต้อง)
- `plugins/mflow/README.md`: แถวในตารางคำสั่ง
- `docs/requirement.md` §6: FR ใหม่ (FR-213 ถึง FR-217 ตามส่วน 1, 2, 5.3, 6, 7) และ §10 สรุปคำสั่ง

## 9. การทดสอบ

- `tests/review-units.test.mjs`: หน่วยเดียวต่อไฟล์, overlap, `notReviewed` ต้องมีเหตุผล, spec ที่ไม่ผูก, ไฟล์ข้อเท็จจริงจาก fixture ของแต่ละ stack, กรณีหาอะไรไม่เจอ
- `tests/inbox-normalize.test.mjs`: เทียบ `Files read` กับ globs ของหน่วย
- `tests/consult.test.mjs`: `--basis built` และ `unit:<ชื่อ>` เก็บใน session, เปิดซ้ำได้ session เดิม
- ไม่มี E2E

## 10. ความเสี่ยงและข้อจำกัด

- **การดึงข้อเท็จจริงขึ้นกับ stack:** ค่าเริ่มต้นครอบคลุม .NET, Next.js และ Node ก่อน stack อื่นต้องตั้งใน config
- **spec ยังไม่ตรงกับโค้ดได้ระหว่างรอบ:** ลดได้แต่ไม่หมด ข้อที่ไม่ตรงจะถูกรายงานเป็นประเภท a หรือ b
- **gate test ใช้เวลานาน** ทำให้การแยก change ต่อหน่วยมีต้นทุน จึงเลือกค่าเริ่มต้นตาม §7.3
- **แผนหน่วยตรวจเก่าได้** เมื่อมีโฟลเดอร์ใหม่ `check` จะเตือนว่ามีไฟล์ที่ไม่มีหน่วย
- **ทดสอบกับโปรเจกต์จริงได้ภายหลัง:** StemHub ยังห้ามแก้ การลองจริงต้องรอผู้ใช้อนุญาต

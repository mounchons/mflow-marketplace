# วิเคราะห์การออกแบบ mflow plugin และข้อเสนอปรับปรุง

วันที่: 2026-10-03 · ฉบับวิเคราะห์: 1.2 · สถานะ: ข้อเสนอ ยังไม่ได้ดำเนินการแก้ plugin

> ความคืบหน้า (2026-10-04, plugin 0.17.3): แก้แล้ว F01, F02, F03, F09, F11, F12 (ส่วนการไม่ถามซ้ำ) และ F08 ส่วน cache และเริ่ม F05 ด้วยชุด regression ใน `tests/` (`node --test`) ข้อที่ยังไม่แก้ (F04, F06) อยู่ในชุดนั้นเป็น test แบบ `todo` เนื้อหาด้านล่างคงไว้ตามที่วิเคราะห์

## 1. ข้อสรุป

**ควรรักษาแนวทางหลักของ mflow และปรับความน่าเชื่อถือของกลไกที่มีอยู่ก่อนเพิ่มคำสั่งใหม่** จุดแข็งคือเชื่อมเอกสารลูกค้า → การตัดสินใจ → prototype → กฎธุรกิจ → OpenSpec → test ได้เป็นลำดับ และกำหนดเจ้าของข้อมูลแต่ละชนิดค่อนข้างชัด เหมาะกับงานที่ผู้ใช้เป็น SA, PM หรือเจ้าของระบบและใช้ AI ช่วยพัฒนา

ช่องว่างสำคัญคือหลายขั้นตอนที่มีผลต่อความถูกต้องยังอาศัยให้ AI ทำตามข้อความใน skill ขณะที่ script ตรวจเพียงบางเงื่อนไข จึงมีโอกาสที่เอกสารถูกระบุว่า “พร้อมอนุมัติ” ทั้งที่ขาดเนื้อหา หรือสถานะเสียแล้วถูกเขียนทับโดยไม่มีคำเตือน

สิ่งที่ควรทำก่อนนำไปใช้ซ้ำหลายโปรเจกต์:

1. ป้องกันทะเบียนและ config เสียหาย รวมถึงแยก “ไม่มีไฟล์” ออกจาก “อ่านไม่ได้”
2. ทำให้การตรวจ discussion ยืนยันโครงสร้างและการตอบข้อตัดสินใจได้จริง
3. แก้การสร้างคำสั่ง shell และกำหนดขอบเขตไฟล์ใน context pack
4. เพิ่มชุด regression test ที่อยู่ใน repository และรันซ้ำได้
5. ผูกการอนุมัติ การส่งต่อ และผลทดสอบกับ revision หรือ commit ที่ตรวจจริง

ไม่พบเหตุผลจากขอบเขตปัจจุบันที่จำเป็นต้องเปลี่ยนเป็นบริการกลางหรือเพิ่มฐานข้อมูล ควรต่อยอด Node scripts + ไฟล์ใน Git ตามเดิม

## 2. ขอบเขตและความน่าเชื่อถือของการตรวจ

| รายการ | ขอบเขต |
|---|---|
| ฐานที่วิเคราะห์ | Working tree ปัจจุบัน; `plugin.json` ระบุ `0.17.0` |
| Git HEAD | `e51a554849647efe424ea8a878ab96c404b1a888` |
| ข้อควรอ่านร่วมกัน | มีการแก้ไฟล์ค้างอยู่ก่อนเริ่ม รวมถึง subagent/config/hooks และเอกสาร; ผลนี้ไม่ได้อ้างว่าเป็นพฤติกรรมของ commit ข้างต้นเพียงอย่างเดียว |
| เอกสาร | `requirement.md`, ส่วนที่เกี่ยวข้องใน `manual.md`, README, templates, skills และ references ที่เกี่ยวข้อง |
| โค้ด | อ่านสคริปต์ `.mjs` ทั้ง 11 ไฟล์ รวม `subagent-guard.mjs` ที่ยังไม่ tracked ตอนเริ่ม |
| การค้นหา | ใช้ MCP architecture/search/snippet ก่อน และ refresh index; index รายงานว่า scripts ถูก excluded และบาง symbol ยังไม่ครบ จึงอ่านไฟล์จริงประกอบ |
| การทดลอง | Node `v22.19.0` บน Windows; fixture แยกใน OS temp; ข้อมูลจำลองเท่านั้น |
| ไม่ได้ยืนยันในรอบนี้ | Claude Code interactive/headless E2E, คำสั่งจริงของ AI ภายนอก, OpenSpec/Backlog integration, Linux และ Node 20 |

ระดับหลักฐานในรายงาน:

- **ทดลองยืนยัน:** รัน scenario จำลองและได้ผลตามที่ระบุ
- **พบจากโค้ด/เอกสาร:** อ่านเส้นทางการทำงาน แต่ยังไม่ได้ทดสอบเงื่อนไขนั้นครบวงจร
- **ข้อเสนอออกแบบ:** สิ่งที่ควรเพิ่ม ไม่ได้หมายความว่าระบบล้มเหลวแล้ว

ตารางผลทดสอบเดิมใน [requirement.md](requirement.md) §15 เป็นหลักฐานที่ผู้พัฒนาเดิมบันทึกไว้ รายงานนี้แยกออกจากสิ่งที่ทดลองใหม่อย่างชัดเจน

## 3. ภาพรวมสถาปัตยกรรมปัจจุบัน

| ชั้น | หน้าที่ | ส่วนประกอบหลัก |
|---|---|---|
| คำสั่งและนโยบาย | บอก AI ว่าควรถาม อ่าน เขียน และส่งต่องานอย่างไร | `skills/*/SKILL.md`, `agents/dev.md` |
| กลไกที่ทำซ้ำได้ | สร้างไฟล์ ตรวจสถานะ ทำทะเบียน สร้างคำสั่ง | `scripts/*.mjs` |
| การเชื่อมกับ host | เริ่ม session, เตือน handoff, ควบคุมการเรียก subagent | `hooks/hooks.json` |
| สถานะของโปรเจกต์ผู้ใช้ | เก็บข้อเท็จจริง งาน และหลักฐานข้าม session | `.mflow/`, `STATUS.md`, `docs/`, `openspec/`, Backlog.md |
| ระบบภายนอก | จัดการ change/task และวิเคราะห์หรือเขียนโค้ด | OpenSpec CLI, Backlog CLI, AI CLI/chat |

เส้นทางหลัก:

```text
เอกสารลูกค้า → capture → vision / agenda / hotspot
                              ↓
                           discuss → ข้อตัดสินใจและข้อกำหนดที่อนุมัติ
                              ↓
theme → screen → ทดลองใช้ → review-notes → ปรับ prototype / change-request
          ↓
       hotspot + golden → OpenSpec change → apply → review → archive

ทุกช่วง: STATUS.md + Backlog + SessionStart/Stop ช่วยให้ทำต่อข้าม session
เส้นทางเสริม: delegate → AI report → assess → งานหรือข้อเสนอที่ตรวจแล้ว
```

ขอบเขตการบังคับใช้มีความต่างกัน: hook ปฏิเสธ `mflow:dev` ตอนปิดได้ด้วยโค้ด แต่การ freeze เอกสาร, การรวมข้อเท็จจริงเข้าปลายทาง และการให้ subagent ทำงานเมื่อเปิด ยังพึ่ง workflow ของ AI อยู่ ไม่ควรใช้คำว่า “รับประกัน” กับทุกขั้นตอนเท่ากัน

## 4. ส่วนที่ออกแบบดีและควรเก็บไว้

| จุดแข็ง | เหตุผล | หลักฐาน |
|---|---|---|
| หนึ่งข้อเท็จจริงมีที่อยู่หลัก | ลดการแข่งกันระหว่างเอกสารเก่ากับโค้ดและ spec ปัจจุบัน | [AGENTS template](../plugins/mflow/templates/AGENTS.md), ตาราง Where things live |
| แยก prototype จาก business logic | ทดลองหน้าจอได้เร็วและนำความไม่แน่นอนไปแตกเป็น hotspot | [screen skill](../plugins/mflow/skills/screen/SKILL.md), [hotspot skill](../plugins/mflow/skills/hotspot/SKILL.md) |
| วาง authorization ตั้งแต่ prototype | endpoint, data scope และ field masking มีสัญญากลาง ไม่จบแค่ซ่อนเมนู | [Prototype data contract](../plugins/mflow/skills/screen/references/prototype-data.md) |
| ผลจาก AI อื่นต้องถูกตรวจ | มี Understanding, Files read, verdict ต่อ finding และการตรวจหลักฐานจริง | [assess skill](../plugins/mflow/skills/assess/SKILL.md) |
| Scaffold เคารพไฟล์ที่มีอยู่ | ส่ง template ไป suggested เพื่อรวมภายหลัง | [scaffold.mjs](../plugins/mflow/scripts/scaffold.mjs) |
| มีความจำข้าม session และจำกัด context | ปัญหาการเริ่มใหม่ถูกออกแบบเป็นส่วนหนึ่งของระบบ | [session-start.mjs](../plugins/mflow/scripts/session-start.mjs) |
| Subagent ปิดเป็นค่าเริ่มต้น | ผู้ใช้ควบคุมการใช้งานได้ และสถานะอยู่ระดับ project root | [apply-subagent.mjs](../plugins/mflow/scripts/apply-subagent.mjs), [subagent-guard.mjs](../plugins/mflow/scripts/subagent-guard.mjs) |
| ใช้ไฟล์และ Node โดยไม่เพิ่ม dependency | เหมาะกับเครื่องนักพัฒนาและตรวจ diff ได้ง่าย | สคริปต์ปัจจุบันและ NFR-01 |

## 5. ลำดับความสำคัญ

P1 = ควรแก้ก่อนขยายการใช้หรือปล่อยรุ่นถัดไป; P2 = เพิ่มความน่าเชื่อถือระหว่าง pilot; P3 = ทำเมื่อมีหลักฐานการใช้งานรองรับ ลำดับนี้เป็นข้อเสนอด้านวิศวกรรม ไม่ใช่คะแนนช่องโหว่มาตรฐาน

| ID | ระดับ | เรื่อง | หลักฐานหลัก |
|---|---|---|---|
| F01 | P1 | JSON เสียแล้วถูกแทนด้วยสถานะว่าง / การเขียนสถานะไม่ atomic | ทดลอง + โค้ด |
| F02 | P1 | Discussion readiness ผ่านทั้งที่โครงสร้างไม่ครบ | ทดลอง |
| F03 | P1 | Context pack ข้ามขอบเขต repo และตรวจ secret เฉพาะบางชนิดไฟล์ | ทดลอง + โค้ด |
| F04 | P1 | Quote ของ path ในคำสั่งไม่แยกตาม shell | ทดลองการ render + โค้ด |
| F05 | P1 | หลักฐาน regression ยังไม่ได้จัดเป็นชุดที่รันจาก checkout ได้ | รายการไฟล์ + เอกสาร |
| F06 | P2 | Stop guard และ briefing มีจุดที่ทำให้สถานะตกหล่น | ทดลอง + โค้ด |
| F07 | P2 | การอนุมัติและการกระจายข้อเท็จจริงข้ามไฟล์ยังไม่มี recovery contract | ข้อเสนอจาก workflow |
| F08 | P2 | เอกสารแปลง, golden data และผล review ควรผูกกับ snapshot | โค้ด + เอกสาร |
| F09 | P2 | Subagent config มีกรณีที่ขอบเขต fail-closed ไม่ตรงคำอธิบาย | ทดลอง + โค้ด |
| F10 | P2 | ความเข้ากันได้และการอัปเกรดยังพึ่งการตรวจด้วยมือ | เอกสาร + โค้ด |
| F11 | P2 | เงื่อนไข prototype/production ควรทดสอบเชิงลบและกำหนดให้แม่น | สัญญาในเอกสาร |
| F12 | P3 | ลดการยืนยันซ้ำและจัดเส้นทางเริ่มต้นตามงานที่ต้องการ | เอกสาร + ข้อเสนอ UX |

## 6. รายละเอียดข้อค้นพบและแนวทางแก้

### F01 — อย่าแปลงความเสียหายของสถานะเป็น “ยังไม่มีข้อมูล”

**พบ:** [source-index.mjs](../plugins/mflow/scripts/source-index.mjs) บรรทัด 26–32 จับทุก error ใน `loadDb()` แล้วคืน `{ version: 1, files: {} }` จากนั้น `mark()` เขียนกลับได้ทันที การทดลอง T03 ใส่ `{broken` ในทะเบียนแล้วสั่ง mark เอกสารหนึ่งไฟล์ ได้ exit 0 และทะเบียนเสียถูกแทนที่ด้วยทะเบียนใหม่

`loadConfig()` ใน [lib.mjs](../plugins/mflow/scripts/lib.mjs) บรรทัด 97 เป็นต้นไปใช้ fallback คล้ายกัน ขณะที่ source status รับค่าจาก `--status` โดยไม่ตรวจ enum การเขียน JSON และ index เป็นคนละ `writeFileSync` จึงไม่มีสัญญาว่าทั้งคู่สำเร็จพร้อมกัน

**ผลกระทบ:** สูญเสีย provenance/usedBy/superseded หรือใช้ config เริ่มต้นโดยผู้ใช้ไม่รู้ ถ้ามีสอง session เขียนทะเบียนเดียวกันยังมีความเสี่ยง read-modify-write ทับกัน ซึ่งเป็นข้อสังเกตจากโค้ด ยังไม่ได้ stress test

**ควรปรับ:**

- แยก absent, invalid JSON, invalid schema และ permission error; เฉพาะ absent เท่านั้นที่เริ่มใหม่ได้
- ตรวจ version, enum, paths และชนิดข้อมูลก่อนเขียน; invalid ต้องหยุดและเก็บต้นฉบับครบ
- ใช้ temporary file ใน directory เดียวกันแล้ว rename; เพิ่ม revision/hash check หรือ lock สำหรับการแก้ทะเบียน
- กำหนด JSON เป็นทะเบียนหลัก และ `INDEX.md` เป็น generated view ที่สร้างซ้ำได้เมื่อเขียนไม่ครบ
- ใช้ helper กลางสำหรับ read/validate/write เพื่อไม่ให้แต่ละสคริปต์ตีความ error ต่างกัน

**เกณฑ์รับ:** JSON เสียไม่เปลี่ยนแม้แต่ byte เดียว, status ที่ไม่รู้จักถูกปฏิเสธ, interrupted write กู้คืนได้ และการเขียนพร้อมกันไม่ทำรายการเก่าหาย

### F02 — `readyToApprove` ต้องตรวจว่ามีสิ่งที่จำเป็นครบ

**พบ:** [discuss.mjs](../plugins/mflow/scripts/discuss.mjs) บรรทัด 127–175 นับ decision จากบรรทัด `**เลือก:**` แล้วให้พร้อมเมื่อไม่พบสิ่งค้าง แต่ไม่ได้บังคับว่าทุก `### D<n>` มีช่องคำตอบ หรือเอกสารมี section ที่จำเป็น

- T01: ไฟล์ที่มีเพียง frontmatter ได้ `readyToApprove: true`
- T02: มี `### D1` และตัวเลือก แต่ไม่มีบรรทัดตอบ ได้ `openDecisions: []` และพร้อมอนุมัติ
- T08: code fence สี่ backtick ครอบตัวอย่างสาม backtick ทำให้ marker ในตัวอย่างถูกนับเป็น decision จริง เพราะ `scanLines()` บรรทัด 71 เป็นต้นไปไม่ได้จับคู่ชนิดและความยาว fence

**ผลกระทบ:** readiness เป็นผลตรวจเชิงรูปแบบที่มีทั้ง false positive และ false negative ไม่ใช่การอนุมัติโดยอัตโนมัติ แต่ [discuss skill](../plugins/mflow/skills/discuss/SKILL.md) §Approve ใช้ค่านี้เป็น gate จึงควรเชื่อถือได้

**ควรปรับ:** เพิ่ม document contract ที่ตรวจ required metadata/sections, decision ID ไม่ซ้ำ, คำตอบหนึ่งช่องต่อ decision และตัวเลือกที่อ้างอิงมีจริง กรณีไม่มี decision ให้ระบุ `none` อย่างชัดเจน ส่วน parser ต้องจำ fence character/length และรองรับ CRLF/UTF-8

เก็บ Markdown เป็นรูปแบบที่ผู้ใช้แก้ได้เหมือนเดิม หากใช้ metadata ประกอบให้มีหน้าที่ตรวจโครงสร้าง ไม่เก็บข้อเท็จจริงซ้ำอีกชุด

**เกณฑ์รับ:** T01/T02 ต้องไม่พร้อม; ตัวอย่าง marker ใน nested fence ต้องไม่เป็นคำตอบจริง; valid document ที่ไม่มีประเด็นเปิดยังผ่านได้

### F03 — Context pack ต้องมีขอบเขตไฟล์และนโยบายข้อมูลชัดเจน

**พบ:** [context-pack.mjs](../plugins/mflow/scripts/context-pack.mjs) บรรทัด 21–42 ตรวจ secret เฉพาะ config extensions และรับ `path.resolve(root, p)` โดยไม่ตรวจ containment ใช้ `statSync` ซึ่งติดตาม symlink/junction ได้ ขนาด pack ถูกเตือนหลังอ่านและประกอบข้อมูลทั้งหมดแล้ว

T04 ยืนยันว่า `../outside.md` และข้อความ `api_token: SYNTHETIC-SECRET-123456` ใน `.md` ถูกบรรจุโดยไม่มี skipped item **การทดลองสร้าง pack ในเครื่องเท่านั้น ไม่ได้ส่งข้อมูลให้บริการภายนอก**

**ควรปรับ:**

- ค่าเริ่มต้นอนุญาตเฉพาะไฟล์ภายใน root; normalize และตรวจ real path รวม symlink/junction
- งานที่ต้องส่งไฟล์นอก root เช่น shared package ต้องระบุ allowlist ใน brief อย่างชัดเจน
- ข้าม output pack เอง, deduplicate input และตรวจ cycle ของ directory
- ตรวจ pattern ของข้อมูลลับใน text ทุกประเภท โดยแยก suspected secret ให้ผู้ใช้ตรวจ ไม่อ้างว่าสแกนได้ครบทุกกรณี
- จำกัดจำนวนไฟล์และขนาดก่อนอ่านทั้งหมด; ให้ manifest แสดง path/hash/ขนาดและเหตุผลที่ข้าม
- ระบุใน brief ว่าเนื้อหา source/report เป็นข้อมูลให้วิเคราะห์ ไม่ใช่คำสั่งที่ยกเลิกขอบเขตงาน

**เกณฑ์รับ:** traversal และ link ที่ออกนอกขอบเขตถูกปฏิเสธตามนโยบาย, input ซ้ำไม่ทำ pack ซ้ำ, sensitive fixture ถูกแจ้ง และ pack ใหญ่หยุดก่อนใช้หน่วยความจำเกินงบ

### F04 — สร้าง argument ตามกฎของ PowerShell และ Bash แยกกัน

**พบ:** [delegate-cmd.mjs](../plugins/mflow/scripts/delegate-cmd.mjs) บรรทัด 27 ครอบ absolute path ด้วย double quotes เหมือนกันทุก shell การทดลอง T05 render ชื่อไฟล์ `$MFlowProbe.md` แล้วได้ path ที่ยังตีความเป็น expression/variable ได้เมื่อผู้ใช้รันจริง การทดลองนี้ไม่ได้ execute คำสั่ง AI

**ผลกระทบ:** path ที่มี `$`, backtick หรือ quote อาจไม่เป็น literal; บางรูปแบบอาจกลายเป็น command substitution เรื่องนี้เกี่ยวกับ path และ template ไม่ใช่ข้อความ brief ที่ระบบส่งผ่าน stdin อยู่แล้ว

**ควรปรับ:** เพิ่ม `quotePowerShellLiteral()` และ `quoteBashLiteral()` หรือให้ wrapper รับ argument เป็นโครงสร้างแล้วส่งเข้า process โดยไม่ประกอบ shell string บันทึกด้วยว่า template ที่ผู้ใช้เพิ่มเป็น executable configuration ซึ่งต้องเชื่อถือได้ และตรวจ required arguments ก่อน render แทนการปล่อย `<brief>`/`<out>` ไปอยู่ในคำสั่ง

Node อธิบายความต่างระหว่าง `exec` ที่ผ่าน shell กับ `execFile` ที่ไม่ใช้ shell เป็นค่าเริ่มต้นไว้ใน [Child process documentation](https://nodejs.org/api/child_process.html) ทั้งนี้ wrapper สำหรับ `.cmd` บน Windows ต้องออกแบบและทดสอบตามข้อจำกัดของแพลตฟอร์มด้วย

**เกณฑ์รับ:** ใช้โปรแกรม echo-arguments จำลองทดสอบทั้ง shell กับช่องว่าง ภาษาไทย `$`, apostrophe และ backtick แล้วได้ path เดิมทุก byte; ไม่มี side effect จาก shell expansion

### F05 — เปลี่ยนรายการ “เคยทดสอบผ่าน” เป็น regression suite ใน repo

**พบ:** [requirement.md](requirement.md) §15 บันทึกการทดสอบไว้ละเอียดและบอกข้อจำกัดหลายรายการ แต่รายการไฟล์ tracked ที่ตรวจไม่พบชุด test/fixtures หรือ CI workflow ที่ใช้รันผลเหล่านั้นซ้ำได้ จึงไม่ได้หมายความว่าไม่เคยทดสอบ แต่ผู้รับช่วงยังยืนยันด้วย checkout เดียวไม่ได้

**ควรปรับ:** ใช้ `node:test` ซึ่งสอดคล้องกับแนวทางไม่เพิ่ม dependency โดยเน้นพฤติกรรมต่อผู้ใช้และข้อมูล ไม่ใช่ทดสอบว่าฟังก์ชันมีหน้าตาตาม implementation

| กลุ่มทดสอบ | ตัวอย่างที่ควรมี |
|---|---|
| State integrity | corrupt JSON, missing file, permission error, repeated command, concurrent writers |
| Discussion | missing sections, unanswered decision, old report revision, CRLF, nested fence |
| Export/commands | path escape, link cycle, synthetic secret, literal shell arguments |
| Hooks | non-mflow, nested cwd, compact/resume, delete/rename, timeout/dependency unavailable |
| Integration | OpenSpec/Backlog output ตามรุ่นที่รองรับ และ host hook contract |
| User journey | init → capture → discuss → prototype → hotspot → apply → review → handoff/resume |

**เกณฑ์รับ:** checkout ใหม่รัน regression ได้โดยไม่ต้องใช้ secret หรือ account; CI ครอบคลุม Windows/Linux และ Node versions ที่ประกาศรองรับ; interactive pilot แยกผลจาก automated tests

### F06 — ความจำข้าม session ต้องตรวจความเปลี่ยนแปลงและแสดงความไม่ครบถ้วนได้

**พบ:** [stop-guard.mjs](../plugins/mflow/scripts/stop-guard.mjs) บรรทัด 29–51 ใช้ Git status ร่วมกับ mtime ไฟล์ การลบไฟล์ทำให้ `mtimeMs()` ได้ 0 และหลุดจากรายการ T06 ยืนยันว่าลบ tracked file เพียงไฟล์เดียวใน fixture ที่มี baseline แล้ว hook ไม่ block แม้ตั้ง grace/repeat เป็น 0

ข้อสังเกตจากโค้ดเพิ่มเติม:

- ไฟล์ที่แก้แล้ว commit ภายใน session จะไม่เหลือใน `git status`; guard จึงไม่ได้ครอบคลุมทุกการเปลี่ยนงาน
- `STATUS.md` ถูกแก้ครั้งล่าสุดไม่ได้พิสูจน์ว่า log ครอบคลุมทุกการเปลี่ยนแปลง
- [session-start.mjs](../plugins/mflow/scripts/session-start.mjs) บรรทัด 65/80 เรียกสอง CLI แบบ synchronous ทีละตัว timeout ตัวละ 10 วินาที ก่อนทำ scan/parse เพิ่ม ภายใต้งบ hook 30 วินาที
- บรรทัด 173 ตัด context ท้ายข้อความรวมที่ 9,000 ตัวอักษร ทำให้ pending work และ ritual ท้ายข้อความมีโอกาสหายหากส่วนต้นใหญ่
- `scanSources()` ไม่มี root argument และ [source-index.mjs](../plugins/mflow/scripts/source-index.mjs) ผูก root ตอน import จาก env/process cwd ต่างจาก hook ที่รับ `input.cwd` เป็น fallback ด้วย เงื่อนไขที่ไม่มี env และ cwd ไม่ตรงกันยังไม่ได้ทดลองผ่าน host จริง

**ควรปรับ:** บันทึก Git HEAD + สถานะ/ลายเซ็นไฟล์ตั้งต้น ใช้ `git status --porcelain=v1 -z` และตรวจ deleted/renamed/committed changes เพิ่ม ส่ง root ให้ reader ทุกตัวอย่างชัดเจน จัดงบ context ต่อ section และสงวนพื้นที่สำหรับ blockers/next action เสมอ

ให้ hook อ่านข้อมูลแต่ละส่วนแบบแยกความล้มเหลว พร้อมผล `complete / partial / unavailable` แทนการหายเงียบ และกำหนดเวลารวม การทำงานขนานหรือ cache ควรเลือกหลังวัด latency จริง ไม่ควรทำให้ทุก session สแกนเอกสารทั้งหมดโดยไม่มีเพดาน

เอกสารทางการระบุว่า `Stop` เกิดเมื่อจบการตอบแต่ละ turn และ `stop_hook_active` ใช้หลีกเลี่ยงการวนซ้ำ ระบบปัจจุบันมีการตรวจค่านี้แล้ว ควรเก็บไว้เมื่อปรับ guard ตาม [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks)

**เกณฑ์รับ:** ลบ/เปลี่ยนชื่อ/commit งานแล้ว handoff ตรวจพบ, briefing ยาวยังแสดง blocker/next step และ dependency ล่มแล้วเห็นคำว่า unavailable โดยไม่ทำ session ใช้งานไม่ได้

### F07 — ทำการอนุมัติและส่งต่อให้ทำซ้ำหรือทำต่อหลังล้มเหลวได้

**พบจาก workflow:** [discuss skill](../plugins/mflow/skills/discuss/SKILL.md) §Approve กระจายข้อมูลไปหลายปลายทาง สร้าง Backlog items แล้วจึง freeze เอกสารและ sync agenda ส่วน [hotspot skill](../plugins/mflow/skills/hotspot/SKILL.md) §Graduate สร้าง change และเปลี่ยนสถานะหลายไฟล์ ยังไม่มี script transaction หรือบันทึกขั้นตอนสำหรับ resume การกระจายข้อมูลดังกล่าว

**ความเสี่ยง:** ถ้าทำได้ครึ่งทางแล้ว context หมด การเริ่มใหม่อาจสร้าง task ซ้ำหรือ freeze เอกสารทั้งที่ปลายทางไม่ครบ นี่เป็น failure scenario จากการออกแบบ ไม่ใช่ผลทดสอบว่าปัจจุบันเกิดแล้ว

**ควรปรับ:** ทำ operation record ขนาดเล็กใน `.mflow/operations/` มี operation ID, source revision/hash, รายการปลายทาง, ID ที่สร้างแล้ว และผลแต่ละขั้น ใช้ key เช่น `discuss:<id>:<revision>:<action>` ให้รันซ้ำได้ หลีกเลี่ยงการเพิ่มสำเนาข้อเท็จจริงทั้งเอกสารลง operation record

สถานะที่เสนอ: `prepared → applying → applied` และ `failed` ที่ resume ได้ โดย approve ใช้หลักฐานคำสั่งของผู้ใช้ที่มีอยู่แล้ว ไม่เพิ่มการขออนุมัติซ้ำถ้าขอบเขตไม่เปลี่ยน

**เกณฑ์รับ:** จำลอง failure หลังสร้าง task แรกแล้ว resume ไม่สร้างซ้ำ, destination ทุกแห่งอ้าง revision ที่ตรงกัน, source เปลี่ยนระหว่างทางต้องระบุว่าต้องทบทวน ไม่ตีความเป็นอนุมัติฉบับใหม่เอง

### F08 — ผูก source, conversion, golden และ review กับ snapshot เดียวกัน

**พบ:** source registry มี hash และ `usedBy` แล้ว แต่ [capture skill](../plugins/mflow/skills/capture/SKILL.md) และ discuss consult ใช้ cache รูป `.mflow/cache/<name>.md` โดย consult เน้นสร้างเมื่อยังไม่มี cache ไม่มี contract ที่บังคับว่า cache เดิมต้องตรงกับ source hash ปัจจุบัน

[golden skill](../plugins/mflow/skills/golden/SKILL.md) เก็บ `sourceRow` แต่ยังควรกำหนด provenance มากกว่านี้ ส่วน [brief template](../plugins/mflow/skills/delegate/references/brief-template.md) ระบุ scope/branch โดยยังไม่ได้กำหนด base commit และ file manifest เป็นข้อมูลบังคับ

**ควรปรับ:**

- Conversion manifest: source path/hash, sheet/range หรือ page, converter/version, generatedAt และ warnings; regenerate เมื่อ source เปลี่ยน
- Golden dataset: source hash, sheet, row/range, mapping version, units, rounding, date/locale convention และวิธีจัดการสูตรที่ไม่มี cached value
- Brief/report: base commit, working-tree snapshot hash หรือ explicit dirty-state declaration, document revision และ hashes ของไฟล์ที่แนบ
- ก่อนยอมรับ review/merge ให้เทียบกับ snapshot ที่ถูกตรวจ หากเปลี่ยนให้ตรวจส่วนที่เปลี่ยนใหม่
- คง anomalies และ unreadable source เป็นรายการที่ตรวจตามได้เหมือนเดิม

**เกณฑ์รับ:** แก้ Excel/PDF เดิมแล้ว consult ไม่แนบข้อความแปลงเก่า, source ชื่อซ้ำคนละ folder ไม่ชน cache และ review ของ revision ก่อนหน้าถูกระบุเป็น stale

### F09 — นิยาม fail-closed ของ subagent config ให้ตรงกับโค้ด

**พบ:** [apply-subagent.mjs](../plugins/mflow/scripts/apply-subagent.mjs) บรรทัด 28–49 ใช้ `readText()` ที่คืน null สำหรับ read error ทุกชนิด แล้วถือ null/ไฟล์ว่างเป็น `{}` ดังนั้น absent, unreadable และ empty ไม่ได้แยกจากกันครบ

T07 ยืนยันว่า shared config เปิด agent และ local config เป็นไฟล์ว่าง จะ resolve เป็น `{ enabled: true, source: "shared" }` ไม่ใช่ปฏิเสธ ส่วน permission-denied ของไฟล์ยังไม่ได้จำลองในรอบนี้ ข้อเท็จจริงนี้ต้องอ่านคู่กับคำอธิบายของ [subagent-guard.mjs](../plugins/mflow/scripts/subagent-guard.mjs) ที่ระบุ fail-closed เมื่ออ่านค่าไม่ได้

**ควรปรับ:** ระบุให้ชัดว่าไฟล์ local ที่มีอยู่แต่ว่าง/อ่านไม่ได้เป็น invalid และ deny หรือเป็น reset ที่อนุญาต fallback หากเลือก reset ควรเป็นคำสั่งชัดเจน เช่นลบ override ผ่าน script พร้อมผลที่อธิบายได้ ไม่เกิดจากไฟล์ถูกเขียนขาดกลางทางโดยบังเอิญ

การเปิดใช้ต้องแยก “อนุญาตให้เรียก” ออกจาก “บังคับว่าต้องเรียก” ปัจจุบัน README/R-14 ระบุข้อจำกัดของ guidance ไว้แล้ว ควรคงขอบเขตนั้นและเพิ่มหลักฐาน actual agent/model ที่ใช้ต่อ task เมื่อผู้ใช้ต้องการติดตามต้นทุนหรือวิธีทำงาน

**เกณฑ์รับ:** empty/corrupt/unreadable/local/shared precedence มี case ครบ และข้อความ status ตรงกับผล guard ทั้งจาก root และ subfolder

### F10 — เพิ่ม compatibility contract และเส้นทางอัปเกรด

**พบ:** README แนะนำติดตั้ง dependencies แบบ latest แต่ requirement บันทึกรุ่นที่เคยทดสอบเฉพาะเจาะจง; `DEFAULT_TOOLS` มี `verified` และ notes ระบุรุ่น ถือเป็นจุดเริ่มที่ดี แต่ boolean ตัวเดียวไม่อธิบาย shell/OS/รุ่น/รูปแบบ output ที่ผ่านทดสอบ

ตัวอย่าง drift ที่พบ: [manual.md](manual.md) หัวเอกสารระบุ plugin `0.15.0` ขณะที่ manifest ปัจจุบันเป็น `0.17.0`; [lib.mjs](../plugins/mflow/scripts/lib.mjs) comment ระบุ Node >=18 ขณะที่ README/NFR ระบุ Node 20+ ควรทำให้ตรงกันโดยยึดรุ่นรองรับที่ทีมตัดสินใจ

**ควรปรับ:**

- เพิ่ม doctor แบบอ่านอย่างเดียว ตรวจ runtime/dependency version, JSON output shape, config, paths, stack mapping, hook/guidance และ legacy settings ที่ยังค้าง
- แยก `schemaVersion`, `pluginVersion`, `testedWith` และ `testedAt`; อย่าใช้ config `version: 1` แทนทุกความหมาย
- อัปเกรด template/config แบบมี before/after diff และบันทึกการ migrate; รักษาแนวทาง suggested สำหรับเนื้อหาที่ผู้ใช้แก้เอง
- รวม release checklist ที่ตรวจ version และตัวอย่างคำสั่งข้าม README/manual/requirement

doctor เป็นตัวเลือกเพิ่มคำสั่งใหม่ที่มีประโยชน์ชัดเจน แต่เริ่มเป็น script ภายใน `/mflow:init` และ `/mflow:help` ก่อนได้

**เกณฑ์รับ:** dependency ที่รุ่นไม่รองรับมีคำแนะนำที่ลงมือทำได้, ไม่ถูกแสดงว่า “ไม่มีงาน”, และ rerun migration ไม่เปลี่ยนไฟล์ซ้ำ

### F11 — แยก prototype flag ออกจากการรับรองว่า production ปลอดจากของจำลอง

**พบ:** [Prototype data contract](../plugins/mflow/skills/screen/references/prototype-data.md) §Production safety กำหนดให้ register fake user/route ใต้ flag และกล่าวว่า production build ไม่สามารถมีส่วนนี้ได้ แต่ runtime flag เพียงอย่างเดียวไม่ได้อธิบายกลไกตัดออกจาก build หรือการห้ามเปิด flag ใน production ส่วน [review skill](../plugins/mflow/skills/review/SKILL.md) มี blocker เรื่อง prototype user switching อยู่แล้ว

นี่เป็นความกำกวมของสัญญาที่จะใช้สร้างแอป **ยังไม่ได้พบแอป production ที่มีช่องโหว่จาก repo นี้**

**ควรปรับ:** กำหนด policy ต่อ stack ให้ชัดว่าจะ exclude ตอน build หรือ reject ตอน startup หาก production เปิด fake mode พร้อม negative tests ว่า switch-user route ใช้ไม่ได้, client เลือก role เองไม่ได้ และ permission/data-scope/field-mask ยังบังคับใน API เมื่อ UI ถูกข้าม

สำหรับ custom/multi-app ให้ mapping ต่อ `appId` ที่มี UI/data/test paths ของตัวเอง เมื่อมีโปรเจกต์จริงต้องการ ตามข้อจำกัด R-11/R-13 เดิม ไม่ควรสมมติว่า mapping ชุดเดียวครอบคลุมทุกแอป

**เกณฑ์รับ:** production configuration ใช้ FakeCurrentUser ไม่ได้, direct URL/API bypass ถูกปฏิเสธ และ tests ครอบคลุม role/scope ข้ามหน่วยงาน

### F12 — ทำหลัก “คำสั่งผู้ใช้คือการอนุมัติ” ให้สม่ำเสมอ

**พบ:** หลัก P4/P10 และ Who decides บอกว่าคำสั่งให้ทำเป็นการอนุมัติแล้ว แต่บางขั้นยังเขียน `after the user says yes` หรือ `wait for a yes` แบบกว้าง เช่น discuss approve, capture triage และ schema changes ผู้ใช้จึงอาจได้รับคำถามซ้ำแม้สั่งอนุมัติขอบเขตนั้นแล้ว

**ควรปรับ:** ทำ authorization rule กลาง: ถ้าได้รับคำสั่งชัดเจนให้ทำขอบเขต X ให้แสดงผลที่กำลังทำและเดินหน้าภายใน X; ถ้าพบขอบเขตใหม่ Y ให้ขอเฉพาะ Y; ถ้าขอเพียงวิเคราะห์ให้หยุดที่รายงาน พร้อมบันทึกว่าการอนุมัติอ้าง revision/ขอบเขตใด

ลดภาระเรียนรู้ด้วยเส้นทางเริ่มต้นสองแบบใน help:

- อยากเห็นหน้าจอเร็ว: init → capture เท่าที่จำเป็น → theme → screen → ทดลองใช้
- มีกฎซับซ้อนหรือผลเสียสูง: capture → discuss/hotspot → golden → OpenSpec → prototype/implementation ตามความพร้อม

ให้แสดง next action เดียวต่อรอบตามที่ออกแบบไว้แล้ว แต่เสนอเหตุผลว่าทำไมงานนั้นจึงถัดไป และคง agenda เป็นคำแนะนำ การทำ hotspot หนึ่ง ticket ต่อ session ควรเป็นค่าเริ่มต้นที่ผู้ใช้ปรับได้เมื่อเป็นชุดคำตอบง่ายและเกี่ยวข้องกัน

**เกณฑ์รับ:** ผู้ใช้สั่ง approve revision ที่ชัดเจนแล้วไม่ถูกถามอนุมัติเรื่องเดิมอีก และผู้ใช้ใหม่ทำ slice แรกได้โดยไม่ต้องอ่านครบทุกคำสั่ง

## 7. รูปแบบภายในที่แนะนำ

ปรับทีละส่วนโดยรักษาชื่อคำสั่งเดิม:

| ส่วน | ความรับผิดชอบที่เสนอ |
|---|---|
| `core/config` | parse, validate, resolve local/shared และ error contract |
| `core/paths` | project root, containment, real paths, relative path normalization |
| `core/state-store` | atomic writes, revision check, recovery สำหรับข้อมูลที่ต้องเขียน |
| `core/discussions` | parse/validate document, readiness, revision และ transition checks |
| `adapters/openspec`, `adapters/backlog` | แปลงผล CLI ให้เป็นรูปข้อมูลกลาง พร้อม unavailable/unsupported |
| scripts ปัจจุบัน | รับ arguments/stdio เรียก core แล้วคืนผล; ลด global root ที่เกิดตอน import |
| hooks | ประกอบ briefing/guard ที่มีเวลาและขนาดจำกัด ใช้ core เดียวกับ CLI |
| skills | อธิบายการตัดสินใจและบทสนทนา อ้าง contracts แทนคัดลอกกฎซ้ำ |

ไม่ต้องแยกทุกไฟล์ทันที ให้เริ่มจาก helper ที่ F01/F03/F04 ต้องใช้จริง และให้ tests ล็อกพฤติกรรมก่อนแยก module ข้อมูลธุรกิจยังมีเจ้าของตามตารางเดิม; metadata เพิ่มเพื่ออ้างอิงและกู้คืน ไม่สร้างฐานความจริงชุดใหม่

## 8. แผนดำเนินงานที่เสนอ

ลำดับด้านล่างเป็นข้อเสนอสำหรับการอนุมัติในงานถัดไป ไม่ใช่การอนุมัติให้แก้ implementation จากคำขอวิเคราะห์ครั้งนี้

| ช่วง | งาน | เงื่อนไขจบ |
|---|---|---|
| A: รักษาข้อมูลและขอบเขต | F01, F03, F04, F09 และ test ที่ตรงกับ defect | ไม่ทับ state เสีย, export อยู่ในขอบเขต, arguments เป็น literal, config policy ตรง guard |
| B: เชื่อถือสถานะได้ | F02, F06 และ regression/CI ของ F05 | readiness ไม่ผ่านเอกสารไม่ครบ; delete/rename/commit ไม่หายจาก handoff; briefing บอก partial ได้ |
| C: ส่งต่องานที่ตรวจย้อนกลับได้ | F07, F08, F10 | operation resume ได้, review ระบุ snapshot, upgrade ตรวจผลได้ |
| D: ยืนยันกับการใช้งานจริง | F11, F12 และ end-to-end pilot | slice จริงครบวงจรและ resume ได้; production safety มี negative tests; ลดการถามซ้ำ |

แนะนำเริ่ม A และ B ก่อนเพิ่มความสามารถใหม่ เช่น automated multi-AI orchestration หรือรองรับ stack เพิ่ม เพราะปัญหาที่พิสูจน์แล้วอยู่ที่ความน่าเชื่อถือของสถานะและขอบเขต

## 9. ผลการทดลองในรอบนี้

ใช้ fixture ใหม่ใต้ OS temp; ไม่แก้ config หรือข้อมูลของโปรเจกต์ผู้ใช้จริง ทดสอบผ่าน script ชั่วคราว `tmp/mflow-design-probe.mjs` ที่สร้างสำหรับการวิเคราะห์นี้

| Test | วิธีทดลอง | ผลที่ได้ |
|---|---|---|
| T01 | สร้าง `01-empty.md` มีเพียง frontmatter แล้ว `discuss.mjs check 01` | `readyToApprove: true` |
| T02 | สร้าง decision heading/ตัวเลือก แต่ไม่มี answer marker แล้ว check | พร้อมอนุมัติและ `openDecisions: []` |
| T03 | ทำ `sources.json` เป็น `{broken` แล้ว `source-index.mjs mark docs/source/new.md` | exit 0 และทะเบียนเดิมถูกแทนที่ |
| T04 | pack `../outside.md` และ `.md` ที่มี synthetic API token | รวมทั้งสองไฟล์; `skipped: []` |
| T05 | render delegate command โดย brief มี `$MFlowProbe.md` | Bash/PowerShell ยังได้ expression อยู่ใน double-quoted path; ไม่รัน AI command |
| T06 | Git fixture มี baseline แล้วลบ tracked file; grace/repeat 0 | Stop hook exit 0 ไม่มี block |
| T07 | shared on + local file ว่าง แล้วเรียก `resolve(root)` | enabled true, source shared |
| T08 | outer fence สี่ backtick ครอบตัวอย่าง fence สาม backtickและ decision | ตัวอย่างถูกนับเป็น open decision |
| Syntax | `node --check` สคริปต์ `.mjs` ทั้ง 11 ไฟล์ | ผ่าน 11/11 |

T01–T08 คือการสังเกตพฤติกรรมเพื่อพิสูจน์ข้อค้นพบ ไม่ใช่ acceptance tests ที่ผ่านตามพฤติกรรมที่ต้องการ ส่วน syntax ผ่านยืนยันได้เพียงการ parse JavaScript ไม่ยืนยัน workflow หรือ integration

ชุด regression ถาวรควรเพิ่ม healthy cases คู่กัน เช่น valid discussion, valid registry, local false override shared true และ safe pack เพื่อให้การแก้ไม่ทำพฤติกรรมที่ถูกต้องเสียไป

## 10. สิ่งที่ควรวัดใน pilot และสิ่งที่ยังไม่ควรเพิ่ม

ต่อยอดเกณฑ์ pilot เดิมใน [requirement.md](requirement.md) §16 โดยเก็บหลักฐานอย่างน้อย:

- จำนวนครั้งที่เปิด session ใหม่แล้วต้องอธิบายบริบทซ้ำ
- จำนวนสถานะผิด/ตกหล่นที่ doctor หรือผู้ใช้พบ และเวลาที่ใช้กู้คืน
- ระยะเวลาจาก source ใหม่ถึง prototype ที่ผู้ใช้ทดลองได้ และถึง slice ที่มี test
- สัดส่วน approved decisions ที่ตามไปถึง destination/task/test ได้
- เวลาและขนาด briefing รวมถึงจำนวนครั้งที่ถูกตัด
- จำนวนการขออนุมัติเรื่องเดิมซ้ำ และจำนวน report ที่ stale ก่อน assess

ยังไม่แนะนำให้เพิ่มบริการ cloud, database กลาง, event sourcing เต็มรูปแบบ, ระบบเลือกโมเดลอัตโนมัติ หรือรองรับ stack จำนวนมากพร้อมกัน ข้อมูลใน repo และ operation record แบบเล็กเพียงพอสำหรับข้อเสนอข้างต้น ส่วนความสามารถใหม่ให้ใช้หลัก P9: มีงานจริงที่ทำซ้ำและผลประโยชน์ที่วัดได้ก่อน

ผลลัพธ์ที่ควรตั้งเป้าคือ **mflow ที่เริ่มงานง่าย ตรวจพบความไม่ครบถ้วนได้ และส่งต่องานจากหลักฐานที่ตรงกับฉบับปัจจุบัน** โดยคงความเร็วของ workflow แบบ prototype-first ไว้

## 11. ความต้องการเพิ่มเติม: หลาย AI ช่วยวิเคราะห์และออกแบบ

ผู้ใช้ระบุว่าต้องการให้ AI agent อื่นช่วยวิเคราะห์ระบบและเสนอแบบได้ นอกเหนือจากการ consult ผ่าน discuss จึงเพิ่ม [ข้อเสนอคำสั่งสำหรับหลาย AI](mflow-multi-agent-design-proposal.md) revision 0.2

แนะนำเพิ่ม `/mflow:analyze` และ `/mflow:design` ก่อน ตามด้วย `/mflow:challenge` เพื่อทดสอบจุดอ่อนของแบบ ทั้งหมดใช้ delegate/assess เป็นกลไกร่วมและมีรายงานรวมที่เก็บหลักฐานกับความเห็นต่าง ไม่จำเป็นต้องเริ่มจาก discussion document หรือเพิ่มการรัน AI ภายนอกอัตโนมัติในรุ่นแรก ข้อเสนอนี้ยังไม่ได้เปลี่ยน implementation

**ข้อกำหนดที่ผู้ใช้ยืนยัน:** ทั้งสามคำสั่งเป็น optional เรียกแยกกันหรือไม่เรียกเลยก็ได้ ไม่มี hooks หรือคำสั่งอื่นเรียกให้อัตโนมัติ และไม่เป็นเงื่อนไขก่อนทำขั้นตอนหลัก ผลปรึกษาที่ยังไม่กลับมาไม่ block งานหลัก ผู้ใช้เลือกนำคำแนะนำไปใช้ได้ตามต้องการ โดยคงการตรวจคุณภาพเดิมของ workflow

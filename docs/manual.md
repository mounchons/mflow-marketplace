# mflow: คู่มือการใช้งาน

| รายการ | ค่า |
|---|---|
| เอกสาร | คู่มือการใช้งานและลำดับการใช้คำสั่ง |
| เวอร์ชัน plugin | 0.9.1 |
| วันที่ | 2026-09-26 |
| อ่านคู่กับ | `docs/requirement.md` (ทำไมถึงออกแบบแบบนี้), `plugins/mflow/README.md` (ติดตั้งและโครงสร้าง) |

---

## 1. กติกาห้าข้อก่อนใช้

1. **คำสั่ง `/mflow:*` พิมพ์เองทุกครั้ง** Claude ไม่เรียกให้อัตโนมัติ ถ้าไม่แน่ใจว่าจะใช้คำสั่งไหน พิมพ์ `/mflow:help <เล่าสถานการณ์>`
2. **ก่อนเขียนไฟล์ Claude จะแสดงตารางหรือแผนให้ดูก่อน** ตอบ yes แล้วจึงเขียน ถ้าไม่ตรงให้แก้ในแชตได้เลย
3. **ความจำอยู่ในไฟล์ ไม่ได้อยู่ในแชต:** `STATUS.md` บอกว่าทำถึงไหน OpenSpec บอกว่าระบบต้องทำอะไร Backlog.md บอกว่างานไหนค้างอยู่ จึงปิดแล้วเปิด session ใหม่ได้ทุกเมื่อ
4. **คำสั่งของ AI ตัวอื่น (Codex, Gemini …) พี่ปูรันเอง** mflow สร้าง brief และบรรทัดคำสั่งให้เท่านั้น
5. **หนึ่ง session ทำเรื่องหลักเรื่องเดียว** โดยเฉพาะ hotspot ที่ทำครั้งละหนึ่งตั๋ว

## 2. ภาพรวมลำดับการใช้คำสั่ง

```mermaid
flowchart TD
    S0["0. /mflow:init<br/>ครั้งเดียวต่อ repo"] --> S1["1. /mflow:capture<br/>ลงทะเบียนเอกสารลูกค้า"]
    S1 --> D["1.5 /mflow:discuss<br/>ยืนยันความเข้าใจกับพี่ปู<br/>วนจนตรงกัน แล้ว approve"]
    D --> S2["2. /mflow:theme<br/>UI kit ครั้งเดียว"]
    S1 -.->|ไม่มีเรื่องต้องยืนยัน| S2
    S2 --> S3["3. /mflow:screen inventory<br/>รายการหน้าจอ"]
    S3 --> DM["3.5 /mflow:discuss กลุ่มข้อมูล data model<br/>ออกแบบตาราง column data dictionary"]
    DM --> S4["4. /mflow:screen ชื่อ สิ่งที่ต้องการ<br/>สร้าง prototype"]
    S3 -.->|ยังไม่ออกแบบข้อมูล| S4
    S4 --> R["รีวิวกับลูกค้า"]
    R --> RN["/mflow:review-notes"]
    RN -->|ปรับหน้าจอ| S4
    RN --> Q{"กฎตัดข้ามหน้าจอ<br/>หรือผิดแล้วแพง?"}
    Q -->|ใช่| H["5. /mflow:hotspot + /mflow:golden<br/>ทีละตั๋ว จน graduate"]
    Q -->|ไม่| P
    H --> P["6. /opsx:propose"]
    P --> A["/opsx:apply<br/>หรือ /mflow:delegate --mode code"]
    A --> V["/mflow:review<br/>(+ /mflow:assess ถ้า tool อื่นทำ)"]
    V --> AR["/opsx:archive"]
    AR -->|slice ถัดไป| S4
```

| ขั้น | คำสั่ง | ใช้เมื่อ | ความถี่ |
|---|---|---|---|
| 0 | `/mflow:init` | repo ใหม่ หรือหลังอัปเกรด plugin | ครั้งเดียว |
| 1 | `/mflow:capture` | ลูกค้าส่งเอกสารหรือฉบับใหม่ | ทุกครั้งที่มีเอกสารเข้า |
| 1.5 | `/mflow:discuss` | เอกสารตีความได้หลายแบบ (สิทธิ์, เมนู, ข้อมูลเฉพาะ role …) | ต่อหัวข้อ วนจนตรงกันแล้ว approve |
| 2 | `/mflow:theme` | ก่อนสร้างหน้าจอแรก | ครั้งเดียว (`update` เมื่อจะเปลี่ยนหน้าตา) |
| 3 | `/mflow:screen inventory` | เริ่ม release | ต่อ release |
| 3.5 | `/mflow:discuss <กลุ่มข้อมูล> data model` | ก่อนสร้างหน้าจอแรกของกลุ่มข้อมูลที่หลายหน้าจอใช้ร่วมกัน | ต่อกลุ่มข้อมูล (ไม่บังคับ) |
| 4 | `/mflow:screen <ชื่อ> …` → `/mflow:review-notes` | สร้างหรือปรับหน้าจอ แล้วรีวิวกับลูกค้า | วนหลายรอบ |
| 5 | `/mflow:hotspot`, `/mflow:golden` | เจอกฎใหญ่หรือกฎที่คลุมเครือ | ครั้งละหนึ่งตั๋วต่อ session |
| 6 | `/opsx:propose` → `/opsx:apply` → `/mflow:review` → `/opsx:archive` | สร้างของจริงทีละ slice | ต่อ slice |
| เหตุการณ์ | `/mflow:change-request` | ลูกค้าขอเปลี่ยนหลังอนุมัติแล้ว | เมื่อเกิดขึ้น |
| เหตุการณ์ | `/mflow:delegate` → `/mflow:assess` | ให้ AI ตัวอื่นวิเคราะห์ รีวิว หรือเขียนโค้ด | เมื่อต้องการ |
| ทุกวัน | `/mflow:handoff` | จบวัน หรือก่อนสลับไปใช้ tool อื่น | วันละครั้ง |

**ช่วงแรกใช้แค่สี่คำสั่ง:** `init` → `capture` → `theme` → `screen` (เพิ่ม `discuss` เมื่อเอกสารตีความได้หลายแบบ) ส่วนที่เหลือค่อยเริ่มใช้เมื่อเจอสถานการณ์ของคำสั่งนั้น

## 3. ก่อนเริ่ม

| ต้องมี | ใช้ทำอะไร | ติดตั้ง |
|---|---|---|
| Node 20 ขึ้นไป, git | script ของ plugin | ติดตั้งตามปกติ |
| OpenSpec 1.10 ขึ้นไป | spec และ change | `npm i -g @fission-ai/openspec@latest` |
| Backlog.md 1.51 ขึ้นไป | task และตั๋ว hotspot (ต้องใช้ `isReady` ใน JSON) | `npm i -g backlog.md` |
| Python + pandas, openpyxl, python-docx, pypdf | อ่าน Excel/Word/PDF ของลูกค้า และแปลงเป็นข้อความก่อน `consult` | `pip install pandas openpyxl python-docx pypdf` |
| .NET SDK | build/test โปรเจกต์ | ติดตั้งตามปกติ |
| ตัวแสดงภาพ Mermaid (ไม่บังคับ) | ดูแผนภาพในเอกสาร discuss | GitHub แสดงเป็นรูปให้เอง ถ้า preview ของ VS Code แสดงเป็นโค้ด ให้ติดตั้ง extension สำหรับ Mermaid preview |
| mermaid-cli (ไม่บังคับ) | ให้ Claude ตรวจ syntax ของแผนภาพโดยการ render | `npm i -g @mermaid-js/mermaid-cli` (ดาวน์โหลด browser มาด้วย ขนาดใหญ่) |

ติดตั้ง plugin ใน Claude Code:

```
/plugin marketplace add mounchons/mflow-marketplace
/plugin install mflow@mflow-marketplace
```

ถ้าโฟลเดอร์โปรเจกต์ยังไม่เป็น git repo ให้รัน `git init` ก่อน เพราะ `backlog init` จะถามคำถามเรื่อง git แม้ใส่ `--defaults` แล้ว

## 4. ขั้นตอนทีละคำสั่ง

### ขั้น 0: `/mflow:init [ชื่อโปรเจกต์]`

- **ใช้เมื่อ:** ใช้ mflow กับ repo นี้เป็นครั้งแรก หรือหลังอัปเกรด plugin เพื่อรับ template ใหม่
- **สิ่งที่เกิดขึ้น:**
  1. สำรวจ repo: solution, test project, Playwright, agent file เดิม, เอกสาร requirement และ CLI ที่ติดตั้งไว้ แล้วสรุปให้ดูในรอบเดียว
  2. แสดงรายการไฟล์ที่จะสร้าง (dry-run) แล้วสร้าง `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `docs/vision.md`, `docs/hotspots/INDEX.md`, `docs/source/`, `docs/ai-inbox/`, `docs/discuss/`, `.mflow/config.json` ไฟล์ที่มีอยู่แล้วจะไม่ถูกเขียนทับ template จะไปอยู่ที่ `.mflow/suggested/` เพื่อ merge ให้พร้อมแสดง diff
  3. ต่อ OpenSpec และ Backlog.md โดยถาม yes ก่อนรันแต่ละคำสั่ง
  4. รัน `dotnet build` และ `dotnet test` จริง แล้วเขียนเฉพาะคำสั่งที่ผ่านลงใน AGENTS.md คำสั่งที่รันไม่ได้จะติด `(unverified)`
  5. ย้ายเอกสารลูกค้าที่พบไปไว้ใน `docs/source/` แล้วคัดแยกตามขั้น 1
- **สิ่งที่พี่ปูต้องตอบ:** คำถามไม่เกินสามข้อ เรื่องจุดประสงค์ของระบบ, bounded context และคำศัพท์ของลูกค้า ข้อไหนยังไม่รู้ให้ตอบว่าข้าม จะเหลือเป็น `TODO` ไว้
- **ได้อะไร:** repo พร้อมใช้งาน และตั้งแต่ session ถัดไป hook จะเริ่มทำงาน
- **ต่อไป:** `/mflow:capture` ถ้ามีเอกสาร แล้ว `/mflow:theme`

### ขั้น 1: `/mflow:capture [@ไฟล์ …] [--replaces @ไฟล์เก่า]`

- **ใช้เมื่อ:** ลูกค้าส่ง TOR, Word, Excel, PDF หรือโน้ตมา หรือส่งฉบับแก้ไขมา
- **เตรียม:** วางไฟล์ต้นฉบับไว้ใน `docs/source/` และ **ห้ามแก้ต้นฉบับ** ฉบับใหม่ให้บันทึกเป็นไฟล์ใหม่ เช่น `2026-10-tor-v2.pdf`
- **พิมพ์:**
  - `/mflow:capture` แบบไม่ใส่ไฟล์ = อ่านเฉพาะไฟล์ใหม่และไฟล์ที่เปลี่ยน (ตรวจจาก hash) ไฟล์ที่เคยอ่านแล้วจะถูกข้าม
  - `/mflow:capture @docs/source/2026-10-tor-v2.pdf --replaces @docs/source/2026-09-tor-v1.pdf` = เทียบฉบับใหม่กับฉบับเก่าทีละหัวข้อ แล้วตั้งฉบับเก่าเป็น `superseded`
- **สิ่งที่เกิดขึ้น:** แสดงรายการไฟล์ที่จะอ่านและที่จะข้าม → อ่านตามชนิดไฟล์ → คัดแยกทุกข้อความเป็นตารางให้ดูก่อน (ข้อกำหนดถาวรไป AGENTS.md, ขอบเขตไป vision, กฎใหญ่ไป hotspot, ข้อที่คลุมเครือไป open questions …) → หลังพี่ปูตอบ yes จึงเขียน → บันทึกลงทะเบียนเอกสาร
- **ชนิดไฟล์ที่รองรับตอนนี้:** `.pdf` `.md` `.txt` `.csv` `.json`, `.docx` (แปลงเก็บไว้ที่ `.mflow/cache/`) และ `.xlsx` (อ่านด้วย python) ส่วน `.doc` `.xls` `.pptx` ยังไม่รองรับ ให้ขอไฟล์ `.docx`/`.xlsx`/PDF จากลูกค้า หรือแปลงเองก่อน
- **ได้อะไร:** `docs/source/INDEX.md` (สร้างอัตโนมัติ ห้ามแก้เอง) บอกว่าไฟล์ไหนใช้อยู่ ไฟล์ไหนถูกแทนแล้ว และถูกใช้กับเรื่องใด

### ขั้น 1.5: `/mflow:discuss` ยืนยันความเข้าใจก่อนเดินต่อ

- **ใช้เมื่อ:** หลัง `/mflow:capture` เมื่อเอกสารลูกค้าตีความได้หลายแบบในเรื่องที่ตัดผ่านหลายหน้าจอ เช่น การกำหนดสิทธิ์, การผูกเมนูกับ role, ข้อมูลที่เฉพาะบาง role เห็น, โครงสร้างสาขา, เลขเอกสาร ควรทำก่อน `/mflow:screen inventory` เพราะถ้าเข้าใจผิดตอนนี้แก้แค่ย่อหน้าเดียว แต่ถ้าสร้างหน้าจอไปแล้วต้องตามแก้ทุกหน้าจอ
- **พิมพ์:**
  - `/mflow:discuss` = ดูเอกสาร discuss ทั้งหมดพร้อมสถานะ และหัวข้อที่ควรคุยแต่ยังไม่มีเอกสาร
  - `/mflow:discuss สิทธิ์ เมนู และข้อมูลที่แต่ละ role เห็น @docs/source/2026-09-tor-v1.pdf` = ร่างเอกสารใหม่
  - `/mflow:discuss 01` = ปรับตามที่พี่ปูเขียนตอบไว้ในไฟล์
  - `/mflow:discuss 01 ผู้จัดการเขตต้องเห็นทุกสาขาในเขตด้วย` = ปรับตามที่พิมพ์บอกในแชต
  - `/mflow:discuss 01 consult` = ให้ AI ตัวอื่นช่วยวิเคราะห์ (ดูหัวข้อ "ให้ AI หลายตัวช่วยคิด" ด้านล่าง)
  - `/mflow:discuss 01 approve` = อนุมัติ แล้วนำแต่ละข้อไปรวมกับ flow หลัก
  - `/mflow:discuss 01 drop <เหตุผล>` = ยกเลิกเอกสาร เช่น เมื่อเรื่องนั้นกลายเป็น hotspot
- **สิ่งที่เกิดขึ้น:** Claude ตั้งชื่อหัวข้อให้พี่ปูยืนยัน แล้วเขียน `docs/discuss/01-access-control.md` เป็นภาษาไทย มีหัวข้อ: เรื่องที่ต้องการยืนยัน, สิ่งที่ Claude เข้าใจ, แบบที่เสนอ (เช่น ตาราง role × เมนู, role × ขอบเขตข้อมูล, field ที่บาง role ไม่เห็น) พร้อมตัวอย่างสถานการณ์ด้วยชื่อสมมติ, ข้อที่ให้พี่ปูตัดสินใจ, คำถามที่ต้องถามลูกค้า, เรื่องที่ไม่รวม และปลายทางเมื่ออนุมัติ
- **หัวข้อที่ใช้บ่อย** (มี checklist ให้ Claude ใช้ตรวจว่าครอบคลุมครบหรือยัง): สิทธิ์ เมนู และข้อมูลที่แต่ละ role เห็น (access-control), ตาราง column และ data dictionary (data-model ดูขั้น 3.5), โครงสร้างบริษัท/สาขา, เมนู, เลขเอกสาร, ภาพรวมการอนุมัติ, การแจ้งเตือน, ประวัติการแก้ไข, นำเข้า/ส่งออก/พิมพ์, การเชื่อมต่อระบบอื่น, master data, การย้ายข้อมูลจากระบบเดิม
- **ภาพประกอบ:** เอกสาร discuss อธิบายด้วยภาพควบคู่กับข้อความ หัวข้อ 3 เริ่มด้วย "ภาพรวม" อย่างน้อยหนึ่งภาพ และข้อตัดสินใจที่แต่ละทางเลือกหน้าตาหรือ flow ต่างกันจะมีภาพเล็กของแต่ละทางเลือก

  | อยากเห็น | ภาพที่ใช้ |
  |---|---|
  | ขั้นตอนงาน ใครทำอะไรก่อนหลัง | flowchart แยกเลนตาม role |
  | ใครคุยกับใคร และถ้าล้มเหลวเกิดอะไร (ระบบภายนอก, การแจ้งเตือน) | sequence diagram |
  | สถานะของเอกสารเปลี่ยนอย่างไร | state diagram |
  | ตารางและความสัมพันธ์ | ER diagram |
  | ลำดับชั้นองค์กร ใครเห็นข้อมูลหน่วยไหน | flowchart จากบนลงล่าง |
  | หน้าจอของแต่ละ role หน้าตาอย่างไร | ภาพหน้าจอจริงจาก `/mflow:screen` ถ้ามีแล้ว ถ้ายังไม่มีใช้ wireframe ตัวอักษร |

  - **ภาพไม่ใช่ความจริงหลัก:** ข้อความและตารางที่ติดป้ายคือความจริง ภาพต้องไม่มีข้อมูลที่ข้อความไม่มี ถ้าแก้ข้อเท็จจริง Claude จะแก้ทุกภาพที่เกี่ยวข้องใน revision เดียวกัน
  - **ภาพก็บอกที่มา:** ส่วนที่ Claude ตีความหรือเสนอจะมีคำว่า `(อนุมาน)` หรือ `(เสนอ: codex)` อยู่ในภาพ ใน flowchart จะเป็นเส้นประด้วย และใต้ภาพมีบรรทัดบอกว่าภาพนี้ตอบคำถามอะไร
  - **ไม่ตรงกับที่คิด:** เขียน `> พี่ปู:` ใต้ภาพได้เลย AI ตัวอื่นที่ `consult` ก็แย้งภาพได้ และเสนอภาพที่แก้แล้วมาด้วยได้
  - **ตัวอย่าง wireframe:** หน้าเดียวกัน วาดแยกตาม role

    ```text
    หน้ารายการงาน: คุณสมชาย (หัวหน้าสาขาบางนา)
    | ค้นหา ________  สถานะ ▼  [ ค้นหา ]     [ + สร้างงาน ]
    | เลขงาน          | ลูกค้า    | ยอดขาย  | ต้นทุน

    หน้ารายการงาน: คุณวิภา (พนักงานขาย)
    | ค้นหา ________  สถานะ ▼  [ ค้นหา ]
    | เลขงาน          | ลูกค้า    | ยอดขาย
    ```
    ต่างกัน: พนักงานขายไม่เห็นต้นทุนและไม่มีปุ่มสร้างงาน

  - **ตอนอนุมัติ:** ภาพไปกับข้อเท็จจริงที่มันแสดง ER diagram ไปอยู่ข้าง data dictionary ใน `PrototypeData/README.md` ส่วน state diagram ไปที่ `rules.md` ถ้าเรื่องนั้นกลายเป็น hotspot ภาพอื่นอยู่ในเอกสาร discuss ที่ freeze แล้ว
  - **Claude ตรวจภาพให้:** `check` นับจำนวนภาพ และเตือน label ใน flowchart ที่จะทำให้ภาพพัง (วงเล็บ, `;` หรือ `#` ที่ไม่ได้ใส่ quote) แต่ไม่ขวางการอนุมัติ ถ้ามี code block ที่ลืมปิด จะอนุมัติไม่ได้ เพราะมันซ่อนทุกอย่างที่อยู่ข้างล่าง
- **ป้ายท้ายข้อความ:** `[ที่มา: ไฟล์ §หัวข้อ]` มาจากเอกสารลูกค้า, `[พี่ปู]` พี่ปูบอกไว้, `[อนุมาน]` Claude ตีความเอง, `[เสนอ]` Claude เสนอ ให้ตรวจ `[อนุมาน]` กับ `[เสนอ]` ละเอียดที่สุด
- **วิธีตอบ:**
  - เขียนในไฟล์: พิมพ์ตัวอักษรของทางเลือก (`a` `b` `c` ไม่ต้องสลับภาษาแป้นพิมพ์) ต่อท้าย `**พี่ปูเลือก:**` ของแต่ละข้อตัดสินใจ เช่น `b` หรือ `b แต่ให้ผู้จัดการเขตเห็นด้วย` หรือเพิ่มบรรทัดที่ขึ้นต้นด้วย `> พี่ปู:` ใต้ข้อที่อยากแก้ แล้วสั่ง `/mflow:discuss 01`
  - หรือพิมพ์ในแชตพร้อมคำสั่ง เช่น `/mflow:discuss 01 D1 a, D2 b`
  - ทุกรอบ Claude เพิ่มเลข revision และจดใน "บันทึกการแก้ไข" ว่าแก้อะไร เพราะข้อไหน
- **ให้ AI หลายตัวช่วยคิด (พี่ปูเป็นคนเลือก):**
  1. `/mflow:discuss 01 consult` (หรือ `--to codex,opencode`) ได้ brief หนึ่งฉบับ และคำสั่ง PowerShell/Bash ของแต่ละ tool ซึ่งเขียนผลลงไฟล์แยกของตัวเองใน `docs/ai-inbox/` เช่น `2026-10-01-codex-discuss-01-r2.md`
  2. พี่ปูรันคำสั่งของ tool ที่ต้องการเอง ถ้าเป็น ChatGPT/Gemini web ให้แนบ context pack ที่ได้
  3. `/mflow:discuss 01` Claude ตรวจหลักฐานที่แต่ละ AI อ้างแล้ววางความเห็นทั้งหมดลงในเอกสาร: ในแต่ละข้อตัดสินใจมีบรรทัด `codex เลือก: …` `opencode เลือก: …` ต่อจากคำแนะนำของ Claude เรื่องที่ AI เห็นต่างกันกลายเป็นข้อตัดสินใจใหม่ ข้อมูลที่ถูกต้องชัดเจนติดป้าย `[เสนอ: codex]` และทุกข้อ (รวมข้อที่ไม่ใช้พร้อมเหตุผล) อยู่ในตารางหัวข้อ 8
  4. Claude ตัดข้อเสนอได้เฉพาะเมื่อมีหลักฐานว่าผิด เรื่องที่เป็นการชั่งน้ำหนักจะเป็นข้อตัดสินใจให้พี่ปูเลือกเสมอ และ Claude ไม่เลือกแทนพี่ปูจากความเห็นของ AI
  5. อยากให้ AI ตอบกันเองอีกรอบ: สั่ง `consult` ซ้ำหลังปรับเอกสาร รอบใหม่จะเห็นหัวข้อ 8 ของรอบก่อน
  6. อนุมัติไม่ได้จนกว่ารายงานที่ส่งกลับมาจะถูกรวมเข้าเอกสารครบ
- **Claude จะไม่คล้อยตามเสมอ:** ถ้าสิ่งที่พี่ปูบอกขัดกับเอกสารลูกค้า Claude จะคงข้อความจากเอกสารไว้พร้อมอ้างที่มา แล้วเปลี่ยนเรื่องนั้นเป็นคำถามถึงลูกค้า
- **อนุมัติ:** ทำได้เมื่อทุกข้อตัดสินใจมีคำตอบ ไม่มีบรรทัด `> พี่ปู:` ค้าง และไม่มีช่องที่ยังไม่ได้เติมจาก template (script ตรวจให้) → Claude แสดงตารางว่าแต่ละข้อจะไปอยู่ที่ไหน (vision, AGENTS.md, hotspot, Backlog decision, task, Open questions) → ตอบ yes → เขียน แล้วเอกสารถูก freeze ไว้เป็นบันทึกเหตุผล
- **การอนุมัติของพี่ปูไม่ใช่การยืนยันของลูกค้า:** คำถามถึงลูกค้าย้ายไป Open questions หรือตั๋ว `ask` ของ hotspot ลูกค้ายืนยันผ่านการรีวิว prototype และ `/mflow:review-notes`
- **เปลี่ยนใจภายหลัง:** ถ้ายังไม่ได้สร้าง ให้เปิดเอกสารใหม่หัวข้อเดิม แล้วฉบับเก่าจะเป็น `superseded` ถ้าสร้างแล้วหรือลูกค้ายืนยันแล้ว ให้ใช้ `/mflow:change-request`
- **ต่างจาก hotspot:** discuss ยืนยันความเข้าใจทั้งเรื่องในเอกสารเดียวและวนได้เร็ว ส่วน hotspot ไล่กฎที่ต้องใช้คำตอบหรือตัวอย่างจากลูกค้าทีละตั๋วหลาย session เอกสาร discuss อาจสร้างแถว hotspot ได้
- **ได้อะไร:** ความเข้าใจที่ตรงกันก่อนสร้างหน้าจอ และ `/mflow:screen inventory` จะใช้ role และเมนูจากเอกสารที่อนุมัติแล้ว
- **ต่อไป:** `/mflow:theme`

### ขั้น 2: `/mflow:theme [แบรนด์ | @โลโก้ | @CI guide]`

- **ใช้เมื่อ:** ก่อนสร้างหน้าจอแรก ทำครั้งเดียว
- **สิ่งที่พี่ปูต้องตอบ (ในรอบเดียว):** โลโก้, สีหลักหรือ CI guide ของลูกค้า, ความรู้สึกของแอป (หน้าจอแน่นแบบ back-office หรือโปร่ง) และฟอนต์ไทย ถ้าลูกค้าไม่มี CI Claude จะเสนอสามชุดสีไว้บนหน้า style guide ให้เลือก
- **ได้อะไร:**
  - `wwwroot/css/tokens.css` เป็นที่เดียวที่เก็บสี ฟอนต์ radius และระยะห่าง
  - `_Layout.cshtml` ที่มี sidebar (เมนูกรองตามสิทธิ์), top bar, toast และ prototype banner ที่มี **ปุ่มสลับ role**
  - ชั้นสิทธิ์ที่ใช้ต่อได้ถึงของจริง: permission key, `ICurrentUser`, `MenuDefinition`, การตรวจสิทธิ์ที่ endpoint และผู้ใช้จำลองใน `PrototypeData/users.json` กับ `roles.json` ที่สร้างจากเอกสาร discuss เรื่องสิทธิ์ที่อนุมัติแล้ว (ถ้ายังไม่มีจะได้ผู้ใช้ "ผู้ดูแลระบบ" คนเดียวที่เห็นทุกอย่าง)
  - component ชุดกลาง: DataTable, FilterPanel, FormField, PageHeader, StatusBadge, EmptyState, ConfirmDialog, Toast, SidebarMenu
  - หน้า `/_styleguide` ให้ลูกค้าอนุมัติหน้าตาครั้งเดียว แทนการอนุมัติทีละหน้าจอ
  - `docs/ui/design-system.md` และ `.claude/rules/ui.md` ที่บังคับให้ทุกหน้าจอใช้ kit
- **ภายหลัง:** `/mflow:theme update <สิ่งที่จะเปลี่ยน>` แก้ kit ครั้งเดียวแล้วทุกหน้าจอเปลี่ยนตาม และ `/mflow:theme update access` สร้างหรือปรับชั้นสิทธิ์และผู้ใช้จำลองหลังอนุมัติเอกสาร discuss เรื่องสิทธิ์ (โปรเจกต์ที่ทำ theme ไว้ก่อน 0.5 ต้องรันคำสั่งนี้ก่อนสร้างหน้าจอถัดไป)

### ขั้น 3: `/mflow:screen inventory [@เอกสาร]`

- **ใช้เมื่อ:** เริ่ม release หลังจากมี story map ใน `docs/vision.md` แล้ว
- **ได้อะไร:** `docs/ui/screens.md` ที่มีหน้าจอละหนึ่งแถว (route, role, สิ่งที่แสดง, action, การคำนวณ) และจุดที่มีการคำนวณจะถูกเพิ่มเป็นแถวใน `docs/hotspots/INDEX.md`
- **สิ่งที่พี่ปูต้องทำ:** ตรวจตาราง หลังจากนั้น Claude จึงสร้าง Backlog task หน้าจอละหนึ่งตัว (label `prototype`)
- **รายงานจะบอกด้วย** ว่ากลุ่มข้อมูลไหนที่หน้าจอใช้แต่ยังไม่มีเอกสาร data model ที่อนุมัติ เรียงจากกลุ่มที่หลายหน้าจอใช้ร่วมกันก่อน ให้เลือกทำขั้น 3.5

### ขั้น 3.5: ออกแบบข้อมูลด้วย `/mflow:discuss <กลุ่มข้อมูล> data model`

- **ใช้เมื่อ:** หลัง `/mflow:screen inventory` เมื่อรู้แล้วว่าหน้าจอไหนใช้ข้อมูลกลุ่มไหน และก่อนสร้างหน้าจอแรกของกลุ่มข้อมูลที่หลายหน้าจอใช้ร่วมกัน ขั้นนี้ไม่บังคับ หน้าจอ prototype สร้างได้โดยไม่มีเอกสารนี้ แต่ inventory จะบอกว่ากลุ่มข้อมูลไหนยังไม่ได้ออกแบบ
- **พิมพ์:**
  - `/mflow:discuss งานขนส่ง data model @docs/source/2026-09-tor-v1.pdf` = ร่างเอกสาร เช่น `docs/discuss/02-job-data.md`
  - ต่อจากนั้นใช้เหมือนเอกสาร discuss ทั่วไป: ตอบในไฟล์, `consult` ให้ AI หลายตัวช่วยดู, `approve`
- **หนึ่งเอกสารต่อหนึ่งกลุ่มข้อมูล (aggregate):** ตารางหลักกับตารางลูกของมัน เช่น `Jobs` กับ `JobStops` แถวใน data dictionary ไม่นับในเพดาน ~200 บรรทัด เพราะต้องแสดงทุก column
- **ในเอกสารมี:**
  - รายการตาราง (หนึ่งแถวคืออะไร, ความสัมพันธ์, จำนวนแถวต่อเดือน), ER diagram และ state diagram ของสถานะ (ถ้ามี)
  - data dictionary ทีละตาราง: column, ชื่อไทย, type ของ .NET และ type ของฐานข้อมูล (ตามที่ระบุใน AGENTS.md ถ้ายังไม่ได้เลือกฐานข้อมูล จะกลายเป็นข้อตัดสินใจ), required, key/default, ตัวอย่าง และป้ายที่มา
  - หน้าจอไหนกรอง เรียง หรือค้นหาด้วย column ไหน และต้องมี index อะไร
  - column มาตรฐาน: column สำหรับ data scope จากเอกสารเรื่องสิทธิ์ (`BranchId`, `CreatedBy`), audit column และ concurrency token
  - ข้อตัดสินใจ: key แบบ Guid หรือ int, ลบจริงหรือ soft delete, enum ในโค้ดหรือตาราง lookup, ตารางลูกหรือเก็บเป็น JSON, เก็บค่า ณ วันที่ออกเอกสาร (snapshot) หรืออ้างอิง master
  - คำถามถึงลูกค้า: รูปแบบเลขเอกสาร, ต้องเก็บประวัติการแก้ไขไหม, ข้อมูลต่อเดือนประมาณเท่าไร, ต้องเก็บกี่ปี
- **ตัวอย่าง (ย่อ):**

  | Column | ชื่อไทย | .NET type | DB type | Required | Key / default | ตัวอย่าง | ที่มา |
  |---|---|---|---|---|---|---|---|
  | Id | รหัสภายใน | Guid | uniqueidentifier | ใช่ | PK | … | [เสนอ] |
  | JobNo | เลขงาน | string | nvarchar(20) | ใช่ | unique | `JOB-2569-00012` | [ที่มา: tor-v1 §3.2] |
  | CustomerId | ลูกค้า | Guid | uniqueidentifier | ใช่ | FK → Customers | … | [ที่มา: tor-v1 §3.1] |
  | BranchId | สาขา | Guid | uniqueidentifier | ใช่ | FK → Branches | … | [ที่มา: 01-access-control] |
  | TotalAmount | ค่าขนส่งรวม | decimal | decimal(18,2) | ใช่ | 0 | 12,500.00 | [อนุมาน] |

- **หลังอนุมัติ ข้อมูลของแต่ละ column อยู่ที่ไหน (มีที่เดียวเสมอ):**

  | ช่วง | ความจริงของ column อยู่ที่ | เอกสาร discuss |
  |---|---|---|
  | ก่อนอนุมัติ | เอกสาร discuss (draft) | กำลังคุย |
  | อนุมัติแล้ว ช่วง prototype | `PrototypeData/README.md` เป็น data dictionary ที่ยังแก้ได้ เขียนทันทีตอนอนุมัติแม้ยังไม่มีหน้าจอของกลุ่มนี้ แล้ว JSON ของ prototype ใช้ field ตามนี้ | เป็นบันทึกเหตุผล (freeze) |
  | สร้างของจริงแล้ว (archive change แล้ว) | EF Core entity และ migration ส่วนของกลุ่มนี้ใน README จะเหลือบรรทัดเดียวที่ชี้ไปที่โค้ด | บันทึกเหตุผล |

- **เปลี่ยนภายหลัง:**
  - **ระดับ field** (เพิ่ม ลบ หรือเปลี่ยนชื่อ column, ความยาว, required) เช่นลูกค้าขอเพิ่มช่องตอนรีวิว ให้แก้ใน README ผ่านกฎ schema-change ของ `/mflow:screen` ไม่ต้องเปิดเอกสาร discuss ใหม่
  - **ระดับโครงสร้าง** (กลุ่มข้อมูลใหม่, เปลี่ยน key หรือความสัมพันธ์, กลับการตัดสินใจเรื่องวิธีจัดเก็บ) ให้เปิดเอกสาร discuss ใหม่ ถ้าสร้างแล้วให้ใช้ `/mflow:change-request`
- **กับ prototype:** JSON ใช้ชื่อ field เดียวกับ property ในอนาคต (camelCase) และเก็บตารางลูกซ้อนไว้ในข้อมูลหลักเสมอ (จุดรับส่งอยู่ในงาน) แม้เอกสารจะเลือกเก็บเป็นตารางแยก เพราะ README บอกตารางลูกและ FK ไว้แล้ว ตอนสลับเป็น EF Core จึงไม่ต้อง map ใหม่
- **ตอนสร้างจริง:** `/opsx:propose` จะอ้างเอกสาร data model กับ README ให้เอง (ตั้งไว้ใน `openspec/config.yaml`) และ `/mflow:review` ตรวจว่า entity, column, type, precision และ nullable ตรงกับ dictionary และมี index ตามที่เอกสารระบุ
- **Data dictionary สำหรับส่งลูกค้า:** สร้างจากโค้ดจริงภายหลัง เช่น ใช้ skill `fspec-export` ถ้าติดตั้งไว้ (ไม่ใช่ส่วนหนึ่งของ mflow) อย่าเขียนด้วยมือแยกไว้อีกชุด เพราะจะไม่ตรงกับโค้ดภายในไม่กี่สัปดาห์
- **ต่อไป:** `/mflow:screen <ชื่อหน้าจอ> …`

### ขั้น 4: `/mflow:screen <ชื่อหน้าจอ> <สิ่งที่ต้องการ>` แล้ว `/mflow:review-notes`

**สร้างหรือปรับหน้าจอ**
- ตัวอย่าง:
  - `/mflow:screen job-list รายการงานขนส่ง`
  - `/mflow:screen job-list เพิ่มช่องค้นหาเลขงานและชื่อลูกค้า`
- หน้าจอสร้างใน stack จริง ใช้ข้อมูลจาก `PrototypeData/*.json` ที่ใช้ร่วมกันทุกหน้าจอ และตัวเลขที่ต้องคำนวณจะใส่เป็นค่าคงที่พร้อมคอมเมนต์ `// PROTOTYPE:`
- ถ้าต้องเพิ่ม field หรือ entity ในไฟล์ JSON Claude จะหยุดถามก่อน เพราะหน้าจออื่นใช้ไฟล์เดียวกัน
- entity ใหม่ใช้ field ตามเอกสาร data model ที่อนุมัติแล้ว (ถ้ามี) และ `PrototypeData/README.md` คือ data dictionary ของ prototype
- ทุกหน้าจอมี permission ของตัวเอง ข้อมูลถูกกรองตาม data scope ของผู้ใช้ และ field ที่ห้ามเห็นถูกซ่อน Claude ตรวจโดยสลับเป็นผู้ใช้ทุก role ที่เข้าได้ และหนึ่ง role ที่เข้าไม่ได้ (ต้องไม่เห็นเมนู และเปิด URL ตรงได้ 403) ถ้ายังไม่มีเอกสาร discuss เรื่องสิทธิ์ที่อนุมัติ หน้าจอจะถูกบันทึกว่า `access not confirmed` และ Claude จะแนะนำ `/mflow:discuss access-control`
- ถ้าอยากเปลี่ยนว่าใครเห็นอะไร และต่างจากเอกสาร discuss ที่อนุมัติแล้ว Claude จะไม่แก้ `roles.json` ตรงๆ แต่เสนอเอกสาร discuss ใหม่ หรือ change request ถ้าสร้างแล้ว
- ถ้าสิ่งที่ขอเกินกว่าที่ kit ทำได้ Claude จะเสนอ `/mflow:theme update` แทนการแต่งหน้าจอนั้นหน้าเดียว

**รีวิวกับลูกค้า แล้วบันทึกผล**
- ระหว่างรีวิว ใช้ปุ่มสลับ role บนแถบ PROTOTYPE ให้ลูกค้าดูระบบในมุมของแต่ละ role: เมนู ข้อมูลที่เห็น field ที่ถูกซ่อน และปุ่มที่กดได้
- `/mflow:review-notes @โน้ตหรือ transcript` (ถ้าเป็นไฟล์เสียง ต้องถอดเป็นข้อความก่อน)
- Claude จัดทุกบรรทัดเป็นตาราง: ปรับหน้าจอ, กฎที่ซ่อนอยู่, field, สิทธิ์, เอกสารที่ต้องพิมพ์, คำศัพท์, ลำดับความสำคัญ, นอกขอบเขต, คำถามค้าง และคำขอใหม่ → ตอบ yes แล้วจึงเขียน
- ได้ร่างอีเมลภาษาไทยที่ `docs/reviews/<วันที่>-<หัวข้อ>-summary.md` ไว้ส่งให้ลูกค้ายืนยัน โดยคำขอที่อยู่นอกขอบเขตจะเขียนว่า "จะประเมินและเสนอแยก" เสมอ
- เรื่องสิทธิ์ เมนู และการมองเห็นข้อมูล Claude เทียบกับเอกสาร discuss ที่อนุมัติแล้ว: ถ้าตรงกัน จะใส่ในหัวข้อ "สิทธิ์และข้อมูลที่แต่ละ role เห็น" ของอีเมลให้ลูกค้ายืนยัน ถ้าต่าง จะเปิดเอกสาร discuss ใหม่ (ลูกค้ากำลังแก้ความเข้าใจของพี่ปู ไม่ใช่ขอเพิ่มขอบเขต) หรือใช้ change request ถ้าสร้างแล้วหรือลูกค้าเคยยืนยันไปแล้ว
- วนขั้น 4 จนลูกค้าพอใจกับ flow ของหน้าจอ

### ขั้น 5: `/mflow:hotspot` และ `/mflow:golden`

ใช้กับกฎที่ตัดข้ามหลายหน้าจอหรือผิดแล้วเสียหายมาก เช่น การคิดราคา, state machine, สต็อก, การอนุมัติ งานในขั้นนี้ได้ผลเป็น **การตัดสินใจ ไม่ใช่โค้ด**

| พิมพ์ | ทำอะไร |
|---|---|
| `/mflow:hotspot` | ดูภาพรวม hotspot ทุกตัวและจำนวนตั๋วที่หยิบได้ |
| `/mflow:hotspot <ไอเดีย> [@เอกสาร]` | chart เรื่องใหม่: ตั้ง slug, สร้าง `map.md` และ `rules.md`, สร้างตั๋วคำถาม (`ask` / `examples` / `research` / `spike`) และร่างคำถามถึงลูกค้าเป็นภาษาไทย ใช้หนึ่ง session |
| `/mflow:hotspot <slug>` | หยิบตั๋วถัดไปใน frontier (ตั๋วที่หยิบได้) มาแก้ **หนึ่งตั๋ว** แล้วบันทึกผลลง `rules.md` |
| `/mflow:hotspot <slug> <TASK-ID>` | แก้ตั๋วที่ระบุ เช่น เมื่อได้คำตอบจากลูกค้ากลับมาแล้ว |
| `/mflow:golden @ไฟล์.xlsx <slug>` | ใช้ Excel ที่ลูกค้าคำนวณด้วยมือจริงเป็นเฉลย (golden data) ได้ไฟล์ JSON และ xUnit test ข้อมูลส่วนบุคคลจะถูกปิดบัง และแถวที่ผิดปกติจะถูกแยกออกไปเป็นตั๋วถาม |

- **ตั๋ว `ask`:** ส่ง `docs/hotspots/<slug>/questions-for-customer.md` ให้ลูกค้า Claude จะไม่ตอบแทนลูกค้า เมื่อได้คำตอบมาให้พิมพ์ `/mflow:hotspot <slug> <TASK-ID>`
- **ถ้าเรื่องจบได้ในคุยครั้งเดียว** Claude จะบอกว่าไม่ต้องทำเป็น hotspot และแนะนำ `/opsx:propose` แทน
- **Graduate:** เมื่อผ่าน readiness bar ครบ 6 ข้อ Claude จะแสดงหลักฐานของแต่ละข้อ → ตอบ yes → สร้าง OpenSpec change จาก `rules.md` → `rules.md` ถูก freeze นับจากนั้นความจริงอยู่ที่ `openspec/specs/`

### ขั้น 6: สร้างของจริงทีละ slice

1. `/opsx:propose <ชื่อ change>` เขียน proposal, spec และ tasks (ถ้ายังคิดไม่ชัด ใช้ `/opsx:explore` ก่อน) change ที่เพิ่มหรือแก้ตารางจะอ้างเอกสาร data model และ `PrototypeData/README.md` และมี task สุดท้ายที่เปลี่ยนส่วนนั้นของ README เป็นบรรทัดชี้ไปที่ entity
2. `/opsx:apply` ให้ Claude ทำ หรือ `/mflow:delegate <ชื่อ change> --mode code --to codex` ให้ tool อื่นทำใน worktree แยก
3. `/mflow:review [branch | --uncommitted | ชื่อ change | TASK-ID]` ตรวจกับ spec แล้วรัน test จริง และตรวจว่า entity ตรงกับ data dictionary ได้คำตัดสิน `approve` หรือ `changes-requested` ที่ `docs/reviews/code/` **merge เมื่อได้ `approve` และพี่ปูตกลงแล้วเท่านั้น**
4. `/opsx:archive` แล้วเช็ก `git diff --stat openspec/specs` ว่า spec หลักเปลี่ยนจริง
5. กลับไปขั้น 4 สำหรับ slice ถัดไป

### เมื่อมีเหตุการณ์

**ลูกค้าขอเปลี่ยนหลังอนุมัติแล้ว: `/mflow:change-request <ข้อความคำขอ | @อีเมล>`**
- Claude เทียบกับ spec ที่ archive แล้ว, หน้าจอที่อนุมัติแล้ว, vision, เอกสาร active และสรุปรีวิว แล้วจัดประเภทพร้อมอ้างหลักฐาน:
  - **defect:** แก้ให้ ไม่คิดเงิน
  - **clarification:** รายละเอียดที่ยังเปิดอยู่ในขอบเขตเดิม
  - **new scope:** งานใหม่ ได้ไฟล์ `docs/change-requests/CR-<nnn>-<slug>.md` พร้อมประมาณการเป็นช่วงชั่วโมงและผลต่อวันส่งมอบ
- ได้ร่างคำตอบภาษาไทยพร้อมทางเลือก (ทำเลย / เฟสถัดไป / ทำเล็กลง) **ไม่เริ่มงานจนกว่าลูกค้าอนุมัติเป็นลายลักษณ์อักษร**

**ให้ AI ตัวอื่นช่วย: `/mflow:delegate` แล้ว `/mflow:assess`**
1. `/mflow:delegate <TASK-ID | ชื่อ change | slug | "หัวข้อ"> --mode analyze|review|code [--to codex|gemini|opencode|chat]`
   - ได้ brief ที่ `.mflow/briefs/` และบรรทัดคำสั่งทั้ง PowerShell และ Bash
   - ไม่ใส่ `--to` = brief ที่ใช้กับ tool ไหนก็ได้ พร้อมคำสั่งของทุก tool
   - `--to chat` (ChatGPT/Gemini web) = ได้ context pack ไว้แนบ ไฟล์ที่อาจมีรหัสผ่านจะถูกข้ามและแสดงไว้ในรายการ `skipped`
2. **พี่ปูรันคำสั่งเอง** ผลจะถูกบันทึกลง `docs/ai-inbox/`
3. `/mflow:assess @docs/ai-inbox/<ไฟล์>` ตรวจว่า tool นั้นเข้าใจระบบและอ่านไฟล์ที่ต้องอ่านครบหรือไม่ แล้วตรวจ finding ทีละข้อกับโค้ดจริง คำตัดสินมี accept, accept-later, reject, needs-decision และ already-done → ตอบ yes แล้วจึงสร้าง task
4. ถ้าเป็นโหมด `code` ให้ `/mflow:review agent/<tool>/<id>` ด้วยก่อน merge

## 5. จังหวะประจำวัน

| เวลา | เกิดอะไรขึ้น | พี่ปูทำอะไร |
|---|---|---|
| เปิด session | hook ใส่ briefing ให้ Claude อัตโนมัติ: ส่วน Now ของ STATUS.md, log ล่าสุด, change ที่ค้าง, task ที่ In Progress, hotspot ที่ยัง active, เอกสารที่ยังไม่ได้ประมวลผล, รายงานของ AI อื่นที่ยังไม่ได้ assess และเอกสาร discuss ที่รอพี่ปูอ่าน | สั่งงานต่อจาก Now ได้เลย ไม่ต้องอธิบายซ้ำ |
| ระหว่างทำงาน | หลัง 10 นาทีแรก ถ้ามีไฟล์เปลี่ยนแต่ STATUS.md ยังไม่ถูกอัปเดต Claude จะเขียนบันทึกสั้นก่อนหยุด เตือนซ้ำไม่เกินทุก 30 นาที และหลัง compact ก็ยังจำงานก่อนหน้าได้ | ไม่ต้องทำอะไร ปรับเวลาได้ใน `.mflow/config.json` (`stopGuard`) |
| จบวัน | | `/mflow:handoff` เขียน STATUS.md แบบละเอียดจากข้อเท็จจริง (git, openspec, backlog และผล test) ให้คนที่ไม่เห็นแชตวันนี้ทำต่อได้ |
| ก่อนสลับไปใช้ tool อื่น | | `/mflow:handoff --for codex` ได้ brief ของงานถัดไปด้วย |

Codex และ tool อื่นไม่มี hook ให้ทำตามส่วน "Session ritual" ใน `AGENTS.md` คืออ่าน STATUS.md ตอนเริ่ม และเขียน log ตอนจบ

## 6. ตัวอย่างครบหนึ่งรอบ: ระบบจัดการงานขนส่ง

```text
# สัปดาห์ที่ 1: ตั้งต้น
git init
/mflow:init TransportHub
  (วาง TOR ลูกค้าไว้ที่ docs/source/2026-09-tor-v1.pdf)
/mflow:capture
/mflow:discuss สิทธิ์ เมนู และข้อมูลที่แต่ละ role เห็น
  → ได้ docs/discuss/01-access-control.md (พี่ปูอ่าน แล้วเขียนตอบในไฟล์)
/mflow:discuss 01 consult
  (พี่ปูรันคำสั่งของ codex และ opencode ที่ได้)
/mflow:discuss 01
/mflow:discuss 01 approve
/mflow:theme @docs/source/ci-guide.pdf
/mflow:screen inventory
  → รายงานบอกว่ากลุ่มข้อมูล "งานขนส่ง" ใช้ใน 4 หน้าจอ แต่ยังไม่มีเอกสาร data model
/mflow:discuss งานขนส่ง data model
  → ได้ docs/discuss/02-job-data.md (Jobs, JobStops, data dictionary, index, ข้อตัดสินใจ)
/mflow:discuss 02 consult
/mflow:discuss 02
/mflow:discuss 02 approve
  → PrototypeData/README.md กลายเป็น data dictionary ของ prototype

# สัปดาห์ที่ 2: prototype
/mflow:screen job-list รายการงานขนส่ง ค้นหาด้วยเลขงานและชื่อลูกค้า
/mflow:screen job-detail หน้ารายละเอียดงาน มีจุดรับและจุดส่งหลายจุด
  (ประชุมรีวิวกับลูกค้า จดโน้ตไว้)
/mflow:review-notes @notes/2026-10-02-review.md
  → ลูกค้าบอกว่า "ค่าขนส่งคิดตามระยะทาง น้ำหนัก และ VIP ได้ส่วนลด"

# สัปดาห์ที่ 3: จับกฎค่าขนส่ง (หนึ่งตั๋วต่อ session)
/mflow:hotspot ค่าขนส่งคิดตามระยะทาง น้ำหนัก และลูกค้า VIP @docs/source/2026-09-tor-v1.pdf
  → slug: freight-rate, ได้ตั๋ว TASK-7 ถึง TASK-12
/mflow:hotspot freight-rate
/mflow:hotspot freight-rate
  (ส่ง questions-for-customer.md ให้ลูกค้า ได้คำตอบกลับมา)
/mflow:hotspot freight-rate TASK-9
/mflow:golden @docs/source/ค่าขนส่ง-2026-08.xlsx freight-rate
/mflow:hotspot freight-rate          → ผ่าน readiness bar → graduate

# สัปดาห์ที่ 4: สร้างของจริง
/opsx:propose freight-rate-calculation
/mflow:delegate freight-rate-calculation --mode code --to codex
  (พี่ปูรันคำสั่ง PowerShell ที่ได้)
/mflow:assess @docs/ai-inbox/2026-10-20-codex-freight-rate-calculation.md
/mflow:review agent/codex/freight-rate-calculation
  (approve → merge)
/opsx:archive
git diff --stat openspec/specs

# เมื่อลูกค้าขอเพิ่ม
/mflow:change-request @docs/source/2026-11-email-fuel-surcharge.pdf

# ทุกเย็น
/mflow:handoff
```

## 7. ตารางลัด: สถานการณ์ → คำสั่ง

| สถานการณ์ | คำสั่ง |
|---|---|
| repo ใหม่ หรือเพิ่งอัปเกรด plugin | `/mflow:init` |
| ลูกค้าส่งเอกสารหรือฉบับใหม่ | `/mflow:capture [@ไฟล์] [--replaces @เก่า]` |
| อยากเช็กว่า Claude เข้าใจเรื่องหนึ่งตรงกับที่คิด (สิทธิ์, เมนู, ข้อมูลเฉพาะ role …) | `/mflow:discuss <หัวข้อ> [@ไฟล์]` |
| เขียนตอบในเอกสาร discuss แล้ว หรืออยากให้แก้ | `/mflow:discuss <NN> [สิ่งที่อยากแก้]` |
| อยากให้ AI หลายตัวช่วยคิดหัวข้อ discuss แล้วเลือกเอง | `/mflow:discuss <NN> consult` → รันคำสั่ง → `/mflow:discuss <NN>` |
| ออกแบบตาราง column และ data dictionary ของกลุ่มข้อมูลหนึ่ง | `/mflow:discuss <กลุ่มข้อมูล> data model [@ไฟล์]` |
| เอกสาร discuss ตรงกับที่คิดแล้ว | `/mflow:discuss <NN> approve` |
| ยังไม่เคยสร้างหน้าจอเลย | `/mflow:theme` |
| จะเปลี่ยนสี ฟอนต์ หรือ component กลาง | `/mflow:theme update <อะไร>` |
| ทำรายการหน้าจอของ release | `/mflow:screen inventory` |
| สร้างหรือปรับหน้าจอ | `/mflow:screen <ชื่อ> <สิ่งที่ต้องการ>` |
| เพิ่งประชุมรีวิวกับลูกค้า | `/mflow:review-notes @โน้ต` |
| กฎตัดข้ามหน้าจอ หรือผิดแล้วแพง | `/mflow:hotspot <ไอเดีย> [@ไฟล์]` |
| ทำ hotspot ต่อ | `/mflow:hotspot <slug>` |
| ลูกค้าตอบคำถามของตั๋วแล้ว | `/mflow:hotspot <slug> <TASK-ID>` |
| มี Excel จริงที่ใช้พิสูจน์กฎได้ | `/mflow:golden @ไฟล์.xlsx <slug>` |
| งานเล็กที่ชัดแล้ว | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` |
| ลูกค้าขอเปลี่ยนหลังอนุมัติ | `/mflow:change-request <คำขอ>` |
| ให้ AI ตัวอื่นวิเคราะห์ รีวิว หรือเขียนโค้ด | `/mflow:delegate <id> --mode … [--to …]` |
| ผลจาก AI ตัวอื่นกลับมาแล้ว | `/mflow:assess @docs/ai-inbox/<ไฟล์>` |
| ตรวจโค้ดก่อน merge | `/mflow:review <branch>` |
| จบวัน หรือจะสลับ tool | `/mflow:handoff [--for <tool>]` |
| ไม่แน่ใจ | `/mflow:help <เล่าสถานการณ์>` |

## 8. ข้อควรระวังที่ทราบแล้ว (0.9.1)

| เรื่อง | ทำอย่างไรตอนนี้ |
|---|---|
| `init` เสนอ `openspec init --language th` ซึ่งจะได้ข้อความ "written in th" ตามตัวอักษร | ถ้าต้องการ spec ภาษาไทย ให้บอก Claude ใช้ `--language "Thai"` แทน |
| `backlog init` ในโฟลเดอร์ที่ยังไม่เป็น git repo จะถามคำถาม | รัน `git init` ก่อน `/mflow:init` |
| `backlog decision create` รับได้แค่ชื่อ | บันทึกเหตุผลของ decision ไว้ในไฟล์ decision เอง หรือใน `rules.md` ของ hotspot |
| ยังไม่มี `.mflow/.gitignore` | เพิ่มเอง: `cache/`, `suggested/`, `briefs/*.pack.md` |
| `/mflow:review <branch>` เทียบกับ `main` | repo ที่ใช้ `master` หรือ `develop` ให้บอกชื่อ branch หลักตอนสั่ง |
| golden JSON ต้องถูก copy ไปโฟลเดอร์ output ของ test | ตั้ง `CopyToOutputDirectory` ใน test project |
| คำสั่ง gemini และ opencode ยังไม่ได้รันกับโมเดลจริง | เช็ก `--help` ก่อนใช้ครั้งแรก |
| skill ทั้ง 14 ตัวยังไม่เคยรันใน session จริง | ใช้ครั้งแรกแบบนั่งดูทีละขั้น |
| หลัง `resume` Stop hook นับเป็น session ใหม่ | งานจาก session ก่อนที่ยังไม่ได้ลง log ให้สั่ง `/mflow:handoff` เอง |
| wireframe ตัวอักษรที่มีภาษาไทย ขอบขวาไม่ตรงกัน เพราะสระบน/ล่างและวรรณยุกต์ไม่กินช่องในฟอนต์ความกว้างคงที่ | Claude จะวาดกล่องแบบเปิดด้านขวา หรือวางข้อความไทยไว้ท้ายบรรทัด ถ้ามีหน้าจอจริงแล้วจะใช้ภาพหน้าจอแทน |
| mindmap, timeline และ journey ของ Mermaid เป็นชนิดใหม่ บาง preview ยังแสดงไม่ได้ | Claude ใช้ flowchart, sequence, state และ ER เป็นหลัก การเตือน label ที่จะพังตรวจเฉพาะ flowchart |
| ตั้งแต่ 0.8 คำสั่ง `/mflow:source` เปลี่ยนชื่อเป็น `/mflow:capture` แต่โฟลเดอร์ `docs/source/`, `source-index.mjs` และ `sourceDir` ยังชื่อเดิม | โปรเจกต์ที่ init ก่อน 0.8 ยังมี `/mflow:source` เขียนอยู่ใน `AGENTS.md` (ตาราง Where things live) และ `docs/source/README.md` ให้แก้สองจุดนี้เป็น `/mflow:capture` เอง หรือรัน `/mflow:init` ซ้ำเพื่อ merge template ใหม่ |
| โปรเจกต์ที่ `init` ก่อน 0.7 ไม่มีบรรทัดเรื่องเอกสาร discuss และ data dictionary ใน `openspec/config.yaml` | เพิ่มเองตามตัวอย่างด้านล่าง |
| คำสั่งแปลงเอกสารลูกค้าเป็นข้อความก่อน `consult` ต้องมี pandoc หรือ python (python-docx, openpyxl, pypdf) | ติดตั้งตามหัวข้อ 3 ถ้าแปลงไม่ได้ brief จะบอก AI ตัวอื่นว่าไฟล์นั้นอ่านไม่ได้ |

โปรเจกต์ที่ init ก่อน 0.7: เพิ่มบรรทัดเหล่านี้ต่อท้ายใต้ key เดียวกันใน `openspec/config.yaml` โดยไม่ต้องลบบรรทัดเดิม:

```yaml
context: |
  Designs agreed before building (roles, data models, ...) are in docs/discuss/NN-*.md with status approved.
  The current data dictionary is PrototypeData/README.md until a change builds the entity.
rules:
  proposal:
    - If the change adds or alters tables, link the approved data-model doc in docs/discuss/ and follow PrototypeData/README.md; state any difference.
  tasks:
    - A change that builds an aggregate ends by replacing its section in PrototypeData/README.md with a pointer to the entity and migration.
```

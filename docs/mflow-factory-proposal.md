# ข้อเสนอ: mflow Software Factory

สถานะ: พักไว้ รอผู้ใช้อ่านรายละเอียดก่อน อาจมีการปรับเปลี่ยน ยังไม่สร้างจนกว่าผู้ใช้จะสั่ง ยังไม่มีการแก้ plugin (2026-11-09)
ที่มา: คำขอของผู้ใช้ 2026-11-09 ให้แสดงงานเป็นกล่องแบบกระดาน มี agent ประจำกล่องมากวาดงานเอง

## 1. เป้าหมาย

- ใบงานเดินเป็นกล่อง: Requirement → Discuss → จัดคิว → Build → QA → Review → E2E → Done (merge)
- หลัง Discuss อนุมัติ agent จัดลำดับงานให้เดินต่อเนื่องหรือทำพร้อมกันได้
- ทุกกล่อง ถ้าติดหรือต้องตัดสินใจ ส่งมากล่อง Human
- ผู้ใช้กำหนด test case และ scenario เองได้ QA และ E2E ต้องตรวจและเพิ่มที่ยังไม่มี
- ให้ AI ตัวอื่นเช่น Codex มาทำบางกล่องได้ เช่น Claude build แล้ว Codex ทำ test

## 2. หลักการออกแบบ

1. **กระดานคือมุมมองของไฟล์** สถานะส่วนใหญ่มีอยู่แล้วในไฟล์ของ mflow ไม่สร้างฐานข้อมูลใหม่
2. **ต่อยอด `/mflow:apply-all`** เพิ่มคำสั่งเดียว `/mflow:factory` คำสั่งเดิมไม่เปลี่ยน
3. **Foreman คือ session ของ Claude Code** Claude Code ไม่มี background process ที่รันค้างเอง Foreman วนกวาดกระดาน ส่ง subagent หรือ Codex ไปทำแต่ละกล่อง และหยุดเมื่อไม่มีงานเดินได้
4. **Gate อ่านจากไฟล์** การ merge ตัดสินจากหลักฐานในไฟล์ ไม่ใช่จากคำบอกของ agent
5. **คนตรวจไม่ใช่คนเขียน** QA และ Review แยกจาก Build เท่าที่ทำได้

## 3. กล่องกับของเดิม

| กล่อง | ใครทำ | อ่านสถานะจาก | สิ่งที่ต้องเพิ่ม |
|---|---|---|---|
| Requirement | ผู้ใช้ · `/mflow:capture` | `Backlog.md`, `AGENDA.md` | ไม่มี |
| Discuss | ผู้ใช้กับ AI · `/mflow:discuss` | `status:` ของเอกสาร | ไม่มี `approved` คือประตูเข้าโรงงาน |
| จัดคิว | planner agent | `.git/mflow/factory/plan.md` | ลำดับมีใน apply-all §1 แล้ว เพิ่มการแยกว่าทำพร้อมกันได้ |
| Build | `/opsx:propose`, `/opsx:apply` | `openspec/changes/<name>/` | worktree ต่อใบเมื่อทำพร้อมกัน |
| QA | `/mflow:test since` | `docs/reviews/tests/` | อ่าน test case แล้วเขียน test ที่ขาด |
| Review | `/mflow:review` | `docs/reviews/pending.md` | ไม่มี |
| E2E | `/mflow:e2e` | ช่อง E2E screens ใน `pending.md` | ทำเฉพาะใบที่มีจอหรือมี case ระดับ e2e |
| Done | `apply-all.mjs gate`, `merge --no-ff` | `git log` ของ main | gate ต้องรู้จักไฟล์ที่ E2E เพิ่มหลัง review |
| Human | ผู้ใช้ | `.git/mflow/factory/human.md` | หยุดเฉพาะใบนั้นและใบที่ต้องรอมัน |

ไฟล์ runtime อยู่ใน `.git/mflow/factory/` เหมือน run file ของ apply-all จึงไม่ทำให้ tree สกปรก และ worktree ทุกตัวเห็นชุดเดียวกัน (ต้องอ่านผ่าน `git rev-parse --git-common-dir`)

## 4. กติกาการเดินงาน

**กวาดงาน** Foreman ไล่จากกล่องขวาไปซ้าย เพื่อให้งานใกล้เสร็จออกก่อน กล่องไหนมีที่ว่างก็หยิบใบที่พร้อม

| กล่อง | จำนวนพร้อมกัน |
|---|---|
| Build | 2 |
| QA, Review, E2E, Merge | 1 |

**ไม่ผ่าน** QA, Review หรือ E2E ส่งกลับ Build พร้อมข้อที่พบ สูงสุด 3 รอบ เกินนั้นส่ง Human

**ข้าม E2E** ใบที่ไม่มีจอใน E2E screens และไม่มี case ระดับ e2e ข้ามกล่องนี้ E2E จำกัด browser ตาม `e2eMaxWorkers` เดิม

## 5. การจัดลำดับ

Planner อ่าน `order` จาก `packs.mjs selected`, `sources:` ของเอกสาร, "ควรคุยก่อน" ใน AGENDA และสิ่งที่แต่ละใบจะแตะ (ตาราง route จอ ไฟล์ร่วม) แล้วส่งแผนให้ผู้ใช้ตอบครั้งเดียว

| กรณี | การเดินงาน |
|---|---|
| ใบหนึ่งใช้ตารางหรือ endpoint ของอีกใบ, pack `requires` | ทำต่อกัน ใบหลังรอใบแรก merge |
| มี migration ทั้งสองใบ | ทำต่อกัน เพราะ model snapshot ชนกัน |
| ไม่พึ่งกัน ไฟล์ไม่ทับ migration ไม่เกินหนึ่งใบ | Build พร้อมกันได้ ไม่เกิน 2 ใบ ใบละ worktree |
| QA, E2E, Merge | ทีละใบเสมอ เพราะใช้ฐานข้อมูล port และ browser ร่วมกัน |
| main ขยับระหว่างทำ | merge main เข้า branch แล้ว test อีกรอบก่อน merge |

Worktree อยู่ที่ `.mflow/wt/<n>` ในโปรเจกต์ (เพิ่มใน `.gitignore`) ชื่อสั้นเพราะเครื่องจำกัด path 260 ตัวอักษร

## 6. กล่อง Human

| ประเภท | ตัวอย่าง |
|---|---|
| ต้องเลือก | spec ไม่ได้บอกสิทธิ์หรือกฎธุรกิจ agent ห้ามเดา |
| เครื่องมือติด | Docker ไม่ทำงาน, stack ไม่ขึ้น, ไม่มีสิทธิ์ |
| แก้ไม่ผ่านครบรอบ | ครบ 3 รอบแล้วยังไม่ผ่าน พร้อมรายงาน |
| ยืนยันแผน | แผนคิว, merge conflict ที่ agent ไม่ควรตัดสินเอง |

ทุกเรื่องมีเลขข้อ ตัวเลือก a) b) c) และคำแนะนำ ตอบรวมครั้งเดียวได้ เช่น `1 a, 2 b` ตอบแล้วใบกลับกล่องเดิม
ต่างจาก apply-all ที่ใบแรกที่ติดหยุดทั้งรอบ ที่นี่หยุดเฉพาะใบนั้นและใบที่พึ่งมัน

## 7. Test case ของผู้ใช้

ไฟล์ `docs/test-cases/<change>.md` ใช้รูปแบบ `## Cases` ของ mtest (`Case, Path, Kind, Expect, Level, Test`) เพิ่มคอลัมน์ `From` ค่าเป็น `user`, `spec` หรือ `agent`
mflow ยังไม่มี `flows.mjs` ต้องมีตัวตรวจของตัวเอง เพราะโปรเจกต์ที่ใช้ mflow อาจไม่ได้ติดตั้ง mtest

- ผู้ใช้เพิ่มได้ตั้งแต่ Discuss หรือบนการ์ดเมื่อไรก็ได้ก่อน merge
- Scenario ใน spec นับเป็น case `spec` ให้เอง
- QA ตรวจระดับ unit และ integration, E2E ตรวจระดับ e2e ถ้ายังไม่มี test ให้เขียนแล้วรัน
- case `user` ที่ไม่มี test E2E นับเป็นช่องโหว่ ต่างจากกติกา mtest ที่รอคำสั่ง
- agent ลบหรือแก้ผลที่คาดของ case `user` ไม่ได้ ถ้าทำตามไม่ได้ส่ง Human
- Merge ไม่ผ่านถ้า case `user` ยังไม่มี test ที่ผ่าน
- เพิ่ม case หลังผ่านกล่องที่ต้องตรวจไปแล้ว ใบย้อนกลับกล่องนั้น

## 8. ให้ Codex มาช่วย

```json
"factory": {
  "route": { "build": "claude", "qa": "codex", "review": "claude", "e2e": "claude" },
  "slots": { "build": 2, "qa": 1, "review": 1, "e2e": 1 },
  "rounds": 3
}
```

- ใช้ registry ใน `.mflow/config.json` และ `delegate-cmd.mjs` ที่มีอยู่
- Codex ทำใน worktree ของตัวเอง sandbox `workspace-write` อาจต่อเน็ตไม่ได้ เช่น NuGet restore
- Review ของ Codex บนโค้ดของตัวเองไม่นับเป็นเงื่อนไข merge (FR-220)
- E2E ต้องเป็น Claude เพราะ hook `e2e-guard` อยู่ใน Claude Code (FR-221)
- ผลนับจาก record `By: codex` ที่รันจริง
- brief ต้องอยู่นอก branch เพราะ gate 0.44.2 ไม่นับไฟล์ที่สั่ง AI เป็นเอกสาร

**คำตอบของผู้ใช้ 2026-11-09: a)** `/mflow:factory` รัน Codex เองได้ เมื่อ `route` ของโปรเจกต์ระบุไว้ คำสั่งอื่นยังเป็นไปตาม FR-101 เมื่อสร้างกล่องนี้ต้องแก้ FR-101 และ FR-180 ใน `docs/requirement.md` ให้ตรงกัน

**ข้อขัดแย้งที่ตัดสินแล้ว:** FR-101 บอกว่า mflow ไม่รัน AI tool อื่นเอง (ตั้งใจ) และ FR-180 ให้ผู้ใช้รันเครื่องมือภายนอกเอง

| ตัวเลือก | ผล |
|---|---|
| a) แก้ FR-101 ให้เฉพาะ `/mflow:factory` รัน Codex เองได้ เมื่อ `route` ในโปรเจกต์ระบุไว้ (แนะนำ) | กวาดงานได้จริงโดยไม่มีคนนั่งรันคำสั่ง คำสั่งอื่นยังเป็นไปตาม FR-101 |
| b) คง FR-101 ไว้ Foreman เขียน brief แล้วใบรอที่ Human จนผู้ใช้รัน `codex exec` เอง | ปลอดภัยตามเดิม แต่ทุกใบที่ route ไป Codex ต้องมีคนรัน |
| c) ยังไม่ใช้ Codex ใน factory รุ่นแรก | เริ่มเร็วสุด เรื่องนี้เลื่อนไปทำทีหลัง |

## 9. สิ่งที่ต้องปรับ

- **Gate** `apply-all.mjs:306` ไม่ให้ merge เมื่อมีโค้ดเพิ่มหลัง review และ record test ต้องไม่มีโค้ดตามหลัง ไฟล์ที่ E2E เพิ่มจึงต้องมี `test since` กับ `review --short` ปิดท้าย
- **ค่าใช้จ่าย** test และ review ต่อใบแพงกว่าการรวมทำบน main (`mflow-batch-checks`) ใบที่แตะ migration หรือ `Program.cs` เป็น whole suite ทุกครั้ง apply-all เลือกแบบต่อใบไว้แล้ว
- **E2E** เดิมรันเมื่อผู้ใช้สั่งเท่านั้น factory จึงเปิดกล่องนี้เฉพาะใบที่มีจอหรือมี case ระดับ e2e
- **Web** apply-all ไม่รันบน web (`CLAUDE_CODE_REMOTE`) factory รุ่นแรกจึงรันบนเครื่องเท่านั้น และไม่ push

## 10. ลำดับการสร้าง

0. รัน `/mflow:apply-all` จริงกับเอกสารเดียว เพราะยังไม่เคยรันในโปรเจกต์จริง
1. `/mflow:factory` เดินทีละใบ กระดานอ่านอย่างเดียว กล่อง Human หยุดเฉพาะใบที่ติด
2. Test case ต่อใบ QA เขียนที่ขาด gate ตรวจ case ของผู้ใช้
3. กล่อง E2E และการปรับ gate
4. ทำพร้อมกันด้วย worktree ไม่เกิน 2 ใบ
5. Codex ตามคำตอบข้อ 8

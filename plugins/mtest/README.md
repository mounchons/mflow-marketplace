# mtest

ทดสอบ, review และ E2E สำหรับ project ใหม่หรือ project ที่มีโค้ดอยู่แล้ว โดยไม่ต้องใช้เครื่องมือ spec ใดๆ:

- **flow ครบทุกทาง** — แต่ละ flow (step 1-2-3-4, ทางแยก, การเปลี่ยนสถานะ, กฎ, สิทธิ์ของแต่ละบทบาท) อยู่ในไฟล์เดียว
  พร้อม case ที่เดินผ่านมัน และ script ตรวจได้ว่า step/branch/transition/rule ทุกตัวมี case และทุก case มีเทสที่มีอยู่จริง
- **runner ที่ไม่ต้องใช้ AI** — รันเทสทีละส่วน (part) แบบ foreground อ่านผลจากไฟล์ผลลัพธ์ของเครื่องมือเอง
  (TRX, JUnit, Playwright/Vitest/Jest JSON) แล้วบันทึกผลผูกกับ commit
- **review ใช้ผลเทสซ้ำ** — ไม่รันเทสชุดเดิมสองรอบสำหรับ commit เดียวกัน; `since` รันเฉพาะที่การแก้ไขต้องการ
- **E2E เมื่อสั่งเท่านั้น** — ทีละหน้าหรือทีละ flow เปิด browser พร้อมกันไม่เกิน `e2eMaxWorkers` (ค่าเริ่มต้น 4)

ใช้ได้ทั้งบนเครื่อง (ติดตั้งจาก marketplace) และบน Claude Code on the web (init คัดลอก plugin ลง `.claude/skills/mtest/` ใน repo)

## ติดตั้ง

```
/plugin marketplace add mounchons/mflow-marketplace   # หรือ path ของโฟลเดอร์ในเครื่อง
/plugin install mtest@mflow-marketplace
```

จากนั้นเปิด session ใหม่ใน project แล้วสั่ง `/mtest:init`

## คำสั่ง (v0.2)

| คำสั่ง | ทำอะไร |
|---|---|
| `/mtest:init [ชื่อที่แสดง]` | สำรวจ repo → สร้าง `AGENTS.md` / `CLAUDE.md` ถ้ายังไม่มี (มีแล้วเสนอส่วน `## Testing (mtest)` ให้ merge ไม่เขียนทับ) → หาคำสั่งเทสเป็น part → รัน build + unit จริงเพื่อยืนยัน → (เลือกได้) คัดลอก plugin สำหรับ cloud |
| `/mtest:flow [list \| <flow> \| <flow> write \| check]` | หา flow ที่ควรมี, เขียน `mtest/flows/<flow>.md` (Steps, Branches, Transitions, Rules, Cases), จับคู่เทสที่มีอยู่, ตรวจความครบ, `write` เขียนเทส unit/integration ที่ขาด |
| `/mtest:test [since \| e2e \| <part> [filter] \| triage]` | รันเทสทั้งชุด (ไม่รวม E2E) ทีละ part แล้วบันทึกลง `mtest/runs/`; `since` รันเฉพาะที่ต้องรันหลัง commit ใหม่; `e2e` เมื่อสั่ง; `triage` วิเคราะห์เทสที่ fail |
| `/mtest:review [since \| <branch> \| <from>..<to> \| pr <n> \| --uncommitted] [--short]` | review diff เทียบกฎใน AGENTS.md, requirement/ADR, flow ที่โดน และผลเทสที่บันทึกไว้; `since` = ทุก commit ตั้งแต่ review ครั้งก่อน |
| `/mtest:e2e [<screen> \| flow <flow>]` | เขียนและรัน E2E ของหน้าเดียวหรือ flow เดียว จำกัด browser ตาม `e2eMaxWorkers` |
| `/mtest:help [check setup]` | สถานะ + คำสั่งถัดไป; `check setup` ตรวจการตั้งค่า |

รันจาก terminal ได้โดยไม่ต้องเปิด Claude: `node <runner>/run.mjs all` (ทั้งชุด) หรือ `--scope e2e` —
ได้บันทึกผลรูปแบบเดียวกัน `/mtest:help` จะบอก path เต็มที่ copy ไปวางได้ทันที (ถ้ามีสำเนาใน repo ใช้
`node .claude/skills/mtest/scripts/run.mjs all` ซึ่งไม่เปลี่ยนตาม version) ใช้เป็นจุดเริ่มสำหรับการตั้งเวลารัน
(เช่นกลางคืน) ในรอบถัดไป

## ไฟล์ที่ mtest เขียนใน project

```
AGENTS.md                  ส่วน ## Testing (mtest) (merge เข้าไฟล์เดิม ถ้ามี)
CLAUDE.md                  @AGENTS.md + คำสั่งของ mtest
mtest/
├── README.md
├── STATUS.md              ตอนนี้ถึงไหน, คำสั่งถัดไป
├── flows/<flow>.md        flow + case + เทสที่พิสูจน์
├── runs/<date>-<commit>.md   บันทึกผลเทสแต่ละรอบ (commit ได้)
└── reviews/<date>-<target>.md  รายงาน review
.mtest/
├── config.json            parts (คำสั่ง, โฟลเดอร์, ผลลัพธ์, prerequisite), e2eMaxWorkers, defaultBranch
├── templates.json         template ที่เคยเสนอ (เพื่อ rerun หลัง upgrade)
├── .gitignore             logs/, tmp/, suggested/, run-open.json
└── logs/                  log เต็มของแต่ละ part (ไม่ commit)
.claude/skills/mtest/      สำเนา plugin สำหรับ Claude Code on the web (เมื่อเลือก)
```

## ตัวอย่าง flow

```markdown
## Steps
| Step | Actor | Action | Expected | State after |
|---|---|---|---|---|
| 1 | Uploader | อัปโหลดใบกำกับภาษี | เก็บไฟล์, เข้าคิวอ่าน | Uploaded |
| 2 | AI | อ่านเอกสาร | ร่างรายการ + คำถามถ้าข้อมูลไม่พอ | Draft |
| 3 | Reviewer | ตรวจและแก้ร่าง | สมุดรายวันสมดุล | Ready |
| 4 | Approver | อนุมัติ | Post รายการบัญชี | Posted |

## Branches
| Branch | At | When | Then | Back to |
|---|---|---|---|---|
| B1 | 2 | ไม่ระบุวัตถุประสงค์ | สร้างคำถาม, อนุมัติไม่ได้ | 3 |

## Cases
| Case | Path | Kind | Expect | Level | Test |
|---|---|---|---|---|---|
| C01 | 1-2-3-4 | happy | Posted, งบทดลองสมดุล | integration | ReviewAndLedgerTests::AC19 |
| C02 | 1-2-B1-3-4 | alt | อนุมัติได้หลังตอบคำถาม | integration | AC02_question_blocks_approval |
| C03 | 1-2-3-4 | permission | Reviewer อนุมัติไม่ได้ (403), ไม่มี journal | integration | TODO |
```

`/mtest:flow check` จะรายงานว่า C03 ยังไม่มีเทส และถ้า Branch หรือ Step ไหนไม่มี case เดินผ่านก็จะรายงานด้วย

### flow ที่มีหลายฝ่าย (0.2)

เช่น ตั้งค่า survey → เชิญ supplier → supplier ตอบและแนบไฟล์ → กวาดข้อมูล → ส่งกลับ หรือเก็บเข้าคลัง →
เลือกไฟล์สร้าง doc → approve / reject / withdraw → supplier acknowledge

- case ชนิด `handoff`: ฝั่งที่รับ (supplier) เห็นสิ่งที่ฝั่งส่งตั้งไว้ครบและตรง (คำถาม, ไฟล์ที่ต้องแนบ, กำหนดส่ง,
  ส่วนที่ปิดไว้ก็ต้องไม่เห็น) และหลังทุกการตัดสินใจ ทุกฝ่ายเห็นสถานะ เหตุผล และปุ่มที่ทำได้ตอนนั้น
- case ชนิด `isolation` ใช้ **supplier คนที่สอง**: ไม่เห็นงานของ supplier คนแรกทั้งใน list, ค้นหา, ตัวเลขนับ,
  เปิดด้วยลิงก์ตรง, ลิงก์ดาวน์โหลดไฟล์, การแจ้งเตือน และ export
- `flows check` เตือนเมื่อ flow มีคนตั้งแต่ 2 ฝ่ายแต่ยังไม่มี case สองชนิดนี้ (`skip: isolation` ใน front matter
  สำหรับ flow ที่ไม่มีฝ่ายที่สอง)
- `/mtest:e2e flow <flow>` เขียนเทสที่สลับคนในเทสเดียว ใช้ browser context ต่อคน (ไม่เพิ่มจำนวน browser),
  เอาลิงก์เชิญจาก fake mailer ของระบบ, ตรวจไฟล์ที่ upload และ doc ที่สร้าง, รอขั้นเบื้องหลังด้วยสถานะ ไม่ใช้ sleep
- ค่าตั้งที่ตั้งเว็บหนึ่งแล้วไปแสดงอีกเว็บ (0.2.1) เช่น admin ตั้งค่าที่ admin web แล้ว supplier web ต้องแสดงตาม:
  case `handoff` หนึ่ง case ต่อหนึ่งสถานะ (ตั้งแล้วเห็นตรง ปิดหรือเปลี่ยนแล้วหายรวมถึงลิงก์ตรง), case ของผู้ที่ค่าตั้ง
  ไปถึงและคนที่ไม่ควรเห็น, และ case ของเวลาที่มีผลเมื่อไม่ใช่ทันที (cache, login ครั้งถัดไป) ใน E2E แต่ละคนเปิดบน
  เว็บของตัวเอง (`baseURL` และ login ของเว็บนั้น) ค่าตั้งที่ทั้งระบบใช้ร่วมกันรันแยกแบบ serial และคืนค่าเดิมแม้เทสล้ม

## บทเรียนจากการใช้งานจริง (มาจาก mflow)

| เคยเกิด | mtest ทำอย่างไร |
|---|---|
| Playwright ไม่จำกัด worker เปิด browser 10 ตัว ทำ laptop ค้างและรีสตาร์ท | cap `e2eMaxWorkers` ทั้งใน runner และ hook; ยอมรับ `workers:` ใน config ของ project ที่อยู่ใน cap |
| รันเทสทั้งชุดใน background / ขนาน จนหน่วยความจำหมด | ทีละ part, foreground, part ละประมาณ 8 นาที (`partMinutes`) |
| แบ่ง part ด้วย filter แล้ว class ใหม่หลุด ไม่เคยถูกรัน | นับจำนวนเทสทั้ง project เทียบผลรวมของทุก part |
| รันเทสชุดเต็มซ้ำตอน review ทั้งที่เพิ่งรันไป | บันทึกผลผูกกับ commit; review อ้างบันทึกนั้น; `since` สำหรับ commit ถัดไป |
| วน test → fix → review ทีละงานนานหลายชั่วโมง | รันและ review ทีเดียวเมื่อผู้ใช้สั่ง (`review since` ครอบทุก commit ที่ยังไม่ review) |
| เขียน E2E ตอนหน้ายังเปลี่ยน ต้องเขียนใหม่ทุกรอบ | E2E ทีละหน้า/ทีละ flow เมื่อสั่ง หลังหน้านิ่งแล้ว |
| DB ไม่ได้เปิด แต่ผลออกมาเป็น fail ปนกับ bug จริง | `requires` ต่อ part: ขาด prerequisite = skipped พร้อมเหตุผล, ผลรวม `incomplete` |

## ใช้กับ project ที่มี mflow

ไม่ได้ — mflow มีคำสั่ง test, review และ e2e ของตัวเองที่ทำงานเดียวกันแล้ว `/mtest:init` จะหยุดเมื่อพบ `.mflow/config.json`

## โครงสร้าง plugin

```
plugins/mtest/
├── .claude-plugin/plugin.json
├── hooks/hooks.json           SessionStart (briefing) + PreToolUse (cap Playwright)
├── scripts/
│   ├── lib.mjs                ค่าตั้ง, path, git, glob
│   ├── scaffold.mjs           คัดลอก templates โดยไม่เขียนทับ (เสนอผ่าน .mtest/suggested/)
│   ├── flows.mjs              อ่าน flow doc, ตรวจ coverage, หาเทสจากชื่อ
│   ├── run.mjs                runner: plan/start/part/finish/all/since/last
│   ├── reviews.mjs            รายงาน review, commit ที่ยังไม่ review
│   ├── vendor.mjs             สำเนา plugin ใน .claude/skills/mtest/
│   ├── e2e-guard.mjs          hook: ปฏิเสธ Playwright ที่เกิน cap
│   ├── session-start.mjs      hook: briefing ตอนเปิด session
│   └── doctor.mjs             ตรวจการตั้งค่า (read-only)
├── skills/{init,flow,test,review,e2e,help}/SKILL.md
└── templates/                 AGENTS.md, CLAUDE.md, mtest/, .mtest/.gitignore
```

ต้องการ Node 20+ (ไม่มี dependency), git; ทำงานบน Windows และ Linux

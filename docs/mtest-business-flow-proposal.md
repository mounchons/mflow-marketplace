# ข้อเสนอ: เติมช่องว่างของ mtest (และ mflow) สำหรับทดสอบ business workflow ข้ามทั้งระบบ

วันที่: 2026-11-07 · Revision: 0.1 · สถานะ: **พักไว้** · คุณตอบข้อ 1–4 เป็น `1 a, 2 a, 3 a, 4 a` แล้วบอกว่ายังไม่ต้องการเพิ่มความซับซ้อนให้คำสั่งเดิม ให้ทำ e2e ของ flow ต่อเนื่องแทน (mflow 0.38.3 / mtest 0.3.3: `skills/e2e/references/chain.md`) · ยังไม่ได้สร้างข้อใดจากเอกสารนี้

> ที่มา: แผน `docs/wannabe/multi_agent_business_workflow_e2e_skill_plan.md` (ระบบสอง portal Admin/Supplier, External API, PostgreSQL, สิทธิ์) เทียบกับสิ่งที่ mtest 0.3.2 และ mflow 0.38.2 ทำได้จริง
>
> วิธีตอบ: ตอบในแชตบรรทัดเดียวได้ เช่น `1 a, 2 a, 3 a, 4 a, 5 b, …` ข้อที่ไม่ตอบถือว่าเลือกข้อที่มี `(แนะนำ)`

## 1. สรุป

- **แกนของแผนมีอยู่แล้วใน mtest:** flow doc (Steps, Branches, Transitions, Rules, Cases) คือ workflow map + state transition + coverage ในไฟล์เดียว `flows.mjs check` บอกว่า step/branch/transition/rule ไหนยังไม่มี case และ case ไหนยังไม่มี test runner (`run.mjs`) รันซ้ำได้โดยไม่ใช้ LLM และบันทึกผลกับ commit ส่วน E2E ทำ flow ข้ามคนข้ามเว็บได้แล้ว (handoff, supplier B, ค่าตั้งข้ามเว็บ, พิสูจน์สามท่อน, ข้อมูลร่วมคืนค่าใน `finally`)
- **ช่องว่างที่สำคัญมี 4 ข้อ (เฟส 1):** reviewer ที่ไม่ใช่คนเขียน (P1), การตรวจข้าม layer UI/API/DB/report/audit ต่อ step (P2), การกระทบยอดรายงานและ export (P3), ป้าย `CONFLICT` / `NEEDS_ORACLE` เมื่อ requirement กับโค้ดไม่ตรงหรือไม่มีเฉลย (P4)
- **เฟส 2:** coverage matrix ที่สร้างจาก flow doc (P5), หลักฐานของ test ที่ล้ม (P6), contract ของ API ภายนอก (P7)
- **เฟส 3:** mutation check (P8), อ้างอิงโค้ดจาก flow doc (P9), แนวทาง widget DevExpress/Kendo (P10)
- **ไม่ทำตามแผนโดยตั้งใจ:** แยก agent 7 ตัว (ใช้คำสั่งที่มี + reviewer อิสระแทน, หัวข้อ 4), pipeline CI (ไม่ตั้ง CI จนกว่าคุณขอในโปรเจกต์นั้น, หัวข้อ 6), แยก artifact เป็นหลายไฟล์ (flow doc เป็นต้นฉบับเดียว ไฟล์อื่นสร้างจากมัน)
- **ลงที่ไหน:** ทุกข้อลง mtest ก่อน เพราะระบบในแผนไม่มี spec tool และ flow doc รับข้อมูลเหล่านี้ได้ mflow ได้เฉพาะข้อที่สะท้อนเป็นบรรทัดใน `rules.specs` หรือใน `/mflow:night` (P1, P3) mtest ห้ามอ้าง OpenSpec หรือคำสั่ง `/mflow:` (test `mtest-independence`) จึงใช้ `/mflow:delegate` เป็น reviewer อิสระของ mtest ไม่ได้

## 2. แผนเทียบกับที่มีอยู่

| ข้อในแผน | สถานะ | ที่มีอยู่ / ข้อเสนอ |
|---|---|---|
| §1 ค้นหา flow จากโค้ดและ requirement | มีแล้ว | `/mtest:flow` อ่าน requirement, state enum, service, background job, test และเมนู แล้วเสนอรายการ flow |
| §1, §4 Journey, ทางแยก, ส่งกลับ, reject, อนุมัติซ้ำ | มีแล้ว | `references/cases.md` ข้อ 1–4 (ทางแยกไปและกลับ, วนสองรอบ, ทุกทางออก, transition ที่ต้องถูกปฏิเสธ) |
| §1 ไม่ถือว่าโค้ดถูกเสมอ | บางส่วน | `(from code)` ในเซลล์ของ flow doc, test ที่ล้มเพราะหน้าจอผิด flow ยังยึด flow → P4 |
| §1 แยกวิเคราะห์ / เขียน / รัน / ทบทวน | บางส่วน | แยกเป็นคำสั่ง แต่ Claude ตัวเดียวทำทุกขั้น → P1 |
| §2 ข้อ 2, §4 Integration: API ภายนอก | บางส่วน | case `recovery`, `idempotency` → P7 |
| §2 ข้อ 3 ค่าตั้งใน Admin มีผลกับ Supplier | มีแล้ว | ค่าตั้งข้ามเว็บ (mtest 0.2.1–0.3) ทุกสถานะ ใครได้รับ มีผลเมื่อไร |
| §2 ข้อ 4 สูตรคำนวณกับ oracle อิสระ | มีแล้ว | Rule + table-driven unit test (mtest), `/mflow:golden` จาก Excel จริงของลูกค้า (mflow) |
| §2 ข้อ 5 ลำดับการอนุมัติ, audit | บางส่วน | transition ที่ถูกปฏิเสธ, "rows written and not written" → P2 (คอลัมน์ Audit) |
| §2 ข้อ 6 supplier B / ไม่ login ไม่เห็นทั้ง UI และ API | มีแล้ว | case `permission`, `isolation` |
| §2 ข้อ 8, §4 Output: รายงาน/export ยอดรวม rounding timezone | บางส่วน | ตรวจชื่อ ชนิด ขนาด ข้อความของไฟล์ → P3 |
| §2 ข้อ 9 UI = API = DB = report = audit | บางส่วน | พิสูจน์สามท่อน (UI/API) และ integration test → P2 |
| §2 ข้อ 10, §6 หลักฐาน, PII ใน trace | ยังไม่มี | ผลรันมีจำนวนและ failure บรรทัดแรก → P6 |
| §4 coverage-matrix.csv | บางส่วน | ตาราง Cases + `flows.mjs check` → P5 |
| §5 CONFLICT / NEEDS_ORACLE, traceability | บางส่วน | requirement → case → test → ผลรันที่ commit → P4, P9 |
| §6 การแยกข้อมูล, seed, cleanup, ไม่ใช้ sleep | มีแล้ว | run stamp, `finally`, project ที่เขียนข้อมูล `workers: 1`, รอสถานะ |
| §7 test impact analysis | มีแล้ว | `run.mjs since` รัน test ที่ครอบไฟล์ที่เปลี่ยน |
| §7 nightly | มีแล้ว (ไม่ใช่ CI) | `/mtest:night`, `/mflow:night`, `run.mjs all` |
| §8 mutation | ยังไม่มี | → P8 |

## 3. หลักที่ใช้ออกแบบ

- **flow doc เป็นต้นฉบับเดียว:** ข้อมูลใหม่ (การตรวจต่อ layer, conflict, อ้างอิงโค้ด) อยู่ใน flow doc ส่วน CSV หรือรายงานอื่นสร้างจากมัน ไม่แก้ด้วยมือ ไม่มีสองที่ที่ต้องตามแก้
- **บังคับด้วย `flows.mjs check`:** ข้อเสนอที่เป็นแค่ข้อความใน skill จะถูกลืม ทุกข้อจึงมีทางเลือก a) ที่ check เตือนหรือนับเป็น gap และ b) ที่เป็นแค่แนวทาง
- **คงกฎเดิม:** ไม่ตั้ง CI จนกว่าคุณขอ, E2E ไม่เกิน `e2eMaxWorkers`, E2E เขียนเมื่อสั่ง, mtest ไม่อ้าง mflow, StemHub ไม่แตะ
- **ไม่ให้ LLM เปลี่ยนสิ่งที่คาดหวัง:** ค่าที่คาดหวังมาจาก requirement หรือข้อมูลที่ test สร้างเอง ไม่ใช่ผลของระบบ

## 4. Agent 7 ตัวของแผน เทียบกับคำสั่งที่มี

| Agent ในแผน (§3) | ทำได้ด้วย | ขาด |
|---|---|---|
| 1 Codebase Discovery & Trace | `/mtest:flow` (ไม่มี argument) หา flow จากโค้ดและ requirement; mflow: `/mflow:analyze units` ทำไฟล์ข้อเท็จจริงของโค้ด | อ้างอิงโค้ดถึงระดับ symbol → P9 |
| 2 Business Workflow Modeler | flow doc: Steps, Branches, Transitions, Rules | conflict report → P4 |
| 3 Test Strategy & Coverage | `references/cases.md` 18 ข้อ + `flows.mjs check` | การตรวจต่อ layer → P2, matrix → P5 |
| 4 Test Generator | `/mtest:flow <flow> write` (unit/integration), `/mtest:e2e` | — |
| 5 Executor & Evidence | `run.mjs` (ไม่ใช้ LLM, บันทึกกับ commit, cap browser) | หลักฐาน → P6 |
| 6 Independent QA Reviewer | `/mtest:review` | ยังเป็นตัวเดียวกับคนเขียน → P1 |
| 7 Healer (สิทธิ์จำกัด) | กฎของ `/mtest:e2e`: แก้ test เมื่อหน้าจอเปลี่ยนโดยตั้งใจเท่านั้น หน้าจอผิด flow คือ defect | — |

ข้อแนะนำ: ไม่สร้าง agent 7 ตัว เพราะแต่ละตัวต้องส่งต่อผ่านเอกสาร (เสียรายละเอียดทุกครั้งที่ส่ง) และใช้ token หลายเท่า ใช้คำสั่งที่มี และเพิ่มเฉพาะ reviewer อิสระ (P1) ซึ่งเป็นจุดเดียวที่แผนให้เหตุผลว่าต้องแยกจริง (ไม่ให้ตัวเดียวรับรองงานตัวเอง) ทางเลือกอื่นคือสร้างเป็น multi-agent Workflow (ข้อ 11)

## 5. ข้อเสนอ

### P1. Reviewer ที่ไม่ใช่คนเขียน

- **ช่องว่าง:** แผน §1 ข้อ 4 และ agent 6 ต้องไม่ให้ agent ตัวเดียวรับรองงานตัวเอง ตอนนี้ `/mtest:night` และ `/mflow:night` แก้แล้ว review เองใน context เดียวกัน
- **ที่เสนอ:**
  - review ของการแก้ใน `/night` (และ `/mtest:review --fresh` เมื่อสั่งเอง) ให้ subagent ใหม่ทำ ส่งให้แค่ช่วง diff, path ของ flow doc, requirement และผล test ไม่ส่งเหตุผลของคนแก้ (reviewer ที่ได้สมมติฐานของคนเขียนมักยืนยันกลับมา)
  - รายงาน review มี `Reviewer: claude (fresh context)` / `Author: claude` อยู่แล้ว เพิ่ม `Self-review: yes|no` และนำกฎของ mflow มาใช้: review ที่คนเขียนตรวจเอง ไม่นับเป็นหลักฐานพอสำหรับ merge
  - `reviews.mjs` อ่าน `Self-review:` และรายการตอนกลับมาของ `/night` บอกว่า branch ไหนผ่าน self-review เท่านั้น
- **ไฟล์:** `plugins/mtest/skills/review/SKILL.md`, `skills/night/SKILL.md`, `scripts/reviews.mjs`, `tests/mtest-project.test.mjs`; mflow: `skills/night/SKILL.md` (review ของ fix branch ใช้ subagent ใหม่)
- **ขนาด:** M (หนึ่ง subagent ต่อ review หนึ่งรอบ)
- **ตัวเลือก:** a) subagent ใหม่ใน `/night` และ `--fresh` + ป้าย self-review (แนะนำ) · b) ป้าย self-review อย่างเดียว ไม่ใช้ subagent · c) คงเดิม

### P2. ตรวจข้าม layer ต่อ step (`## Checks`)

- **ช่องว่าง:** แผน §1 ข้อ 3, §2 ข้อ 9 และคอลัมน์ UI/API/DB/report ของ §4 ต้องการให้แต่ละ step ตรวจว่า UI, API, DB, report และ audit ตรงกัน ตอนนี้ flow doc บอกแค่ "Expected" และ "State after"
- **ที่เสนอ:**
  - flow doc มีหัวข้อใหม่ (ไม่บังคับ) `## Checks`: `| Step | UI | API | DB | Report | Audit |` แต่ละช่องบอกสิ่งที่ต้องเป็นจริงหลัง step นั้น หรือ `—` พร้อมเหตุผล (`— ไม่มีหน้าจอ`) ห้ามว่าง
  - `flows.mjs check` เตือนเมื่อ step ที่เปลี่ยน State after ไม่มีช่อง API หรือ DB, เมื่อช่องว่างโดยไม่มีเหตุผล, และเมื่อ step ใน `## Checks` ไม่มีอยู่ใน Steps
  - E2E อ่าน DB ผ่าน API ของระบบหรือ helper อ่านอย่างเดียวของโปรเจกต์เท่านั้น ส่วนการตรวจแถวใน DB เป็นงานของ integration test
  - `/mtest:review` ตรวจว่า test ของ case ที่ผ่าน step ที่แก้ assert ตามช่องเหล่านี้
- **ไฟล์:** `skills/flow/references/flow-format.md`, `cases.md`, `skills/flow/SKILL.md`, `scripts/flows.mjs`, `skills/review/SKILL.md`, `skills/e2e/SKILL.md`, `tests/mtest-flows.test.mjs`
- **ขนาด:** M
- **ตัวเลือก:** a) `## Checks` + คำเตือนของ check (แนะนำ) · b) แนวทางใน `cases.md` อย่างเดียว · c) ไม่ทำ

### P3. กระทบยอดรายงานและ export (case ชนิด `report`)

- **ช่องว่าง:** แผน §2 ข้อ 8, §4 Output และ §6 ข้อรายงาน ต้องตรวจเนื้อหาของรายงาน ไม่ใช่แค่ว่ามีไฟล์ ตอนนี้ตรวจแค่ชื่อ ชนิด ขนาด และข้อความเมื่ออ่านได้
- **ที่เสนอ:**
  - case ชนิดใหม่ `report`: จำนวนแถว ยอดรวม ตัวกรอง rounding timezone และการตัดงวด คอลัมน์ที่แต่ละ role เห็น โดย**คำนวณค่าที่คาดหวังจากข้อมูลที่ test สร้างเอง** ไม่ใช่จากผลของระบบ อย่างน้อยหนึ่ง case ระดับ `integration` (ข้อมูล) และหนึ่ง case ระดับ `e2e` (เปิดไฟล์ที่ดาวน์โหลด)
  - `flows.mjs check` เตือนเมื่อ Action หรือ Expected ของ step พูดถึงรายงาน export หรือดาวน์โหลด (คำไทยและอังกฤษ) แต่ flow ไม่มี case `report` ส่วน `skip: report` ใน front matter ปิดคำเตือนนี้
  - mflow: เพิ่มบรรทัดใน `rules.specs` ให้ requirement ที่สร้างรายงานหรือ export มี Scenario ที่ระบุข้อมูลตั้งต้น ยอดรวม rounding และงวด
- **ไฟล์:** `scripts/flows.mjs` (`KINDS`), `flow-format.md`, `cases.md`, `skills/e2e/SKILL.md`, `tests/mtest-flows.test.mjs`; mflow: `scripts/openspec-config.mjs`, `tests/openspec-config.test.mjs`
- **ขนาด:** S–M
- **ตัวเลือก:** a) ชนิด `report` + คำเตือน + บรรทัดใน mflow (แนะนำ) · b) ทำใน mtest อย่างเดียว · c) ไม่ทำ

### P4. ป้าย `CONFLICT` และ `NEEDS_ORACLE`

- **ช่องว่าง:** แผน §5: เมื่อ requirement, โค้ด และพฤติกรรมจริงไม่ตรงกัน ต้องมี conflict report และเมื่อไม่มีเฉลยที่เชื่อถือได้ต้องไม่สร้างค่าที่คาดหวังจากผลของระบบเอง ตอนนี้มีแค่ `(from code)`
- **ที่เสนอ:**
  - ป้ายในเซลล์ของ flow doc เพิ่มจาก `(from code)`: `CONFLICT: <ref>` เมื่อ requirement กับโค้ดต่างกัน (เซลล์คงค่าของ requirement) และ `NEEDS_ORACLE` เมื่อยังไม่มีค่าที่คาดหวังที่เชื่อถือได้
  - หัวข้อ `## Conflicts`: แต่ละข้อมี requirement, ตำแหน่งในโค้ด, สิ่งที่เห็นจริง, คำถามถึงคุณ และคำตัดสินเมื่อตอบแล้ว
  - case ที่ Expect เป็น `NEEDS_ORACLE` นับเป็น gap (flow นั้น `ok: false`) และ `/mtest:flow <flow> write` ข้ามมัน
  - `flows.mjs check` นับ conflict ที่ยังเปิด, `/mtest:review` แสดง conflict ของ flow ที่ diff แตะ, และรายการตอนกลับมาของ `/night` แสดงเป็นข้อที่ต้องให้คุณตัดสิน
- **ไฟล์:** `scripts/flows.mjs`, `flow-format.md`, `skills/flow/SKILL.md`, `skills/review/SKILL.md`, `skills/night/SKILL.md`, `tests/mtest-flows.test.mjs`
- **ขนาด:** S
- **ตัวเลือก:** a) ป้าย + `## Conflicts` + check (แนะนำ) · b) ป้ายอย่างเดียว · c) ไม่ทำ

### P5. Coverage matrix ที่สร้างจาก flow doc

- **ช่องว่าง:** แผน §4 ต้องการ `coverage-matrix.csv` ที่มี workflow, step, source, actor, assertion ต่อ layer, test, evidence, owner, review status
- **ที่เสนอ:**
  - `flows.mjs matrix [--write]` สร้าง CSV จาก flow doc หนึ่งแถวต่อ (flow, step, case): flow, step, actor, ที่มา (requirement id หรือ `(from code)`), kind, expect, ช่อง Checks ของ P2, test, level, ผล, review
  - **ผล** มาจากผลรันล่าสุด ซึ่งเก็บแค่จำนวนและรายการ failure จึงเป็น `failed` (อยู่ในรายการ failure), `passed` (ส่วนนั้นผ่านและไม่อยู่ในรายการ) หรือ `unknown` (นอกเหนือจากนั้น) ไม่สัญญาผลราย test
  - **review** มาจากคำตัดสินของ review ล่าสุดที่ครอบ flow doc นั้น, `owner` มาจาก front matter ของ flow (ใหม่, ไม่บังคับ)
  - `--write` เขียน `mtest/coverage.csv` ซึ่งหัวไฟล์บอกว่าสร้างใหม่ทุกครั้ง ห้ามแก้ด้วยมือ
- **ไฟล์:** `scripts/flows.mjs`, `flow-format.md`, `skills/flow/SKILL.md`, `tests/mtest-flows.test.mjs`
- **ขนาด:** M
- **ตัวเลือก:** a) CSV ที่สร้างจาก flow doc + `owner` (แนะนำ) · b) เพิ่มคอลัมน์ในตาราง Cases ให้กรอกเอง · c) ไม่ทำ

### P6. หลักฐานของ test ที่ล้ม

- **ช่องว่าง:** แผน §2 ข้อ 10 และ §6 ต้องการ trace, screenshot, log, network, correlation id และกัน PII หลุด ตอนนี้ผลรันมีจำนวนกับ failure บรรทัดแรก และ log เต็มอยู่ใน `.mtest/logs/<run>/`
- **ที่เสนอ:**
  - `run.mjs` อ่าน attachment ของ test ที่ล้มจากรายงาน JSON ของ Playwright แล้วเขียน `.mtest/logs/<run>/evidence.json` (test, ไฟล์ trace และ screenshot, log, commit, run stamp) ผลรันอ้าง path ของไฟล์นี้
  - Playwright config ควรตั้ง `trace: 'retain-on-failure'` และ `screenshot: 'only-on-failure'` แต่ตอนนี้ `/mtest:e2e` แก้ได้แค่ไฟล์ test **การแก้ config จึงต้องให้คุณตัดสิน** (ข้อ 6)
  - trace มีเนื้อหาของหน้า (ชื่อ อีเมล) จึงอยู่ใน `.mtest/logs/` ที่ไม่ commit ผลรันอ้างแค่ path
  - correlation id: ถ้าระบบส่ง header ของ request id อยู่แล้ว helper ของ test เก็บไว้ตอนล้ม ถ้าไม่มีก็ไม่บังคับ
- **ไฟล์:** `scripts/run.mjs`, `skills/test/SKILL.md`, `skills/e2e/SKILL.md`, `tests/mtest-run.test.mjs`
- **ขนาด:** M
- **ตัวเลือก:** a) manifest ใน runner + `/mtest:e2e` เสนอแก้ config และแก้เมื่อคุณตกลง (แนะนำ) · b) manifest อย่างเดียว ไม่แตะ config · c) ไม่ทำ

### P7. Contract ของ API ภายนอก (case ชนิด `contract`)

- **ช่องว่าง:** แผน §2 ข้อ 2 และ §4 Integration: status, schema, field, idempotency, retry ของ API ภายนอก ตอนนี้มี `recovery` (ล้มหรือ timeout) และ `idempotency`
- **ที่เสนอ:**
  - case ชนิดใหม่ `contract`: field ที่ระบบอ่านจาก API ภายนอก (ตัวอย่างที่บันทึกไว้หรือ schema ใน fixture), การ map เข้า field ที่เก็บ, record เดิมมาซ้ำแล้วเก็บครั้งเดียว และ test กับระบบจริงที่รันด้วยมือ (ข้ามเมื่อไม่มีตัวแปร environment) แบบ DMS contract test ของ StemHub
  - `.mtest/config.json` มี `externalActors` ใหม่ (ค่าเริ่มต้นว่าง) เช่น `["DMS", "ERP"]` และ `flows.mjs check` เตือนเมื่อ step ที่ Actor เป็นระบบภายนอกไม่มี case `contract`
- **ไฟล์:** `scripts/flows.mjs`, `scripts/lib.mjs` (ค่าเริ่มต้น), `flow-format.md`, `cases.md`, `tests/mtest-flows.test.mjs`
- **ขนาด:** S–M
- **ตัวเลือก:** a) ชนิด `contract` + `externalActors` + คำเตือน (แนะนำ) · b) แนวทางใน `cases.md` อย่างเดียว · c) ไม่ทำ

### P8. Mutation check: test จับการเปลี่ยนกฎได้จริงไหม

- **ช่องว่าง:** แผน §8 ข้อ 5 และ §10 ข้อ 4: เมื่อลองเปลี่ยนกฎธุรกิจหรือสิทธิ์โดยตั้งใจ test ที่ควรล้มต้องล้ม
- **ที่เสนอ:**
  - `/mtest:test mutation <flow>` จำกัดที่ไฟล์ที่ทำ Rule และสิทธิ์ของ flow นั้น รันกับ unit/integration test ของ case เท่านั้น **ไม่รันกับ E2E** บันทึก mutant ที่ถูกจับและที่รอดต่อไฟล์ mutant ที่รอดบนบรรทัดของ Rule แสดงใน review
  - ใช้เครื่องมือที่มีอยู่: Stryker.NET (.NET) และ StrykerJS (JS/TS) `(ยังไม่ได้ตรวจกับเอกสาร: คำสั่งและ option จะตรวจก่อนเขียน)` ไฟล์ชั่วคราวอยู่ใน `.mtest/tmp/` ในโปรเจกต์เท่านั้น
  - ไม่อยู่ใน `/night` โดยค่าเริ่มต้น เพราะช้า
- **ไฟล์:** `skills/test/SKILL.md`, `scripts/run.mjs` (part ชนิด mutation), `skills/init/references/stacks.md`, `tests/mtest-run.test.mjs`
- **ขนาด:** L
- **ตัวเลือก:** a) สร้างในเฟส 3 ด้วยเครื่องมือ mutation ที่ตรวจคำสั่งแล้ว (แนะนำ) · b) Claude เปลี่ยนบรรทัดของ Rule ทีละจุดแล้วรัน test ของ case แล้วคืนไฟล์ (ไม่ต้องติดตั้งเครื่องมือ แต่เสี่ยงลืมคืนไฟล์ จึงไม่ให้ทำใน `/night`) · c) ไม่ทำ

### P9. อ้างอิงโค้ดจาก flow doc

- **ช่องว่าง:** แผน §5 ต้องการ linkage `requirement → code symbol → workflow → test → evidence` ตอนนี้ขาดช่วง code symbol
- **ที่เสนอ:** คอลัมน์ `Code` (ไม่บังคับ) ใน Steps และ Rules: `path:Symbol` และ `flows.mjs check` เตือนเมื่อไฟล์ไม่มีแล้วหรือหา symbol ในไฟล์ไม่เจอ (อ้างอิงที่ค้าง) ไม่ใช้ MCP ภายนอก
- **ไฟล์:** `scripts/flows.mjs`, `flow-format.md`, `skills/flow/SKILL.md`, `tests/mtest-flows.test.mjs`
- **ขนาด:** S
- **ตัวเลือก:** a) ทำในเฟส 3 (แนะนำ) · b) ไม่ทำ

### P10. แนวทาง widget ของ DevExpress/DevExtreme และ Kendo

- **ช่องว่าง:** แผน §1 บอกว่าระบบ "อาจใช้" DevExpress/DevExtreme หรือ Kendo UI ซึ่ง grid, dropdown, date picker และ loading mask ของมันทำให้ E2E ยาก
- **ที่เสนอ:** `skills/e2e/references/widgets.md`: วิธีรอ loading mask หายไป, หาแถวและแก้ช่องใน grid, popup ของ dropdown, ใช้ ARIA ที่ widget มีให้ เขียนจากเอกสารของผู้ผลิตที่ตรวจแล้ว ไม่เขียนจากความจำ
- **ไฟล์:** `skills/e2e/references/widgets.md`, `skills/e2e/SKILL.md`
- **ขนาด:** S–M
- **ตัวเลือก:** a) รอจนมีโปรเจกต์ที่ใช้จริง แล้วเขียนจากหน้าจอจริงพร้อมเอกสาร (แนะนำ) · b) เขียนตอนนี้จากเอกสารของผู้ผลิต · c) ไม่ทำ

## 6. นอกขอบเขตโดยตั้งใจ

- **Pipeline CI (§7):** กติกาเดิมคือไม่ตั้งหรือเสนอ CI ในโปรเจกต์จนกว่าคุณขอในโปรเจกต์นั้น สิ่งที่ใช้แทนตอนนี้คือ `run.mjs all` (ไม่ใช้ LLM, ใช้จาก CI ได้ภายหลัง) และ `/mtest:night`
- **แยก artifact หลายไฟล์ (§7 โครงไฟล์):** `workflow-map.md`, `state-transitions.yaml`, `coverage-matrix.csv` แยกกันจะทำให้ข้อมูลเดียวกันอยู่หลายที่ ใช้ flow doc เป็นต้นฉบับเดียวและสร้าง CSV จากมัน (P5)
- **Playwright Test Agents (Planner/Generator/Healer, §3):** ไม่ผูกกับเครื่องมือนี้ เพราะกฎ "ห้ามแก้ผลที่คาดหวัง" อยู่ใน `/mtest:e2e` แล้ว ถ้าจะใช้ภายหลัง ต้องตรวจเวอร์ชันและวิธีติดตั้งจากเอกสารก่อน ตามที่แผนเขียนไว้

## 7. ลำดับขั้นและ release

| เฟส | ข้อ | ปิดความเสี่ยง | release |
|---|---|---|---|
| 1 | P1, P2, P3, P4 | reviewer อิสระ, ตรวจข้าม layer, รายงาน, conflict | mtest 0.4.0 + mflow 0.39.0 (P1, P3 ฝั่ง mflow) |
| 2 | P5, P6, P7 | matrix, หลักฐาน, API ภายนอก | mtest 0.5.0 |
| 3 | P8, P9, P10 | mutation, อ้างอิงโค้ด, widget | ตามที่เลือก |

แต่ละเฟสจบด้วย test ของ script, `claude plugin validate` และการลองกับ flow ตัวอย่างหนึ่ง flow ก่อนให้คุณเลือก commit

## 8. คำถาม

1. P1 reviewer ที่ไม่ใช่คนเขียน: a) subagent ใหม่ใน `/night` และ `--fresh` + ป้าย self-review (แนะนำ) · b) ป้ายอย่างเดียว · c) คงเดิม
2. P2 `## Checks` ต่อ layer: a) หัวข้อใหม่ + คำเตือนของ check (แนะนำ) · b) แนวทางอย่างเดียว · c) ไม่ทำ
3. P3 รายงานและ export: a) ชนิด `report` + คำเตือน + บรรทัดใน mflow (แนะนำ) · b) mtest อย่างเดียว · c) ไม่ทำ
4. P4 `CONFLICT` / `NEEDS_ORACLE`: a) ป้าย + `## Conflicts` + check (แนะนำ) · b) ป้ายอย่างเดียว · c) ไม่ทำ
5. P5 coverage matrix: a) CSV ที่สร้างจาก flow doc + `owner` (แนะนำ) · b) คอลัมน์ที่กรอกเอง · c) ไม่ทำ
6. P6 หลักฐาน: a) manifest + เสนอแก้ Playwright config เมื่อคุณตกลง (แนะนำ) · b) manifest อย่างเดียว · c) ไม่ทำ
7. P7 API ภายนอก: a) ชนิด `contract` + `externalActors` + คำเตือน (แนะนำ) · b) แนวทางอย่างเดียว · c) ไม่ทำ
8. P8 mutation: a) เฟส 3 ด้วยเครื่องมือที่ตรวจแล้ว (แนะนำ) · b) Claude เปลี่ยนกฎทีละจุดเอง · c) ไม่ทำ
9. P9 อ้างอิงโค้ด: a) เฟส 3 (แนะนำ) · b) ไม่ทำ
10. P10 widget: a) รอโปรเจกต์จริง (แนะนำ) · b) เขียนตอนนี้จากเอกสาร · c) ไม่ทำ
11. สถาปัตยกรรม: a) คำสั่งที่มี + reviewer อิสระ (P1) (แนะนำ) · b) สร้างเป็น multi-agent Workflow ตามแผน 7 ตัว (ใช้ token มากกว่าหลายเท่า)
12. mflow: a) ทำข้อที่สะท้อนได้ใน mflow ด้วย (P1, P3) (แนะนำ) · b) mtest อย่างเดียว
13. release: a) ทีละเฟส เริ่มเฟส 1 (แนะนำ) · b) ทุกข้อที่เลือกในครั้งเดียว

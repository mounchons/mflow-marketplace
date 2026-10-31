# วิเคราะห์ StemHub 2026-10-31: change ที่แยก API กับหน้าจอ และการขอให้ test/review หลัง apply

- วันที่วิเคราะห์และแก้: 2026-10-31
- mflow ก่อนแก้: 0.34.2 (`7b096a2`) แก้แล้วเป็น 0.35.0 (`a95c772`) push แล้ว CI ผ่านทั้ง 6 job (run 41212537672)
- ข้อมูลจาก: StemHub (`D:\GitHub\StemHub`) อ่านอย่างเดียว ไม่ได้แก้ไฟล์ใดใน StemHub ตอนวิเคราะห์ `main` อยู่ที่ `026e3680` และมี session อื่นกำลัง apply `landing-content` อยู่บน `feat/landing-content` StemHub ติดตั้ง plugin 0.34.1 ส่วนบรรทัดใน `openspec/config.yaml` เป็นของ 0.34.0
- session: `6b8d705b-0757-435c-882b-41768b343d55`

## 1. ปัญหาที่ผู้ใช้แจ้ง

1. **OpenSpec หรือ mflow แตก change เป็นงาน API หนึ่งตัวกับงานหน้าจอ (UI) อีกหนึ่งตัว** จึงต้อง apply สองรอบ ผู้ใช้เห็นว่ารวมกันได้ เพราะ Opus 5.5 ทำได้ดีและงานไม่ใหญ่ ตัวอย่างคือ discuss 21 ที่ทำทั้งวันแล้วยังไม่ครบ
2. **หลัง `/opsx:apply` เสร็จ ระบบบอกให้เรียก `/mflow:test` และ `/mflow:review`** งานจึงไม่ต่อเนื่อง และกว่าจะผ่านต้องใช้เวลามาก ผู้ใช้ต้องการให้ไม่ต้องแจ้ง แต่เก็บรายการงานที่ยังไม่ได้ test และ review ไว้ แล้วผู้ใช้จะสั่งเองบน `main` ภายหลัง

## 2. ข้อสรุป

1. **ทั้งสองปัญหามาจากกฎของ mflow เอง ไม่ได้มาจาก OpenSpec** สาเหตุคือบรรทัดที่ mflow เขียนลง `openspec/config.yaml` คือ `rules.proposal` (FR-224 ของ 0.34.0) และ `operations.apply.guidance`
2. **ข้อ 2 กินเวลามากกว่าข้อ 1 ราว 5 เท่า** test และ review ของ change แรกของ CR-009 ใช้ 4 ชั่วโมง 25 นาที (ราว 35% ของวัน) ส่วนงานที่เพิ่มขึ้นจากการแยก API กับหน้าจอ (propose, archive, merge, STATUS) รวมราว 40 นาที
3. **การรวม API กับหน้าจอใน change เดียวทำได้จริง** `owning-site-names` มี 11 tasks ทั้ง API และหน้าจอ apply เสร็จใน 1 ชั่วโมง 6 นาที
4. **ผู้ใช้ข้าม test และ review เองแล้วสามครั้งในวันเดียวกัน** การแก้ครั้งนี้จึงทำให้วิธีที่ใช้อยู่จริงเป็นทางปกติ ไม่ได้สร้างวิธีใหม่
5. **แก้แล้วใน 0.35.0**
   - change หนึ่งตัวคือหนึ่ง feature ทั้ง server และหน้าจอ แยกเฉพาะเมื่อเกินราว 25 tasks หรือผู้ใช้สั่ง และแยกตาม feature
   - จบ apply แล้วเพิ่มแถวลง `docs/reviews/pending.md` แทนการบอกให้ test หรือ review
   - `/mflow:test` รันครั้งเดียวบน main แล้วครอบทุกแถว `/mflow:review pending` ตรวจทีละ change

## 3. ข้อมูล: discuss 21 / CR-009 ในวันที่ 2026-10-31

discuss 21 อนุมัติเวลา 08:36 (`f16e76fc`) และ CR-009 เขียนเสร็จเวลา 08:51 (`d9d00492`) CR-009 §4 วางไว้ 4 change คือ A, B, C, D ตามหัวข้อ และแต่ละ change มีหน้าจอของตัวเอง ตาราง §6 ของ CR-009 ก็นับหน้าจอรวมไว้ใน change เดียวกัน

| change | ส่วน | tasks | propose | apply | test / review | รวมโดยประมาณ |
|---|---|---|---|---|---|---|
| `system-settings` (A) | API | 12 | 08:51–09:15 | 09:15–11:00 (1 ชม. 45 นาที) | 11:10–15:25 **4 ชม. 25 นาที** | 6 ชม. 40 นาที |
| `system-settings-screen` (A) | หน้าจอ | 10 | 15:32–15:47 | 15:47–16:08 (21 นาที) และปรับ `SettingField` ตามที่ผู้ใช้ขอ แล้วลองใช้จริงจนถึง 16:40 | ข้าม (E2E ที่สั่งเอง 16:51) | 1 ชม. 25 นาที |
| `password-policy-settings` (B) | API | 10 | 16:57–17:25 | 17:25–18:36 (1 ชม. 11 นาที) | ข้าม ("ไม่ต้องทำ test and review") | 1 ชม. 50 นาที |
| `password-policy-screens` (B) | หน้าจอ | 6 | 18:48–18:51 | 18:51–19:05 (14 นาที) | ข้าม | 23 นาที |
| `owning-site-names` (C) | **API และหน้าจอ** | 11 | 19:11–19:32 | 19:32–20:38 (1 ชม. 6 นาที) | ข้าม | 1 ชม. 46 นาที |
| `landing-content` (D) | API | 8 | 20:57–21:14 | 21:14–22:22 (8/8) | ยังไม่ทำ | proposal แยก `landing-content-screens` ไว้อีกตัว |

รอบ test และ review ของ `system-settings` เป็นแบบนี้ (record อยู่ใน `docs/reviews/tests/` และ `docs/reviews/code/` ของ StemHub):
1. whole suite ที่ `ba4a9bd3` ใช้ราว 1 ชั่วโมง 6 นาที ล้ม 2 จาก 1423 integration tests (เครื่องรัน container ของ project อื่นอยู่ด้วย)
2. แก้แล้ว commit `1a377370` ตามด้วย `since` ใช้ 16 นาที 35 วินาที ผ่าน
3. full review ได้ `changes-requested` (M1: compose map ค่า OTP hours ไว้ที่ `:-24`)
4. แก้แล้ว commit `b6b5c5aa` ตามด้วย `since` ใช้ 21 นาที ผ่าน
5. short review ได้ `approve` แล้ว merge เวลา 15:25

## 4. วิเคราะห์ข้อ 1: ทำไม change ถูกแยกเป็น API กับหน้าจอ

**กฎที่แยก:** `rules.proposal` ข้อ 4 ของ 0.34.0 (FR-224) เขียนว่า

> Keep a change small enough to apply, test and review in one sitting. When it would need more than about 15 tasks, or changes code that every module relies on (sign-in, sessions, security, seed data, shared tables) together with screens, propose only its first part now, usually the server side, and list the rest under Later changes …

- **A ติดเงื่อนไขทั้งสองข้อ** รวมกันได้ 12 + 10 = 22 tasks และแตะ seed กับสิทธิ์
- **B ติดเงื่อนไขข้อที่สอง** แตะ sign-in พร้อมหน้าจอ รวมกันได้ 10 + 6 = 16 tasks
- **C ไม่ติด** 11 tasks และ `owning_site` ไม่ใช่ตารางกลาง จึงเป็น change เดียว
- **D ติดอีกครั้ง** proposal ของ `landing-content` มี `landing-content-screens` อยู่ใต้ Later changes

ผลคือ 4 change ตามแผนของ CR กลายเป็น 6 ตัว และจะเป็น 7 ตัวเมื่อนับ D แต่ละตัวที่เพิ่มต้อง propose, ตอบคำถาม, archive, sync spec, merge และเขียน STATUS เองทุกขั้น และผู้ใช้ต้องสั่งงานเพิ่มอีก 4–5 รอบต่อตัว

**ที่มาของกฎ** (commit `6f65eb6`, 2026-10-19): `supplier-sign-in` มี 27 tasks ใช้เวลา propose และ apply ราว 3 ชั่วโมง ในนั้นมีปัญหาสามเรื่อง
- integration class ที่ครอบ change รันเกิน 10 นาทีจนไปรันเบื้องหลัง แล้วถูกหยุดเพราะหน่วยความจำไม่พอ รวมเวลา test ราว 55 นาที
- context เต็มกลาง apply
- (สองเรื่องแรกเป็นเหตุให้ออกกฎ 0.34.0 ทั้งชุด)

**เหตุผลนี้แก้ไปแล้วเกือบหมด:**
- เรื่อง test แก้ด้วย FR-222 (รันใน foreground แบ่งส่วนละราว 8 นาที) และ FR-223 (apply รันแค่ unit กับ test ของ task เมื่อ integration ที่ครอบกว้าง)
- change `integration-test-speed` ลด integration suite จาก 42 นาที 52 วินาที เหลือราว 20 นาที
- เหลือแค่เรื่อง context ซึ่ง `/opsx:apply` ทำต่อใน session ใหม่จาก task แรกที่ยังไม่ติ๊กได้อยู่แล้ว (`/opsx:apply` แสดง "N/M tasks complete") จึงไม่จำเป็นต้องแยกเป็น change ใหม่

**ข้อเสียที่การแยกตาม layer สร้างเพิ่ม:**
- change ที่มีแค่ API ทดสอบใช้งานจริงไม่ได้จนกว่าหน้าจอจะเสร็จ
- review ของ API ไม่ได้เห็นหน้าจอที่ใช้มัน
- change ของหน้าจอต้องอ่าน context ชุดเดิมซ้ำอีกรอบ

## 5. วิเคราะห์ข้อ 2: ทำไมหลัง apply ถึงขอ test และ review

**การขอมาจาก 3 ที่ ซึ่งทั้งหมดอยู่ใน `operations.apply.guidance`:**
1. บรรทัดที่ 3: "When the other tasks are done, give the user /mflow:test as the next command, and name the review that follows …"
2. บรรทัดของ E2E: "When the change touched screens, name them to the user as screens whose E2E tests /mflow:e2e can write or update."
3. ทุกครั้งที่ขั้นข้างบนทำงาน จะเขียน "Next:" ลง STATUS.md `## Now` ด้วย

**งานที่ค้างไม่มีที่เก็บเป็นรายการ:**
- อยู่เป็นข้อความยาวใน `## Now` ซึ่งมีขนาดราว 330 KB เช่น "Still owed: /mflow:review of everything merged since 2026-10-28"
- นับจากชื่อโฟลเดอร์ archive เทียบกับรายงานใน `docs/reviews/code/` พบราว 16 change ที่ archive ตั้งแต่ 2026-10-28 แล้วยังไม่มีรายงาน review (นับโดยประมาณ: การหาชื่อ change ในรายงานแบบ substring นับ `system-settings-screen` เป็นมีรายงานด้วย เพราะไปเจอรายงานของ `system-settings`)
- record ของ test มีบรรทัด `Change:` ที่ใส่ได้แค่ชื่อเดียว และบางครั้งก็ใส่เลข TASK แทนชื่อ change จึงผูก record กับ change ด้วย script ไม่ได้

**ช่องว่างที่พบระหว่างออกแบบ:**
- `/mflow:review <change-name>` หา change ได้แค่ใน `openspec/changes/<name>/` ยังหา change ที่ archive แล้วไม่เจอ
- กฎ "merge only on approve" สมมติว่า review เกิดก่อน merge จึงยังไม่มีรูปแบบของ review หลัง merge
- `operations.archive.guidance` ของ OpenSpec 1.13.2 เป็นแค่คำแนะนำ (`/opsx:archive` บอกว่า "advisory") การเขียนรายการตอน archive จึงอาจถูกข้าม ต้องมีตัวกันพลาด

## 6. ทางเลือกที่เสนอ และคำตอบของผู้ใช้

ผู้ใช้ตอบว่า `1 a, 2 a, 3 a, 4 a, 6 a` และ `5 a` หลังจากได้คำอธิบายเพิ่ม

| ข้อ | คำถาม | ทางที่ผู้ใช้เลือก | ทางอื่นที่เสนอ |
|---|---|---|---|
| 1 | กฎการแยก change | a) หนึ่ง change ต่อ feature แยกเมื่อเกินราว 25 tasks และแยกตาม feature | b) คงเพดาน 15 แต่ตัดเงื่อนไข "โค้ดกลาง + หน้าจอ"; c) ไม่มีเพดาน แยกเมื่อผู้ใช้สั่งเท่านั้น |
| 2 | ที่เก็บรายการ | a) `docs/reviews/pending.md` | b) `.mflow/pending-checks.json` แล้วดูผ่านคำสั่ง |
| 3 | รูปแบบ review บน main | a) รายงานละ change ใช้ test run เดียวกัน | b) รายงานเดียวครอบทุกอย่างตั้งแต่ commit ที่ review ล่าสุด |
| 4 | ตอนเปิด session | a) ไม่แสดงอะไร | b) แสดงหนึ่งบรรทัดว่า "N change รอ test/review" |
| 5 | ขอบเขต | a) ทุก project ใช้แบบใหม่ ไม่มี setting | b) แบบใหม่เป็นค่าเริ่มต้น และมี `"checks": "per-change"` สำหรับ project ที่อยากได้แบบเดิม; c) แบบเดิมเป็นค่าเริ่มต้น และเปิดทีละ project ด้วย `"checks": "batch"` |
| 6 | รายการตั้งต้นของ StemHub | a) change ที่ยังไม่มี review/test ตั้งแต่ 2026-10-28 | b) เฉพาะ CR-009; c) เริ่มจากว่าง |

เหตุผลของข้อ 5 a: แบบใหม่ไม่ได้ปิดการตรวจทีละ change ผู้ใช้ยังสั่ง `/mflow:test` หรือ `/mflow:review <branch>` ก่อน merge ได้เหมือนเดิม ต่างกันแค่ระบบไม่ทักหลัง apply การทำ setting จึงต้องดูแลบรรทัดใน config สองชุดเพียงเพื่อคืนคำทักนั้น

## 7. สิ่งที่แก้ใน 0.35.0

### 7.1 บรรทัดใน `openspec/config.yaml` (`scripts/openspec-config.mjs`)

- **`rules.proposal` ข้อ 4 (FR-224 ฉบับใหม่):**
  > One change holds one feature whole, its server side and its screens together, so it can be tried in use once it is applied. Split a change only when it would need more than about 25 tasks, or when the user says so, and then by feature, each part with its own server side and screens; a part with only the server side comes first only when the screens of every later part need it. List the parts not proposed now under Later changes in the proposal, one line each, for the user to propose next. A long apply needs no split, because /opsx:apply continues in a new session from the first unticked task.
- **`operations.apply.guidance` บรรทัดใหม่ (FR-226):** เมื่อ task อื่นเสร็จ ให้เพิ่มแถวของ change ลง `docs/reviews/pending.md` ถ้ายังไม่มีไฟล์ให้สร้างพร้อมหัวตาราง `| Change | Branch | Applied | Review level | Test | Review | E2E screens |` แล้วบอกผู้ใช้แค่ว่าพร้อม archive และห้ามให้ `/mflow:test`, `/mflow:review` หรือ `/mflow:e2e` เป็นขั้นถัดไป ทั้งในคำตอบและใน STATUS.md
- **บรรทัดที่บอกว่า "the whole suite runs once per change"** (ใน `rules.tasks` และบรรทัด integration) เปลี่ยนเป็น "once for every change waiting in docs/reviews/pending.md"
- **บรรทัด E2E:** หน้าจอที่ change แตะให้เขียนไว้ในแถวของ change แทนการบอกในคำตอบ

ผล dry-run บน StemHub (ไม่ได้เขียนไฟล์): แทน 6 บรรทัด เพิ่ม 1 บรรทัด และไม่มี problems

### 7.2 Script ใหม่ `scripts/pending.mjs` (FR-227)

| คำสั่ง | ทำอะไร |
|---|---|
| `status` | อ่านแถวทั้งหมด บอกว่างานของแต่ละ change จบที่ commit ไหน และ `HEAD` มีงานนั้นแล้วหรือยัง (`landed`) พร้อมรายการ change ที่ archive ตั้งแต่วันที่ `Since:` แต่ไม่อยู่ในรายการ (`missing`) |
| `range <change>` | ช่วง commit ของ change: ตั้งแต่ commit ก่อนครั้งแรกที่แตะ `openspec/changes/<name>/` (proposal) ถึงครั้งสุดท้ายที่แตะโฟลเดอร์ของมันหรือโฟลเดอร์ archive ถ้างานเดินต่อบน branch ของ change ให้นับถึงปลาย branch แยกไฟล์โค้ด (`codeFiles`) ออกจากเอกสาร ถ้าชื่อ change ถูกใช้ซ้ำ ให้นับเฉพาะหลัง archive ของตัวเก่า |
| `add <change> --level …` | เพิ่มแถว (ใช้เติม change ที่หลุดจากรายการ และใช้ตอนตั้งรายการครั้งแรก) |
| `init [--since <date>]` | สร้างไฟล์ หรือตั้งวันที่ `Since:` |
| `tick-test <record>` | ถ้า record ผ่าน (whole suite หรือ `since`) และรันบน tree ที่ไม่มีไฟล์ค้าง ให้เติม Test ทุกแถวที่ commit ที่ test มีงานของ change แล้ว (ตรวจด้วย `git merge-base --is-ancestor`) archive ที่ commit ตามมาทีหลังนับว่ามีงานแล้ว เพราะเป็นเอกสารล้วน |
| `tick-review <change> --report … --verdict …` | เติม Review ถ้ามีทั้ง Test และ `approve` ให้ย้ายแถวไป `## Done` แถวที่ระดับ skip ย้ายไปเมื่อ Test ผ่านอย่างเดียว |

### 7.3 Skill และเอกสาร

- **`/mflow:test`:**
  - ก่อนรัน เติม change ที่หลุดจากรายการ
  - record มีบรรทัด `Changes:` ที่ใส่ได้หลายชื่อ
  - เมื่อผ่าน รัน `tick-test`
  - validate แบบ `--specs --strict` เมื่อ change ที่ครอบ archive ไปแล้ว
  - ขั้นถัดไปคือ `/mflow:review pending`
- **`/mflow:review`:**
  - target ใหม่ `pending [<change>]` ตรวจทีละ change ตาม `range` ใช้ผล test จากช่อง Test ของแถวนั้น
  - รายงาน `docs/reviews/code/<date>-<change>.md` เขียนว่า `Reviewed: <change> <base>..<end>`
  - หา change ที่ archive แล้วได้จากชื่อ
  - ถ้าได้ `changes-requested` ให้แก้ใน `fix/<change>-review` แล้วรัน `/mflow:test since` และ `/mflow:review fix/<change>-review --short`
  - ถ้า context เยอะ ให้หยุดหลังรายงานที่เสร็จ แล้วทำต่อใน session ใหม่
- **`/mflow:change-request`:** แบ่ง CR ตามหัวข้อ แต่ละ change มีหน้าจอของตัวเอง และนับเวลา test/review ครั้งเดียวต่อชุด
- **`/mflow:init`:** project ที่มี change archive อยู่แล้ว ให้ถามวันที่ `Since:` แล้วตั้งรายการให้ (add, tick-test ด้วย record ที่ผ่านล่าสุด, tick-review ให้ change ที่มีรายงาน approve อยู่แล้ว)
- **`/mflow:help`:** flow ของงานเล็ก และแถวใหม่ "review the changes merged into main"
- **skill ของ Codex และ OpenCode** (`agent-skills.mjs`) แนบ `pending.mjs` ไปด้วย
- **template:** `docs/reviews/pending.md` ใหม่ และบรรทัด Definition of done ใน AGENTS.md
- **เอกสาร:** README, manual (flow, ขั้น 6, ตารางปัญหา, ข้อควรระวัง §8), fast-track manual และ requirement (FR-200, FR-224, FR-226, FR-227 และตารางคำสั่ง)
- **version:** 0.35.0

### 7.4 การตรวจ

- **test เพิ่มเป็น 216 ตัว** (0.34.2 มี 202 ตัว เพิ่ม 14) ทั้งหมดผ่าน
  - `tests/pending.test.mjs` 11 ตัวบน repo ชั่วคราว ครอบกรณี range, ชื่อ change ที่ใช้ซ้ำ, change ที่ยังอยู่บน branch, proposal บน main ที่โค้ดอยู่บน branch, archive ที่ตามมาหลัง test, ระดับ skip และข้อความเมื่อรับค่าผิด
  - `tests/openspec-config.test.mjs` เพิ่ม 2 ตัว
  - `tests/agent-skills.test.mjs` เพิ่ม 1 ตัว
- **`claude plugin validate` ผ่าน** ทั้ง plugin และ marketplace
- **CI ผ่านทั้ง 6 job** (ubuntu และ windows บน Node 20, 22, 24)
- **`range` ลองกับประวัติ git ของ StemHub แล้ว ได้ช่วงถูกต้องทั้ง 5 change ของวันนั้น:**

| change | range | ไฟล์ทั้งหมด / โค้ด |
|---|---|---|
| `system-settings` | `d9d00492..b982be04` | 91 / 62 |
| `system-settings-screen` | `b982be04..83a4e34a` | 33 / 15 |
| `password-policy-settings` | `7007d3b1..af851aee` | 70 / 52 |
| `password-policy-screens` | `af851aee..3bc62a36` | 23 / 10 |
| `owning-site-names` | `8a73a91e..026e3680` | 52 / 37 |

- **บั๊กที่ test เจอระหว่างทำ (แก้แล้ว):** รุ่นแรกนับว่างานของ change จบที่ commit สุดท้ายที่แตะโฟลเดอร์ของ change เท่านั้น ถ้ามี code commit ตามหลัง commit ที่ติ๊ก `tasks.md` ตัวสุดท้าย (และไม่แตะโฟลเดอร์) record ที่รันก่อน code commit นั้นจะถูกนับว่าครอบ change แล้ว ตอนนี้ถ้า branch ของ change ยังอยู่และงานเดินต่อที่นั่น ให้นับจุดจบถึงปลาย branch และ `landed` คิดจาก ancestry ไม่ได้คิดแค่ว่าเจอ commit จาก `HEAD`
- **ข้อผิดพลาดในการเขียนไฟล์ที่เจอและแก้แล้ว:** แถวคำสั่ง `/mflow:review` ใน README เคยเสีย เพราะ `\|` ในคำสั่ง bash ถูกตัดเหลือ `|` จนตารางแตก แก้แล้วด้วยการแก้ไฟล์ตรง

## 8. ความเสี่ยงและข้อจำกัด

- **ยังไม่เคยใช้ใน session จริง** ครั้งแรกให้ดูสามเรื่อง
  - apply เพิ่มแถวแทนการบอกให้ test
  - `/mflow:test` บน main เติม Test ครบทุกแถวที่ merge แล้ว
  - แถวที่ยังอยู่บน branch ขึ้นใน `notHeld`
- **การเพิ่มแถวตอนจบ apply เป็นแค่คำแนะนำที่ OpenSpec ส่งให้ AI** ตัวกันพลาดคือรายการ `missing` ที่ `/mflow:test` และ `/mflow:review pending` เติมให้ แต่ต้องมีวันที่ `Since:` หรือมีแถวอยู่แล้วอย่างน้อยหนึ่งแถว
- **main จะมีโค้ดที่ยังไม่ผ่าน whole suite** apply ยังรัน test ของแต่ละ task และ class ที่ครอบโค้ดที่แก้อยู่ ถ้าล้มตอนรันรวม การบอกว่าเป็นของ change ไหนจะยากขึ้น `/mflow:test` จึงบอกแถวที่ไฟล์ตรงกับ test ที่ล้มเมื่อหาเจอ
- **ถ้า review เจอปัญหาใน migration ที่ขึ้น dev server ไปแล้ว** ต้องเขียน migration ใหม่แทนการแก้ตัวเดิม รายการมีระดับ review และเหตุผล (เช่น `full: migration`) ให้ดูก่อน deploy แต่การ deploy ยังเป็นการตัดสินใจของผู้ใช้
- **range เป็นการเดาจากประวัติ git**
  - ถ้า branch merge `main` เข้ามากลางทาง diff จะรวมงานของ main ช่วงนั้นด้วย
  - ถ้า change ทำบน main ตรงๆ แล้วมีงานอื่น merge เข้ามาระหว่างนั้น diff ก็จะรวมงานนั้นด้วย (review ระบุว่างานของ change อื่นเป็นของแถวนั้น)
  - ถ้าใช้ squash merge การตรวจ ancestry จะไม่เห็นงาน (StemHub ใช้ merge commit จึงไม่โดน)
- **แถวที่ย้ายไป Done หลังรอบ `changes-requested` → แก้ → `approve` ยังเก็บ record ของ test ก่อนแก้** ส่วน fix branch มี record และ short review ของตัวเองแยกไว้ ยอมรับได้
- **apply ที่เกินราว 25 tasks ยังอาจทำให้ context เต็ม** ทางแก้คือทำต่อใน session ใหม่ ไม่ต้องแยก change

## 9. การนำไปใช้ที่ StemHub (ยังไม่ได้ทำ เป็นงานของผู้ใช้)

**สถานะเวลา 22:22:** `feat/landing-content` apply ครบ 8/8 แล้ว (`a85f77f3`) แต่ยังไม่ archive และยังไม่ merge มีไฟล์ค้าง 1 ไฟล์ (`docs/dms/q7-form-version.http` ที่แก้นอก session)

**ถ้า update แค่ตัว plugin:**
- session ที่เปิดอยู่ใช้รุ่นเดิมจนกว่าจะปิด (โฟลเดอร์ 0.34.1 ยังอยู่ใน cache)
- `config.yaml` ไม่เปลี่ยนจนกว่าจะรัน `/mflow:init` กฎของ propose และ apply จึงยังเป็นของ 0.34
- session ใหม่ได้ `/mflow:test` และ `/mflow:review` รุ่น 0.35 ซึ่งถ้ายังไม่มีรายการก็ทำงานแบบเดิม
- briefing ตอนเปิด session มีบรรทัดบอกว่ามี template ใหม่
- plugin ติดตั้งแบบ user scope ด้วย session ใหม่ของ ThawSi จึงได้ skill 0.35 ไปด้วย ส่วน BunTukTransport ติดตั้งแยกไว้ที่ 0.23.0

**`/mflow:init` จะเขียนอะไรบ้าง** (dry-run แล้ว ไม่ได้เขียนไฟล์):
- `config.yaml`: แทน 6 บรรทัด และเพิ่ม 1 บรรทัด
- สร้าง `docs/reviews/pending.md`
- template ที่ต้อง merge เอง 5 ไฟล์ (`AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `docs/vision.md`, `docs/source/README.md`) เพราะรับ template ครั้งล่าสุดตอน 0.34.0
- skill ของ Codex ใน `.agents/skills/` ถูกสร้างใหม่

**ลำดับที่แนะนำ:**
1. archive และ merge `landing-content` ตามที่ผู้ใช้สั่ง
2. update plugin แล้วปิด session ของ StemHub ทั้งหมด
3. เปิด session ใหม่บน `main` ตอนที่ไม่มีไฟล์ค้าง รัน `/mflow:init` ตอบ `Since:` ว่า `2026-10-28` แล้ว commit แยกไว้เป็น commit ของ mflow 0.35.0
4. `/opsx:propose landing-content-screens` ภายใต้กฎใหม่ (การ upgrade ไม่รวม change ที่แยกไว้ก่อนแล้วให้อัตโนมัติ)

## 10. ข้อสังเกตเพิ่มเติม

- **STATUS.md ของ StemHub ใหญ่ 546 KB** ส่วน `## Now` ยาวราว 1,670 บรรทัด (330 KB) ทุก change เขียน entry ยาวหลายครั้ง ซึ่งกินเวลาเอง briefing ตอนเปิด session ถูกตัดให้พอดีอยู่แล้ว แต่ไฟล์ยังโตต่อ ใช้ `/mflow:handoff` ย่อได้ เรื่องนี้ไม่อยู่ในขอบเขตที่แก้ครั้งนี้
- **วันที่ 2026-10-31 มี commit 34 ตัวที่ข้อความพูดถึง STATUS** ในนั้น 11 ตัวเป็น commit ของ STATUS ล้วน ("docs: STATUS …") หลายตัวเป็นขั้นที่การแยก change สร้างเพิ่ม

## 11. ไฟล์ที่เปลี่ยน (`a95c772`)

- `plugins/mflow/scripts/openspec-config.mjs`, `plugins/mflow/scripts/pending.mjs` (ใหม่), `plugins/mflow/scripts/agent-skills.mjs`
- `plugins/mflow/skills/test/SKILL.md`, `review/SKILL.md`, `change-request/SKILL.md`, `init/SKILL.md`, `help/SKILL.md`
- `plugins/mflow/templates/docs/reviews/pending.md` (ใหม่), `plugins/mflow/templates/AGENTS.md`
- `plugins/mflow/README.md`, `docs/manual.md`, `docs/manual-fast-track.md`, `docs/requirement.md`
- `plugins/mflow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- `tests/pending.test.mjs` (ใหม่), `tests/openspec-config.test.mjs`, `tests/agent-skills.test.mjs`

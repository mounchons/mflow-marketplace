# แผนออกแบบ Multi-Agent Skill สำหรับการทดสอบ End-to-End Business Workflow ทั้งระบบ

**สถานะ:** Draft สำหรับส่งให้ Soul / Asta หรือ AI Reviewer อีกตัวตรวจสอบความครอบคลุม  
**จุดประสงค์หลัก:** ให้ AI วิเคราะห์ระบบเว็บที่ซับซ้อนจากโค้ดที่พัฒนาอยู่จริง และออกแบบ/สร้าง/รันทดสอบ **กระบวนการธุรกิจที่ต่อเนื่องกันตั้งแต่ต้นจนจบ** ไม่ใช่เพียงทดสอบแยกแต่ละหน้า (page-level test)

## 1. เป้าหมายและเงื่อนไขที่ห้ามละเลย

ระบบตัวอย่างมีสอง Portal (Admin และ Supplier) บน ASP.NET Core MVC อาจใช้ DevExpress/DevExtreme หรือ Kendo UI มี Backend API, External API, PostgreSQL และระบบสิทธิ์ผู้ใช้ หลายขั้นตอนขึ้นต่อกัน เช่น ดึงข้อมูลจาก API → เก็บข้อมูล → ตั้งค่าใน Admin → ประมวลผลข้อมูลตามค่าตั้ง → ตรวจสอบ/อนุมัติ → แสดงผลให้ Supplier ตามสิทธิ์ → ออกรายงาน/ตรวจผล

**นิยามความสำเร็จ:** ทุกเส้นทางธุรกิจสำคัญต้องตรวจสอบได้ทั้ง *เหตุการณ์ต้นทาง เงื่อนไข การเปลี่ยนสถานะ ข้อมูลที่ส่งข้ามระบบ สิทธิ์การมองเห็น และผลลัพธ์ปลายทาง* พร้อมหลักฐานที่ตรวจสอบย้อนกลับได้

สิ่งที่ต้องมี:
- ตรวจทั้งกระบวนการแบบ **cross-portal / cross-role / cross-service** และครอบคลุม flow สาขา ทางเลือก การย้อนกลับ การปฏิเสธ การแก้ไข การอนุมัติซ้ำ และข้อผิดพลาด
- อ้างอิงโค้ดล่าสุดที่ commit/branch ระบุได้ พร้อมเชื่อมกับ Requirement/Business Rules ที่มีอยู่; เมื่อขัดแย้งต้องทำ **conflict report** ไม่ถือว่าโค้ดถูกเสมอ
- ตรวจสอบ **state transition**, data lineage, สูตรคำนวณ, authorization ทั้งเชิง UI และ API, และข้อมูลที่ปรากฏต่อ Supplier ในแต่ละสถานะ
- แยก **วิเคราะห์/สร้างแผน**, **เขียนเทส**, **รันเทส**, และ **ทบทวนผล** เพื่อไม่ให้ Agent ตัวเดียวรับรองงานตัวเอง
- Test ต้อง reproducible, isolated, มี seed/reset/cleanup, evidence และรันซ้ำใน CI/CD ได้โดยไม่จำเป็นต้องเรียก LLM ในทุก pipeline

## 2. ตัวอย่าง Golden Business Flow ที่ต้องทดสอบครบสาย

**ตัวอย่างเชิงสมมติ** (ต้องให้ Agent อ่านโค้ดจริงแล้วปรับชื่อ field, endpoint, permission และกฎธุรกิจ):

1. สร้างข้อมูลเริ่มต้นและผู้ใช้ `admin`, `supplier-A`, `supplier-B`; เตรียมสิทธิ์/role/tenant และข้อมูลทดสอบเฉพาะรอบ
2. เรียก External API (หรือ mock/recorded contract ใน CI) → ตรวจ status, schema, field, idempotency, retry และจัดเก็บใน DB
3. Admin Login → เข้าหน้าตั้งค่าที่เกี่ยวข้อง → บันทึกค่า → ตรวจว่า setting persistence/validation/effective date ถูกต้อง
4. ระบบนำข้อมูล API มารวมกับการตั้งค่า → ตรวจผลคำนวณ/ผลคัดเลือกด้วย independent test oracle
5. Admin ตรวจสอบและอนุมัติ → ยืนยัน audit, ผู้อนุมัติ, timestamp, transition และการป้องกัน approve ที่ผิดลำดับ
6. Supplier-A Login → เห็นรายการที่อนุมัติและ field ที่มีสิทธิ์เห็น; Supplier-B หรือ unauthenticated user **ต้องไม่เห็น** ทั้งผ่าน UI และ API
7. Supplier ดำเนินการขั้นตอนถัดไป (ถ้ามี) → กลับมาตรวจ Admin Portal อีกครั้งจนถึง terminal state
8. ออกรายงาน/ดาวน์โหลดเอกสาร → ตรวจค่าที่แสดงกับ source transactions, totals, filters, rounding, timezone, export contents
9. ตรวจสอบ consistency ระหว่าง UI, Backend API, Database, report และ audit log
10. Cleanup/reset ข้อมูลทดสอบ; เก็บ trace, screenshots, logs, network, correlation IDs และผลทดสอบ

**ข้อกำหนด:** อย่าจบที่ปุ่ม Approve สำเร็จ ต้องตามข้อมูลต่อไปจนถึงผู้รับปลายทางและรายงาน/ผลที่ผู้ใช้ธุรกิจคาดหวัง

## 3. สถาปัตยกรรม Agent ที่เสนอ

| Agent / Skill | หน้าที่ | Artifact ส่งต่อ | เงื่อนไขผ่าน |
|---|---|---|---|
| 1. Codebase Discovery & Trace | อ่าน frontend/backend route, controller, service, DB schema/migrations, API client, role/policy, jobs/events; ผูก symbol กับ source location/commit | `system-inventory.md`, `code-trace.json`, `source-map.md` | ระบุส่วนที่รู้/ไม่รู้พร้อมหลักฐาน; ห้ามเดา |
| 2. Business Workflow Modeler | สร้าง cross-system flow, state machine, dependency graph, data lineage และ preconditions จากโค้ด+requirement+behavior | `workflow-map.md`, `state-transitions.yaml`, `requirements-conflicts.md` | ครบ start → terminal, positive/negative/alternate paths |
| 3. Test Strategy & Coverage Planner | ทำ risk-based scenario matrix, roles, permissions, boundary, integration failure, report assertion, reset strategy | `test-plan.md`, `coverage-matrix.csv`, `test-data-plan.md` | ทุก critical business transition มี assertion และ oracle |
| 4. Test Generator | สร้าง Playwright tests, fixtures, API helpers, page/components, DB verification adapters และรายงาน | executable tests + README | เทสอ่านง่าย deterministic และไม่พึ่ง hard-coded timing |
| 5. Test Executor & Evidence Collector | รันใน isolated environment; เก็บ logs/trace/network/screenshots/report, classify flakiness | `test-results`, `evidence-manifest.json` | ผลเทสทำซ้ำได้ พร้อม reproducible steps |
| 6. Independent QA / Critical Reviewer | ตรวจว่ามี flow หายไปไหม, assertion เช็คของจริงไหม, requirement conflict, false positives, security gaps | `review-findings.md`, `coverage-gaps.md` | high-risk gaps ต้องถูกปิดหรือยอมรับเป็นลายลักษณ์อักษร |
| 7. Test Maintenance / Healer (จำกัดสิทธิ์) | เสนอแก้ selector, timing, test harness เมื่อ UI เปลี่ยน | change proposal/PR | **ห้ามแก้ expected business results, ลด assertion, หรือเปลี่ยน permission expectations เอง** |

สามารถนำ Playwright Test Agents (Planner / Generator / Healer) มาเป็นฐานในส่วน 3, 4, 7 และสร้าง Skill เฉพาะด้าน Codebase/Business/QA เพิ่มได้ ทั้งนี้ต้องตรวจสอบเวอร์ชันและวิธีติดตั้งจากเอกสารจริงก่อนใช้งาน

## 4. ความหมายของ "ครบทั้ง Flow" (Coverage Model)

อย่างน้อยต้องวัดความครอบคลุม 8 มิติ:

1. **Journey**: ตั้งแต่ trigger → prerequisite → action → hand-off → terminal outcome
2. **State**: สถานะเริ่มต้น/ระหว่างทาง/สุดท้าย, transition ที่อนุญาตและห้าม
3. **Role & Access**: Admin, Supplier แต่ละประเภท, tenant isolation, API direct access, document access
4. **Data**: field mapping, API ingestion, normalization, database persistence, data freshness, no cross-tenant leakage
5. **Business Rules**: สูตรคำนวณ, effective date, rounding, exceptions, thresholds, validations
6. **Integration**: external API timeout, failure, duplicates, retries, eventual consistency, background jobs/queues
7. **Output**: dashboard, notifications, exported reports, audit trails, supplier-visible artifacts
8. **Operational**: idempotency, concurrency/race, rollback/compensation, cleanup, reproducibility

ออกแบบ `coverage-matrix.csv` ให้ทุก row บันทึก `workflow_id, business_step, source_reference, actor, precondition, input, expected_state, UI_assertion, API_assertion, DB_assertion, report_assertion, negative_case, test_id, evidence, owner, review_status` โดยช่องที่ไม่มีเหตุผลในการทดสอบต้องบันทึกเหตุผล ไม่ปล่อยว่างโดยไม่อธิบาย

## 5. แหล่งความจริงและกติกาเมื่อข้อมูลขัดแย้ง

- **Implementation truth**: source code + branch + commit SHA + runtime configuration และ feature flags ระบุว่าระบบปัจจุบันทำอะไร
- **Business intent**: requirement, acceptance criteria, process policy, tax/accounting rules ระบุว่าควรทำอะไร
- **Observed truth**: runtime UI/API/DB/network/logs บอกว่าระบบทำอะไรจริงในสภาพแวดล้อมทดสอบ
- หากสามแหล่งไม่ตรงกัน ให้ระบุ `CONFLICT` และส่ง human owner review ห้าม Agent เปลี่ยน expected results เพื่อให้เทสผ่าน
- ถ้าไม่มีกฎธุรกิจ/expected outcome ที่น่าเชื่อถือ ให้ทำ `NEEDS_ORACLE` และออกแบบคำถามกับหลักฐานประกอบ ไม่สร้าง expected value จากผลลัพธ์ของระบบตัวเองอย่างเดียว
- เก็บ linkage `requirement → code symbol → workflow node → test case → execution evidence`

## 6. แนวทางสร้างชุดทดสอบ

- **Layer A — Unit/contract**: business logic calculations, mapping, API schemas, permissions at service level
- **Layer B — Integration**: API + database + background jobs; ใช้ testcontainers/isolated DB เมื่อเหมาะสม
- **Layer C — Full E2E**: เดินงานจริงข้ามสอง Portal ด้วย Playwright, assertions ตามแต่ละจุดเปลี่ยนสำคัญ ไม่แค่ screenshot
- **Layer D — Business acceptance**: golden paths + cross-role handoff + exported report reconciliation + regression
- ใช้ browser contexts แยกสำหรับ Admin/Supplier และผู้ใช้อื่น รวมถึง auth storage state ที่จัดการอย่างปลอดภัย
- Page Objects/Component helpers ควรเป็น abstraction เฉพาะที่จำเป็น; ใช้ accessible locators และ `expect` แบบ auto-wait แทน fixed sleeps
- ควบคุมเวลา, timezone, seed data, external service responses, event processing และ eventual consistency ให้ทดสอบซ้ำได้
- ตรวจสิทธิ์ทั้ง UI และ API; การซ่อนปุ่มไม่เท่ากับ authorization ที่ปลอดภัย
- รายงานและเอกสารที่ดาวน์โหลดต้องตรวจเนื้อหา/ยอดรวมและแถวสำคัญ ไม่ใช่ตรวจเพียงว่ามีไฟล์
- ป้องกัน secret/PII หลุดใน traces และ CI artifacts

## 7. Pipeline ที่เสนอ

**เมื่อมี Pull Request:** static analysis / unit / API-contract / targeted integration / E2E smoke ที่สำคัญ; เก็บ Playwright HTML + traces เมื่อ fail; บล็อก merge หาก critical test fail (ตาม policy ทีม)

**Nightly หรือก่อน Release:** full cross-portal business workflow suites, negative scenarios, permission matrix, report reconciliation และ concurrency/integration recovery tests

**เมื่อโค้ดเปลี่ยน:** Agent วิเคราะห์ diff → impact map → เสนอเพิ่มหรือแก้ scenario เป็น PR → Independent Reviewer ตรวจ → อนุมัติ → CI รันไฟล์เทสที่ version-controlled; ไม่ให้ LLM ปรับ expectation ขณะ CI รัน

โครงไฟล์เริ่มต้น:

```text
qa/
  skills/
    codebase-workflow-analyzer/SKILL.md
    business-e2e-planner/SKILL.md
    critical-qa-reviewer/SKILL.md
  workflows/
    workflow-map.md
    state-transitions.yaml
    requirements-conflicts.md
    coverage-matrix.csv
  playwright/
    playwright.config.ts
    tests/business-flows/
    fixtures/
    helpers/
  reports/
    review-findings.md
```

## 8. Acceptance Criteria ของโครงการ Skill

ถือว่า Pilot สำเร็จเมื่อ:

- AI สร้างแผนผังหนึ่ง business workflow สำคัญจากโค้ดปัจจุบันพร้อม source references/commit ได้
- แผนผังอธิบายกิจกรรมต่อเนื่องทั้ง Admin → API/DB → Supplier → Admin/Report ถึง terminal outcome
- มี scenario matrix ที่ทดสอบ success, reject, permission denial, API failure และ rerun/idempotency
- สร้าง Playwright tests ที่รันจริงใน CI ด้วย test data isolated และมี assertions ข้าม UI/API/DB/report
- เมื่อลองเปลี่ยน business rule หรือ permission โดยตั้งใจ test ที่ควร fail ต้อง fail (mutation/negative validation)
- มี independent reviewer รายงาน gap; ไม่มี critical gap ที่ไม่ถูกอธิบาย
- Test report ชี้ได้ชัดว่าขั้นตอนไหนผิด, expected/actual อะไร, แหล่งหลักฐานไหน, ใช้ test data ชุดใด

## 9. Prompt สำหรับส่งต่อให้ Soul / Asta / Independent Architect Agent

> คุณทำหน้าที่เป็น **Principal QA Architect, Business Process Analyst และ Adversarial Reviewer** ตรวจทานเอกสารนี้อย่างเข้มงวด เป้าหมายไม่ใช่เพียง E2E ของหน้าเว็บ แต่คือการรับประกันความครอบคลุมของ **business workflow ต่อเนื่องทั้งระบบ** ระหว่าง Admin Portal, Supplier Portal, External API, Backend, Database, Authorization และ Reports โดยอิง source code ปัจจุบันซึ่งอาจต่างจาก requirement เก่า
>
> โปรดตรวจว่าแผนนี้มีช่องโหว่อะไรที่จะทำให้ AI ทดสอบได้แค่หน้าจอแต่พลาด flow ที่ซับซ้อน, branch, asynchronous work, สิทธิ์ข้าม tenant, data consistency, state transition, reconciliation, test oracle หรือ regression หรือไม่
>
> ส่งผลลัพธ์เป็น: (1) Critical/High/Medium gaps พร้อมเหตุผลและตัวอย่าง, (2) Agent/Skill responsibilities ที่ควรเพิ่ม ลด หรือรวม, (3) Workflow discovery algorithm จาก code → dependency graph → scenario, (4) รูปแบบ artifacts และ traceability, (5) กลยุทธ์ deterministic test/fixture/isolation/cleanup, (6) วิธีตรวจว่า *ครอบคลุมทั้ง flow จริง* ด้วย coverage metrics และ mutation testing, (7) ความเสี่ยงเรื่องค่า token/เวลารันและแนวทาง CI/CD, (8) revised architecture และ **พร้อมร่าง SKILL.md ที่พร้อมนำไปติดตั้งใช้จริง**
>
> **อย่าถือว่าแผนนี้ถูกอยู่แล้ว** โปรดโต้แย้งสมมติฐานที่ยังไม่มีหลักฐาน และแยกสิ่งที่ทำได้ทันที สิ่งที่ต้องเขียนเพิ่ม และสิ่งที่ต้องขอรายละเอียดจากเจ้าของระบบอย่างชัดเจน

## 10. ประเด็นให้ Reviewer ตัดสินใจ

1. ควรใช้ Agent แยกสำหรับ source-code discovery, workflow modeling, scenario planning และ verification หรือรวมบางตัวเพื่อลดค่าใช้จ่าย?
2. จะค้นหา workflow จาก event/queue/job/background service และ cross-repo ได้อย่างไรโดยไม่หลงทาง?
3. จะทราบได้อย่างไรว่า flow ไหนยังไม่ถูกค้นพบ (unknown unknowns)? ควรวัด state/transition/role/branch coverage แบบใด?
4. จะป้องกัน AI สร้าง assertion จาก code bug เดิมและทำให้เกิด false pass อย่างไร?
5. ควรกำหนด golden data, environment, external API mock vs live contract, concurrent execution และ cleanup อย่างไร?
6. จะจับ discrepancy ระหว่าง requirement เก่ากับ deployed behavior อย่างไร และใครมีสิทธิ์ตัดสิน expectation?
7. จะพิสูจน์ permission isolation ต่อ Supplier รายอื่นและการเข้าถึงโดยตรงผ่าน API/URL อย่างไร?
8. มีกรณี tax/financial reporting ที่ต้องใช้ independent calculation oracle, rounding rules, period cutoffs หรือไม่?
9. จะสร้าง test impact analysis เมื่อ source code diff เปลี่ยนเฉพาะบางโมดูลอย่างไร?
10. เกณฑ์อนุมัติว่า Skill พร้อมเข้าสู่ production CI/CD คืออะไร?

---

**ข้อจำกัดของเอกสารนี้:** เป็น blueprint สำหรับให้ AI ตัวอื่น review ไม่ใช่ผลวิเคราะห์โค้ดของระบบจริง ยังไม่ได้ตรวจ repository, endpoints, schema, permission, external integration หรือ report ของโครงการจริง จึงต้องทำ discovery ก่อนสรุปว่า workflow ใดครบถ้วน

# คู่มือ Bot ของ Orca สำหรับ mflow: ใครทำงานอะไร และเปลี่ยนเองอย่างไร

ใช้กับ mflow 0.62.9 ขึ้นไป เขียนเมื่อ 2026-11-28 ค่าในตัวอย่างเป็นค่าจริงของเครื่องนี้ (`D:\orca`, โปรเจกต์ ThawSi)

## 1. ภาพรวม: 3 ชั้น

```
Bot ใน Orca (ตัวสั่งงาน)          automation ของโปรเจกต์ (ตัวทำงาน)        ผลงาน
mflow-sync   ตื่น :00 :10 …  ──►  mflow sync   ThawSi claude   ──►  batch + draft PR
mflow-test   ตื่น :02 :12 …  ──►  mflow test   ThawSi codex    ──►  record ของ test
mflow-review ตื่น :04 :14 …  ──►  mflow review ThawSi claude   ──►  รายงาน review
mflow-e2e    ตื่น :06 :16 …  ──►  mflow e2e    ThawSi claude   ──►  E2E test + record
mflow-fix    ตื่น :08 :18 …  ──►  mflow fix    ThawSi claude   ──►  commit แก้โค้ด
```

- **Bot** (5 ตัวในแถบ Bots) ตื่นทุก 10 นาที **เฉพาะเมื่อมีงาน** (precheck `due`) แล้วสั่ง automation ของโปรเจกต์ที่มีงานพร้อม (`dispatch`) และปิด terminal ของรอบที่จบแล้ว (`cleanup`) Bot ไม่ได้ทำงานเอง เพราะ Bot รันในโฟลเดอร์ของตัวเองซึ่งไม่มี mflow
- **automation ของโปรเจกต์** (หน้า Automations ชื่อ `mflow <งาน> <โปรเจกต์> <agent>`) **ปิดไว้เสมอ** Bot เป็นคนสั่งรัน ทำงานใน checkout ของโปรเจกต์ด้วย agent, model, effort ที่ตั้งไว้
- **ไฟล์ตั้งค่าเดียว** `D:\orca\bots.json` แก้แล้วรัน `apply` Orca จะตรงกับไฟล์

กติกา: ในโปรเจกต์เดียวทำทีละงาน ถ้ามีหลายชนิดพร้อมพร้อมกัน ลำดับคือ **fix → test → e2e → review → sync** (fix ก่อนเพราะเปลี่ยนโค้ดที่ review ถัดไปจะอ่าน) และเมื่องานหนึ่งจบ งานถัดไปของโปรเจกต์นั้นเริ่มทันที ไม่ต้องรอรอบของ Bot ข้ามโปรเจกต์ทำพร้อมกันได้ (งานหนัก test/e2e/fix ไม่เกิน `maxHeavy` = 3, งานเบา review/sync ไม่เกิน `maxLight` = 6) agent ที่ใช้โควตาเกิน 85% หยุดรับงาน ถ้าอ่านโควตาไม่ได้ จำกัด 12 งานต่อ 5 ชั่วโมงต่อ agent

## 2. ตอนนี้ใครทำงานอะไร

### งานในโปรเจกต์ ThawSi

| งาน | ทำอะไร | Agent | Model ที่ใช้จริง | Effort |
|---|---|---|---|---|
| sync | ใส่ change ที่ merge เข้า main ลง batch, เปิด draft PR, merge PR ที่ผ่านตามกติกา (ข้อ 6) | claude | `opus` (Opus 5.5) | low |
| test | test ทั้งชุด (T1) และ test since หลัง fix (S) | **codex** | `sol` → `gpt-6.2-sol` | **high** |
| review | review ทีละ change และงานรวมผล review | claude | `opus` (Opus 5.5) | high |
| e2e | เขียน E2E test ของจอ (EW) แล้วรัน (E) | claude | `opus` (Opus 5.5) | medium |
| fix | แก้ตาม review ที่ไม่ผ่าน หรือ test/E2E ที่ล้ม | claude | `opus` (Opus 5.5) | high |

ช่อง Model: ค่าที่ตั้งใน `bots.json` (ลบ `model` ออก = ใช้ model เริ่มต้นของ agent) และรายงานใน chat ของ Bot บอก model ที่ใช้จริงจาก log ของ agent

### Bot (ตัวสั่งงาน)

ทั้ง 5 ตัว: **agy (antigravity)** model **`gemini-4-hydrogen-low`** (Gemini 4 Hydrogen, Low) ตั้งที่ส่วน `bots` ของ `bots.json`

### Bot ตำรา

"Tamra digest of agent runs": claude effort low ทุกวัน 06:00 บันทึกสรุปงานของวันก่อนลง Tamra space `shared` ตั้งที่ `D:\orca\tamra-bot.json`

## 3. test ทำงานอย่างไร

1. merge feature เข้า main → แถวของ change ขึ้นใน `docs/reviews/pending.md`
2. **mflow-sync** ตื่น เห็นว่ามี change รอ → สั่ง `mflow sync ThawSi claude` → สร้าง branch `checks/<วันที่>-<n>`, worktree, checklist และ draft PR
3. **mflow-test** ตื่น เห็นงาน T1 → สั่ง `mflow test ThawSi codex` → Codex (effort high) ใช้ skill `mflow-test-pr`: รัน build, format, lint และ test ทั้งชุดใน worktree ของ batch, เขียน record `docs/reviews/tests/<วันที่>-<commit>.md`, commit และ push
4. ผล:
   - **ผ่าน**: เกิดงาน review (R1…) และ E2E (EW1…) ให้ Bot ตัวอื่นหยิบต่อ
   - **ล้ม**: เกิดงาน fix (F) → fix แล้วเกิด test since (S) ซึ่ง mflow-test หยิบอีกครั้ง วนได้สูงสุด 3 รอบ
5. ทุกงานบันทึกลง `D:\orca\runs.jsonl` (agent, model, effort, กี่นาที, ผล)

## 4. วิธีเปลี่ยนเอง

### 4.1 เปลี่ยน agent / model / effort ของงาน

1. เปิด `D:\orca\bots.json` แก้ในโปรเจกต์และงานที่ต้องการ

   ```json
   "ThawSi": {
     "path": "D:\\GitHub\\ThawSi",
     "kinds": {
       "test":   { "agent": "codex",  "model": "sol",  "effort": "high" },
       "review": { "agent": "claude", "model": "opus", "effort": "high" }
     }
   }
   ```

   - `agent`: `claude`, `codex` หรือ `antigravity`
   - `model`: ไม่ใส่ = ค่าเริ่มต้นของ agent
     - claude: ชื่อย่อ `opus`, `sonnet`, `haiku` หรือชื่อเต็ม เช่น `claude-opus-5-5`
     - codex: ชื่อเต็ม เช่น `gpt-6.2-sol` หรือ**ชื่อย่อ** เช่น `sol`, `astra`, `terra` ซึ่ง `apply` แปลงเป็นรุ่นใหม่สุดในรายการ model ของ Codex บนเครื่อง (`sol` → `gpt-6.2-sol`) ชื่อที่ไม่มีจะขึ้นใน `warnings`
     - antigravity: ชื่อเต็มจาก `agy models` เช่น `gemini-4-hydrogen-medium`
   - `effort`: `low`, `medium`, `high`, `xhigh` (agy มีระดับอยู่ในชื่อ model แล้ว ไม่ต้องใส่)
   - review หลายคน: `"review": [{ "agent": "claude" }, { "agent": "codex" }]`
2. รัน (พิมพ์ใน Claude Code โดยมี `!` นำหน้า หรือใน terminal):

   ```
   node D:/ProjectClaude/mflow-marketplace/plugins/mflow/scripts/bots.mjs apply --home D:/orca
   ```

   ผลบอกว่า `created` (สร้าง), `updated` (อัปเดต), `removed` (ลบตัวที่ไม่อยู่ในไฟล์แล้ว) และ `warnings`
3. อ่าน `warnings` ทุกครั้ง ถ้ามีคำเตือนเรื่อง `checks.route` ทำตามข้อ 4.2

### 4.2 agent ต้องตรงกับ route ของโปรเจกต์

แต่ละงานใน batch ระบุว่าเป็นของ agent ไหน ตาม `checks.route` ใน `.mflow/config.json` ของโปรเจกต์ ThawSi ใช้ค่าเริ่มต้น (`"checks": {}`) คือ:

| งาน | route เริ่มต้น |
|---|---|
| test | `any` (ใครก็ได้) |
| review, review-merge, fix, e2e | `claude` |

เปลี่ยน agent ของ review, fix หรือ e2e ต้องแก้ 2 ที่ให้ตรงกัน เช่น ให้ codex ทำ fix:

1. `D:\GitHub\ThawSi\.mflow\config.json` → `"checks": { "route": { "fix": "codex" } }`
2. `D:\orca\bots.json` → `"fix": { "agent": "codex", "effort": "high" }`
3. รัน `apply`

ข้อจำกัด: E2E ให้ได้ claude, codex หรือ antigravity (0.63.0) claude กับ codex มี hook กัน browser เกิน ส่วน antigravity ไม่มี hook งานของมันจึงบอกให้ใส่ `--workers` ไม่เกิน `e2eMaxWorkers` เอง ให้ตั้ง `workers: 2` ใน `playwright.config` ของโปรเจกต์ไว้ด้วย; OpenCode รับแค่ review ชื่อ model ของ antigravity ใช้ตามที่ `agy models` แสดง เช่น `gemini-4-neon-medium`

**review หลัง fix (`reviewAfterFix`):** review ที่ reviewer เป็นคนเขียนโค้ดเอง (Reviewer = Author) ไม่นับเป็นเงื่อนไข merge ถ้า fix กับ review เป็น agent เดียวกัน ให้ตั้ง `"reviewAfterFix": "claude"` ใน route (review รอบสั้นหลัง fix ไปที่ claude) และเพิ่ม review bot ของ claude ใน `bots.json` (`"review": [{ "agent": "codex", … }, { "agent": "claude", … }]`) แล้ว `apply` ThawSi ตั้งไว้แบบนี้แล้ว

### 4.3 ย้ายงานเดียว

ใน checkout ของโปรเจกต์: `node <plugin>/scripts/checks.mjs assign R5 codex` (ต้องมี bot ของงานนั้นสำหรับ codex ใน `bots.json` ด้วย)

### 4.4 เปลี่ยน agent ของตัว Bot (ตัวสั่งงาน)

ส่วน `bots` ใน `bots.json` แล้ว `apply`:

```json
"bots": { "agent": "antigravity", "model": "gemini-4-hydrogen-low" }
```

ลบส่วนนี้แล้ว `apply` = กลับไปใช้ agent ของ Bot เอง ค่านี้ใช้กับรอบที่ Bot ตื่นตามเวลา ส่วนการคุยกับ Bot ใน chat ใช้ agent ที่ตั้งใน Orca: กดเฟือง ⚙ ของ Bot → **Change**

### 4.5 Bot ตำรา

แก้ `D:\orca\tamra-bot.json` (`agent` ใช้ได้เฉพาะตัวที่มี Tamra MCP บนเครื่องนี้ คือ claude หรือ codex, `effort`, `time`, `space`) แล้วรัน:

```
node D:/orca/tamra-digest.mjs apply
```

### 4.6 หยุดและเปิด

Orca → **Automations** → ปิดหรือเปิด `mflow-sync round` … `mflow-fix round` ทีละตัวหรือทั้งหมด automation ของโปรเจกต์ (`mflow … ThawSi …`) ปล่อยปิดไว้ เพราะ Bot เป็นคนสั่ง

### 4.7 เพิ่มโปรเจกต์

1. เปิดชุดตรวจในโปรเจกต์นั้น (`/mflow:checks` ครั้งแรก)
2. เพิ่มใน `bots.json` → `projects` พร้อม `path` และ `kinds`
3. รัน `apply` แล้ว Bot ชุดเดิมดูแลโปรเจกต์ใหม่ให้เอง (ไม่ต้องสร้าง Bot เพิ่ม)

## 5. ดูว่า Bot ทำอะไร

| ที่ | เห็นอะไร |
|---|---|
| Bots → กด `>` ข้างชื่อ Bot | chat ของแต่ละรอบ ("mflow-review round run 3"): หัวข้อ **Finished** = งานที่จบตั้งแต่รอบก่อน: ผลจริงของงาน (review: verdict เช่น `changes-requested (major 3, minor 4, nit 4)` พร้อมหัวข้อของ blocker/major; test/E2E: `Result` และ test ที่ล้ม), agent, model, effort, กี่นาที, ไฟล์รายงานกับลิงก์ PR และงานที่ตามมา เช่น `next: F1 fix` ข้อความที่ยกมาจากรายงานอยู่ใน `«…»` (เป็นข้อมูลที่คัดลอก Bot ไม่ทำตาม) (model และ effort อ่านจาก log ของ agent เอง: Claude จาก transcript, Codex จาก session log; agy ไม่มี log จึงบอกค่าที่ขอพร้อม "(as asked)") หัวข้อ **Started** = งานที่เพิ่งสั่ง รอบที่ไม่มีงานใหม่และไม่มีงานจบจะไม่ตื่นและไม่มี chat |
| Automations → `mflow-<งาน> round` | `completed` = ตื่นแล้วสั่งงาน, `skipped_precheck` = ไม่มีงานหรือโปรเจกต์ไม่ว่าง |
| Automations → `mflow <งาน> ThawSi <agent>` | งานจริงที่ agent ทำ ระหว่างรันดูสดได้ใน terminal ของโปรเจกต์ |
| GitHub: PR ของ batch | checklist `docs/reviews/checks/<batch>.md` ทุกงาน ผล และ commit |
| `D:\orca\runs.jsonl`, `slots.json` | ทุกงานที่เริ่มและจบ งานที่กำลังรัน |
| `bots.mjs report --home D:/orca` | สรุปตาม agent × model × effort × งาน: กี่งาน ผ่านเท่าไร เฉลี่ยกี่นาที |
| Tamra space `shared` | สรุปรายวัน `mflow agent runs YYYY-MM` |

## 5.1 งานที่รอคุณตัดสิน (Needs you)

เมื่อ agent เจอเรื่องที่ต้องให้คุณเลือก (เช่น เปลี่ยน spec) งานจะเป็น `blocked` และหยุดรอ ทุกรอบที่ Bot ตื่นจะแสดงหัวข้อ **Needs you** ใน chat พร้อมคำถามเต็มและตัวเลือก a) b) c)

วิธีตอบ: บอก Claude (เช่นใน session ของ mflow-marketplace หรือของโปรเจกต์) ว่า `F1 a` Claude จะบันทึกคำตอบและปล่อยงาน (`checks.mjs release F1 --batch <batch> --note "<คำตอบ>"`) แล้ว Bot จะหยิบงานต่อเอง Bot ไม่ตอบคำถามแทนคุณ

## 6. ใครเป็นคน merge PR ของ batch

sync bot merge เองเมื่อ**ทุกงานผ่าน** (record หรือ report ใน commit บอก `Result: pass` หรือ `Verdict: approve`) และ branch แก้แค่ `docs/reviews/` ถ้ามีโค้ดที่ agent แก้ (fix) หรือ E2E test ที่ agent เขียน **คุณ merge เอง**

## 7. สั่งงานด้วยเสียง

ช่องพิมพ์ของ Orca มีปุ่มไมโครโฟน ซึ่งเป็นความสามารถของ Orca (พูดแล้วแปลงเป็นข้อความก่อนส่ง) จึงใช้ได้กับ Bot ทุกตัว ไม่ขึ้นกับ agent หรือ model ที่ Bot ใช้ ตัว agy CLI และ `orca automations` ไม่มีตัวเลือกเรื่องเสียง และผมยังไม่ได้ยืนยันว่า Hydrogen รับเสียงโดยตรง เมื่อพูดใน chat ของ Bot คำสั่งจะไปที่ agent ที่ตั้งใน Orca สำหรับ chat (ข้อ 4.4 ส่วนท้าย) ไม่ใช่ค่าใน `bots.json`

ตัวอย่างที่พูดกับ Bot ได้: "รัน dispatch ของ review ตอนนี้", "มีงานอะไรค้างบ้าง" (Bot จะเรียก `bots.mjs` ให้)

## 8. ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / แก้ |
|---|---|
| Bot ไม่มีข้อความใน chat | ยังไม่ถึงรอบ หรือทุกรอบ `skipped_precheck` (ไม่มีงาน / โปรเจกต์ไม่ว่าง) |
| งานค้างไม่มีใครหยิบ | agent ใน `bots.json` ไม่ตรงกับ `checks.route` ดู `warnings` ของ `apply` |
| แก้ `bots.json` แล้วไม่มีผล | ยังไม่ได้รัน `apply` |
| Claude หยุดรับงาน / Bot ไม่ทำงานทั้งที่มีงาน | ครบ 12 งานใน 5 ชั่วโมง (เมื่ออ่านโควตาจริงไม่ได้) หรือโควตาเกิน 85% ดูเหตุผลด้วย `bots.mjs due --home D:/orca --kind fix` และ `bots.mjs usage --home D:/orca`; แก้: เพิ่ม `usage.maxJobsPer5h.claude` ใน `bots.json` หรือเติม `claude-snapshot` ใน statusline ให้คุมด้วยโควตาจริง |
| Codex ค้างที่ "Hooks need review: N hooks are new or changed" (run ขึ้น `dispatch_failed`) | Codex ถือว่า hook ของปลั๊กอินเปลี่ยนเมื่อไฟล์ใดในปลั๊กอินเปลี่ยน (hash ของทั้งปลั๊กอิน) บนเครื่องนี้ Codex จึงอ่าน mflow จาก branch `codex-stable` (`codex plugin marketplace add https://github.com/mounchons/mflow-marketplace.git --ref codex-stable`) การ push ขึ้น main ไม่ทำให้ถามอีก เลื่อน `codex-stable` (`git push origin <commit>:codex-stable`) เฉพาะเมื่อ hook หรือสคริปต์ของ hook เปลี่ยน แล้วกด 2 (Trust all) ครั้งเดียว |
| review ของโปรเจกต์ยังใช้ช่วงของ change ผิด | ปลั๊กอิน mflow ในโปรเจกต์ยังเก่า อัปเดตด้วย `/plugin` |

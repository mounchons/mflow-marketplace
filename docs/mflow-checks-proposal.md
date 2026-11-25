# ข้อเสนอ: ให้ agent หลายตัวช่วย test, review, e2e หลัง merge (`/mflow:checks`)

เขียนเมื่อ 2026-11-26 จาก mflow 0.54.0 (`64c2315`) สถานะ: **ข้อเสนอ ยังไม่ได้สร้าง** คำตอบของผู้ใช้อยู่ในข้อ 2

## 1. ปัญหา

กลางวันผู้ใช้สั่ง `/mflow:*` และ `/opsx:apply` แต่ละ change แตก `feat/<change>` แล้ว merge เข้า `main` ทันที (ตัวเลือก b ของ 0.54.0) แล้วทำ change ต่อไป แถวใน `docs/reviews/pending.md` จึงสะสมโดยยังไม่มี test, review, e2e

ผู้ใช้ต้องการให้ agent อื่น (Codex, agy, Claude ทั้งในเครื่องและบน cloud) มาทำส่วนนั้นตอนกลางคืน หรือกลางวันเมื่องานด่วน โดย:
- มี PR ไว้ตรวจ เป็นชุดของ change ที่ merge แล้ว
- ติดตามงานในไฟล์ เป็น checklist ของแต่ละ test, review, e2e
- แบ่งงานครั้งละพอประมาณ ไม่ให้ usage limit หมดกลางทาง
- เลือก agent ต่องานได้ เช่น test1 ให้ codex, test2 ให้ agy แต่ test ทำทีละงาน
- review ช่วยกันได้ เช่น review1 claude, review2 claude + codex, review3 agy + claude

ของที่มีอยู่และใช้ต่อ: `pending.md` และ `pending.mjs` (Test, Review ต่อ change), skill `mflow-test`, `mflow-review`, `mflow-e2e` ของ Codex และ agy ใน `.agents/skills/` (0.33, 0.48), `results.mjs` (0.54), `/mflow:night` (Claude ทำทั้งสายคนเดียว), `/mflow:delegate` และ registry ของ tool ใน `lib.mjs` ส่วน `mflow-factory-proposal.md` ข้อ 3, 4 และ 8 วางกล่อง QA, Review, E2E ไว้แล้วแต่ยังไม่ได้สร้าง ข้อเสนอนี้คือกล่องสามกล่องนั้น ทำให้ใช้ได้ก่อนตัว factory

## 2. คำตอบของผู้ใช้ (2026-11-26)

| ข้อ | คำถาม | คำตอบ |
|---|---|---|
| 1 | PR คืออะไร | a) PR ตรวจหลัง merge: branch `checks/<batch>` จาก `main` ไป `main` ใน PR มี checklist ผลตรวจ และ commit แก้ ผู้ใช้ merge PR = รับผลตรวจ ให้ push `checks/*` และเปิด PR ได้เสมอ แต่ไม่ merge |
| 2 | ชุดนับอย่างไร | a) สะสมจนเริ่มตรวจ: มีชุดที่เปิดอยู่ได้ชุดเดียว ทุก merge เพิ่ม change ลงชุดนั้น ชุดถูกตรึง commit เมื่อ agent หยิบงานแรก merge หลังจากนั้นไปชุดถัดไป |
| 3 | agent เริ่มงานและ commit อย่างไร | c) มีทั้งตัวรันที่ผู้ใช้เปิด (กลางคืน) และ `$mflow-checks` ใน tool (งานด่วน) **และใช้ Codex cloud, agy cloud, Claude Code web ด้วย** |
| 4 | มอบงานอย่างไร | a) ค่าเริ่มต้นใน `.mflow/config.json` แล้วผู้ใช้สั่งเปลี่ยนเป็นคำพูด Claude แก้ไฟล์ให้ |
| 5 | review หลายคนรวมผลอย่างไร | a) งานรวมผลแยกต่างหาก (ค่าเริ่มต้น claude) ตรวจข้อที่พบกับโค้ดจริงแบบ `/mflow:assess` แล้ว tick `pending.md` ครั้งเดียว |
| 6 | มีงานแก้ไหม | a) มีอัตโนมัติ: test ล้มหรือพบ blocker หรือ major จะเกิดงาน fix แล้ว test since และ review สั้นตามมา สูงสุด 3 รอบ ข้อที่ต้องให้ผู้ใช้ตัดสินไม่แก้เอง |
| 7 | E2E รออะไร (ผู้ใช้ย้ำให้มีส่วน E2E) | a) รอ test ทุก part ผ่าน ไม่รอ review E2E กับ review จึงทำพร้อมกันได้ จอที่ fix แตะทีหลังรัน E2E ใหม่ (ข้อ 10.5) |

## 3. ภาพรวม

```
กลางวัน (ผู้ใช้ + Claude)                    กลางคืน / งานด่วน (agent ใดก็ได้)
feat/a ─merge─┐
feat/b ─merge─┼─ main ──────────────────────────────────────────●  ← ผู้ใช้ merge PR
              │                                                  │
              └─ checks/2026-11-26-1 ── ตรึงที่ abc123 ── ผลตรวจ ── fix ──┘
                 docs/reviews/checks/2026-11-26-1.md (checklist)
                 PR #42 (draft) checks/2026-11-26-1 → main

  T1 test part api        codex     ✔        R1 review a        claude      ✔
  T2 test part integ-1    agy       กำลังทำ   R2a review b       claude      ✔
  E1 e2e จอ Approvals     claude    รอ T*     R2b review b       codex       ✔
  F1 fix R2 ข้อ 1-3       claude    รอ R2     R2 รวมผล b         claude      รอ R2a R2b
```

## 4. ชุดและ PR

**เปิดและเพิ่ม** ทุกครั้งที่ merge เข้า `main` (จบ apply แบบ b, `/mflow:worktree merge`, หรือผู้ใช้ merge เองแล้วบอก) Claude รัน `checks.mjs add <change>`:
- ไม่มีชุดที่เปิดอยู่: สร้าง `checks/<YYYY-MM-DD>-<n>` จาก `main`, commit checklist, `git push -u`, `gh pr create --draft --base main` หัวเรื่อง `checks: <batch> (<n> changes)` เนื้อหา PR สร้างจาก checklist
- มีชุดที่ยังไม่ตรึง: `git merge main` เข้า branch ชุด เพิ่มแถวของ change แล้ว push และแก้เนื้อหา PR
- ชุดที่ตรึงแล้ว: เปิดชุดใหม่ตามข้อแรก

**ตรึง** เมื่อมีงานแรกถูกหยิบ บรรทัด `Pinned: <commit>` เขียนลง checklist test ทุก part รันบน commit นั้น งาน fix ต่อ commit บน branch ชุด แล้ว test since จาก commit ที่ตรึง

**สิ่งที่อยู่บน branch ชุด** checklist, record ของ test, รายงาน review, ติ๊กใน `pending.md` (ไฟล์นี้ merge แบบ union อยู่แล้ว), test E2E ที่เขียนเพิ่ม และ commit ของ fix ห้ามแก้ `STATUS.md` บน branch ชุด แบบเดียวกับใน worktree (0.53.0) สรุปสถานะอยู่ใน checklist และ Claude เขียน `STATUS.md` บน `main` ตอนผู้ใช้ merge PR

**ในเครื่อง** งานทำใน worktree `.claude/worktrees/checks-<batch>` บน branch ชุด โฟลเดอร์หลักจึงว่างให้ merge ระหว่างวันได้ ข้อห้าม merge ระหว่าง test ของ 0.53.1 ไม่ต้องใช้แล้ว เพราะ test ไม่ได้รันในโฟลเดอร์หลัก

**จบชุด** เมื่อทุกงาน `done` หรือ `needs-you` แล้ว PR เปลี่ยนจาก draft เป็นพร้อม merge Claude ถามบรรทัดเดียวในครั้งถัดไปที่ผู้ใช้อยู่ ไม่ merge เอง

## 5. Checklist

`docs/reviews/checks/<batch>.md` อยู่บน branch ชุด เป็นที่เดียวที่ทุก agent อ่านและเขียน (agent บน cloud เห็นแค่ไฟล์ใน repo)

```markdown
# Checks 2026-11-26-1
Branch: checks/2026-11-26-1 · PR: #42 · Pinned: abc1234 (2026-11-26 19:05) · Changes: team-lead-approval, billing-team

| Job | Kind | Target | Size | Agent | Where | State | Result |
|---|---|---|---|---|---|---|---|
| T1 | test | part api-unit | ~6 min | codex | local | done codex 01:10 | docs/reviews/tests/…-api-unit.md pass 412 |
| T2 | test | part integration-1 | ~8 min | agy | local | running agy 01:20 | |
| R1 | review | team-lead-approval | 420 lines | claude | local | open | |
| R2a | review | billing-team | 380 lines | claude | cloud | done claude 22:40 | docs/reviews/code/…-billing-team-claude.md changes-requested |
| R2b | review | billing-team | 380 lines | codex | cloud | done codex 23:05 | docs/reviews/code/…-billing-team-codex.md approve |
| R2 | review-merge | billing-team | | claude | any | waits R2a R2b | |
| EW1 | e2e-write | screen Approvals | 1 screen | claude | local | waits T1 T2 | |
| E1 | e2e | screen Approvals | 1 screen | claude | local | waits EW1 | |
| F1 | fix | R2 | | claude | local | waits R2 | |
```

- **State:** `open`, `waits <jobs>`, `running <tool> <time>`, `done <tool> <time>`, `failed`, `stopped` (ครบรอบ), `needs-you` (ต้องให้ผู้ใช้ตัดสิน คำถามมีเลขข้อและตัวเลือก a) b) c))
- `checks.mjs` เป็นตัวเดียวที่แก้ตาราง (`claim`, `done`, `fail`, `release`) agent ไม่แก้ด้วยมือ ผู้ใช้แก้ช่อง Agent เองได้
- `pending.md` ยังเป็นที่ tick Test และ Review ตามเดิม checklist คือการแบ่งงาน

## 6. ขนาดงานและ usage limit

ไม่มี tool ไหนอ่านโควตาที่เหลือได้ จึงคุมด้วยขนาดงานและจำนวนงานต่อรอบ:

| งาน | ขนาดหนึ่งงาน |
|---|---|
| test | หนึ่ง part จาก `- Test parts:` (ไม่เกินราว 8 นาที ตามที่ `/mflow:test` แบ่งอยู่แล้ว) |
| review | หนึ่ง change ถ้าส่วนต่างเกินราว 800 บรรทัด แบ่งเป็นกลุ่มไฟล์ (R3.1, R3.2) แล้วงานรวมผลปิด |
| e2e | หนึ่งจอ `--workers` ไม่เกิน `e2eMaxWorkers` |
| fix | ข้อที่พบของรายงานเดียว หรือที่ล้มของ part เดียว |
| review-merge | หนึ่ง change |

- ตัวรันหยุดหลังครบ `--jobs` (ค่าเริ่มต้น 2 ต่อ tool ต่อรอบ) หรือถึง `--until HH:MM`
- tool ตอบว่าติด usage limit หรือ rate limit: งานนั้นกลับเป็น `open` พร้อมหมายเหตุ `limit` แล้วตัวรันของ tool นั้นหยุด tool อื่นยังทำต่อ
- งานที่ `running` นานเกิน 2 เท่าของขนาด (หรือ 60 นาทีเมื่อไม่รู้ขนาด) ถือว่าค้าง หยิบใหม่ได้ เพราะ session ที่ถูกตัดไม่ได้ปล่อยงานคืน
- ค่าทั้งหมดอยู่ใน `.mflow/config.json` แก้ได้

## 7. ช่องทาง (lane) และการทำทีละงาน

| ช่อง | งาน | พร้อมกัน |
|---|---|---|
| หนัก | test, e2e, และ test ของ fix | ทีละงานต่อเครื่อง เพราะใช้ฐานข้อมูล port Docker และ browser ร่วมกัน (เครื่องเคยค้างตอน E2E เต็มชุด) |
| เบา | review, review-merge | หลายงานพร้อมกันได้ เพราะอ่านอย่างเดียวและเขียนรายงานคนละไฟล์ |
| fix | fix | ทีละงานต่อชุด เพราะ commit บน branch เดียวกัน |

"ต่อเครื่อง": งานบน cloud อยู่คนละเครื่อง จึงไม่ติดช่องหนักของเครื่องผู้ใช้ ในเครื่อง lock อยู่ใน `git rev-parse --git-common-dir`/mflow/checks.lock ทุก worktree และทุกตัวรันเห็นไฟล์เดียวกัน

ลำดับ: test ทุก part ก่อน แล้ว review (review ใช้ record ของ test เป็นหลักฐาน ตาม `/mflow:review` ข้อ 2) และ e2e หลัง test ผ่าน การแบ่งนี้ทำให้ test1 ให้ codex และ test2 ให้ agy ได้ แต่ไม่รันพร้อมกันในเครื่องเดียว

## 8. มอบงาน

ค่าเริ่มต้นใน `.mflow/config.json`:

```json
"checks": {
  "route": {
    "test": "any", "review": ["claude"], "review-merge": "claude",
    "e2e": "claude", "fix": "claude"
  },
  "jobsPerRun": 2, "rounds": 3, "reviewSplitLines": 800
}
```

- ผู้ใช้สั่งเป็นคำพูด เช่น "test2 ให้ agy", "review3 ให้ agy กับ claude", "R1 ส่ง cloud" Claude แก้ checklist และ commit บน branch ชุด
- review ที่มีหลายคนแตกเป็น R2a, R2b ต่อคน และงาน R2 รวมผลที่รอทุกคน
- กติกาเดิมที่ยังใช้: review ของ tool ที่เขียนโค้ดนั้นเอง (Reviewer = Author) ไม่นับ ถ้า route ทำให้เกิด self-review Claude บอกในบรรทัดเดียวตอนมอบ E2E ให้ได้เฉพาะ tool ที่มีตัวกัน browser: claude และ codex ที่เปิด hook ใน `.codex/hooks.json` แล้ว agy ยังไม่มีตัวกัน จึงไม่รับ e2e

## 9. ช่องทางให้ agent ทำงาน

| ช่องทาง | เริ่มอย่างไร | commit และ push |
|---|---|---|
| **ตัวรัน (กลางคืน)** | ผู้ใช้รันบรรทัดเดียวต่อ tool เช่น `node <plugin>/scripts/checks.mjs run --as codex --jobs 2` ในโฟลเดอร์โปรเจกต์ Claude บอกบรรทัดนี้เมื่อชุดพร้อม | script หยิบงานทีละงาน เรียก `codex exec`, agy แบบ headless หรือ `claude -p` ตามงาน เมื่อ tool จบ script ซึ่งอยู่นอก sandbox เลือกไฟล์ผลเอง commit เอง (เหมือน `results.mjs commit` แต่ไม่ต้องใช้ model) แล้ว push branch ชุด |
| **ใน tool (งานด่วน)** | ผู้ใช้เปิด Codex หรือ agy แล้วพิมพ์ `$mflow-checks` (Claude Code: `/mflow:checks next`) ได้งานถัดไปที่มอบให้ tool นั้น หนึ่งงานต่อครั้ง | Claude Code commit เอง ส่วน Codex และ agy ใช้ทางของ 0.54.0 (`claude -p --model sonnet` ที่ล็อกสิทธิ์ หรือ briefing ถามใน session ถัดไป) |
| **cloud** (Codex cloud, agy cloud, Claude Code web) | `/mflow:checks send R1 --to codex-cloud` เขียนข้อความสั่งงานที่มีชื่อ branch ชุด งาน และ skill ที่ต้องอ่าน ผู้ใช้วางในหน้าเว็บของ tool นั้น | agent บน cloud push ไป branch ของตัวเองและเปิด PR เข้า `checks/<batch>` (ไม่ใช่ `main`) แล้ว `/mflow:checks collect` ตรวจว่าแก้แต่ไฟล์ที่งานนั้นควรแก้ (test, review: `docs/reviews/**`; fix: โค้ดและ test) แล้วจึงรวมเข้า branch ชุดและติ๊กงาน |

ตัวรันกับ tool ที่ผู้ใช้เปิดเองใช้ lock เดียวกัน ตัวรันของ codex กับของ agy จึงรันพร้อมกันได้ ช่องหนักยังทำทีละงาน

## 10. งานรวมผลและงานแก้

**รวมผล (R2)** อ่านรายงานของ R2a และ R2b ตรวจทุก finding กับโค้ดจริงที่ commit ตรึง (วิธีของ `/mflow:assess`) ตัดข้อที่ไม่จริงพร้อมเหตุผล เขียนรายงานรวม `docs/reviews/code/<date>-<change>.md` ที่อ้างรายงานย่อยทั้งหมด แล้ว `pending.mjs tick-review` ครั้งเดียว review ที่มีคนเดียวและเป็น claude tick เองได้เลยโดยไม่มีงานรวมผล ถ้าเป็น tool อื่นคนเดียว ยังมีงานรวมผลเพื่อให้ Claude ตรวจข้อที่พบตามกติกาเดิม

**แก้ (F1)** เกิดเมื่อ test part ล้ม หรือรายงานรวมผลเป็น `changes-requested` แก้ blocker และ major ก่อน พร้อม test ที่พิสูจน์ แล้วเกิด test since (ช่องหนัก) และ review สั้น (`--short`) ตามมา รอบละหนึ่ง fix สูงสุด `rounds` รอบ (ค่าเริ่มต้น 3) เหมือน `/mflow:night` ข้อ 3 และ 5 ครบรอบแล้วยังไม่ผ่านเป็น `stopped` ข้อที่ต้องให้ผู้ใช้ตัดสิน (spec ไม่ได้บอก สิทธิ์ ตารางที่ไม่มี) เป็น `needs-you` ไม่เดา

## 10.5 E2E

E2E มีสองงานต่อจอ ทำทีละจอเหมือน `/mflow:night` ข้อ 6 และ 7:

| งาน | ทำอะไร | ช่อง |
|---|---|---|
| `e2e-write` (EW1) | จอที่ยังไม่มี test E2E หรือมีไฟล์ UI เปลี่ยนหลัง test ล่าสุด (`git log -1` ของแต่ละไฟล์): เขียนหรือแก้ test จาก spec ของจอ ด้วย `/mflow:e2e <screen>` แล้ว commit ไฟล์ test บน branch ชุด | หนัก (รัน browser ตอนลอง) |
| `e2e` (E1) | รัน test E2E ของจอนั้นด้วย `--workers` ไม่เกิน `e2eMaxWorkers` และเขียน record | หนัก |

- จอมาจากช่อง E2E screens ของแถวใน `pending.md` ที่อยู่ในชุด
- **รออะไร (คำตอบของผู้ใช้ข้อ 7: a):** E2E รอ test ทุก part ของชุดผ่าน แต่ไม่รอ review E2E กับ review จึงทำพร้อมกันได้ (E2E อยู่ช่องหนัก review อยู่ช่องเบา) test ต้องผ่านก่อน เพราะเมื่อ unit หรือ integration ล้ม E2E ก็มักล้มตามด้วยเหตุเดียวกัน เปลือง usage และเวลาของช่องหนักไปเปล่าๆ ส่วน review ไม่ต้องรอ เพราะ E2E หาปัญหาที่ review มองไม่เห็น (จอจริง ข้อมูลจริง) ยิ่งรู้เร็วยิ่งดี
- **เมื่อ fix แตะไฟล์ UI ของจอ** E1 ของจอนั้นกลับเป็น `open` และรันใหม่หลัง fix ผ่าน test since กติกาเดียวกับที่ night ใช้ตัดสินว่า test ของจอเก่าแล้ว
- **test E2E ที่ agent เขียน** เป็นโค้ดใหม่บน branch ชุด จึงมี review สั้น (`--short`) ของไฟล์ test เหล่านั้นอีกหนึ่งงานในช่องเบา ตามผลทดลองแบบ B ของ factory ข้อ 12.2
- **E2E ล้ม:** แยกว่าจอผิด spec (เป็น defect เกิดงาน fix) หรือ test ผิด (แก้ test ในงาน EW เดิม นับรอบ) เหมือน night ข้อ 6
- **stack:** งาน E2E ในเครื่องเริ่ม stack ตาม `## Commands` ของ AGENTS.md เมื่อยังไม่ขึ้น และหยุดเมื่อช่องหนักไม่มีงาน E2E ค้าง (กติกา `--stack` ของ night) บน cloud ต้องผ่านข้อ 12 ข้อ 3 ก่อน
- **ใครทำได้:** claude และ codex ที่เปิด hook ตัวกัน browser แล้ว (ข้อ 8) agy ยังรับไม่ได้
- **PR พร้อม merge** เมื่องาน E2E ของทุกจอในชุดจบด้วย (`done`, หรือ `needs-you` ที่มีเหตุผล) ไม่ใช่แค่ test และ review

## 11. สิ่งที่ต้องเปลี่ยนในของเดิม

| ที่ | เปลี่ยน |
|---|---|
| FR-101 และ FR-180 | ตัวรันที่ผู้ใช้เปิดเรียก tool อื่นได้ (ผู้ใช้เป็นคนเริ่ม) ตามแนวคำตอบ a) ของ factory ข้อ 8 |
| กติกา push (CLAUDE.md, AGENTS.md) | push `checks/*` และเปิด PR แบบ draft ได้โดยไม่ต้องถาม ไม่ push `main` ไม่ merge PR |
| apply ที่จบแบบ b และ `/mflow:worktree merge` | หลัง merge รัน `checks.mjs add <change>` |
| `By:` ใน record และ `Reviewer:` ในรายงาน | เพิ่ม `antigravity` (วันนี้รับแค่ claude, codex, opencode) และ `-cloud` สำหรับงานบน cloud |
| `status-guard.mjs` และ briefing | branch `checks/*` ไม่แก้ `STATUS.md` และ briefing บอกชุดที่เปิดอยู่กับงานที่ค้าง |
| skill ของ Codex และ agy | เพิ่ม `mflow-checks` ใน `.agents/skills/` ผ่าน `agent-skills.mjs` |
| `/mflow:night` | ยังเหมือนเดิมในรุ่นแรก ภายหลังอาจเป็น `checks.mjs run --as claude` |
| `/mflow:monitor` | แสดง checklist ของชุดที่เปิดอยู่ |

## 12. ต้องพิสูจน์ก่อน (ขั้นที่ 0)

ยังไม่เคยลองจริง และ handoff ของ 0.54.0 ระบุไว้ว่ายังไม่ได้ลอง จึงยังไม่สัญญาว่า "test1 ให้ codex, test2 ให้ agy" ใช้ได้จนกว่าจะผ่านข้อเหล่านี้:

1. Codex ใน sandbox `workspace-write` รัน integration test ที่ใช้ Docker (Testcontainers) ได้หรือไม่ และ NuGet restore ต่อเน็ตได้หรือไม่
2. agy แบบ headless เขียนไฟล์ record ได้หรือไม่ (handoff บอกว่า terminal ใน sandbox ของ agy เขียนไฟล์ไม่ได้)
3. Codex cloud, agy cloud และ Claude Code web มี Docker และ .NET SDK ใน environment หรือไม่ ถ้าไม่มี cloud รับได้แค่ review และ fix ที่ไม่ต้องรัน integration test
4. แต่ละ cloud push branch และเปิด PR เข้า `checks/<batch>` ได้หรือไม่ (Claude Code web มักจำกัด push ไว้ที่ branch ของ session)
5. `codex exec`, agy และ `claude -p` แจ้ง usage limit ด้วยข้อความหรือ exit code แบบไหน เพื่อให้ตัวรันจับได้
6. `gh` ในเครื่องผู้ใช้ login แล้ว และ repo ของโปรเจกต์อยู่บน GitHub

ถ้าข้อ 1 หรือ 2 ไม่ผ่าน: tool นั้นรับได้แค่ review และ fix ส่วน test เป็นของ claude ตามค่าเริ่มต้น

## 13. ลำดับการสร้าง

| ขั้น | สร้าง | ใช้ได้เมื่อจบขั้น |
|---|---|---|
| 0 | พิสูจน์ข้อ 12 ในโปรเจกต์ทดลอง | รู้ว่า tool ไหนรับงานแบบไหนได้ |
| 1 | `checks.mjs` (add, status, claim, done, fail, release), checklist, ชุดและ PR, `/mflow:checks` (สถานะ, มอบงานจากคำพูด, `next`) | Claude ทำงานใน checklist ทีละงานใน session ได้ |
| 2 | review หลายคน, งานรวมผล, งาน fix และรอบ | review2 = claude + codex ใช้ได้ |
| 3 | ตัวรันในเครื่อง (`run --as`), lock ช่องหนัก, จับ usage limit, `$mflow-checks` ของ Codex และ agy | กลางคืนเปิดตัวรันแล้วไปนอนได้ |
| 4 | `send` และ `collect` ของ cloud | ส่งงานให้ Codex cloud, agy cloud, Claude Code web |

ขั้น 1 และ 2 ไม่ต้องรอข้อ 12 เพราะใช้ Claude อย่างเดียว ขั้น 3 และ 4 รอผลข้อ 12

## 14. ยังต้องตัดสิน (มีคำแนะนำ ไม่ขวางขั้น 1)

1. PR ของชุดเป็น draft จนจบ หรือเปิดปกติตั้งแต่แรก แนะนำ a) draft เพื่อกัน merge ก่อนตรวจเสร็จ
2. agent บน cloud ส่งผลกลับเป็น PR เข้า branch ชุด แล้ว `collect` รวม หรือ push ตรงเข้า branch ชุด แนะนำ a) PR เพราะตรวจได้ว่าแก้แต่ไฟล์ที่ควรแก้ และเป็นทางที่ Codex cloud ทำได้อยู่แล้ว
3. ชื่อคำสั่ง `/mflow:checks` หรือรวมเข้า `/mflow:night` แนะนำ a) คำสั่งใหม่ เพื่อไม่เพิ่มความซับซ้อนให้คำสั่งเดิม (คำขอของผู้ใช้ 2026-11-07)

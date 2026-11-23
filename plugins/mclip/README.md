# mclip

ทำคลิปสอนการใช้งานระบบเว็บจาก "ไฟล์บท" (scenario) แทนการอัดหน้าจอด้วยมือ: recorder เปิดเบราว์เซอร์ทำตามบททีละ step
(คลิก กรอก ติ๊กจริง) พร้อมกรอบไฮไลต์ ลูกศร ซูม เคอร์เซอร์สีส้มมีวงแสง caption ไทย และเสียงพากย์ไทย
UI เปลี่ยนเมื่อไรก็สั่งอัดใหม่ได้ด้วยคำสั่งเดียว

Phase 1 (0.1.0) — ใช้งานจริงมาแล้วกับระบบเดียว (React + Docker Compose บน Windows) ระบบ/OS อื่นยังไม่ได้ลอง
Phase 2 (0.2.0) — วางแผนก่อนอัด: หัวข้อการสอนจาก e2e, เทสต์ และโค้ด หลายแอป (เว็บ, iPhone, Android) หน้าแผนแบบ slide
ที่กดขอแก้ได้ และ version ของแต่ละบท; แผนหลายแอปทดสอบกับตัวอย่างสังเคราะห์เท่านั้น

## คำสั่ง (v0.2)

| คำสั่ง | ทำอะไร |
|---|---|
| `/mclip:plan` | อ่านแอปของโปรเจกต์ (เว็บ, iPhone, Android) จาก e2e, เทสต์ และโค้ด แล้วร่าง "หัวข้อการสอน" ใน `clips/plan.md` (ระบบ ขอบเขต รูปแบบ แอป สารบัญ); `lesson <id>\|all` เขียนขั้นตอน คำบนจอ คำพูด และรูปอ้างอิงของบท; `edit ...` ทำตามคำขอแก้ที่คัดลอกจากหน้าแผน; ทุกครั้งสร้าง `clips/index.html` ใหม่ |
| `/mclip:init` | ติดตั้ง recorder ลงโปรเจกต์ที่ `tools/TutorialRecorder/`, เขียน stack ทดสอบที่ใช้อัด (สำเนาระบบที่มีแต่ข้อมูลทดสอบ), ไฟล์ผู้ใช้ทดสอบ (git-ignore), build, ติดตั้ง Chromium และเสียงพากย์ไทยถ้าต้องการ; รันซ้ำด้วย `--update` หลังอัปเกรด plugin |
| `/mclip:record <flow>` | ยังไม่มีบท: อ่าน flow ในโค้ด เสนอรายการ `data-tour` ที่ต้องเพิ่มและขั้นตอนของคลิปให้ยืนยันก่อน แล้วเขียน `scenarios/<clip>.yaml`; อัดคลิป (caption / callout / both / clean, `voice`) แล้วตรวจภาพทุกจุดที่เปลี่ยนหน้าก่อนรายงาน |
| `/mclip:finish <clip>` | ตกแต่งใน WeftCut: เอาคลิปโหมด clean (ไม่มี caption ในภาพ) มาวาง caption จาก `.srt` และ title card เปิด/สรุปเป็น layer ที่แก้ได้ ตรวจด้วย `check_composition` + ภาพจริง และ export เมื่อสั่ง |

## ได้อะไร

ใน `clips/` ของโปรเจกต์ (commit ได้ ยกเว้น `index.html` และ `*.mp4`):

- `plan.md` — ระบบ ขอบเขต รูปแบบ แอป และสารบัญ (หัวข้อที่ยังไม่มี `lesson.md` แสดงเป็น "หัวข้อ")
- `<NN-x>/lesson.md` และ `<NN-x>/screen/*.jpg` — ขั้นตอน คำบนจอ คำพูด รูปอ้างอิง (`-ios` / `-android` ท้ายชื่อ = รูปของเครื่องนั้น)
- `<NN-x>/v<n>/` — แต่ละครั้งที่อัด: บท รูป srt timing และ `version.json` (commit ของแอปตอนอัด); บทที่แก้หรือหน้าจอเปลี่ยนหลังอัดขึ้นสถานะ "ต้องอัดใหม่"
- `index.html` — แผนเป็น slide มีเมนูซ้าย (บท > ขั้นตอน จัดกลุ่มตามแอป), ปุ่ม ✎ แก้ เก็บคำขอแล้วคัดลอกเป็น `/mclip:plan edit ...`

ใน `tools/TutorialRecorder/Output/` ของโปรเจกต์ (git-ignore):

- `<clip>.mp4` — H.264 1920×1080 30 fps, มีเสียงพากย์เมื่ออัดด้วย `voice`
- `<clip>.srt`, `<clip>.timing.json` (เวลาและตำแหน่งของทุก step)
- `<clip>/review.html` — ดูคลิปคู่กับรายการ step คลิกแล้วกระโดดไป step นั้น
- โหมด callout: `<clip>/steps/NN.png` + `<clip>/manual.md` คู่มือแบบรูปทีละขั้นจากบทเดียวกัน

## ต้องมี

- .NET 10 SDK, ffmpeg และ PowerShell 7 (`pwsh`) บน PATH
- Chromium ของ Playwright (`/mclip:init` ติดตั้งให้ ราว 450 MB)
- สำเนาระบบสำหรับอัดที่รีเซ็ตข้อมูลได้ (เช่น Docker Compose อีก project) — **ห้ามอัดบนระบบที่มีข้อมูลจริง**
- เสียงพากย์ (ไม่บังคับ): Python 3.10+ กับ `pythaitts==1.0.0` (venv ราว 260 MB และโมเดล Apache-2.0 ที่โหลดครั้งแรก) เสียงผู้หญิง ให้เขียนบทลงท้าย "ค่ะ"
- `/mclip:finish`: แอป WeftCut พร้อม MCP server ที่เชื่อมกับ Claude Code แล้ว

## โครงสร้าง plugin

```
mclip/
├── .claude-plugin/plugin.json
├── README.md
├── scripts/
│   ├── clips.mjs            # แผนใน clips/: ตรวจ (check), สร้างหน้า (page), version ของบท, เทียบรูปหน้าจอ (ffmpeg ssim)
│   └── install.mjs          # คัดลอก recorder ลงโปรเจกต์, ไม่ทับ settings/secrets/stack/scenarios, ประทับ .mclip-version
├── skills/
│   ├── init/SKILL.md
│   ├── plan/SKILL.md
│   ├── record/SKILL.md
│   └── finish/SKILL.md
└── templates/
    ├── TutorialRecorder/    # ซอร์ส recorder (.NET + Playwright + overlay.js + tts/tts_paradee.py) และ README อ้างอิงบท
    ├── scenarios/example.yaml
    └── weftcut/card-plate.svg
```

## ข้อควรรู้

- caption ของ WeftCut เป็นตัวขาวขอบบางไม่มีพื้นรอง อ่านยากบนหน้าเว็บสีอ่อนกว่าแถบ caption ของ recorder:
  คลิปที่ต้องอ่านง่ายทันทีใช้โหมด caption ของ recorder; WeftCut เหมาะกับคลิปที่จะแก้ข้อความหรือ title ภายหลัง
- WeftCut เตือน caption ไทยยาวเกิน 6 วินาที / 42 ตัวอักษร (นับสระและวรรณยุกต์ด้วย) — `/mclip:finish` ใส่ tack อธิบายแทนการตัดท่อน
- `/mclip:init` ไม่ commit ให้ — บอกไฟล์ที่ควร commit แล้วให้ผู้ใช้สั่งเอง

## Phase ถัดไป (ยังไม่ทำ)

- ถ่ายรูปอ้างอิงของบทเว็บอัตโนมัติ (recorder โหมดถ่ายรูปอย่างเดียว ไม่อัดวิดีโอ) และเทียบหน้าจอเมื่อแอปเปลี่ยน
- อัดคลิปแอป iPhone / Android (ตอนนี้มีแผนและรูปที่ใส่เอง; iPhone simulator ต้องใช้ Mac) และบทที่ข้ามหลายแอป
- วาดกรอบไฮไลต์ใน WeftCut จาก `timing.json` แทนการวาดในหน้าเว็บ (แก้ได้หลังอัด)
- อัดหลายคลิปต่อกันทั้งโฟลเดอร์ `scenarios/`
- ทดสอบกับระบบที่ไม่ใช้ Docker และบน Linux/macOS

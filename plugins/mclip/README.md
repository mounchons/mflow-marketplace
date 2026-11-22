# mclip

ทำคลิปสอนการใช้งานระบบเว็บจาก "ไฟล์บท" (scenario) แทนการอัดหน้าจอด้วยมือ: recorder เปิดเบราว์เซอร์ทำตามบททีละ step
(คลิก กรอก ติ๊กจริง) พร้อมกรอบไฮไลต์ ลูกศร ซูม เคอร์เซอร์สีส้มมีวงแสง caption ไทย และเสียงพากย์ไทย
UI เปลี่ยนเมื่อไรก็สั่งอัดใหม่ได้ด้วยคำสั่งเดียว

Phase 1 (0.1.0) — ใช้งานจริงมาแล้วกับระบบเดียว (React + Docker Compose บน Windows) ระบบ/OS อื่นยังไม่ได้ลอง

## คำสั่ง (v0.1)

| คำสั่ง | ทำอะไร |
|---|---|
| `/mclip:init` | ติดตั้ง recorder ลงโปรเจกต์ที่ `tools/TutorialRecorder/`, เขียน stack ทดสอบที่ใช้อัด (สำเนาระบบที่มีแต่ข้อมูลทดสอบ), ไฟล์ผู้ใช้ทดสอบ (git-ignore), build, ติดตั้ง Chromium และเสียงพากย์ไทยถ้าต้องการ; รันซ้ำด้วย `--update` หลังอัปเกรด plugin |
| `/mclip:record <flow>` | ยังไม่มีบท: อ่าน flow ในโค้ด เสนอรายการ `data-tour` ที่ต้องเพิ่มและขั้นตอนของคลิปให้ยืนยันก่อน แล้วเขียน `scenarios/<clip>.yaml`; อัดคลิป (caption / callout / both / clean, `voice`) แล้วตรวจภาพทุกจุดที่เปลี่ยนหน้าก่อนรายงาน |
| `/mclip:finish <clip>` | ตกแต่งใน WeftCut: เอาคลิปโหมด clean (ไม่มี caption ในภาพ) มาวาง caption จาก `.srt` และ title card เปิด/สรุปเป็น layer ที่แก้ได้ ตรวจด้วย `check_composition` + ภาพจริง และ export เมื่อสั่ง |

## ได้อะไร

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
│   └── install.mjs          # คัดลอก recorder ลงโปรเจกต์, ไม่ทับ settings/secrets/stack/scenarios, ประทับ .mclip-version
├── skills/
│   ├── init/SKILL.md
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

- วาดกรอบไฮไลต์ใน WeftCut จาก `timing.json` แทนการวาดในหน้าเว็บ (แก้ได้หลังอัด)
- อัดหลายคลิปต่อกันทั้งโฟลเดอร์ `scenarios/`
- ทดสอบกับระบบที่ไม่ใช้ Docker และบน Linux/macOS

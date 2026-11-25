# งาน: สร้างเครื่องมือทำคลิปสอนใช้งานเว็บอัตโนมัติ (PoC)

## จุดประสงค์

ผมต้องการทำคลิปสอนการใช้งานเว็บที่ผมพัฒนาอยู่ ให้ผู้ใช้ทั่วไปดูแล้วทำตามได้ทีละขั้น

ระบบของผมมี flow หลาย role (เช่น ผู้ขอส่งเรื่อง → ผู้อนุมัติอนุมัติ) และ UI ยังเปลี่ยนอยู่เรื่อย ๆ

จึงต้องการให้คลิปถูกสร้างจาก "ไฟล์บท (scenario)" แล้วรันซ้ำได้ทุกครั้งที่ UI เปลี่ยน แทนการอัดหน้าจอด้วยมือ

ลำดับงานที่ผมต้องการ (สำคัญ ห้ามข้าม):

1. รอบ 1 — ภาพ: คลิปที่มีการคลิก/กรอกจริง + กรอบไฮไลต์ + ลูกศรชี้ + ซูมเข้า/ออก

2. รอบ 2 — คำบรรยาย (caption) เป็นช่วง ๆ ต่อ step เพื่อใช้ตรวจ flow เหมือน storyboard

3. รอบ 3 (ยังไม่ทำตอนนี้) — ใส่เสียงภาษาไทยด้วย TTS จากข้อความ narration ในบท

   → ตอนนี้แค่ "เตรียมโครงสร้างให้พร้อม" เช่น เก็บ timing ของแต่ละ step ไว้

## ขอบเขต PoC รอบนี้

- ทำแค่ **1 คลิป** จาก flow: 【ชื่อ flow เช่น สร้างคำขอซื้อ → อนุมัติ】

- เว็บเป้าหมาย: 【URL เช่น [https://localhost:5001](https://localhost:5001) หรือ staging】

- User ทดสอบแต่ละ role: 【requester / approver — ใช้ข้อมูลจาก seed หรือ appsettings.Development ของโปรเจกต์ ห้ามใส่รหัสผ่านจริงลงในไฟล์ที่ commit】

- ยังไม่ต้องทำ HyperFrames / motion graphics, ยังไม่ต้องทำ TTS, ยังไม่ต้องรองรับทุกเมนู

- ถ้ามีอะไรไม่ชัด ให้ถามผมก่อนลงมือ ไม่ต้องเดาเอง

## Tech stack

- .NET 8 console app + Microsoft.Playwright (C#)

- ไฟล์บทเป็น YAML (ใช้ YamlDotNet)

- ffmpeg สำหรับแปลง .webm → .mp4

- Viewport 1920×1080, DeviceScaleFactor = 2 (ตัวหนังสือไทยต้องคมเวลาซูม)

## โครงสร้างโปรเจกต์ที่ต้องการ

\`\`\`

tools/TutorialRecorder/

  TutorialRecorder.csproj

  Program.cs                 # รับ argument: path ของไฟล์บท

  Scenario/                  # model ของไฟล์บท + loader

  Actions/                   # click, fill, select, navigate, wait, zoom, zoom-out, login

  Overlay/overlay.js         # JS/CSS ที่ฉีดเข้าหน้าเว็บ: กรอบ, ลูกศร, spotlight, caption bar, เคอร์เซอร์จำลอง

  Output/                    # timing.json, .srt, .mp4

scenarios/

  【flow-name】.yaml

\`\`\`

## รูปแบบไฟล์บท (ปรับได้ถ้ามีเหตุผล แต่บอกผมก่อน)

\`\`\`yaml

clip: purchase-request-approval

baseUrl: [https://localhost:5001](https://localhost:5001)

roles:

  requester: { userKey: Requester }   # อ้างอิง credential จาก config/secret ไม่ใช่ใส่ตรงนี้

  approver:  { userKey: Approver }

steps:

  - role: requester

    action: navigate

    url: /PurchaseRequest

    caption: "เข้าเมนูคำขอซื้อ"

    narration: "เริ่มจากเข้าเมนูคำขอซื้อครับ"

  - role: requester

    action: click

    target: "\[data-tour=btn-new-request\]"

    highlight: box            # box | arrow | spotlight | none

    caption: "กดปุ่ม 'สร้างคำขอ'"

    narration: "กดปุ่มสร้างคำขอที่มุมขวาบน"

  - role: requester

    action: fill

    target: "\[data-tour=amount\]"

    value: "15000"

    zoom: 1.8                 # ซูมเข้าก่อนทำ step นี้

    caption: "กรอกจำนวนเงิน"

  - action: zoom-out

  - role: approver            # สลับ role = logout/login หรือใช้ browser context แยก

    action: click

    target: "\[data-tour=btn-approve\]"

    highlight: spotlight

    caption: "ผู้อนุมัติกด 'อนุมัติ'"

\`\`\`

## พฤติกรรมของแต่ละ step

1. หา element จาก `target` → ดึง BoundingBox

2. ถ้ามี `zoom` → ซูมด้วย CSS transform (transform-origin = กึ่งกลาง element, transition \~600ms)

3. แสดง caption bar ด้านล่างจอ (ฟอนต์ไทยอ่านง่าย เช่น Sarabun/Noto Sans Thai, พื้นหลังโปร่งแสง)

4. แสดง highlight ตามชนิด แล้วเลื่อนเคอร์เซอร์จำลองไปที่ element แบบนุ่ม ๆ

5. ค้างไว้ให้คนอ่านทัน: ระยะเวลา = max(1.5s, ความยาว caption × \~0.08s ต่อตัวอักษร) — ให้ปรับค่าได้ใน config

6. **ก่อนสั่งคลิกจริง ให้ซูมกลับ scale(1) ก่อน** เพื่อให้ตำแหน่งคลิกตรง (หรือหาวิธีที่ดีกว่าแล้วอธิบาย)

7. ทำ action จริง (click/fill/...) แล้วรอหน้าเว็บนิ่ง (network idle หรือ selector ถัดไป)

8. ลบ overlay ของ step นั้น

9. บันทึก start/end time ของ step ลง timing.json

ข้อระวัง: element `position: fixed` (navbar, Bootstrap modal) อาจเพี้ยนตอนซูม — ทดสอบและจัดการให้ด้วย

Overlay ต้องไม่บังการคลิก (pointer-events: none) และต้องฉีดใหม่ทุกครั้งที่เปลี่ยนหน้า (AddInitScript)

## Output ที่ต้องได้

- `Output/【clip】.mp4` (แปลงจาก webm ของ Playwright recordVideo ด้วย ffmpeg)

- `Output/【clip】.srt` สร้างจาก caption + timing (เผื่อใช้ทำ subtitle จริง)

- `Output/【clip】.timing.json` — แต่ละ step มี index, caption, narration, startMs, endMs

  (รอบ TTS จะใช้ไฟล์นี้: ได้ความยาวเสียงจริงแล้วปรับ duration ของ step แล้วรันใหม่)

- ถ้า step ไหนหา element ไม่เจอ → หยุดทันที, ถ่าย screenshot, แจ้งชื่อ step และ selector ที่พัง

## สิ่งที่ผมจะทำฝั่งเว็บ

ผมจะใส่ attribute `data-tour="..."` ที่ปุ่ม/ช่องสำคัญใน Razor view เพื่อให้ selector ไม่พังเวลาแก้ CSS/id

→ ช่วยไล่ดู view ของ flow นี้ แล้วเสนอรายการ `data-tour` ที่ควรเพิ่ม (ให้ผมยืนยันก่อนแก้)

## เกณฑ์ว่าเสร็จ (Definition of Done)

- รันคำสั่งเดียว `dotnet run -- scenarios/【flow-name】.yaml` แล้วได้ mp4 + srt + timing.json

- คลิปเห็นการคลิก/กรอกจริง, กรอบ/ลูกศรชี้ถูกตำแหน่ง, ซูมเข้า-ออกนุ่ม, caption ตรงกับ step

- รันซ้ำได้ผลเหมือนเดิม (ข้อมูลทดสอบต้อง reset หรือสร้างใหม่ได้)

- มี README สั้น ๆ: วิธีติดตั้ง (playwright install, ffmpeg), วิธีเขียนบท, ชนิด action/highlight ที่รองรับ

## วิธีทำงาน

1. อ่านโปรเจกต์ก่อน แล้วสรุปแผนสั้น ๆ + คำถามที่ต้องให้ผมตอบ

2. รอผมยืนยัน แล้วค่อยลงมือ

3. ทำทีละส่วน: recorder พื้นฐาน → overlay/highlight → zoom → caption + srt/timing → ffmpeg

4. จบแต่ละส่วนให้รันจริงแล้วบอกผลลัพธ์

## เผื่ออนาคต (ไม่ต้องทำตอนนี้ แต่ออกแบบไม่ให้ปิดทาง)

- โหมด screenshot + bounding box ต่อ step → ส่งต่อให้ HyperFrames ทำ motion

- ขั้น TTS ภาษาไทย (เช่น VachanaTTS) อ่านจาก narration → ใช้ความยาวเสียงกำหนด duration → ผสมเสียงเข้า mp4

- รองรับหลายคลิปพร้อมกัน (รันทั้งโฟลเดอร์ scenarios/)  
  
- role: requester

  action: click

  target: "[data-tour=btn-new-request]"

  callout: "กดปุ่มนี้เพื่อสร้างคำขอซื้อใหม่"

  result:

    target: "\[data-tour=form-request\]"   # ชี้ไปที่ผลลัพธ์ (ไม่ใส่ = ชี้ที่เดิม)

    text: "ระบบเปิดฟอร์มให้กรอกรายละเอียด"

  placement: auto                         # auto | top | bottom | left | right  
  
# เพิ่มโหมด Callout (คลิปไม่มีเสียง)

## จุดประสงค์

คลิปบางชุดผมยังไม่ใส่เสียง ต้องการให้คำอธิบายขึ้น "ตรงตำแหน่งที่คลิก" แทน caption bar ด้านล่าง

คนดูจะได้เห็นว่ากดตรงไหน และกดแล้วระบบทำอะไร โดยไม่ต้องฟังเสียง

## เพิ่มในไฟล์บท

- `callout`: ข้อความก่อนทำ action (บอกว่ากำลังทำอะไร/ทำไม)

- `result.text` + [`result.target`](http://result.target) (ไม่บังคับ): ข้อความหลังทำ action ชี้ไปที่ผลลัพธ์ เช่น ฟอร์มที่เปิด, สถานะที่เปลี่ยน, toast ที่ขึ้น

- `placement`: auto | top | bottom | left | right (default auto)

- ตั้งค่าระดับคลิป: `mode: callout | caption | both` (default caption เพื่อไม่ให้ของเดิมพัง)

## พฤติกรรมของ step ในโหมด callout

1. กรอบไฮไลต์ + ป้ายเลข step (①②③) ที่มุมกรอบ

2. Callout bubble มีหางชี้ไปที่ element

   - placement auto: เลือกด้านที่มีพื้นที่พอ ไม่ล้นจอ ไม่บังตัว element เอง

   - กว้างสูงสุด \~360px, ตัดบรรทัดภาษาไทยได้ถูก (word-break ที่เหมาะกับภาษาไทย), ฟอนต์ Sarabun/Noto Sans Thai

   - fade/slide in \~250ms

3. ค้างให้อ่านทัน: max(2s, จำนวนตัวอักษร × \~0.09s) — นานกว่าโหมด caption เพราะไม่มีเสียงช่วย

4. เคอร์เซอร์จำลองเลื่อนไปที่ element → แอนิเมชัน ripple ตรงจุดคลิก → ทำ action จริง

   (สำหรับ fill ให้พิมพ์ทีละตัวอักษรให้เห็น)

5. รอหน้านิ่ง → ถ้ามี `result` แสดง callout ผลลัพธ์ (สีต่างจาก callout แรก เช่น สีเขียว ✓) ชี้ไปที่ [result.target](http://result.target)

6. ลบ overlay ของ step แล้วไป step ถัดไป

7. ถ้ามี zoom ให้ callout ขยายตามไปด้วย หรือคำนวณตำแหน่งใหม่หลังซูม ข้อความต้องไม่หลุดจอ

## Output เพิ่ม

- timing.json เก็บทั้ง callout และ result พร้อม startMs/endMs แยกกัน

- (ทำเพิ่ม ถ้าไม่ยุ่งยาก) ถ่าย screenshot ตอนที่ callout แสดงครบแล้วของแต่ละ step

  → `Output/【clip】/steps/01.png, 02.png ...` + [`manual.md`](http://manual.md) ที่มีรูปและข้อความทีละ step

  ใช้เป็นคู่มือแบบอ่านจากบทเดียวกันได้เลย

## Definition of Done

- รันบทเดียวกันด้วย mode callout แล้วได้ mp4 ที่ callout ชี้ถูกตำแหน่งทุก step

- callout ไม่ล้นจอ ไม่บังปุ่มที่กำลังจะคลิก

- โหมด caption เดิมยังทำงานเหมือนเดิม

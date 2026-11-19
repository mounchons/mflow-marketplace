# mtech

งานศึกษาเชิงเทคนิคสำหรับเจ้าของระบบ ที่ปรึกษา และ software house: อ่านระบบเก่าจากโค้ดจริง แล้วทำข้อเสนอปรับปรุงระบบที่มีราคา ผัง และแผนงาน พร้อมนำไปคุยกับลูกค้า

mtech ไม่แก้โค้ดของระบบ ผลงานทั้งหมดเป็นไฟล์ในโฟลเดอร์ docs ของโปรเจกต์: Markdown, Excel (.xlsx), HTML, SVG และ PNG

## ติดตั้ง

```
/plugin marketplace add mounchons/mflow-marketplace   # หรือ path ของโฟลเดอร์ในเครื่อง
/plugin install mtech@mflow-marketplace
```

เครื่องที่ใช้ต้องมี:

- Python 3.10 ขึ้นไป (ลองแล้วกับ 3.10 ถึง 3.13) และ `python -m pip install openpyxl` (สร้าง Excel ค่าใช้จ่าย) script จะหยุดพร้อมบอกรุ่นถ้า Python เก่ากว่านี้ บน Windows ถ้าไม่มีคำสั่ง `python3` หรือ `python` เป็น Python 2 skill จะใช้ `py -3` แทน ตรวจรุ่นได้ด้วย `py -0p`
- Node 20+ และ `npm i -g playwright` แล้ว `npx playwright install chromium` (screenshot ตรวจผัง และแปลงเป็น PNG)
- LibreOffice (ถ้าต้องการให้คำนวณ Excel ใหม่แบบไม่ต้องเปิดโปรแกรม)

## คำสั่ง (v0.1)

| คำสั่ง | ทำอะไร |
|---|---|
| `/mtech:cloud-architecture [ระบบหรือโฟลเดอร์] [cloud และ region] [สิ่งที่ต้องการ]` | สำรวจระบบเก่าจากโค้ด → เลือกแนวทางย้าย (rehost / replatform / refactor เป็นเฟส) → ออกแบบสถาปัตยกรรมเป้าหมาย → หาราคาทางการ AWS / Azure / GCP ลง Excel แบบสูตร → ทำผังสถาปัตยกรรม, ผัง log + alert, ผังค่าใช้จ่าย เป็น HTML / SVG / PNG → เขียน README และแผนติดตั้ง ทดสอบ ส่งมอบ → โครงใบเสนอราคาและสัญญาดูแลรายเดือน |

ตัวอย่าง:

```
/mtech:cloud-architecture . AWS ap-southeast-7 plan
/mtech:cloud-architecture src/LegacyWeb เทียบ AWS กับ Azure costs
/mtech:cloud-architecture . diagrams
/mtech:cloud-architecture . install-plan
```

## หลักที่ skill ยึด

- ทุกข้อมูลของระบบเดิมต้องอ้างไฟล์และบรรทัดจริง ส่วนที่โค้ดตอบไม่ได้จะกลายเป็นรายการคำถาม
- ราคาทุกบรรทัดระบุแหล่งที่มาและวันที่ ราคาจาก AWS Price List API นับเป็นราคาทางการ ราคาจากการค้นเว็บติดป้าย "ประมาณ ต้องยืนยัน"
- ตัวเลขมีแหล่งเดียว: JSON → Excel แล้วค่อยคัดลอกไป README และผัง เปลี่ยนการตัดสินใจเมื่อไรต้องแก้ทุกไฟล์พร้อมกัน
- เจอรหัสผ่านหรือ key ในโค้ด จะระบุแค่ชื่อไฟล์และใส่งาน "เปลี่ยนรหัสก่อน go-live" ไม่คัดลอกค่าออกมา
- ผู้ใช้เป็นคนตัดสินใจ skill เสนอทางเลือกพร้อมคำแนะนำ แล้วบันทึกการตัดสินใจพร้อมวันที่

## ข้อจำกัด

- ราคา Azure ใช้ Retail Prices API ได้โดยไม่ต้องมี key ส่วน Google Cloud ต้องมี API key ถ้าเครือข่ายบล็อก จะใช้การค้นเว็บแทน
- ราคาเป็นตัวเลข ณ วันที่ค้น ต้องยืนยันอีกครั้งก่อนส่งใบเสนอราคา
- ผังใช้ฟอนต์ IBM Plex Sans Thai จาก Google Fonts ถ้าเปิดแบบออฟไลน์จะใช้ฟอนต์สำรองของเครื่อง

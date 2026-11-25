# สิ่งที่ลองตอนทดสอบใช้งาน

1. clone repo ลงเครื่องใหม่ copy `.env.example` เป็น `.env` แล้วรัน `docker compose up` ที่ root → ทุก service ขึ้น โดยไม่ต้องแก้ไฟล์ใด และใน Docker ทุก container อยู่กลุ่มเดียวชื่อโปรเจกต์
2. ใน `.env` ตั้ง `COMPOSE_FILE` เป็น `compose.yml` ไฟล์เดียวและ host ของฐานข้อมูลเป็นฐานข้อมูลอื่น แล้วรัน `docker compose up` → แอปขึ้นและต่อฐานข้อมูลนั้น ไม่มี container ฐานข้อมูลขึ้นมา
3. เปิดเฉพาะ service ฐานข้อมูลจาก compose แล้วรัน API จากเครื่อง → API ต่อฐานข้อมูลได้ด้วยค่าใน `.env`
4. บนเครื่องที่มี PostgreSQL อื่นใช้ port 5432 อยู่ เปิด compose → ฐานข้อมูลของโปรเจกต์ขึ้นที่ `foundation.db_dev_port` ไม่ชนกัน และเครื่องอื่นในวง LAN ต่อ port นี้ไม่ได้
5. สร้างตาราง แล้วรัน `docker compose down` ตามด้วยเปิดใหม่ → ตารางและข้อมูลยังอยู่
6. สร้างไฟล์ `.env` ที่ root แล้วดู `git status` → git ไม่แสดงไฟล์นี้ และทุกค่าที่ compose, script และแอปอ่านมีชื่ออยู่ใน `.env.example`
7. รัน `dotnet build` และ `dotnet test` กับ `.slnx` ใน `foundation.src_folder` โดยเปิด Docker ไว้ → ผ่านทั้งหมด รวม architecture test และไม่มี browser เปิดขึ้นมา
8. (test) ใส่การอ้างผิดชั้นสองแบบ: Domain ใช้ EF Core และ Application ใช้ class ของ Infrastructure → architecture test ล้มและบอกชื่อกฎ เอาออกแล้วผ่าน
9. เขียนโค้ดที่ใช้ค่าที่อาจเป็น null ใน project ใดก็ได้ → build ล้ม
10. ใส่เวอร์ชันแพ็กเกจในไฟล์ project → restore ล้ม บอกว่าเวอร์ชันต้องอยู่ที่ไฟล์กลาง
11. เพิ่ม entity ใหม่แล้วสร้าง migration → ชื่อตารางและคอลัมน์เป็น snake_case และคอลัมน์เงินเป็นชนิดตาม `foundation.money_precision`
12. แก้ entity โดยไม่สร้าง migration แล้วรัน test → test บอกว่ามีการเปลี่ยน model ที่ยังไม่มี migration
13. แถวหนึ่งของไฟล์ golden data มีค่าที่คาดไว้ผิด → test รายงานครบทุกแถว และล้มเฉพาะแถวนั้น
14. เปิดดู image สุดท้ายของ API → มีแอปที่ publish แล้วกับ runtime ไม่มี SDK และไม่มีซอร์สโค้ด
15. เว็บ `react-vite`: กำหนดค่าที่อาจเป็น undefined ให้ฟิลด์บังคับแล้ว build → build ล้ม และ build ของ .NET ไม่สั่ง build เว็บตัวนี้
16. เว็บ `react-vite`: กรองรายการ ไปหน้า 2 แล้วกด reload → ตัวกรองและหน้ายังเหมือนเดิม
17. เปลี่ยนชื่อฟิลด์ในคำตอบของ API แล้วสร้าง client ใหม่ → type check ของเว็บชี้ทุกจุดที่ใช้ชื่อเดิม
18. รันคำสั่ง build และ test ตาม AGENTS.md → ไม่มี Playwright รัน E2E รันเมื่อสั่งคำสั่งของมันเท่านั้น
19. เปิดตาราง Libraries ใน AGENTS.md → ทุกแพ็กเกจและ image มีเวอร์ชันเต็ม licence และวันที่ตรวจ
20. ไล่ตามทุก path ใน AGENTS.md `## Stack` → มีอยู่จริงทุกตัว

# สิ่งที่ลองตอนทดสอบใช้งาน

1. clone repo ลงเครื่องใหม่ copy `.env.example` เป็น `.env` แล้วรัน `docker compose up` → ทุก service ขึ้น โดยไม่ต้องแก้ไฟล์ใด
2. เปิดเฉพาะฐานข้อมูลจาก compose แล้วรัน API จากเครื่อง → API ต่อฐานข้อมูลได้ด้วยค่าใน `.env`
3. บนเครื่องที่มี PostgreSQL อื่นใช้ port 5432 อยู่ เปิด compose → ฐานข้อมูลของโปรเจกต์ขึ้นที่ `foundation.db_dev_port` ไม่ชนกัน และเครื่องอื่นในวง LAN ต่อ port นี้ไม่ได้
4. สร้างตาราง แล้วรัน `docker compose down` ตามด้วยเปิดใหม่ → ตารางและข้อมูลยังอยู่
5. สร้างไฟล์ `.env` แล้วดู `git status` → git ไม่แสดงไฟล์นี้ และทุกค่าที่ compose กับแอปอ่านมีชื่ออยู่ใน `.env.example`
6. รัน `dotnet build` และ `dotnet test` ที่ root โดยเปิด Docker ไว้ → ผ่านทั้งหมด รวม architecture test และไม่มี browser เปิดขึ้นมา
7. (test) ใส่การอ้างผิดชั้นสองแบบ: Domain ใช้ EF Core และ Application ใช้ class ของ Infrastructure → architecture test ล้มและบอกชื่อกฎ เอาออกแล้วผ่าน
8. เขียนโค้ดที่ใช้ค่าที่อาจเป็น null ใน project ใดก็ได้ → build ล้ม
9. ใส่เวอร์ชันแพ็กเกจในไฟล์ project → restore ล้ม บอกว่าเวอร์ชันต้องอยู่ที่ไฟล์กลาง
10. เพิ่ม entity ใหม่แล้วสร้าง migration → ชื่อตารางและคอลัมน์เป็น snake_case และคอลัมน์เงินเป็นชนิดตาม `foundation.money_precision`
11. แก้ entity โดยไม่สร้าง migration แล้วรัน test → test บอกว่ามีการเปลี่ยน model ที่ยังไม่มี migration
12. แถวหนึ่งของไฟล์ golden data มีค่าที่คาดไว้ผิด → test รายงานครบทุกแถว และล้มเฉพาะแถวนั้น
13. เปิดดู image สุดท้ายของ API → มีแอปที่ publish แล้วกับ runtime ไม่มี SDK และไม่มีซอร์สโค้ด
14. เว็บ `react-vite`: กำหนดค่าที่อาจเป็น undefined ให้ฟิลด์บังคับแล้ว build → build ล้ม และ build ของ .NET ไม่สั่ง build เว็บตัวนี้
15. เว็บ `react-vite`: กรองรายการ ไปหน้า 2 แล้วกด reload → ตัวกรองและหน้ายังเหมือนเดิม
16. เปลี่ยนชื่อฟิลด์ในคำตอบของ API แล้วสร้าง client ใหม่ → type check ของเว็บชี้ทุกจุดที่ใช้ชื่อเดิม
17. รันคำสั่ง build และ test ตาม AGENTS.md → ไม่มี Playwright รัน E2E รันเมื่อสั่งคำสั่งของมันเท่านั้น
18. เปิดตาราง Libraries ใน AGENTS.md → ทุกแพ็กเกจและ image มีเวอร์ชันเต็ม licence และวันที่ตรวจ
19. ไล่ตามทุก path ใน AGENTS.md `## Stack` → มีอยู่จริงทุกตัว

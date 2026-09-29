# หัวข้อที่ควร discuss

<!-- Written by /mflow:capture (new or changed documents), /mflow:screen inventory (data groups) and
     /mflow:discuss agenda (a full look at every active source). Thai, for the user.
     One row per topic. The หัวข้อ cell carries the slug in backticks: the slug of the discussion doc for it.
     The สถานะ cell is written by `discuss.mjs agenda`; by hand only to skip (ข้าม: <reason>) or split (แยกเป็น `a`, `b`).
     Example row:
     | 1 | สิทธิ์ เมนู และข้อมูลที่แต่ละ role เห็น (`access-control`) | TOR มี 4 role แต่ไม่บอกว่าใครเห็นงานของสาขาไหน [ที่มา: tor-v1.pdf §3.1] ถ้าเข้าใจผิดต้องแก้ทุกหน้าจอ | ก่อน `/mflow:screen inventory` | ยังไม่เริ่ม |
-->

รายการนี้แนะนำว่าเรื่องไหนควรคุยให้ตรงกันก่อนสร้างหน้าจอหรือเขียนโค้ด เพราะเอกสารลูกค้ายังตีความได้หลายแบบ ขัดกันเอง หรือยังไม่ได้บอกทั้งที่ระบบต้องใช้ เป็นคำแนะนำเท่านั้น จะคุยเรื่องไหนก่อน หรือไม่คุยเรื่องไหนเลยก็ได้ ไม่มีคำสั่งไหนรอรายการนี้

- เริ่มคุยหัวข้อ: `/mflow:discuss <slug>` เช่น `/mflow:discuss access-control`
- ไม่คุยหัวข้อไหน: เขียน `ข้าม: <เหตุผล>` ในช่องสถานะ หรือสั่ง `/mflow:discuss agenda skip <slug> <เหตุผล>`
- **ทบทวน:** ในช่อง "ทำไมควรคุย" แปลว่าเอกสารที่เข้ามาใหม่เปลี่ยนเรื่องที่อนุมัติไปแล้ว ควรเปิดเอกสาร discuss ฉบับใหม่ของหัวข้อนั้น
- ช่องสถานะอัปเดตเองจากเอกสาร discuss: ยังไม่เริ่ม, กำลังคุย `NN`, อนุมัติแล้ว `NN`, ยกเลิก `NN`
- สองหัวข้อแรก (`tech-stack` และ `code-structure`) มีในทุกโปรเจกต์ เพราะทุกอย่างหลังจากนี้สร้างบนคำตอบของมัน
- เอกสารลูกค้าที่เข้ามาใหม่ (`/mflow:capture`) เพิ่มหัวข้อใหม่ในรายการนี้ได้ ส่วน `/mflow:discuss agenda` อ่านเอกสารทั้งหมดแล้วเรียงรายการใหม่

| # | หัวข้อ | ทำไมควรคุย | ควรคุยก่อน | สถานะ |
|---|---|---|---|---|
| 1 | Tech stack: แอป เฟรมเวิร์ก library ฐานข้อมูล Docker (`tech-stack`) | ทุกขั้นหลังจากนี้ (theme, หน้าจอ, data model, OpenSpec) สร้างบน stack นี้ ต้องตกลงให้ละเอียดก่อน: แยก web แต่ละตัว, API, mobile, library ที่ใช้ (open source และฟรี ตรวจ licence), ฐานข้อมูล, Docker และตัวเสริมที่ใส่ภายหลังได้ (Redis, queue) ถ้าเลือกผิดต้องสร้าง kit และหน้าจอใหม่ | ก่อน `/mflow:theme` |  |
| 2 | โครงสร้างโค้ดและโฟลเดอร์ (`code-structure`) | โครง repo และ solution แยกตาม layer (Domain, Application, Infrastructure, Api) โฟลเดอร์ของแต่ละแอป และทิศทางการอ้างอิงระหว่าง project ถ้าตั้งผิดตอนเริ่มต้องย้ายไฟล์ทั้ง repo ภายหลัง | ก่อน `/mflow:theme` |  |

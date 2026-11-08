# ค่าเริ่มต้นของแพ็ก foundation

ค่าที่เอกสารลูกค้าระบุแทนค่าเริ่มต้นได้ รุ่นในตารางนี้เป็นรุ่นหลักเท่านั้น รุ่นเต็มที่ pin อยู่ใน AGENTS.md ของโปรเจกต์ เฉพาะค่าที่กำกับ `ตั้งบนจอ` อยู่บนหน้าตั้งค่าระบบ (แพ็กนี้ไม่มีค่าที่กำกับ) ทุกค่าตัดสินตอนเริ่มโปรเจกต์และอยู่ในไฟล์ของ repo

| ค่า | key | เริ่มต้น | ช่วง | หมายเหตุ |
|---|---|---|---|---|
| รุ่นหลักของ .NET | `foundation.dotnet_major` | 10 | รุ่น LTS ที่ยังได้รับ support ตอนเริ่มโปรเจกต์ | EF Core และ ASP.NET Core ใช้รุ่นหลักเดียวกัน |
| รุ่นหลักของ C# | `foundation.csharp_major` | 14 | ตามรุ่นเริ่มต้นของ .NET ที่เลือก | |
| รุ่นหลักของ PostgreSQL | `foundation.postgres_major` | 18 | รุ่นที่ยังได้รับ support ตอนเริ่มโปรเจกต์ | เครื่องลูกค้าที่รุ่นต่ำกว่าเป็นค่าจากเอกสารลูกค้า |
| รุ่นหลักของ React | `foundation.react_major` | 19 | รุ่นเสถียรล่าสุดตอนเริ่มโปรเจกต์ | เฉพาะ profile `react-vite` |
| รุ่นหลักของ Node | `foundation.node_major` | 24 | รุ่น LTS ตอนเริ่มโปรเจกต์ | ใช้ build เว็บ ไม่ได้รันใน production |
| วิธีเลือก SDK ใหม่กว่าที่ pin | `foundation.sdk_roll_forward` | `latestFeature` | `latestFeature`, `latestPatch`, `disable` | ค่าของ `rollForward` ใน `global.json` |
| port ของฐานข้อมูลบนเครื่องนักพัฒนา | `foundation.db_dev_port` | 15432 | 1024–65535 ยกเว้น 5432 | ต้องไม่ซ้ำกับโปรเจกต์อื่นบนเครื่องเดียวกัน |
| ความละเอียดของเงิน | `foundation.money_precision` | `numeric(18,2)` | ความละเอียดอื่นตามสกุลเงินหรือกฎของลูกค้า | ปริมาณและน้ำหนักกำหนดต่อคอลัมน์ในเอกสาร data model |
| โฟลเดอร์ของแอปและ layer | `foundation.src_folder` | `src` | `src` หรือ `apps` คู่ `packages` | ตาม FOUND-D21 |
| โฟลเดอร์ของ test | `foundation.tests_folder` | `tests` | path ใน repo | |
| โฟลเดอร์ของ E2E | `foundation.e2e_folder` | `tests/e2e` | path ใน repo | แยกจาก test ของ .NET และเว็บ |
| โฟลเดอร์ของไฟล์ deploy | `foundation.deploy_folder` | `deploy` | path ใน repo | Dockerfile และไฟล์ตั้งค่า proxy |

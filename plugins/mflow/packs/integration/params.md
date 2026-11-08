# integration: ค่าเริ่มต้น

เฉพาะค่าที่กำกับ `ตั้งบนจอ` อยู่บนหน้าตั้งค่าระบบ นอกนั้นอยู่ในโค้ดหรือ env ค่าที่เอกสารลูกค้าหรือเอกสาร API ของอีกฝั่งกำหนดใช้แทนค่าเริ่มต้น

ค่าที่หมายเหตุขึ้นต้นว่า `ต่อระบบ` เป็นแบบของหนึ่งชุด: catalog ของโปรเจกต์มีคีย์หนึ่งชุดต่อ `{external_system}` โดยแทรกรหัสระบบหลังจุด (`integration.erp_base_url`) และแท็บละหนึ่งระบบ

| ค่า | key | เริ่มต้น | ช่วง | หมายเหตุ |
|---|---|---|---|---|
| Address ของระบบภายนอก | `integration.base_url` | ว่าง | https ไม่เกิน 500 ตัวอักษร host ต้องอยู่ใน `integration.allowed_hosts` | ต่อระบบ ตั้งบนจอ แท็บ <ชื่อระบบ> มีผลการเรียกครั้งถัดไป |
| ชื่อผู้ใช้ของระบบภายนอก | `integration.username` | ว่าง | ไม่เกิน 200 ตัวอักษร | ต่อระบบ ตั้งบนจอ แท็บ <ชื่อระบบ> |
| รหัสผ่านหรือ API key ของระบบภายนอก | `integration.password` | ว่าง | ไม่เกิน 1,000 ตัวอักษร | ต่อระบบ ตั้งบนจอ ค่าความลับ แท็บ <ชื่อระบบ> |
| กุญแจลายเซ็น webhook | `integration.webhook_secret` | ว่าง | อย่างน้อย 32 ตัวอักษร | ต่อระบบ ตั้งบนจอ ค่าความลับ แท็บ <ชื่อระบบ> เฉพาะเมื่อมี webhook (INTG-D21) |
| โหมดของแต่ละระบบ | `integration.mode` | `fake` ใน Development และ Prototype, `live` นอกนั้น | `fake` หรือ `live` | ไม่ขึ้นจอ env `<SYSTEM>_MODE` (INTG-D18) |
| host ที่อนุญาตให้เรียก | `integration.allowed_hosts` | ว่าง | host คั่นด้วยจุลภาค | ไม่ขึ้นจอ env `INTEGRATION_ALLOWED_HOSTS` โหมด live แล้วรายการว่าง API ไม่ start (INTG-D04) |
| รอเชื่อมต่อ (วินาที) | `integration.connect_timeout_seconds` | 5 | 1–30 | ไม่ขึ้นจอ |
| รอคำตอบต่อครั้ง ในคำขอของผู้ใช้ (วินาที) | `integration.request_timeout_seconds` | 10 | 1–60 | ไม่ขึ้นจอ |
| รอรวมทุกครั้ง ในคำขอของผู้ใช้ (วินาที) | `integration.request_total_seconds` | 30 | ไม่น้อยกว่าเวลาต่อครั้ง ไม่เกิน 120 | ไม่ขึ้นจอ |
| รอคำตอบต่อครั้ง ในงานเบื้องหลัง (วินาที) | `integration.job_timeout_seconds` | 100 | 10–600 | ไม่ขึ้นจอ |
| รอคำตอบเมื่อส่งหรือรับไฟล์ (วินาที) | `integration.file_timeout_seconds` | 300 | 30–1800 | ไม่ขึ้นจอ (INTG-D23) |
| จำนวนครั้งต่อการเรียกที่อ่านข้อมูล | `integration.read_attempts` | 3 | 1–5 | ไม่ขึ้นจอ นับครั้งแรกด้วย งานเขียนไม่ใช้ค่านี้ (INTG-D06) |
| ต่ออายุ token ก่อนหมด (นาที) | `integration.token_refresh_minutes` | 5 | 1–30 | ไม่ขึ้นจอ |
| ตัวส่งดูคิวทุก (วินาที) | `integration.outbox_poll_seconds` | 60 | 15–600 | ไม่ขึ้นจอ |
| รอก่อนส่งซ้ำ (นาที) | `integration.outbox_retry_minutes` | 1, 5, 15, 60 | ค่าละ 1–1440 | ไม่ขึ้นจอ ครบรายการแล้วใช้ค่าสุดท้ายต่อไปจนสำเร็จ |
| คำสั่งค้าง InFlight ได้นานเกินเวลารอ (นาที) | `integration.inflight_grace_minutes` | 5 | 1–60 | ไม่ขึ้นจอ นับต่อจากเวลารอของเส้นนั้น |
| ค้างนานจึงนับว่าช้า (ชั่วโมง) | `integration.late_hours` | 24 | 1–168 | ไม่ขึ้นจอ นับจากครั้งแรกที่ล้ม |
| ช่วงซ้อนของการดึงเข้า (นาที) | `integration.cursor_overlap_minutes` | 5 | 0–60 | ไม่ขึ้นจอ (INTG-D09) |
| ขนาดหน้าของการดึงเข้า | `integration.page_size` | 100 | 1–1000 | ไม่ขึ้นจอ ไม่เกินที่อีกฝั่งรับได้ |
| ลองรอบใหม่เมื่อระบบล่ม (นาที) | `integration.down_rerun_minutes` | 15 | 1–240 | ไม่ขึ้นจอ (INTG-D12) |
| ล้มกี่ครั้งติดกันจึงแจ้งเตือน | `integration.alert_failures` | 10 | 3–100 | ไม่ขึ้นจอ นับการเรียกจริงต่อระบบจากทุกผู้เรียก (INTG-D17) |
| แจ้งเตือนเรื่องเดิมซ้ำได้ทุก (นาที) | `integration.alert_repeat_minutes` | 60 | 15–1440 | ไม่ขึ้นจอ |
| ความยาว body ที่เก็บใน log (ไบต์) | `integration.body_log_bytes` | 4096 | 0–65536 | ไม่ขึ้นจอ 0 คือไม่เก็บ body |
| ชื่อฟิลด์ที่ปิดบังใน log | `integration.masked_fields` | password, secret, token, authorization, api_key, otp | รายการชื่อ ไม่สนตัวพิมพ์ เป็นส่วนหนึ่งของชื่อก็นับ | ไม่ขึ้นจอ โปรเจกต์เพิ่มฟิลด์ข้อมูลส่วนบุคคลได้ |
| อายุของลายเซ็น webhook (วินาที) | `integration.webhook_tolerance_seconds` | 300 | 30–900 | ไม่ขึ้นจอ (INTG-D21) |
| ช่วงเวลาตอนเปิดจอติดตาม (ชั่วโมง) | `integration.monitor_hours` | 24 | 1 ถึงอายุ log | ไม่ขึ้นจอ |
| ดึงย้อนหลังด้วยมือได้ไม่เกิน (วัน) | `integration.repull_max_days` | 31 | 1–365 | ไม่ขึ้นจอ (INTG-D16) |
| รอผลปุ่มทดสอบการเชื่อมต่อ (วินาที) | `integration.test_timeout_seconds` | 30 | 5–60 | ไม่ขึ้นจอ (INTG-D19) |

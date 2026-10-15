# หน้าตาระบบ

| อยู่ที่ | มีอะไร |
|---|---|
| `theme/` | UI kit: style guide (`index.html`), หน้าตัวอย่าง, token และ component สถานะของ kit อยู่ใน `theme/README.md` |
| `design-system.md` | component ไหนใช้กับงานแบบไหน สิ่งที่ควรทำและห้ามทำ |
| `contracts/` | สัญญาของแต่ละ component, การปรับตามขนาดจอ และรูปแบบข้อมูลผู้ใช้กับ role ที่ผู้สร้างใช้สร้าง component จริงตาม |
| `data/` | ผู้ใช้ตัวอย่าง (`users.json`), role และสิทธิ์ (`roles.json`), data dictionary (`README.md`) |

เปิดดูใน Claude Code ด้วย `/mreq:theme open` หรือ `python -m http.server 8810 --bind 127.0.0.1 --directory mreq/ui` แล้วเปิด `http://127.0.0.1:8810/theme/`

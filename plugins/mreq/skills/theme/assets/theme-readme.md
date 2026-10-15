# UI kit

Status: draft
Revision: 1

<!-- Written by /mreq:theme through theme-status.mjs. Keep the Status and Revision lines as they are, each on its own line:
     the script reads and rewrites them. Thai below, for the user. -->

kit นี้เป็นหน้า HTML, CSS และ JavaScript ธรรมดา เปิดดูได้โดยไม่ต้องมีแอป หน้าจอตัวอย่างทุกหน้าสร้างจาก kit นี้เท่านั้น จึงเปลี่ยนตามเมื่อ kit เปลี่ยน สถานะ `draft` คือยังปรับอยู่ `approved <วันที่>` คืออนุมัติแล้ว แต่ยังแก้ได้ด้วย `/mreq:theme update <สิ่งที่จะเปลี่ยน>` ซึ่งเพิ่ม Revision และบันทึกเหตุผลไว้ด้านล่าง

## เปิดดู

- ใน Claude Code: `/mreq:theme open` แล้วเปิด URL ที่ได้
- ไม่มี Claude Code: `python -m http.server 8810 --bind 127.0.0.1 --directory mreq/ui` แล้วเปิด `http://127.0.0.1:8810/theme/`
- ต้องเปิดผ่าน server ไม่ใช่ดับเบิลคลิกไฟล์ เพราะ browser จำกัดการอ่านไฟล์ JSON และ storage บนหน้า `file://`
- Bootstrap, ฟอนต์ และ icon โหลดจาก CDN จึงต้องต่ออินเทอร์เน็ต

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `tokens.css` | สี ฟอนต์ ขนาด ระยะ และขนาดโครงหน้าทุกค่า |
| `app.css` | สไตล์ของ component และโครงหน้า อ่านค่าจาก token เท่านั้น |
| `shell.js` | โครงหน้าแต่ละชนิดแอป, Toast, Dialog, SidePanel, QuickView, Dropdown, Tabs, Tooltip, การซ่อนตามสิทธิ์, ตัวสลับผู้ใช้, StatusBadge และชุด icon |
| `datatable.js` | DataTable บนข้อมูลตัวอย่าง (แบ่งหน้าใน browser เพื่อแสดงพฤติกรรม ของจริงแบ่งที่ server) |
| `datepicker.js` | DatePicker และ DateRangeField พร้อมรูปแบบวันที่และตัวแปลงข้อความเป็นวันที่ |
| `index.html` | style guide: การตัดสินใจของ theme, โครงหน้าและเมนู, ทุก component ในทุกสถานะ |
| `list.html`, `form.html`, `dashboard.html` | หน้าตัวอย่างของแอปหลังบ้าน ประกอบจาก kit อย่างเดียว (`dashboard.html` มีเมื่อระบบมีหน้า dashboard) |
| `site.html` | หน้าตัวอย่างของแอปหน้าบ้าน (SiteShell) มีเมื่อระบบมีแอปสำหรับลูกค้าหรือคนทั่วไป |
| `assets/` | โลโก้และรูป |

ผู้ใช้ตัวอย่างและ role อยู่ใน `../data/users.json` และ `../data/roles.json` ตัวสลับผู้ใช้อ่านจากไฟล์ทั้งสองโดยตรง ส่วนกฎการใช้ kit สำหรับคนและ AI อยู่ใน `../design-system.md` และสัญญาของแต่ละ component ที่ผู้สร้างใช้สร้างของจริงตามอยู่ใน `../contracts/`

## บันทึกการแก้ไข

- rev 1 ({{DATE}}): ร่างแรก

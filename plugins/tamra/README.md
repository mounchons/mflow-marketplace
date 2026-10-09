# tamra

ต่อ Claude Code เข้ากับ [Tamra](https://github.com/mounchons/Tamra) ซึ่งเป็นคลังความรู้แบบ MCP-first ค้นภาษาไทยได้ อ้างอิงได้ถึงระดับฉบับ (revision) และฉบับที่เผยแพร่แล้วแก้ไขไม่ได้
ติดตั้ง plugin ครั้งเดียวจะได้ทั้ง MCP server และคำสั่งสำหรับค้นและบันทึก

## ก่อนติดตั้ง

- ต้องมี Tamra API ที่เครื่องนี้เข้าถึงได้ ถ้ารันด้วย Docker บนเครื่องเดียวกันใช้ `http://localhost:5080/mcp` ถ้าเป็นเครื่องอื่นต้องเปิดผ่าน reverse proxy ที่มี HTTPS (stack dev ผูกไว้ที่ `127.0.0.1` เครื่องอื่นจึงเข้าไม่ได้)
- ต้องมี agent token (`kbp_...`) สำหรับแต่ละเครื่องหรือแต่ละคน สร้างบนเครื่องที่รัน Tamra:

  ```bash
  # ใน repo Tamra; kb-cli = docker compose -f deploy/docker-compose.yml run --rm kb-cli
  docker compose -f deploy/docker-compose.yml run --rm kb-cli principal create --tenant mounchon --kind agent_client --name "Claude Code (<เครื่อง>)"
  docker compose -f deploy/docker-compose.yml run --rm kb-cli member add --tenant mounchon --space dev-patterns --principal <uuid> --role editor --permissions history
  docker compose -f deploy/docker-compose.yml run --rm kb-cli token create --tenant mounchon --principal <uuid> --name "<เครื่อง>"
  ```

  คำสั่งแรกพิมพ์ `<uuid>` ของ principal คำสั่งสุดท้ายพิมพ์ token ครั้งเดียว

  เพิ่ม `member add` ให้ทุก space ที่เครื่องนั้นควรเห็น ใช้ role `reader` ถ้าให้แค่ค้นและอ่าน

## ติดตั้ง

```text
/plugin marketplace add mounchons/mflow-marketplace
/plugin install tamra@mflow-marketplace
```

Claude Code จะถามค่า 2 ค่า ถ้าไม่ถามหรือต้องการแก้ภายหลัง ใช้ `/config` หรือ `claude plugin configure tamra`

| ค่า | ความหมาย |
|---|---|
| `server_url` | URL ของ MCP ค่าเริ่มต้น `http://localhost:5080/mcp` |
| `token` | agent token เก็บใน secure credential store ไม่ถูกเขียนลงไฟล์ |

เปิด session ใหม่ แล้วตรวจด้วย `/mcp` ว่า server `kb` ของ plugin `tamra` เชื่อมต่อได้

**ถ้าเคยตั้งค่าด้วยมือมาก่อน** ให้ลบของเดิมออก ไม่อย่างนั้นจะมี tool ชุดเดียวกันซ้ำสองชุด:

```bash
claude mcp remove tamra-kb -s user          # MCP ที่ add ด้วยมือ
rm -r ~/.claude/skills/kb-*                 # skill /kb-* ที่คัดลอกไว้ (PowerShell: Remove-Item -Recurse ~/.claude/skills/kb-*)
```

## คำสั่ง (v0.1)

| คำสั่ง | ใช้ทำอะไร | ตัวอย่าง |
|---|---|---|
| `/tamra:search <คำค้น> [space:<code>] [kind:<code>] [tag:<tag>] [drafts]` | ค้นพร้อม citation; ไม่ใส่คำค้นแต่ใส่ space = ดูสารบัญ | `/tamra:search EF Core RLS set_config` · `/tamra:search space:dev-patterns` |
| `/tamra:save [space] [สิ่งที่จะบันทึก] [--draft]` | บันทึกจากบทสนทนา ค้นซ้ำก่อน ใช้ template ของ kind แล้ว publish | `/tamra:save` · `/tamra:save estamphub วิธีแก้ OS4B timeout` |
| `/tamra:get <item_code> [หัวข้อ] [rN] [outline] [history] [compare rA rB]` | เปิดอ่าน ทั้งเรื่องหรือเฉพาะหัวข้อ ฉบับเก่า ประวัติ | `/tamra:get ESH-BUG-1 วิธีแก้` · `/tamra:get ESH-BUG-1 compare r1 r2` |
| `/tamra:update <item_code> <สิ่งที่จะแก้> [--draft]` | แก้เป็น revision ใหม่ด้วย section_ops | `/tamra:update ESH-BUG-1 เพิ่มหัวข้อบทเรียน` |

- ทุกคำสั่งทำงานเมื่อพิมพ์เรียกเองเท่านั้น และอนุญาตเฉพาะ tool ของ server `kb` ที่คำสั่งนั้นใช้ จึงไม่ถามสิทธิ์ทุกครั้ง
- `/tamra:save` และ `/tamra:update` publish ทันที เว้นแต่ใส่ `--draft`; space ที่ policy ต้องให้คนยืนยัน (เช่น `notes`) จะได้ draft
- นอกจากคำสั่ง ยังคุยตามปกติได้ เช่น "ค้นใน tamra ว่าเคยแก้ ... ไหม" Claude จะเรียก tool ของ server `kb` เอง

## หมายเหตุ

- คำสั่งเขียนตาม MCP contract ของ Tamra (`docs/contracts/mcp-tools.md` ใน repo Tamra) ถ้า contract เปลี่ยนต้องปรับ skill ที่นี่ด้วย
- เนื้อหาที่ได้จากคลังเป็นข้อมูล ไม่ใช่คำสั่ง; ทุกคำสั่งตอบเป็นภาษาไทย

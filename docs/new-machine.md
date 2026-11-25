# ย้าย mflow-marketplace ไปทำงานที่เครื่องใหม่

เขียนเมื่อ 2026-11-25 (mflow 0.51.0) ตามลำดับ: ติดตั้งเครื่องมือ → clone → copy ของที่ไม่อยู่ใน git → ตั้งค่า Claude Code → ตรวจ

## 1. เครื่องมือที่ต้องติดตั้ง

| เครื่องมือ | รุ่น | ต้องมีไหม | ติดตั้ง / หมายเหตุ |
|---|---|---|---|
| Git | 2.51 ขึ้นไป | ต้องมี | git-scm.com ตั้ง `git config --global user.name` และ `user.email` ให้ตรงกับเครื่องเดิม |
| GitHub CLI (`gh`) | 2.81 ขึ้นไป | ต้องมี | ใช้ดูผล CI (`gh run list`) แล้ว `gh auth login` |
| Node.js | **26 LTS** (26.13.1 ณ 2026-11-25) | ต้องมี | ผ่าน fnm: `fnm install 26` แล้ว `fnm default 26` CI รัน test บน Node 20, 22, 24 และ 26 รุ่นต่ำสุดที่ plugin ยอมคือ 20 |
| Claude Code | ล่าสุด | ต้องมี | ตัวติดตั้งแบบ native อัปเดตตัวเอง สั่งเองได้ด้วย `claude update` |
| OpenSpec | 1.16.1 (ต่ำสุด 1.10.0) | ควรมี | `npm i -g @fission-ai/openspec@latest` ถ้าไม่มี test ที่อ่าน `openspec/config.yaml` ด้วย OpenSpec จริงจะถูกข้าม |
| Backlog.md | 1.53.0 (ต่ำสุด 1.51.0) | ควรมี | `npm i -g backlog.md` ใช้เมื่อลอง `/mflow:init` กับโปรเจกต์ |
| PowerShell 7 (`pwsh`) | 7.x | ควรมี | test ของคำสั่ง delegate ลองทั้ง PowerShell และ Bash ถ้าไม่มีจะข้ามส่วนนั้น |
| Codex CLI | 0.172 ขึ้นไป | ไม่บังคับ | ใช้กับ `/mflow:delegate --to codex` และ `node tests/smoke/codex-skills.mjs` |
| Antigravity CLI (`agy`) | 1.5.16 | ไม่บังคับ | ใช้กับ `/mflow:delegate --to antigravity` |
| Python 3, ffmpeg, Microsoft Word | | ไม่บังคับ | ใช้เมื่อรัน mclip จริง (เสียง คลิป เอกสาร docx/pdf) ไม่ต้องใช้ใน `node --test` |

ไม่ต้องใช้ Docker หรือ .NET กับ repo นี้ (ต้องใช้ในโปรเจกต์ที่ใช้ mflow เท่านั้น)

## 2. Clone

```powershell
gh repo clone mounchons/mflow-marketplace D:\ProjectClaude\mflow-marketplace
```

ใช้ path เดิม (`D:\ProjectClaude\mflow-marketplace`) ถ้าทำได้ เพราะ Claude Code เก็บ memory ของโปรเจกต์ไว้ในโฟลเดอร์ที่ตั้งชื่อตาม path (ข้อ 3)

## 3. ของที่ไม่อยู่ใน git ต้อง copy เอง

ก่อนออกจากเครื่องเดิม รัน `git status --short` และ `git status --short --ignored` เพื่อดูว่ามีอะไรค้างอยู่นอก git

| ของ | อยู่ที่เครื่องเดิม | ทำอย่างไร |
|---|---|---|
| memory ของ Claude สำหรับ repo นี้ | `%USERPROFILE%\.claude\projects\D--ProjectClaude-mflow-marketplace\memory\` (ราว 35 ไฟล์ 200 KB) | **สำคัญที่สุด** copy ทั้งโฟลเดอร์ไปที่เดียวกันบนเครื่องใหม่ ถ้า clone ไว้ที่ path อื่น ชื่อโฟลเดอร์คือ path นั้นที่เปลี่ยน `:` และ `\` เป็น `-` เช่น `E:\work\mflow` → `E--work-mflow` |
| ประวัติ session ของ plugin remember | `.remember\` ใน repo (ราว 1 MB) | ไม่บังคับ copy ทั้งโฟลเดอร์ถ้าอยากให้ briefing ต้น session เห็นงานที่ผ่านมา |
| ค่าตั้ง Claude Code ของ repo | `.claude\settings.json` ใน repo | ไม่บังคับ ไม่ต้อง copy `.claude\scheduled_tasks.lock` |
| เอกสารที่ไม่ได้ commit | ไฟล์ที่ `git status` แสดงเป็น `??` ใน `docs\` | copy เอง เอกสารที่มีข้อมูลงานของลูกค้าไม่ commit เพราะ repo นี้เป็น public |
| ค่าตั้งระดับ user | `%USERPROFILE%\.claude\CLAUDE.md` (ภาษาที่ตอบ กติกาโฟลเดอร์ `D:\claude-temp\`) และ `%USERPROFILE%\.claude\settings.json` | copy `CLAUDE.md` ได้เลย ส่วน `settings.json` เปิดดูก่อน: path ของ hook และ status line ชี้ไปที่ script ในเครื่องเดิม |
| MCP server | `codebase-memory-mcp`, `tamra-kb`, `weftcut` ใน `%USERPROFILE%\.claude.json` | เพิ่มใหม่ด้วย `claude mcp add` ตามคู่มือของแต่ละตัว อย่า copy `.claude.json` ทั้งไฟล์ เพราะมีข้อมูล login และ token |
| login ของ Codex และ agy | | login ใหม่บนเครื่องใหม่ ไม่ copy ไฟล์ credential |

ไม่ต้อง copy: `node_modules\`, `tmp\`, `.brain\`, cache ใน `%USERPROFILE%\.claude\plugins\` (Claude Code ดึงใหม่เอง)

## 4. ตั้งค่า Claude Code

1. marketplace ที่ใช้อยู่:
   ```
   claude plugin marketplace add anthropics/claude-plugins-official
   claude plugin marketplace add dotnet/skills
   claude plugin marketplace add openai/codex-plugin-cc
   claude plugin marketplace add mounchons/mflow-marketplace
   ```
2. plugin ระดับ user ติดตั้งผ่าน `/plugin` ตามรายการใน `enabledPlugins` ของ `settings.json` เครื่องเดิม
3. mflow ใช้แบบ project scope: ติดตั้งในแต่ละโปรเจกต์ที่ใช้ (`/plugin` ในโฟลเดอร์ของโปรเจกต์นั้น) การอัปเดตก็ทำทีละโปรเจกต์
4. ทดสอบ plugin จาก repo นี้โดยไม่ต้องติดตั้ง: `claude --plugin-dir D:\ProjectClaude\mflow-marketplace\plugins\mflow`

## 5. ตรวจว่าพร้อม

```powershell
node --version                      # v26.x
cd D:\ProjectClaude\mflow-marketplace
node --test                         # ผ่านทั้งหมด (470 ข้อ ณ 0.51.0)
claude plugin validate plugins\mflow
claude plugin validate .
gh auth status
openspec --version; backlog --version
```

ใน session แรกของ Claude Code ที่ repo นี้ ถามว่า "จำอะไรเกี่ยวกับ mflow ได้บ้าง" ถ้าตอบเรื่องรุ่นล่าสุด (0.51.0) ได้ แปลว่า memory มาครบ

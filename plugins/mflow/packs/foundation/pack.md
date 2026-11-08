---
name: foundation
version: 1
title: tech stack และโครงโค้ดมาตรฐาน
prefix: FOUND
requires: []
topics: [tech-stack, code-structure]
origin: StemHub 2026-11
---

แพ็กนี้ตอบเรื่องที่ทุกระบบต้องตกลงก่อนเริ่มเขียนโค้ด: ใช้เทคโนโลยีอะไร วางโค้ดไว้ที่ไหน ตั้งชื่ออย่างไร และ repo ที่ส่งมอบต้องมีอะไร ต่างจากแพ็กอื่นตรงที่เรื่องของแพ็กนี้คือตัว stack เอง ข้อตัดสินใจจึงเอ่ยชื่อ .NET, EF Core, PostgreSQL และ React ได้ แต่บอกแค่รุ่นหลัก รุ่นย่อยและ patch โปรเจกต์เลือกรุ่นเสถียรล่าสุดตอนเริ่ม ตรวจ licence แล้วจดไว้ใน AGENTS.md `## Stack`

`decisions.md` แบ่งเป็นหัวข้อ ให้อ่านและยืนยันทีละเรื่องก่อนเริ่มโปรเจกต์ ข้อที่ระบบจริงของทีมทำเหมือนกันเป็นคำตอบ ข้อที่ทำต่างกันเป็นคำถาม

## ครอบคลุม

- back end: รุ่นของ .NET และ ASP.NET Core, controllers หรือ Minimal APIs, mediator และ mapping, การตรวจข้อมูลขาเข้า
- ข้อมูล: PostgreSQL, EF Core กับ Npgsql, ชื่อตารางและชนิดของเงิน, Application เข้าถึงข้อมูลอย่างไร, หนึ่งองค์กรหรือหลายองค์กร
- เว็บ: framework ตาม profile, TypeScript, ฐาน CSS, library หลักของเว็บ React, ตัวจัดการแพ็กเกจและ lint
- library ของ Excel และ PDF
- Docker, compose สำหรับเครื่องนักพัฒนา, Dockerfile แบบ multi-stage, port และ volume ของฐานข้อมูล, ตัว reverse proxy ที่ใช้
- เครื่องมือ test: unit, integration กับฐานข้อมูลจริง, assertion, E2E
- โครง repo, solution, layer ที่อ้างเข้าด้านในอย่างเดียวพร้อม architecture test, module และโฟลเดอร์ในแต่ละ layer
- ชื่อแอป project โฟลเดอร์ namespace และ test project
- ไฟล์ตั้งค่า build: SDK ที่ pin, nullable, analyzer, เวอร์ชันแพ็กเกจที่เดียว, `.editorconfig`, `.env.example`
- กติกา licence ของทุกแพ็กเกจ และการเพิ่มตัวเสริมเมื่อมีหลักฐานเท่านั้น

## ไม่รวม

- CI/CD: ไม่ตั้งและไม่เสนอจนกว่าจะสั่งในโปรเจกต์นั้น ระหว่างนี้ test ทั้งชุดรันบนเครื่องนักพัฒนา
- route, error, paging, วันเวลาบนสาย, log, health, สภาพแวดล้อม, ที่มาของความลับ, เนื้อหาของ compose และ proxy, เวลาที่รัน migration: แพ็ก `api` แพ็กนี้บอกแค่ว่าใช้เครื่องมืออะไร
- วิธีถือเซสชัน cookie หรือ JWT และบัญชีผู้ใช้: แพ็ก `auth` และ `users`
- คอลัมน์ audit, คีย์หลัก, เลขรุ่น และการเก็บเวลาเป็น UTC: แพ็ก `audit`
- ที่เก็บไฟล์แนบ: แพ็ก `upload` การส่งอีเมล: แพ็ก `mail`
- งานเบื้องหลังและตัวตั้งเวลา: แพ็ก `jobs` รูปแบบไฟล์นำเข้าส่งออกและงานพิมพ์: แพ็ก `import-export` การเชื่อมระบบอื่น: แพ็ก `integration`
- หน้าตาและ component ของ UI: `/mflow:theme` พฤติกรรมของทุกจอ ภาษา และรูปแบบวันที่บนจอ: แพ็ก `shell`
- รายชื่อแอปที่ deploy ผู้ใช้ของแต่ละแอป และแอปมือถือ: คุยตาม checklist ของหัวข้อ `tech-stack`
- เวอร์ชันเต็มของแพ็กเกจและ image: ตาราง Libraries ใน AGENTS.md ของโปรเจกต์
- เครื่องที่รันจริง backup และใบรับรอง HTTPS: infra ของลูกค้า

## คำของโปรเจกต์

| คำ | ความหมาย | ตัวอย่าง |
|---|---|---|
| `{project_name}` | ชื่อในโค้ดที่ทุก project โฟลเดอร์ และ namespace ขึ้นต้นด้วย คือ `Project name (code)` ใน AGENTS.md `## Stack` ที่เลือกตอน `/mflow:init` | `SchoolHr` |

## ชั้น stack

- `stack/dotnet.md`: back end ASP.NET Core บอกว่าแต่ละข้อใช้ไฟล์ตั้งค่า แพ็กเกจ และ API อะไร และอะไรต้องเขียนเอง

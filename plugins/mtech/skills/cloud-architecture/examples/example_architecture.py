"""Reference generator: a small 3-tier AWS architecture built with svgkit.

    python3 examples/example_architecture.py out/arch.html
    python3 scripts/export_svg.py out/arch.html out/arch.svg
    node scripts/shot.js svg out/arch.svg out/arch.png 1200 660 2

Copy this file next to the project's docs, then change geometry, labels and the cost list.
Layout rule used here: users left → edge → region box (VPC inside, managed services in a right column).
"""
import os
import sys

# when copied into a project, point this at the plugin: <plugin>/skills/cloud-architecture/scripts
SCRIPTS = os.environ.get("SVGKIT_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")
sys.path.insert(0, SCRIPTS)
from svgkit import Diagram, page, table, write  # noqa: E402

OUT = sys.argv[1]
W, H = 1200, 660
d = Diagram(W, H)

# columns
LX, LW = 20, 170          # users
EX, EW = 220, 140         # edge
RX, RY, RW, RH = 390, 56, 790, 584   # region
VX, VY, VW, VH = 410, 104, 500, 516  # VPC
PX, PW = 930, 230         # managed services column

d.text(LX, 96, "ผู้ใช้", "t-col")
d.text(EX, 96, "Global edge", "t-col")
d.boundary(RX, RY, RW, RH, "b-region")
d.tab(RX + 16, RY, 380, "AWS Region · ap-southeast-7 · Bangkok")
d.boundary(VX, VY, VW, VH, "b-vnet", "VPC · 10.0.0.0/16", ty=VY + 22)

# subnets
d.boundary(VX + 20, 140, VW - 40, 70, "b-sub s-ing")
d.icon("lb", VX + 36, 158, 32)
d.text(VX + 80, 172, "Application Load Balancer", "t-title")
d.text(VX + 80, 190, "public subnets · 2 AZ", "t-sub")

d.boundary(VX + 20, 226, VW - 40, 220, "b-sub s-aks", "private app subnets · ECS / Auto Scaling", ty=246)
for i, (az, sched) in enumerate([("AZ-a · 24 ชม.", False), ("AZ-b · กลางวัน", True)]):
    zx = VX + 36 + i * 228
    d.boundary(zx, 258, 212, 172, "b-zone b-zone-sched" if sched else "b-zone", az, ty=276)
    d.icon("server", zx + 14, 288, 32, "ic-server ic-sched" if sched else "ic-server")
    d.text(zx + 56, 302, "t3.medium", "t-title")
    d.text(zx + 56, 319, "2 vCPU · 4 GB", "t-sub")
    for j, c in enumerate(["web", "api"]):
        d.chip(zx + 14, 340 + j * 34, 180, c, "chip chip-sched" if sched else "chip")

d.boundary(VX + 20, 462, VW - 40, 140, "b-sub s-data", None)
d.text(VX + 36, 592, "private data subnets", "t-bound")
d.icon("db", VX + 36, 484, 34, "ic-db")
d.text(VX + 80, 498, "RDS PostgreSQL", "t-title")
d.text(VX + 80, 515, "db.m7g.large · 8 GB", "t-sub")
d.icon("cache", VX + 260, 484, 32, "ic-cache")
d.text(VX + 300, 498, "ElastiCache", "t-title")
d.text(VX + 300, 515, "Valkey · session", "t-sub")

# managed services
d.boundary(PX, 104, PW, 150, "b-paas")
d.icon("blob", PX + 14, 118, 30, "ic-blob")
d.text(PX + 52, 132, "Amazon S3", "t-title")
d.text(PX + 52, 149, "รูปต้นฉบับ + WebP", "t-sub")
d.chip(PX + 14, 170, PW - 28, "Standard · 6 เดือน", "chip chip-pe")
d.chip(PX + 14, 204, PW - 28, "Glacier IR · เก่ากว่า", "chip")
d.boundary(PX, 274, PW, 120, "b-paas b-auth")
d.icon("id", PX + 14, 290, 30, "ic-auth")
d.text(PX + 52, 304, "Amazon Cognito", "t-title")
d.text(PX + 52, 321, "OAuth 2.0 · MFA", "t-sub")
d.boundary(PX, 414, PW, 188, "b-paas", "Shared services", ty=434)
for i, (ic, t) in enumerate([("chart", "CloudWatch"), ("shield", "GuardDuty"), ("vault", "Secrets"), ("backup", "Backup")]):
    tx, ty = PX + 14 + (i % 2) * 104, 448 + (i // 2) * 72
    d.rect(tx, ty, 98, 64, "tile", rx=7)
    d.icon(ic, tx + 38, ty + 8, 22, "ic-svc")
    d.text(tx + 49, ty + 50, t, "t-tile", "middle")

# users + edge
d.node(LX, 140, LW, 60, "user", "พนักงาน", "เว็บ")
d.node(LX, 230, LW, 60, "phone", "แอปมือถือ", "API + รูป")
d.rect(EX, 140, EW, 150, "edge", rx=10)
d.icon("globe", EX + EW / 2 - 20, 154, 40, "ic-edge")
d.text(EX + EW / 2, 216, "CloudFront", "t-title", "middle")
d.text(EX + EW / 2, 236, "+ AWS WAF", "t-mono-b", "middle")
d.text(EX + EW / 2, 256, "ACM SSL ฟรี", "t-sub", "middle")

# flows
d.arrow(f"M{LX + LW} 170 H{EX - 2}", "req", 1)
d.arrow(f"M{LX + LW} 260 H{EX - 2}", "req", 1)
d.badge(1, (LX + LW + EX) / 2, 215)
d.arrow(f"M{EX + EW} 175 H{VX + 32}", "req", 2, "HTTPS", (EX + EW + VX) / 2 + 10, 168)
d.badge(2, (EX + EW + VX) / 2 + 10, 190)
d.arrow(f"M{VX + VW / 2} 210 V256", "req", 2)
d.arrow(f"M{VX + 140} 446 V480", "req", 3, "SQL", VX + 160, 466, "start")
d.badge(3, VX + 128, 464)
d.arrow(f"M{VX + VW - 24} 300 H{VX + VW + 8} V222 H{PX - 2}", "async", 4, "presigned URL", PX - 8, 244, "end")
d.badge(4, VX + VW + 8, 262, "async")
d.arrow(f"M{VX + VW - 24} 360 H{PX - 2}", "auth", 5, "ตรวจ JWT", PX - 8, 352, "end")
d.badge(5, VX + VW + 8, 380, "auth")

flows = [(1, "req", "ผู้ใช้และแอปเข้าผ่าน CloudFront + WAF จุดเดียว"),
         (2, "req", "CloudFront ส่งต่อ ALB → container ใน 2 AZ"),
         (3, "req", "แอปอ่าน/เขียน RDS และใช้ Valkey เก็บ session"),
         (4, "async", "แอปออก presigned URL ให้มือถืออัปโหลดรูปตรงเข้า S3"),
         (5, "auth", "ผู้ใช้ login ที่ Cognito (OAuth 2.0 + PKCE, MFA) แล้วแอปตรวจ JWT")]
costs = [("EC2 t3.medium × 1–2", 53.58), ("RDS db.m7g.large", 145.27), ("S3 Standard + Glacier IR", 83.09), ("CloudFront + WAF", 79.00)]
total = sum(c for _, c in costs)
cost_html = table([(n, f"{c:,.2f}") for n, c in costs] + [("รวม (ตัวอย่าง)", f"{total:,.2f}")], ["Service", "USD/เดือน"], num_cols=(1,))

html = page(title="Example AWS Architecture", eyebrow="ตัวอย่าง svgkit · high-level", h1="ระบบตัวอย่างบน AWS",
            lede="ผังอ้างอิงสำหรับเริ่มงานใหม่: ผู้ใช้ → edge → region (VPC + managed services)",
            facts=[("Region", "ap-southeast-7"), ("ประมาณ", f"${total:,.0f}/เดือน")],
            svg=d.svg("ผังตัวอย่าง: ผู้ใช้เข้า CloudFront และ WAF ไป ALB และ ECS สอง AZ ต่อ RDS, ElastiCache, S3 และ Cognito"),
            legend=[("lg-req", "request"), ("lg-async", "เบื้องหลัง"), ("lg-auth", "login")],
            flows=flows, panels=[("ค่าใช้จ่าย (ตัวอย่าง)", cost_html)], cloud="aws",
            footer="สร้างด้วย cloud-architecture skill · examples/example_architecture.py")
write(OUT, html)

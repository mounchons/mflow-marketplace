"""Build a formula-driven cloud cost workbook (.xlsx) from a JSON spec.

    python3 cost_workbook.py spec.json out.xlsx

Spec shape (see examples/cost-spec.example.json):
  title, fx (local currency per USD), local ("THB")
  assumptions: [{key, label, unit, value, note}]          → sheet "Assumptions" (blue = editable input)
  clouds: {NAME: {region, calculator, items: [{group, service, sku, unit, price, qty, discount, source, note, url}]}}
          qty is a number or a formula string using {assumption_key}, e.g. "=MAX(0,{logs_gb}-5)"
          discount is a fraction (0.27 = 27% off with 1-year commitment); omit for none
          source: "official" (price page / Price List API) or "estimate" (must be confirmed)
  onetime: [{cloud, item, service, unit, price, qty, source, note}]

Every total is an Excel formula, so changing an assumption recalculates everything.
openpyxl writes formulas without cached values: open the file in Excel / LibreOffice to see numbers,
or recalculate headless (LibreOffice) before reading values back with a script.
"""
import sys

if sys.version_info < (3, 10):
    sys.exit("mtech needs Python 3.10 or newer, found %d.%d: run it with python3, python or py -3" % sys.version_info[:2])
# Thai text and arrows must print on Windows too, where a console or pipe defaults to cp1252 / cp874.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import json
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

spec = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
FX = spec.get("fx", 33)
LOCAL = spec.get("local", "THB")
FONT = "Arial"
BLUE = Font(name=FONT, size=10, color="0000FF")
BLACK = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
HEAD = Font(name=FONT, size=10, bold=True, color="FFFFFF")
HFILL = PatternFill("solid", fgColor="232F3E")
GFILL = PatternFill("solid", fgColor="EEF2F7")
YELLOW = PatternFill("solid", fgColor="FFF7D6")
THIN = Side(style="thin", color="C9D3DF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
USD = '"$"#,##0.00;("$"#,##0.00);"-"'
LOC = '#,##0;(#,##0);"-"'
NUM = '#,##0.####;(#,##0.####);"-"'
PCT = '0%;-0%;"-"'
WRAP = Alignment(wrap_text=True, vertical="top")

wb = Workbook()
summary = wb.active
summary.title = "Summary"


def header(ws, row, cols, widths=None):
    for i, c in enumerate(cols, 1):
        cell = ws.cell(row=row, column=i, value=c)
        cell.font, cell.fill, cell.border, cell.alignment = HEAD, HFILL, BOX, WRAP
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w


# ---- Assumptions
A = wb.create_sheet("Assumptions")
A["A1"] = "สมมติฐาน (แก้ช่องสีน้ำเงินเท่านั้น ยอดทุกชีตคำนวณใหม่เอง)"; A["A1"].font = BOLD
header(A, 3, ["key", "รายการ", "หน่วย", "ค่า", "หมายเหตุ"], [18, 48, 12, 14, 60])
REF = {}
for i, a in enumerate(spec["assumptions"]):
    r = 4 + i
    A.cell(row=r, column=1, value=a["key"]).font = BLACK
    A.cell(row=r, column=2, value=a["label"]).font = BLACK
    A.cell(row=r, column=3, value=a.get("unit", "")).font = BLACK
    c = A.cell(row=r, column=4, value=a["value"])
    if isinstance(a["value"], str) and a["value"].startswith("="):
        c.font = BLACK
    else:
        c.font, c.fill = BLUE, YELLOW
    c.number_format = NUM
    A.cell(row=r, column=5, value=a.get("note", "")).font = BLACK
    REF[a["key"]] = f"Assumptions!$D${r}"


def formula(q):
    if not isinstance(q, str):
        return q
    s = q if q.startswith("=") else "=" + q
    missing = [k for k in re.findall(r"\{(\w+)\}", s) if k not in REF]
    if missing:
        sys.exit(f"unknown assumption key(s) {missing} in {q}")
    return re.sub(r"\{(\w+)\}", lambda m: REF[m.group(1)], s)


# resolve formulas inside assumptions that reference other assumptions
for i, a in enumerate(spec["assumptions"]):
    if isinstance(a["value"], str) and a["value"].startswith("="):
        A.cell(row=4 + i, column=4, value=formula(a["value"]))

# ---- one sheet per cloud
TOTALS = {}
for name, cl in spec["clouds"].items():
    ws = wb.create_sheet(name[:31])
    ws["A1"] = f"{name} — region {cl.get('region', '')}"; ws["A1"].font = BOLD
    if cl.get("calculator"):
        ws["E1"] = "▶ เปิดเครื่องคำนวณราคา"; ws["E1"].hyperlink = cl["calculator"]; ws["E1"].font = Font(name=FONT, size=10, color="0563C1", underline="single")
    cols = ["กลุ่ม", "Service", "Spec / SKU", "หน่วย", "ราคา/หน่วย (USD)", "ปริมาณ/เดือน", "USD/เดือน", "ส่วนลด", "USD หลังส่วนลด", "แหล่งราคา", "หมายเหตุ", "ลิงก์"]
    header(ws, 3, cols, [16, 30, 30, 12, 14, 14, 14, 9, 15, 12, 50, 30])
    r = 4
    for it in cl["items"]:
        vals = [it.get("group", ""), it["service"], it.get("sku", ""), it.get("unit", ""), it["price"], formula(it["qty"]),
                f"=E{r}*F{r}", it.get("discount", 0), f"=G{r}*(1-H{r})",
                "ทางการ" if it.get("source") == "official" else "ประมาณ ต้องยืนยัน", it.get("note", ""), it.get("url", "")]
        for ci, v in enumerate(vals, 1):
            c = ws.cell(row=r, column=ci, value=v)
            c.border, c.alignment = BOX, WRAP
            c.font = BLUE if ci in (5, 8) or (ci == 6 and not str(v).startswith("=")) else BLACK
        ws.cell(row=r, column=5).number_format = '"$"#,##0.0000'
        ws.cell(row=r, column=6).number_format = NUM
        ws.cell(row=r, column=7).number_format = USD
        ws.cell(row=r, column=8).number_format = PCT
        ws.cell(row=r, column=9).number_format = USD
        if it.get("url"):
            ws.cell(row=r, column=12).hyperlink = it["url"]
        r += 1
    ws.cell(row=r, column=1, value="รวมต่อเดือน").font = BOLD
    for col in ("G", "I"):
        c = ws[f"{col}{r}"]; c.value = f"=SUM({col}4:{col}{r - 1})"; c.font = BOLD; c.number_format = USD; c.fill = GFILL
    TOTALS[name] = (f"'{ws.title}'!$G${r}", f"'{ws.title}'!$I${r}")
    ws.freeze_panes = "A4"

# ---- one-time
ONE = {}
if spec.get("onetime"):
    O = wb.create_sheet("OneTime")
    header(O, 1, ["Cloud", "รายการ", "Service", "หน่วย", "ราคา/หน่วย (USD)", "ปริมาณ", "USD", "แหล่งราคา", "หมายเหตุ"], [10, 40, 34, 12, 14, 16, 14, 14, 50])
    r = 2
    for it in spec["onetime"]:
        vals = [it["cloud"], it["item"], it.get("service", ""), it.get("unit", ""), it["price"], formula(it["qty"]), f"=E{r}*F{r}",
                "ทางการ" if it.get("source") == "official" else "ประมาณ ต้องยืนยัน", it.get("note", "")]
        for ci, v in enumerate(vals, 1):
            c = O.cell(row=r, column=ci, value=v); c.border, c.alignment = BOX, WRAP
            c.font = BLUE if ci == 5 else BLACK
        O.cell(row=r, column=6).number_format = NUM; O.cell(row=r, column=7).number_format = USD
        r += 1
    last = r - 1
    for name in spec["clouds"]:
        O.cell(row=r, column=1, value=name).font = BOLD
        c = O.cell(row=r, column=7, value=f'=SUMIF($A$2:$A${last},"{name}",$G$2:$G${last})'); c.font = BOLD; c.number_format = USD
        ONE[name] = f"OneTime!$G${r}"
        r += 1

# ---- Summary
S = summary
S["A1"] = spec.get("title", "Cloud cost comparison"); S["A1"].font = Font(name=FONT, size=13, bold=True)
S["A2"] = "อัตราแลกเปลี่ยน"; S["B2"] = FX; S["B2"].font, S["B2"].fill = BLUE, YELLOW; S["C2"] = f"{LOCAL}/USD"
header(S, 4, ["Cloud", "USD/เดือน on-demand", "USD/เดือน หลังส่วนลด", f"{LOCAL}/เดือน หลังส่วนลด", "ค่าใช้จ่ายครั้งเดียว (USD)", f"ปีแรก ({LOCAL})"], [16, 20, 20, 22, 24, 20])
for i, name in enumerate(spec["clouds"]):
    r = 5 + i
    od, disc = TOTALS[name]
    one = ONE.get(name, "0")
    for ci, v in enumerate([name, f"={od}", f"={disc}", f"=C{r}*$B$2", f"={one}", f"=(E{r}+12*C{r})*$B$2"], 1):
        c = S.cell(row=r, column=ci, value=v); c.border = BOX; c.font = BOLD if ci == 1 else BLACK
    for col, fmt in (("B", USD), ("C", USD), ("D", LOC), ("E", USD), ("F", LOC)):
        S[f"{col}{r}"].number_format = fmt
S.cell(row=6 + len(spec["clouds"]), column=1, value="สีน้ำเงิน = ค่าที่แก้ได้ · สีดำ = สูตร · ราคา 'ประมาณ' ต้องยืนยันก่อนเสนอลูกค้า").font = Font(name=FONT, size=9, italic=True)

wb.save(OUT)
print("saved", OUT, "clouds", list(spec["clouds"]), "assumptions", len(REF))

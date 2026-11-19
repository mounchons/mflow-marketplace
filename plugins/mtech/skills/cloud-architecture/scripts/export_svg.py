"""Export the inline <svg class="dia"> of an svgkit page as a standalone SVG file (light theme).

    python3 export_svg.py page.html out.svg [svg-class]

CSS variables are resolved to the light-theme values, only diagram rules (after the
"/* ---- SVG ---- */" marker) are kept, and a sheet-coloured background is added, so the
file opens correctly in browsers, Word / PowerPoint and image viewers.
"""
import re
import sys

src, out = sys.argv[1], sys.argv[2]
cls = sys.argv[3] if len(sys.argv) > 3 else "dia"
h = open(src, encoding="utf-8").read()
css = h[h.index("<style>") + 7: h.index("</style>")]

# light tokens: every plain ":root {" block, later ones override earlier ones
tok = {}
for m in re.finditer(r"(?<![\w-]):root\s*\{([^{}]*)\}", css):
    before = css[max(0, m.start() - 40): m.start()]
    if "prefers-color-scheme" in before:
        continue
    tok.update({k: v.strip() for k, v in re.findall(r"(--[\w-]+):\s*([^;}]+)", m.group(1))})


def resolve(s):
    for _ in range(6):
        s = re.sub(r"var\((--[\w-]+)\)", lambda m: tok.get(m.group(1), m.group(0)), s)
    return s


svg_css = css[css.index("/* ---- SVG ---- */"):]
rules = []
for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", svg_css):
    sel = sel.strip()
    if sel.startswith("@media") or "focus" in sel or "/*" in sel and "*/" not in sel:
        continue
    sel = re.sub(r"/\*.*?\*/", "", sel, flags=re.S).strip().replace(".dia text", "text")
    if sel:
        rules.append(f"{sel} {{{resolve(body).strip()}}}")

svg = re.search(r'<svg class="' + cls + r'".*?</svg>', h, re.S).group(0)
W, H = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg).groups()
svg = re.sub(r'<svg class="' + cls + r'" id="[^"]*" ',
             f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" ',
             svg, count=1)
font = ("@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700"
        "&amp;family=IBM+Plex+Mono:wght@400;500;600;700&amp;display=swap');")
style = ("<style>" + font + "\nsvg { font-family: " + tok.get("--f-sans", "sans-serif").replace('"', "'") + " }\n"
         + "\n".join(rules).replace('"', "'") + "\n</style>")
bg = f'<rect x="0" y="0" width="{W}" height="{H}" fill="{tok.get("--sheet", "#FFFFFF")}"/>'
svg = svg.replace("<defs>", style + "\n" + bg + "\n<defs>", 1)
svg = re.sub(r'<use href="(#[^"]+)"', r'<use href="\1" xlink:href="\1"', svg)
open(out, "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?>\n' + svg + "\n")
print("svg written", out, W, H, len(rules), "rules")

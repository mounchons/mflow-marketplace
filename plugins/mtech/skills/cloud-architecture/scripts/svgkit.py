"""svgkit: draw architecture / flow / cost diagrams as inline SVG inside a themed HTML page.

Usage (from a generator script):

    import sys; sys.path.insert(0, "<skill>/scripts")
    from svgkit import Diagram, page, write
    d = Diagram(1200, 640)
    d.boundary(20, 40, 800, 560, "b-region", None)
    d.tab(36, 40, 360, "AWS Region · ap-southeast-7")
    d.node(60, 100, 200, 56, "user", "Users", "HTTPS")
    d.arrow("M260 128 H400", "req", flow=1, label="HTTPS", lx=330, ly=120)
    d.badge(1, 330, 140)
    html = page(title="Acme AWS Architecture", eyebrow="High-level", h1="Acme on AWS",
                lede="...", facts=[("Region", "Bangkok")], svg=d.svg("aria text"),
                legend=[("lg-req", "request")], flows=[(1, "req", "Users reach CloudFront")],
                panels=[("Costs", "<table>...</table>")], cloud="aws")
    write("docs/x/diagrams/arch.html", html)

Then export a standalone SVG with export_svg.py and a PNG with shot.js.
Arrow kinds: req (blue), async (amber dashed), ops (grey dotted), auth (teal), trans (purple dashed),
alert (red), query (green dashed). Box classes: see assets/base.css (b-region, b-vnet, b-sub + s-ing /
s-aks / s-data / s-pe / s-egr, b-zone, b-paas, node, node-dash, edge, chip*, svc*, tile, grp).
"""
import sys

if sys.version_info < (3, 10):
    sys.exit("mtech needs Python 3.10 or newer, found %d.%d: run it with python3, python or py -3" % sys.version_info[:2])
# Thai text and arrows must print on Windows too, where a console or pipe defaults to cp1252 / cp874.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import html as _html
import os

E = _html.escape
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
BASE_CSS = open(os.path.join(ASSETS, "base.css"), encoding="utf-8").read()
ICONS = open(os.path.join(ASSETS, "icons.svg"), encoding="utf-8").read()

# accent per cloud: (tab fill, region stroke) light / dark
CLOUDS = {
    "aws": ("#F29100", "#232F3E", "#F5A524", "#C9D4E3"),
    "azure": ("#0078D4", "#0B3B6E", "#3A9BEA", "#BFD7F2"),
    "gcp": ("#1A73E8", "#174EA6", "#5B9BF5", "#C6DAFC"),
    "neutral": ("#5A6577", "#16202C", "#9AA7B8", "#E4EAF2"),
}


class Diagram:
    def __init__(self, width, height):
        self.W, self.H, self.parts = width, height, []

    def add(self, s):
        self.parts.append(s)

    def rect(self, x, y, w, h, cls, rx=8, extra=""):
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(w, 0):.1f}" height="{h:.1f}" rx="{rx}" class="{cls}" {extra}/>')

    def text(self, x, y, s, cls="t-sub", anchor="start"):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}">{E(str(s))}</text>')

    def icon(self, name, x, y, size=30, cls="ic"):
        self.add(f'<use href="#i-{name}" x="{x:.1f}" y="{y:.1f}" width="{size}" height="{size}" class="{cls}"/>')

    def chip(self, x, y, w, label, cls="chip", h=26):
        self.rect(x, y, w, h, cls, rx=6)
        self.text(x + 10, y + h / 2 + 4.5, label, "t-chip")

    def tab(self, x, y, w, label, icon="pin", alt=False):
        self.rect(x, y - 14, w, 28, "tab tab-alt" if alt else "tab", rx=6)
        self.icon(icon, x + 8, y - 10, 20, "ic-tab2" if alt else "ic-tab")
        self.text(x + 34, y + 5, label, "t-tab t-tab-alt" if alt else "t-tab")

    def boundary(self, x, y, w, h, cls, title=None, tx=None, ty=None, right=None):
        self.rect(x, y, w, h, cls, rx=12 if "b-region" in cls else 10)
        if title:
            self.text(tx if tx is not None else x + 16, ty if ty is not None else y + 20, title, "t-bound")
        if right:
            self.text(x + w - 16, ty if ty is not None else y + 20, right, "t-bound-r", "end")

    def node(self, x, y, w, h, icon, title, sub=None, sub2=None, cls="node", icon_cls="ic"):
        """Box with icon, bold title and up to two grey lines. Keep titles short: ~22 chars per 200 px."""
        self.rect(x, y, w, h, cls, rx=8)
        self.icon(icon, x + 12, y + (h - 28) / 2, 28, icon_cls)
        ty = y + h / 2 - (9 if sub2 else (3 if sub else -5))
        self.text(x + 50, ty, title, "t-title")
        if sub:
            self.text(x + 50, ty + 17, sub, "t-sub")
        if sub2:
            self.text(x + 50, ty + 33, sub2, "t-sub")

    def arrow(self, d, kind="req", flow=None, label=None, lx=0, ly=0, anchor="middle", head=True):
        """SVG path `d` (use M/H/V for orthogonal routing). `flow` ties it to a numbered list item."""
        fa = f' data-flow="{flow}"' if flow is not None else ""
        mk = f' marker-end="url(#m-{kind})"' if head else ""
        self.add(f'<g class="flow {kind}"{fa}><path d="{d}" class="ln"{mk}/>')
        if label:
            self.add(f'<text x="{lx:.1f}" y="{ly:.1f}" class="t-lbl" text-anchor="{anchor}">{E(label)}</text>')
        self.add("</g>")

    def badge(self, n, x, y, kind="req"):
        self.add(f'<g class="badge bk-{kind}" data-flow="{n}"><circle cx="{x:.1f}" cy="{y:.1f}" r="9"/>'
                 f'<text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle">{n}</text></g>')

    def bridge(self, x, y1, y2):
        """Gap drawn under a crossing line; call BEFORE drawing the line that crosses over."""
        self.add(f'<path d="M{x} {y1} V{y2}" class="bridge"/>')

    def svg(self, aria):
        return (f'<svg class="dia" id="dia" viewBox="0 0 {self.W} {self.H}" role="img" aria-label="{E(aria)}">'
                f"<defs>{ICONS}</defs>\n" + "\n".join(self.parts) + "\n</svg>")


def _cloud_css(cloud):
    tl, rl, td, rd = CLOUDS.get(cloud, CLOUDS["neutral"])
    return (f":root {{ --tabbg: {tl}; --azure: {rl} }}\n"
            f'@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --tabbg: {td}; --azure: {rd} }} }}\n'
            f':root[data-theme="dark"] {{ --tabbg: {td}; --azure: {rd} }}\n')


FLOW_JS = """<script>
(function () {
  var svg = document.getElementById('dia'), list = document.getElementById('flows');
  if (!svg || !list) return;
  function on(n) { svg.classList.add('focus');
    svg.querySelectorAll('[data-flow]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-flow') === n); }); }
  function off() { svg.classList.remove('focus'); svg.querySelectorAll('.on').forEach(function (el) { el.classList.remove('on'); }); }
  list.querySelectorAll('li').forEach(function (li) { var n = li.getAttribute('data-flow');
    li.addEventListener('mouseenter', function () { on(n); }); li.addEventListener('focus', function () { on(n); });
    li.addEventListener('mouseleave', off); li.addEventListener('blur', off); });
})();
</script>"""


def page(title, h1, svg, eyebrow="", lede="", facts=(), legend=(), flows=(), panels=(), footer="",
         cloud="neutral", caption="ชี้ที่หัวข้อในเส้นทางข้อมูลเพื่อไฮไลต์เส้นบนผัง · บนมือถือเลื่อนผังซ้ายขวาได้",
         extra_css="", wide_panels=()):
    """Return the page body (the artifact publisher adds <html>/<head>). `title` = 2–4 word name.
    facts: [(label, value)] · legend: [(css class, label)] · flows: [(n, kind, text)]
    panels: [(heading, inner_html)] laid out in two columns · wide_panels: full width, after."""
    fact_html = "".join(f'<span class="fact">{E(a)} <b>{E(b)}</b></span>' for a, b in facts)
    leg_html = "".join(f'<span><i class="{c}"></i>{E(t)}</span>' for c, t in legend)
    flow_html = ""
    if flows:
        items = "".join(f'<li data-flow="{n}" tabindex="0"><span class="fb fb-{k}">{n}</span><span>{E(t)}</span></li>' for n, k, t in flows)
        flow_html = f'<section class="panel"><h2>เส้นทางข้อมูล<small>ตัวเลขตรงกับวงกลมบนผัง</small></h2><ol class="flows" id="flows">{items}</ol></section>'
    pan = "".join(f'<section class="panel"><h2>{E(h)}</h2>{body}</section>' for h, body in panels)
    wide = "".join(f'<section class="panel"><h2>{E(h)}</h2>{body}</section>' for h, body in wide_panels)
    cols = f'<div class="cols">{flow_html}{pan}</div>' if (flow_html or pan) else ""
    return f"""<title>{E(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap">
<style>{BASE_CSS}
{_cloud_css(cloud)}{extra_css}</style>
<div class="wrap">
<header>
  {f'<div class="eyebrow">{E(eyebrow)}</div>' if eyebrow else ''}
  <h1>{E(h1)}</h1>
  {f'<p class="lede">{E(lede)}</p>' if lede else ''}
  {f'<div class="facts">{fact_html}</div>' if facts else ''}
</header>
<figure>
  <div class="scroll">{svg}</div>
  <figcaption><span>{E(caption)}</span><span class="legend">{leg_html}</span></figcaption>
</figure>
{cols}
{wide}
{f'<footer>{E(footer)}</footer>' if footer else ''}
</div>
{FLOW_JS if flows else ''}
"""


def table(rows, head=None, num_cols=()):
    """Small helper: rows of cells → <table>. num_cols = indexes rendered right-aligned mono."""
    th = "<thead><tr>" + "".join(f"<th>{E(str(h))}</th>" for h in head) + "</tr></thead>" if head else ""
    body = "".join("<tr>" + "".join(f'<td class="num">{E(str(c))}</td>' if i in num_cols else f"<td>{E(str(c))}</td>"
                                    for i, c in enumerate(r)) + "</tr>" for r in rows)
    return f"<table>{th}<tbody>{body}</tbody></table>"


def write(path, content):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("written", path)

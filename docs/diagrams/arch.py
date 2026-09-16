#!/usr/bin/env python3
"""Interview Prep Kit - system architecture diagram, rendered to SVG.

Drawn in the project's own design tokens (DESIGN.md): ink greys, one accent,
Space Grotesk for titles, Inter for body, system mono for routes/payloads.
Terse technical labels only - the prose lives in the README beside the image.
"""
import base64, pathlib, html

FONTS = pathlib.Path(__file__).parent / "fonts"
OUT = pathlib.Path(__file__).resolve().parents[1] / "images"
OUT.mkdir(parents=True, exist_ok=True)

# ---- design tokens (DESIGN.md) ------------------------------------------
BG        = "#FCFCFD"
SUNKEN    = "#F7F7F9"
SURFACE   = "#FFFFFF"
INK       = "#0A0A0B"
INK2      = "#52525B"
INK3      = "#A1A1AA"
BORDER    = "#EDEDF0"
BORDER_S  = "#DEDEE3"
ACCENT    = "#5B54F0"
ACCENT_SF = "#EEEDFE"

SG   = "'Space Grotesk', system-ui, sans-serif"
UI   = "'Inter', system-ui, sans-serif"
MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace"

W, H = 1360, 700
el = []


def esc(s):
    return html.escape(str(s), quote=True)


def font_face(family, weight, fn):
    b64 = base64.b64encode((FONTS / fn).read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-style:normal;"
            f"font-weight:{weight};src:url(data:font/woff2;base64,{b64}) format('woff2');}}")


def text(x, y, s, size=12, fill=INK2, family=UI, weight=400, anchor="start",
         spacing=None, opacity=None):
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    op = f' opacity="{opacity}"' if opacity else ""
    el.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
              f'font-weight="{weight}" fill="{fill}"{a}{ls}{op}>{esc(s)}</text>')


def rect(x, y, w, h, fill=SURFACE, stroke=BORDER_S, r=8, sw=1, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    el.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
              f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')


def zone(x, y, w, h, label):
    rect(x, y, w, h, fill=SUNKEN, stroke=BORDER, r=10)
    text(x + 16, y + 22, label, size=10, fill=INK3, weight=600, spacing="0.09em")


def block(x, y, w, h, title, lines=(), mono_lines=(), notes=(), accent=False):
    rect(x, y, w, h, fill=SURFACE, stroke=ACCENT if accent else BORDER_S)
    if accent:
        el.append(f'<rect x="{x}" y="{y}" width="3" height="{h}" rx="1.5" fill="{ACCENT}"/>')
    text(x + 14, y + 22, title, size=13, fill=INK, family=UI, weight=600)
    cy = y + 40
    for ln in lines:
        text(x + 14, cy, ln, size=11, fill=INK2)
        cy += 15
    for ln in mono_lines:
        text(x + 14, cy, ln, size=10.5, fill=INK2, family=MONO)
        cy += 19
    if notes:
        cy += 8
        el.append(f'<path d="M{x+14},{cy-14} H{x+w-14}" stroke="{BORDER}" stroke-width="1"/>')
        for ln in notes:
            text(x + 14, cy, ln, size=10.5, fill=INK3)
            cy += 16


def cylinder(x, y, w, h, title, lines=()):
    ry = 11
    el.append(f'<path d="M{x},{y+ry} a{w/2},{ry} 0 0 1 {w},0 v{h-2*ry} '
              f'a{w/2},{ry} 0 0 1 {-w},0 z" fill="{SURFACE}" stroke="{BORDER_S}"/>')
    el.append(f'<path d="M{x},{y+ry} a{w/2},{ry} 0 0 0 {w},0" fill="none" stroke="{BORDER_S}"/>')
    text(x + w / 2, y + 40, title, size=13, fill=INK, weight=600, anchor="middle")
    cy = y + 58
    for ln in lines:
        text(x + w / 2, cy, ln, size=10.5, fill=INK2, family=MONO, anchor="middle")
        cy += 15


def path(d, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    el.append(f'<path d="{d}" fill="none" stroke="{INK3}" stroke-width="1.25" '
              f'stroke-linecap="round" stroke-linejoin="round" '
              f'marker-end="url(#ah)"{da}/>')


def badge(x, y, n):
    el.append(f'<circle cx="{x}" cy="{y}" r="9" fill="{ACCENT}"/>')
    text(x, y + 3.5, n, size=10, fill="#fff", weight=600, anchor="middle", family=UI)


def edge_label(x, y, s, anchor="middle"):
    w = len(s) * 5.6 + 10
    lx = {"middle": x - w / 2, "start": x - 5, "end": x - w + 5}[anchor]
    el.append(f'<rect x="{lx}" y="{y-10}" width="{w}" height="15" rx="3" '
              f'fill="{BG}" opacity="0.94"/>')
    text(x, y + 1, s, size=10, fill=INK2, family=MONO, anchor=anchor)


# ---- header -------------------------------------------------------------
text(40, 46, "Interview Prep Kit", size=22, fill=INK, family=SG, weight=600)
text(40, 68, "job description + company URL + days  →  a tailored, editable study kit",
     size=12.5, fill=INK3)

# ---- zones --------------------------------------------------------------
ZY, ZH = 96, 340
zone(40, ZY, 280, ZH, "BROWSER")
zone(380, ZY, 520, ZH, "NEXT.JS ON VERCEL  ·  FLUID COMPUTE  ·  NODE 20")
zone(960, ZY, 360, ZH, "EXTERNAL  ·  UNTRUSTED, RATE-LIMITED")

# browser column
block(56, 146, 248, 56, "Builder", ["paste JD, company URL, days"])
block(56, 218, 248, 56, "Progress view", ["polls every 2s, live stepper"])
block(56, 290, 248, 56, "Study client", ["tabs, practice, localStorage"])

# vercel column - left: routes.  right: middleware + the job.
block(396, 146, 236, 212, "API routes", (), (
    "POST   /api/kits",
    "GET    /api/kits/:id",
    "PATCH  /api/kits/:id",
    "POST   /api/kits/:id/regenerate",
    "POST   /api/kits/:id/retry",
), notes=(
    "owner-scoped · 401 unauthenticated",
    "mutations CAS on version · 409 stale",
))
block(672, 146, 208, 60, "Auth", ["scrypt + signed cookie", "every request"])
block(672, 218, 208, 60, "Rate limit", ["8 / 10 min, in-memory", "every request"])
block(672, 290, 208, 56, "Background job", ["after() → runGeneration"])
block(672, 362, 208, 56, "Pipeline", ["8 stages, injected deps"], accent=True)

# external column
block(976, 146, 328, 76, "LLM provider", ["Gemini | Groq, one interface"],
      ("JSON schema  retry 429",))
block(976, 246, 328, 64, "Tavily Search", (), ("2 queries  max 3 results",))
block(976, 334, 328, 76, "Company site", ["fetch + cheerio, SSRF guarded"],
      ("<=4 pages  2MB  text/html",))

# datastore
cylinder(420, 500, 280, 88, "MongoDB Atlas", ("kits: { kit, editState,",
                                              "tombstones, version }"))

# ---- edges --------------------------------------------------------------
# client -> API
path("M304,174 H388")
badge(346, 174, "1"); edge_label(346, 162, "POST /api/kits")
path("M304,246 H388")
badge(346, 246, "2"); edge_label(346, 234, "GET :id · 2s")
path("M304,318 H388")
badge(346, 318, "3"); edge_label(346, 306, "PATCH · version")

# 4  API -> background job
path("M632,318 H664")
badge(650, 318, "4")
# background job -> pipeline (internal, unnumbered)
path("M776,346 V356")
# 5  pipeline -> external bus
path("M880,390 H928 V184 H968")
path("M928,278 H968")
path("M928,372 H968")
badge(908, 390, "5")
# 6  API -> db
path("M514,358 V500")
badge(514, 430, "6"); edge_label(528, 424, "insert · generating", anchor="start")
# 7  pipeline -> db
path("M776,418 V466 H620 V500")
badge(700, 466, "7"); edge_label(700, 482, "progress, then ready")

# ---- footnotes ----------------------------------------------------------
FY = 630
text(40, FY, "GUARANTEES", size=10, fill=INK3, weight=600, spacing="0.09em")
notes = [
    "every outbound call independently timed out — a hung upstream cannot eat the 300s budget",
    "429 → waits the provider's own advised retry-after, never a guessed backoff",
    "writes compare-and-swap on version — a stale save returns 409, never a silent overwrite",
    "a job that stops reporting is reconciled to failed after 6 min; the client retries once",
]
for i, n in enumerate(notes):
    nx, ny = 40 + (i % 2) * 660, FY + 21 + (i // 2) * 19
    el.append(f'<circle cx="{nx+3}" cy="{ny-4}" r="2" fill="{INK3}"/>')
    text(nx + 14, ny, n, size=11, fill=INK2)

# ---- assemble -----------------------------------------------------------
faces = "".join([
    font_face("Space Grotesk", 600, "sg600.woff2"),
    font_face("Space Grotesk", 500, "sg500.woff2"),
    font_face("Inter", 400, "inter400.woff2"),
    font_face("Inter", 500, "inter500.woff2"),
    font_face("Inter", 600, "inter600.woff2"),
])

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
<style>{faces}</style>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0,1 L9,5 L0,9" fill="none" stroke="{INK3}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</marker>
</defs>
<rect width="{W}" height="{H}" fill="{BG}"/>
{chr(10).join(el)}
</svg>'''

(OUT / "architecture.svg").write_text(svg)
print(f"wrote {OUT/'architecture.svg'}  {len(svg)//1024} KB  ({len(el)} elements)")

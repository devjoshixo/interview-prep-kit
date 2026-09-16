#!/usr/bin/env python3
"""Interview Prep Kit - the generation pipeline, rendered to SVG.

Opens the "Pipeline - 8 stages" box from architecture.svg. Vertical layout so it
stays readable at README width. Each stage carries its gate as a predicate, not a
paragraph - the gate is what the code checks before the next stage is allowed to
trust the output.
"""
import base64, pathlib, html

FONTS = pathlib.Path(__file__).parent / "fonts"
OUT = pathlib.Path(__file__).resolve().parents[1] / "images"
OUT.mkdir(parents=True, exist_ok=True)

BG, SUNKEN, SURFACE = "#FCFCFD", "#F7F7F9", "#FFFFFF"
INK, INK2, INK3 = "#0A0A0B", "#52525B", "#A1A1AA"
BORDER, BORDER_S = "#EDEDF0", "#DEDEE3"
ACCENT, ACCENT_SF = "#5B54F0", "#EEEDFE"
GREEN, GREEN_SF = "#16A34A", "#E8F7EE"

SG = "'Space Grotesk', system-ui, sans-serif"
UI = "'Inter', system-ui, sans-serif"
MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace"

W = 1000
CARD_X, CARD_W, CARD_H, PITCH = 132, 736, 108, 142
TOP = 156
el = []


def esc(s):
    return html.escape(str(s), quote=True)


def font_face(family, weight, fn):
    b64 = base64.b64encode((FONTS / fn).read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-style:normal;"
            f"font-weight:{weight};src:url(data:font/woff2;base64,{b64}) format('woff2');}}")


def text(x, y, s, size=12, fill=INK2, family=UI, weight=400, anchor="start", spacing=None):
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    el.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
              f'font-weight="{weight}" fill="{fill}"{a}{ls}>{esc(s)}</text>')


def pill(x, y, s, fg, bg):
    w = len(s) * 5.9 + 18
    el.append(f'<rect x="{x-w}" y="{y-12}" width="{w}" height="19" rx="9.5" fill="{bg}"/>')
    text(x - w / 2, y + 2, s, size=10, fill=fg, weight=600, anchor="middle")
    return w


STAGES = [
    ("Extract", "Pulls the role, seniority and a list of requirements out of the job description.",
     "evidence ⊆ JD text", "a requirement survives only if its quoted evidence appears verbatim",
     "LLM", None),
    ("Research", "Reads the company's own site, then searches the web twice — what they do, and how they interview.",
     "sources = URLs actually fetched", "an unreachable site yields an empty brief, never an invented one",
     "site · search · LLM", "company brief + hiring notes"),
    ("Ask", "Writes the question bank, one batched call per category, told how this company actually interviews.",
     "requirement_id ∈ extracted ids", "any requirement reference the model invents is stripped",
     "LLM", "questions tagged to requirements"),
    ("Measure", "Which requirements does no question touch?",
     "uncovered = R \\ ⋃ Q.requirement_ids", "a set difference in code — the model never grades its own coverage",
     None, "the uncovered set"),
    ("Repair", "Generates questions only for what was missed, and appends them.",
     "append-only · ≤ 3 passes", "existing questions are never rewritten; the cap guarantees it terminates",
     "LLM", "questions, gaps filled"),
    ("Recall", "Turns each verified requirement into a flashcard.",
     "cards ← requirements", "built from requirements already verified upstream, so nothing new is introduced",
     "LLM", None),
    ("Plan", "Packs the questions into a day-by-day schedule for the days you have left.",
     "no LLM · Σ days = N · must-haves first", "nothing is dropped and nothing spills past the last day",
     None, None),
]

# ---- header -------------------------------------------------------------
text(40, 50, "The generation pipeline", size=22, fill=INK, family=SG, weight=600)
text(40, 74, "seven stages — each one verified in code before the next is allowed to trust it",
     size=12.5, fill=INK3)
text(40, 108, "STAGE", size=10, fill=INK3, weight=600, spacing="0.09em")
text(CARD_X + CARD_W, 108, "GATE  ·  WHAT THE CODE CHECKS", size=10, fill=INK3,
     weight=600, spacing="0.09em", anchor="end")

# ---- stages -------------------------------------------------------------
for i, (name, desc, pred, why, uses, handoff) in enumerate(STAGES):
    y = TOP + i * PITCH
    pure = uses is None
    acc = GREEN if name == "Plan" else ACCENT
    acc_sf = GREEN_SF if name == "Plan" else ACCENT_SF

    el.append(f'<rect x="{CARD_X}" y="{y}" width="{CARD_W}" height="{CARD_H}" rx="10" '
              f'fill="{SURFACE}" stroke="{BORDER_S}"/>')
    # gate strip
    el.append(f'<path d="M{CARD_X},{y+62} H{CARD_X+CARD_W}" stroke="{BORDER}" stroke-width="1"/>')
    el.append(f'<rect x="{CARD_X}" y="{y+62}" width="{CARD_W}" height="{CARD_H-62}" '
              f'fill="{SUNKEN}" opacity="0.7"/>')
    el.append(f'<rect x="{CARD_X}" y="{y}" width="3" height="{CARD_H}" rx="1.5" fill="{acc}"/>')

    # step number on the spine
    el.append(f'<circle cx="{CARD_X-52}" cy="{y+30}" r="14" fill="{SURFACE}" stroke="{BORDER_S}"/>')
    text(CARD_X - 52, y + 34, str(i + 1), size=12, fill=INK2, weight=600, anchor="middle")

    text(CARD_X + 20, y + 28, name, size=15, fill=INK, family=SG, weight=600)
    text(CARD_X + 20, y + 50, desc, size=11.5, fill=INK2)

    if pure:
        pill(CARD_X + CARD_W - 20, y + 26, "PURE CODE", GREEN, GREEN_SF)
    else:
        pill(CARD_X + CARD_W - 20, y + 26, uses, INK2, "#F1F1F4")

    text(CARD_X + 20, y + 84, "GATE", size=9.5, fill=acc, weight=600, spacing="0.08em")
    text(CARD_X + 62, y + 84, pred, size=11.5, fill=INK, family=MONO)
    text(CARD_X + 20, y + 100, why, size=10.5, fill=INK3)

    # hand-off to the next stage
    if i < len(STAGES) - 1:
        ny = y + CARD_H
        el.append(f'<path d="M{CARD_X+52},{ny+4} V{ny+PITCH-CARD_H-6}" stroke="{INK3}" '
                  f'stroke-width="1.25" marker-end="url(#ah)"/>')
        if handoff:
            text(CARD_X + 68, ny + 22, handoff, size=10.5, fill=INK3, family=MONO)

# ---- footer -------------------------------------------------------------
FY = TOP + len(STAGES) * PITCH + 18
text(40, FY, "WHY IT DEGRADES INSTEAD OF BREAKING", size=10, fill=INK3, weight=600, spacing="0.09em")
for i, n in enumerate([
    "verification is code reading named fields, never the model second-guessing itself",
    "so a bad model response loses that field — it cannot corrupt the stages already done",
]):
    el.append(f'<circle cx="43" cy="{FY+17+i*19}" r="2" fill="{INK3}"/>')
    text(54, FY + 21 + i * 19, n, size=11, fill=INK2)

H = FY + 74

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

(OUT / "pipeline.svg").write_text(svg)
print(f"wrote {OUT/'pipeline.svg'}  {W}x{H}  ({len(el)} elements)")

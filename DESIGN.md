# Interview Prep Kit — Design Language

A **premium, high-craft product** in the register of Linear, Stripe, Vercel and
Sarvam. Quiet confidence, not decoration — but every surface is intentional and
expensive-feeling. Depth comes from refined layering and one signature gradient,
never from clutter. Premium means *craft*, not more elements.

## North star

- Feels like a well-funded product company's flagship app, not a template.
- Serene and content-first, yet unmistakably crafted: soft depth, a signature
  accent, a distinctive display face, generous negative space, real micro-detail.
- The reader trusts it instantly. It looks like it costs money.

## Typography — a deliberate pairing (this is half the premium)

- **Display / headings: Space Grotesk** — characterful, modern, technical.
  Used large and confident for the hero and section titles.
- **Body / UI: Inter** — neutral, legible, workhorse.
- **Numerals: tabular** for minutes, day counts, difficulty.

| Token | Size / line | Weight | Tracking | Font | Use |
| --- | --- | --- | --- | --- | --- |
| hero | 52 / 56 | 600 | -0.03em | Space Grotesk | landing / builder hero |
| display | 34 / 40 | 600 | -0.02em | Space Grotesk | page title |
| h1 | 24 / 30 | 600 | -0.015em | Space Grotesk | section headers |
| h2 | 18 / 26 | 600 | -0.01em | Space Grotesk | card titles |
| body-lg | 16 / 26 | 400 | 0 | Inter | prompts, briefs |
| body | 14 / 22 | 400 | 0 | Inter | default |
| small | 13 / 20 | 400 | 0 | Inter | meta, outlines |
| label | 11 / 16 | 600 | 0.06em (UPPER) | Inter | tags, badges |

## Colour

Light is the primary theme; **dark mode is first-class and dramatic**, not an
afterthought.

**Light — neutrals**
- `--bg` page: `#FCFCFD` · `--bg-sunken` sections: `#F7F7F9`
- `--surface` cards: `#FFFFFF`
- `--ink` `#0A0A0B` · `--ink-2` `#52525B` · `--ink-3` `#A1A1AA`
- `--border` `#EDEDF0` · `--border-strong` `#DEDEE3`

**Signature accent (used sparingly — CTA, active state, hero glow)**
- `--accent` `#5B54F0` · `--accent-hover` `#4B44E0` · `--accent-soft` `#EEEDFE`
- `--accent-gradient` `linear-gradient(135deg,#7A6CFF 0%,#5B54F0 45%,#7C3AED 100%)`
  — reserved for the hero glow and the primary CTA only.

**Dark (first-class)**
- `--bg` `#0A0A0F` · `--surface` `#141419` · `--surface-2` `#1B1B23`
- `--ink` `#F4F4F5` · `--ink-2` `#A1A1AA` · `--border` `#26262E`
- Accent `#7A6CFF` with a soft outer glow on primary actions.

**Semantic (minimal):** success `#16A34A`, warning `#B45309`, danger `#DC2626`,
each with an ultra-light tint for chips.

## Depth & elevation (the premium tell)

Refined, layered shadows — soft and low-opacity, never heavy. This is what
separates premium from flat.

- `--shadow-card` `0 1px 2px rgba(10,10,24,.04), 0 8px 24px -12px rgba(10,10,24,.12)`
- `--shadow-pop` (menus, dialogs, flashcard) `0 12px 40px -12px rgba(10,10,24,.22)`
- **Featured cards** carry a 1px top accent hairline or a faint `--accent-soft`
  wash. The **hero** sits over a soft radial `--accent` glow (blurred, ~8% alpha).
- Surfaces layer: sunken section → raised card → popover. Each step lighter/closer.

## Shape & spacing

- **Radius:** cards 16px, inputs/buttons 10px, chips 8px, pills full.
- **Spacing (4px base):** 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Reading width:** max 760px; hero may go full-bleed with centred content.
- **Rhythm:** 48px between major sections, 16px within a card. Air is premium.

## Components

- **Primary button:** `--accent` (or the gradient on the hero CTA), white text,
  10px radius, soft `--shadow-card`, subtle 1px inner top highlight; hover lifts
  1px + darkens. Confident, not loud.
- **Secondary:** surface fill, 1px `--border`, `--ink`; hover border-strong.
- **Ghost:** text-only `--ink-2` with a thin-line icon; inline actions (Edit,
  Regenerate).
- **Input / textarea:** surface, 1px border, 10px radius; focus = `--accent`
  border + 4px `--accent-soft` ring. Generous padding.
- **Card:** surface, 1px `--border`, 16px radius, 20px padding, `--shadow-card`.
- **Section header:** a small `--accent` marker (2px bar or dot) + h1 title, with
  a ghost "Regenerate" and a subtle meta note on the right.
- **Badge — priority:** `must` = solid `--ink`, inverse text; `nice` = soft chip
  with a 1px ring. **Chip — category:** `--accent-soft` bg, `--accent` text, 8px.
- **Item state (regenerate model):** `edited` = amber dot + label; `pinned/user`
  = accent dot; untouched = none. Deleted are hidden.
- **Icons:** thin-line, 1.5px stroke (Lucide register), `--ink-2`, never filled.
- **Progress (generation):** a premium 7-step stepper — done (accent check),
  active (soft-glow spinner), pending (`--ink-3`), each step named. Sits on a
  sunken panel with the hero glow behind it.
- **Flashcard:** raised card, `--shadow-pop`, 3D `rotateY` flip, faint gradient
  edge; keyboard-navigable with progress dots.
- **Empty state:** centred, a thin-line icon, one honest line, one action.

## Motion

180–240ms ease-out; hover lifts 1px; primary CTA has a barely-there gradient
shimmer on hover. Flashcard flip 260ms 3D. Purposeful, never bouncy.

## Voice

Premium, sparse, confident, second person. No exclamation, no hype. State what
the product did and where it's unsure ("No web results — using the site only").

## Screens

1. **Builder** — a hero moment: large Space Grotesk headline over a soft accent
   glow, then one focused card (JD textarea, company URL, days), gradient primary
   "Generate kit". Feels like a landing page and a tool at once.
2. **Generating** — the premium 7-step stepper on a sunken panel, calm and lit.
3. **Kit overview** — sections (Company brief, Requirements, Questions by
   category, Flashcards, Schedule) as raised cards with soft depth, accent
   markers, coverage note, and per-section ghost "Regenerate".
4. **Practice** — a single large flashcard centred over the glow, 3D flip,
   progress dots; keyboard-first.
5. **Edit affordances** — inline edit; an item gains an "edited" badge once
   touched; regenerate refills only untouched items.

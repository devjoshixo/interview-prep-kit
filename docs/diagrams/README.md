# Diagrams

`../images/architecture.svg` is generated, not drawn. To change it, edit
`arch.py` (every box, coordinate and edge lives there) and re-run:

```sh
python3 docs/diagrams/arch.py                      # -> docs/images/architecture.svg
```

Then re-render the PNG that the README embeds (GitHub renders PNG reliably):

```sh
google-chrome --headless --screenshot=docs/images/architecture.png \
  --window-size=1360,700 --force-device-scale-factor=2 docs/images/architecture.svg
```

The diagram uses the design tokens from `DESIGN.md`, so it stays visually
consistent with the app itself.

## Fonts

`fonts/` holds glyph-subsetted WOFF2 builds of **Space Grotesk** and **Inter**,
both licensed under the SIL Open Font License 1.1. They are embedded in the SVG
as base64 so it renders identically without a network fetch.

- Space Grotesk — https://fonts.google.com/specimen/Space+Grotesk
- Inter — https://fonts.google.com/specimen/Inter
- SIL OFL 1.1 — https://openfontlicense.org/

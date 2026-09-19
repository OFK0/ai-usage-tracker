# Icon sources

The drawings of record for the app icon and the tray glyph. The PNGs the app
ships are generated from the same numbers by `npm run generate:icons`, so the
SVGs here are what you edit and the scripts are what you keep in step.

| File                      | What it is                                           |
| ------------------------- | ---------------------------------------------------- |
| `app-icon.svg`            | The app icon, 1024×1024, layered, real SVG gradients |
| `tray-glyph-template.svg` | The tray glyph in black, for the macOS menu bar      |
| `tray-glyph-accent.svg`   | The tray glyph in accent blue, for Windows and Linux |

## The mark

A gauge: a dial of 250° open at the bottom, the remaining allowance drawn as a
solid white sweep over a quieter track. It is the widget's story in one shape —
how much is left of a fixed amount — and it survives being shrunk, because below
about 32px the track falls away and the solid sweep carries the silhouette on
its own.

The mouth at the bottom is wide (110°) on purpose: a nearly-closed ring of even
weight reads as a loading spinner, and this app is the opposite of busy.

## The numbers

The app icon, on a 1024 canvas:

- Body: 824 square centred, 100 of margin, corner radius 185 — the macOS icon
  grid. Windows and Linux use the same artwork.
- Gradient: 135°, `#1289E7` → `#5D5DDD`. These are `--gradient-from` and
  `--gradient-to` from `src/renderer/src/assets/main.css` in light mode at the
  default accent hue of 250. The icon is fixed, so it does not follow the accent
  the user picks in settings.
- Glow: white at 22%, falling off over 741.6 from the body's top-left corner —
  the `.widget-surface` wash.
- Dial: struck from (512, 564), radius 242, stroke 128 with round caps, from
  145° over 250°. The centre sits below the middle of the body so that the
  mark's own bounding box ends up centred, rather than the circle it is cut
  from.
- Remaining: the first 62% of the sweep in solid white; the rest of the dial at
  38% white.

The tray glyph, on a 16 grid:

- The dial alone, one flat colour — with a single colour there is no sweep and
  track to tell apart, so what is left is the dial itself. That is also what the
  app icon collapses to at 16px, which keeps the two marks reading as one thing.
- Radius 5 and stroke 4 about (8, 9), which puts the outer edge on whole pixels
  at x=1, x=15 and y=2. Every number doubles exactly, so `@2x` is as sharp as
  `@1x`.
- The tray icon is static — see `src/main/tray/index.ts` — so it carries
  identity, not a reading.
- The widget's header draws the same glyph, in the accent gradient
  (`GaugeMark` in `src/renderer/src/App.tsx`). It's hand-copied, so a change
  to the glyph goes there too.

## Regenerating

```sh
npm run generate:icons
```

Writes `build/icon.png` (1024×1024, transparent) and the four PNGs in
`resources/tray/`. Neither script needs any image tooling; they rasterise the
geometry themselves and encode the PNGs with `scripts/png.mjs`.

There is no SVG rasteriser in the loop, so changing a drawing means changing the
matching constants at the top of `scripts/generate-app-icon.mjs` or
`scripts/generate-tray-icons.mjs` by hand.

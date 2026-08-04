# Universal Directors Cut — Feature Freeze

**Status:** FROZEN as of Waves 1–5 + W4.1–W4.7 completion.
**Scope:** No new feature work on UDC. Only P0 bug fixes and security patches.

## What "frozen" means
- No new panels, tools, buttons, tabs, keyboard shortcuts, or engine changes in
  `src/components/directors-cut/**` or `src/lib/directors-cut/**`.
- Preflight rules (`ciPreflight.ts`) are complete — 14 checks covering duration,
  voice-lock, VO, aspect, subtitles, loudness, endcard, thumbnails, blackscreens,
  hook-fatigue. Do not add new rules without an explicit unfreeze.
- Anchor-Refresh, Auto Cut-Down, Master-Snapshot, Voice-Lock are the four
  moat features — keep them stable, do not extend surface area.

## Gezielte Entfrostung: Grafik-Overlays (v407, freigegeben vom Nutzer)
- Overlay-Ebene erweitert: Lower Thirds, Banner, Störer, Schilder, CTA,
  Ticker, Logo-Bug, Callout, Zitat, Fortschritt (`overlayPresets.ts`).
- Relative Box-Koordinaten (0..1) — Studio-Vorschau und Remotion-Export
  teilen sich `OverlayGraphic.tsx`, damit 1080p/4K identisch aussieht.
- Alt-Overlays werden über `upgradeOverlay()` verlustfrei migriert.
- Sonst bleibt der Freeze bestehen.

## Allowed changes while frozen
- P0 crash / data-loss fixes.
- Backend-only stability (Lambda config, refund automation).
- Copy / translation fixes in existing strings.
- Landing / pricing positioning of UDC (marketing surface only).

## To unfreeze
Explicit user request stating "unfreeze UDC" plus the concrete feature scope.

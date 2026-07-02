## Problem

Beim Anhängen eines 9-Sekunden-Clips aus der Mediathek wird die neue Szene auf **2.5s** geklemmt (12.5 → 15.0), statt die Timeline auf **21.5s** wachsen zu lassen.

## Root Cause

`pickInsertionFit` → `findBestInsertionCell` → `fitSceneToCell` in `src/lib/directors-cut/timelineAnchors.ts`:

1. `normalizeCutAnchors` fügt einen virtuellen **`timeline`-End-Anchor** bei `max(videoDuration, effectiveSourceDuration) = 15.0s` ein.
2. Nach Szene 1 (endet 12.5s) existiert dadurch eine **freie Rest-Zelle 12.5 → 15.0** (2.5s breit).
3. `findBestInsertionCell` liefert diese Zelle zurück, obwohl `preferredMinDuration` (aktuell fest `1`) nichts mit der Cliplänge zu tun hat.
4. `fitSceneToCell` klemmt den 9s-Clip auf die 2.5s-Zelle → das ist der sichtbare Bug.

Der bereits eingebaute `null`-Fallback (Append hinter letzter Szene) greift nicht, weil die Rest-Zelle „passt".

## Fix

**`src/lib/directors-cut/timelineAnchors.ts`**
- `fitSceneToCell`: NICHT klemmen, wenn die Zelle rechts vom `timeline`-Anchor begrenzt wird (offene Timeline-Kante) — Dauer = `naturalDuration` unverändert.
- `findBestInsertionCell`: Wenn `preferredMinDuration` gesetzt ist und keine Zelle groß genug ist, `null` zurückgeben (statt der kleinsten freien) → Append-Fallback greift.

**`src/components/directors-cut/studio/CapCutEditor.tsx`**
- `pickInsertionFit`: `preferredMinDuration: opts.naturalDuration ?? 1` durchreichen, damit oben genannte Regel wirkt.

Damit wird ein 9s-Clip:
- Playhead in einer Lücke ≥9s → snapt an die Lücke.
- Timeline-Ende / keine passende Lücke → hängt hinten an, Timeline wächst auf `letztes_end + naturalDuration`.

## Zweiter Punkt („2 Szenen werden markiert")

Das ist mit dem Screenshot nicht eindeutig reproduzierbar — nach dem Duration-Fix sollte die neue Szene volle 9s lang und klar als einzige neue Szene sichtbar sein. Falls die Doppel-Markierung dann noch besteht, bitte kurze Beschreibung/Screenshot **direkt nach dem Klick** — dann trace ich Selection-State (`selectedSceneId`, ID-Kollision durch `scene-${Date.now()}` bei schnellem Doppel-Add).

## Files touched
- `src/lib/directors-cut/timelineAnchors.ts` (2 Funktionen)
- `src/components/directors-cut/studio/CapCutEditor.tsx` (1 Zeile in `pickInsertionFit`)

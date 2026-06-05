# v50 — Speaker-3-Fix + Qualität auf Pro

## Problem (aus aktuellem Render)

1. **Speaker 3 Mund bleibt zu** während er spricht → Sync.so Auto-ASD findet die 3. Person auf der Hailuo-Plate nicht zuverlässig, lippt nur Speaker 1 + 2.
2. **Qualität nicht überzeugend** → v49 nutzt `lipsync-2` (Standard). `lipsync-2-pro` liefert sichtbar schärfere Mundregion, bessere Zahn-/Lippen-Definition, weniger Smear bei seitlichen Köpfen.

## Was wir bisher belegt haben (Probes V1–V4)

| # | model | segments[] | per-segment ASD coords | Ergebnis |
|---|---|---|---|---|
| V1 | lipsync-2 | ✅ | ✅ coords | ❌ unknown error |
| V2 | lipsync-2 | ✅ | ❌ (auto) | ✅ COMPLETED |
| V3 | lipsync-2-pro | ✅ | ✅ coords | ❌ unknown error |
| V4 | lipsync-2 | ❌ | ✅ coords | ✅ COMPLETED |

**Nicht getestet:** `lipsync-2-pro + segments[] + auto-ASD` (V5) und `lipsync-2 + segments[] + bounding_boxes` (V6 — laut Doku eigene ASD-Variante, NICHT `coordinates`).

## Plan

### Schritt 1 — Zwei neue Live-Probes auf einer 3-Sprecher-Szene

- **V5**: `model: lipsync-2-pro` + `segments[]` **ohne** `optionsOverride`. Hypothese: Pro+Segments+Auto-ASD ist erlaubt (nur Pro+Segments+coords war broken). Wenn ✅ → Qualitätsboost ohne Bruch.
- **V6**: `model: lipsync-2` + `segments[]` + pro Segment `optionsOverride.active_speaker_detection: { bounding_boxes: [[x,y,w,h]] }` (eine Box pro Segment, aus Gemini-Face-Detect der Hailuo-Plate vor dem Dispatch). Hypothese: `bounding_boxes` ist laut Doku eine eigene ASD-Mode-Variante, getrennt vom kaputten `coordinates`-Pfad.

Beide Probes laufen parallel, max. 5 min Watchdog statt 15.

### Schritt 2 — v50 Payload-Entscheidung

| Probe-Ergebnis | v50-Payload |
|---|---|
| V5 ✅, V6 egal | `lipsync-2-pro` + `segments[]` + Auto-ASD → Qualität ↑, Speaker-3 wird via Pro-Modell-besseres ASD eher gefunden |
| V5 ❌, V6 ✅ | `lipsync-2` + `segments[]` + per-Segment `bounding_boxes` → deterministisches Targeting, löst Speaker-3-Problem |
| V5 ✅, V6 ✅ | **Beste Welt**: `lipsync-2-pro` + `segments[]` + per-Segment `bounding_boxes` → Pro-Qualität + deterministisches Targeting |
| Beide ❌ | Bleibt bei v49 + dokumentieren, dass 3+ Sprecher auf dichten Plates unzuverlässig sind; Empfehlung Single-Speaker-Cinematic-Sync pro Turn |

### Schritt 3 — Implementation

In `supabase/functions/compose-dialog-segments/index.ts`:
- v49-Block (Zeilen ~808–910) updaten auf gewählte Payload-Variante
- Falls `bounding_boxes` gewählt: vor Dispatch `validate-frame-face` einmal auf Plate-Mid-Frame, Boxen nach Speaker-Reihenfolge an Segmente mappen (Gemini gibt N Boxen sortiert nach X-Koordinate zurück, Speaker-Reihenfolge bekannt aus `dialog_shots`).
- `version: 50`, `engine: "sync-official-segments-v50"`, `model` + `asd_mode` reflektiert Wahl.
- Webhook-Gate auf `41..50` erweitern.
- Per-Pass-Cost-Update: Pro = ~2× Standard, in Credit-Reservation berücksichtigen (`ceil(totalSec) × 18` statt `× 9`).

### Schritt 4 — Reset & Re-render der aktuellen Szene

Szene mit fehlendem Speaker-3 (ID aus aktuellem Render-Log holen) auf `pending` zurücksetzen, einmal mit v50 durchlaufen, visuell verifizieren.

### Schritt 5 — Memory-Update

`mem/architecture/lipsync/v49-docs-exact-segments.md` als superseded markieren, neue `v50-...md` mit Probe-Tabelle V1–V6 + finaler Payload.

## Technische Details (für Engineering)

- **bounding_boxes Format laut Sync.so Doku**: `[[x, y, width, height]]` in normalisierten 0–1 Koordinaten (NICHT Pixel), eine Box pro Segment im `optionsOverride.active_speaker_detection.bounding_boxes` Array.
- **Gemini Plate-Face-Detect** liefert bereits Boxen in `frame_face_cache` (Stage G), nur Speaker-zu-Box-Mapping nötig (Sort by `box.x` → Speaker 1, 2, 3 von links nach rechts; Override möglich via `speakers[i].plate_face_idx` falls Reihenfolge anders).
- **Cost-Increase Pro**: Sync.so Pro-Modell laut Pricing 2× Credits/s. Memory `architecture/lipsync/sync-so-pro-model-policy` updaten (`ceil(durationSec) × 18 × passes` für Pro-Single).
- **Refund-Pfad** unverändert (idempotente UUID aus `dialog_shot_id`).

## Risiken

- Pro-Modell verdoppelt Sync.so-Kosten → Marge sinkt, aber Output-Qualität rechtfertigt es für Dialog-Szenen mit Multi-Speaker.
- `bounding_boxes` benötigt verlässliche Plate-Face-Detection; bei <3 erkannten Gesichtern Fallback auf Auto-ASD pro Segment.

Soll ich so durchziehen — oder zuerst nur die zwei Probes (V5+V6) laufen lassen und dann nochmal entscheiden?

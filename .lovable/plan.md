
# Analyse + Fix: Verschobene Lip-Syncs bei Multi-Sprecher-Szenen (N=2..4)

**TL;DR:** Die v169-Architektur (Parallel-Passes + Per-Preclip + `bounding_boxes_url` + sync-3 + kein `auto_detect`) läuft korrekt. Die Fehlerursache liegt eine Ebene tiefer: die per-Sprecher-Preclips werden auf den **falschen Bildausschnitt** gerendert, weil Face-Coords in einem anderen Koordinatenraum als das reale Plate leben. Fix skaliert deterministisch von N=2 bis N=4.

Analyse basiert auf Scene `11df951d-054c-4c13-b955-c50a5b16ec0e` (3 Sprecher: Samuel/Matthew/Sarah).

---

## Forensik: Was v169 tatsächlich getan hat

Aus `syncso_dispatch_log` + `dialog_shots`:

| Pass | Sprecher | ASD | Model | Preclip | Coords |
|---|---|---|---|---|---|
| 0 | Samuel | `bounding_boxes_url` | sync-3 | p1 720×720 | (461, 329) |
| 1 | Matthew | `bounding_boxes_url` | sync-3 | p2 720×720 | (979, 343) |
| 2 | Sarah | `bounding_boxes_url` | sync-3 | p3 720×720 | (1292, 343) |

Alle 12 v169-Invarianten eingehalten. Die Regeln stimmen — die zugelieferten Pixel nicht.

---

## Root Cause 1 (primär): Plate-Koordinatenraum ≠ Face-Coord-Raum

- Reales Hailuo-Plate: **1924×1076**
- Gespeicherte Coords: max x=1292 → passt in 1280-Raum, nicht 1924
- Preclip p1 zeigt Samuel am **rechten Rand** statt zentriert; p2 zeigt **3 Gesichter**; p3 zeigt 2 Gesichter

**Warum:** `probeMp4Dims(plateUrl)` liefert bei Hailuo-MP4s (zero-tkhd) gerne `null` → Fallback auf `anchor_facemap_fallback` mit 1280×720. Gemini normalisierte Coords werden × 1280 gerechnet → Coords in 1280-Raum. Remotion lädt beim Preclip-Render die echte 1924×1076-MP4 und wendet Crop-Pixel ohne Rescale an → Fenster sitzt am falschen Ort.

**Folge für Sync.so:** Zielgesicht liegt außerhalb der `bounding_boxes_url`-Box. Sync-3 klebt den Ton auf den in der Box tatsächlich sichtbaren Mund (meist Matthew, weil er auf allen Preclips zufällig zentral steht) → „alle Münder bewegen sich, Sprecher 2 spricht für alle, Sprecher 3 out-of-sync".

## Root Cause 2 (sekundär): Preclip-Crop-Size zu groß für N≥3

`computeFaceCrop` erzeugt 592px Crops. Auf 1924-Plate mit Sprecher-Abstand ~330–450px zieht das immer Nachbar-Gesichter mit rein. Selbst mit korrekten Coords blieben mehrere Gesichter im Preclip. v116-Expansion-Loop bis 2.5× verstärkt das.

## Root Cause 3 (tertiär): Persistenz-Drift

`passes[].input_url` speichert das Master-Plate, obwohl der Sync.so-POST den Preclip sendet. Kein Live-Bug, aber Forensik-Falle.

## Warum der v169-Guide das nicht abfängt

Der Guide beschreibt Regeln, aber keine **Datentyp-Assertion**: „Face-Coords und Plate-Video-Datei müssen im selben Koordinatenraum leben." Der `anchor_facemap_fallback` bricht diese Annahme stumm.

---

## Fix-Plan (additiv, keine Architektur-Änderung, N=2..4-tauglich)

### Fix A — Plate-Dim-Assertion + Coord-Rescale (P0, ~50 Zeilen)

Datei: `supabase/functions/compose-dialog-segments/index.ts` (~L1264-1350)

1. Nach `probeMp4Dims`: zusätzlicher **HEAD + Content-Length + ffprobe-Fallback** (letzter ist bereits vorhanden, aber unter-genutzt). Wenn nach 3 Fallbacks immer noch `null`: **hard fail** statt `anchor_facemap_fallback`.
2. Wenn Face-Coord-Raum ≠ Plate-Raum (z.B. Cache-Load mit 1280×720, echtes Plate 1924×1076): **alle** Face-Coords und BBoxes rescale via `x_plate = x_cached × plateW/cachedW`. Rescale-Utility neu in `_shared/plate-face-detect.ts`.
3. Log-Zeile `plate_dim_mismatch anchor=1280x720 plate=1924x1076 rescale=1.503x` in `syncso_dispatch_log.meta` — Grep-Alert-tauglich.

**N-Skalierung:** dimensions-agnostisch, keine N-Verzweigung nötig.

### Fix B — N-adaptive Preclip-Crop-Size (P0-P1, ~30 Zeilen)

Datei: `supabase/functions/_shared/pass-face-preclip.ts` (`computeFaceCrop`)

1. Neuer Parameter: `siblingCoords[]` wird schon durchgereicht — jetzt echt genutzt.
2. Neue Regel:
   ```
   maxSafeSize = 0.9 × nearestSiblingDistance(coord, siblings)
   size = clamp(minFaceCropSize, maxSafeSize, defaultCropSize)
   ```
3. **N=4-Spezial:** wenn `siblings.length ≥ 3` (also N=4): zusätzlich `size ≤ 0.22 × plateWidth` cappen — verhindert, dass bei asymmetrischer 4-Gruppe der äußerste Sprecher zu breit croppt.
4. Sync.so-480p-Floor: wenn `size < 480` → auf 480 upscalen, `flag: forced_upscale` loggen.
5. v116-Expansion-Loop: `cropExpansionFactor` bei N≥3 hart auf **1.2** kappen (bisher 2.5).

**N-Tabelle (bei 1924-Plate):**
- N=2: Abstand ~950px → Crop 592px ✅ default bleibt
- N=3: Abstand ~440px → Crop 396px (statt 592)
- N=4: Abstand ~330px + 22%-Cap ~420px → Crop 297px, upscale auf 480 (`forced_upscale`)

### Fix C — Preclip-Face-Count-Sanity-Gate (P0, ~30 Zeilen; Modul existiert)

Datei: `_shared/syncso-face-gate.ts` (bereits vorhanden), einbinden in `pass-face-preclip.ts` **vor** `renderPassFacePreclip`-Return.

1. Preclip erstes Middle-Frame extrahieren, Gemini Vision → `face_count` erwartet: exakt **1**, Zentrum ±20% Bildbreite.
2. Miss → 1 Retry mit engerem Crop (Fix B `size × 0.75`).
3. Zweiter Miss → `failLipSync("preclip_face_isolation_failed")` + idempotenter Refund.

**N-Skalierung:** N-agnostisch (immer „exakt 1"). Für N=4 kritischer weil enger — Fix B stellt die kleineren Crops bereit, Fix C validiert.

### Fix D — N=4-Anchor-Prompt-Guard (P1, ~20 Zeilen) — NEU auf Wunsch

Datei: `supabase/functions/compose-video-clips/index.ts` — `neutralTwoShotPrompt` N≥3-Branch (`syncso-n-slot-face-map` v87)

Aktuell: `"single horizontal line, equal screen share, no overlap"`

Neu für N=4:
```
"exactly four people in a single horizontal line, equal screen share,
 each head occupies at least 18% of frame width, clear vertical gap
 between heads, identical lighting, no overlap, no depth stacking,
 waist-up framing, camera locked, no dolly, no zoom"
```

Zusätzlich `ANCHOR_AUDIT_VERSION` 7→8 → alte 4-Sprecher-Plates werden neu komponiert.

**Warum das entscheidend ist für N=4:** ohne Prompt-Guard rendert Hailuo bei 4 Personen gerne eng geclusterte Group-Shots mit Depth-Stacking. Damit bleibt der Sprecher-Abstand unter 300px, Fix B kann nicht mehr sauber isolieren, Fix C schlägt zu oft an → viele Refunds. Der Guard löst das an der Ursache (Bildkomposition).

### Fix E — Persistenz-Aufräumen (P2, ~10 Zeilen)

`sync-so-webhook`: beim ersten erfolgreichen Dispatch `pass.input_url = preclip_url` via `update_dialog_shot_pass` RPC schreiben. Rein kosmetisch für Forensik-Klarheit.

### Fix F — Observability (P2, ~30 Zeilen)

- `qa-watchdog`: Grep-Alert auf `plate_dim_mismatch`, `forced_upscale`, `preclip_face_isolation_failed` (24h-Fenster) → Sentry.
- Neuer Deep-Sweep-Flow „4-Sprecher End-to-End" (Cast=4, erwartet: 4 valide Preclips mit face_count=1, Sync.so-Success auf allen 4).

---

## Aufwand & Reihenfolge

| Fix | Zeilen | Risiko | N-Tauglichkeit | Priorität |
|---|---|---|---|---|
| A — Plate-Dim + Rescale | ~50 | niedrig | N=2..4 identisch | P0 |
| C — Face-Count-Gate | ~30 | niedrig | N=2..4 identisch | P0 |
| B — N-adaptive Crop | ~30 | mittel | primär N=3,4 | P0/P1 |
| D — N=4-Prompt-Guard | ~20 | niedrig | N=4-spezifisch | P1 |
| E — Persistenz | ~10 | trivial | – | P2 |
| F — Observability | ~30 | trivial | – | P2 |

**Deploy-Reihenfolge:** A + C zuerst (heilt das Symptom bei jeder N). Dann B (verhindert Rezidiv bei N≥3). Dann D (Bildkomposition-Guard für N=4). E + F über die Woche.

---

## Was der Fix NICHT anfasst

- v169-Payload-Regeln (§5)
- Sync-3-Model-Wahl, Retry-Ladder, MAX_SPEAKERS=4, PARALLEL_CAP_HARD_MAX=4
- v166 Anchor-Identity Bridge, v167 Preclip Pre-Fanout, v168 Per-Pass Lock, v169 Stale Reconcile
- Refund-Logik (bleibt idempotent über deterministische UUID)
- DB-Schema, Sync.so-API-Contract, Storage-Buckets

Rein additiv, jederzeit per Feature-Flag rollbar.

## Betroffene Dateien (final)

| Datei | Fix |
|---|---|
| `supabase/functions/compose-dialog-segments/index.ts` | A |
| `supabase/functions/_shared/pass-face-preclip.ts` | B + C-Integration |
| `supabase/functions/_shared/plate-face-detect.ts` | A (Rescale-Utility) |
| `supabase/functions/_shared/syncso-face-gate.ts` | C (schon vorhanden, wird verdrahtet) |
| `supabase/functions/compose-video-clips/index.ts` | D |
| `supabase/functions/sync-so-webhook/index.ts` | E |
| `supabase/functions/qa-watchdog/index.ts` | F |

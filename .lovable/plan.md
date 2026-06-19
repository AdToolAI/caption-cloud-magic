# Fix: Sync.so Preclip-Pass auf `auto_detect` als Primary-Pfad umstellen

## Diagnose (aus Root-Cause Lab bestätigt)

| Variante         | Ergebnis     | Relevanz für Prod |
| ---------------- | ------------ | ----------------- |
| `exact` (coords + frame_number) | FAILED — generation_unknown_error | **heutiger Default** |
| `omit_sync_mode` | FAILED | trägt dieselben falschen Coords |
| `auto_detect`    | **COMPLETED** | ✅ funktioniert |
| `bboxes`         | **COMPLETED** | ✅ funktioniert, aber teurer (Upload pro Pass) |
| `lipsync_2_pro`  | FAILED | nicht in der Pipeline, ignorieren |

**Klare Schlussfolgerung:** Das `(coordinates, frame_number)`-Tupel ist die einzige Ursache. Sync.so kommt mit Asset, Audio und Crop einwandfrei klar, sobald es das Gesicht selbst suchen darf. Da unser Preclip per Konstruktion bereits ein **Single-Face Square-Crop** ist (v69-Unified, siehe `mem/architecture/lipsync/v69-unified-single-face-preclip.md`), gibt es im Bild gar keine Ambiguität, die wir per Coords disambiguieren müssten.

→ `auto_detect: true` ist auf dem Preclip-Pass nicht nur sicher, sondern strukturell **korrekter** als unsere selbst gerechneten Coords.

## Ziel

`auto_detect: true` wird der **Primary-Pfad** für den Preclip-Pass. Coords/Frame-Anchor werden nur noch als kontrollierter Fallback gefahren, falls `auto_detect` mal scheitert.

## Plan

### 1. ASD-Strategy-Builder umpolen

In `_shared/asd-strategy.ts` (siehe `.lovable/mem/architecture/lipsync/asd-strategy-single-source-builder-v130.md`):

- Neue **Rule 0 (höchste Priorität)** für den Preclip-Pass: 
  - Wenn `context === 'preclip'` und der Preclip ein verifizierter Single-Face-Crop ist (v69-Pfad, `preclip_face_count === 1`, `preclip_ambiguity === false`) → Strategy = `auto_detect`.
- Die bisherigen Rules 1–5 (Coords aus Plate, Snap-to-Preclip, BBox-URL etc.) rutschen eine Ebene tiefer und gelten nur noch, wenn Rule 0 nicht greift oder als Fallback explizit angefordert wird.
- Unit-Tests in `_shared/asd-strategy.test.ts` ergänzen:
  - Single-Face-Preclip → `auto_detect`
  - Ambiguer Preclip → unverändert Coords-Pfad
  - Multi-Face Plate (non-preclip) → unverändert wie bisher

### 2. Payload-Bereinigung in `compose-dialog-segments`

- Wenn Strategy `auto_detect`: 
  - `active_speaker_detection: { auto_detect: true }`
  - **keine** `coordinates`, **kein** `frame_number`, **kein** `bounding_boxes_url` im Payload.
- Sicherstellen, dass der v124 sync-3 Sanitizer keine alten Felder wieder reinmischt (Test hinzufügen).
- `sync_mode: 'cut_off'` bleibt unverändert (das war nie das Problem, `omit_sync_mode` ist nur fehlgeschlagen, weil es dieselben falschen Coords trug).

### 3. Fallback-Ladder (klein halten)

Wenn `auto_detect` auf einem konkreten Pass `generation_unknown_error` liefert (selten, aber möglich z. B. bei sehr dunklem Frame):

1. **Pass 2:** `bounding_boxes_url` aus den face-probe Frames bauen und hochladen (`bboxes`-Pfad, im Replay-Lab grün).
2. **Pass 3:** Voller Plate ohne Preclip (bestehender v69-Fallback).

Coords + frame_number werden **nicht** mehr als Fallback genutzt — sie waren der Trigger der Failures.

### 4. Preflight & Logging

- `v1291` Preflight-Guard:
  - Neuer Block: bei Strategy `auto_detect` muss `preclip_face_count === 1` und `preclip_ambiguity === false` sein, sonst → Strategy-Downgrade auf `bboxes`.
  - Bestehender `auto_detect_with_ambiguous_crop` Guard bleibt (greift jetzt nur noch im Multi-Face-Plate-Fall).
- `syncso_dispatch_log` Felder erweitern:
  - `asd_mode_chosen` (`auto_detect` | `coords` | `bboxes` | `plate_fallback`)
  - `asd_rule_fired` (`rule_0_preclip_single_face` | …)
  - `preclip_single_face_verified` (bool)

### 5. Forensics & Replay-Lab

- `SyncsoForensicsSheet` Diagnose-Tab zeigt `asd_mode_chosen` + `asd_rule_fired` prominent.
- `syncReplayClassify` bekommt zusätzlichen Verdict-Zweig `legacy_coords_pre_v131` → wenn `auto_detect` grün und `exact` rot war und der Dispatch vor Deploy v131 lag → markiert als „behoben durch v131".
- Replay-Lab bleibt 5-Varianten; `lipsync_2_pro` wird im UI als „Diagnostik, nicht prod-relevant" gekennzeichnet (Tooltip), damit künftige Reads das richtig einordnen.

### 6. Verifikation

- Nach Deploy: Replay-Lab erneut für `33427056…` und `ec23f623…` → der echte Prod-Dispatch (`exact` aus dem Live-Pfad) muss jetzt COMPLETED liefern.
- 24h Canary: Anteil `provider_unknown_error` auf Preclip-Passes vor/nach Deploy. Erwartet: < 1 %.
- Cost-Check: `auto_detect` ist kein zusätzlicher Sync.so-Call, also netto **gleich teuer** wie `exact` (ohne unsere Coords-Compute-Kosten). `bboxes`-Fallback nur bei Fehlern, also marginal.

## Technische Notizen

- Änderungen ausschließlich in:
  - `supabase/functions/_shared/asd-strategy.ts` (Rule 0 + Tests)
  - `supabase/functions/compose-dialog-segments/index.ts` (Payload-Bereinigung, Fallback-Ladder, Preflight, Logging)
  - `src/components/admin/SyncsoForensicsSheet.tsx` (neue Felder anzeigen, lipsync_2_pro-Tooltip)
  - `src/lib/syncReplayClassify.ts` (neuer Verdict-Zweig)
- Keine Schema-Migration nötig (neue Felder gehen in bestehendes `payload` JSONB).
- Memory-Update nach Deploy: `mem://architecture/lipsync/v131-auto-detect-primary-on-preclip.md` mit Verweis auf v69 (Single-Face-Preclip-Garantie) als Vorbedingung.

## Was bewusst NICHT geändert wird

- `lipsync_2_pro` bleibt aus der Pipeline. Im Replay-Lab dient es nur als Provider-Vergleich.
- Coords-Berechnung & Snap-to-Preclip bleiben als Code-Pfade für den Nicht-Preclip / Multi-Face-Plate Fall erhalten.
- v69 Single-Face-Preclip-Rendering bleibt unverändert — Voraussetzung für Rule 0.

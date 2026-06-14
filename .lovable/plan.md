# v116 — Identity-Lock Fix (im Einklang mit Sync.so 3 Doku)

## Ziel
4-Personen-Lip-Sync stabil zum Laufen bringen, ohne erneut an der Dispatch-Architektur zu rütteln. Wir behalten den bewährten **v60 Serial-Chain mit `sync-3`** (genau wie Sync.so es für Multi-Person/Static-Plates empfiehlt) und fixen chirurgisch die **echte Root Cause** der Failures: das Speaker→Face-Mapping driftet bei N=4 vom realen Plate-Frame ab, deshalb landet jeder zweite Pass auf dem falschen Gesicht (`provider_unknown_error`) oder im leeren Hintergrund (`faces=0`).

## Sync.so-Doku als Anker
Die offizielle Doku (https://sync.so/docs/models/lipsync, /developer-guides/speaker-selection, /developer-guides/segments) sagt für unseren Use-Case:

1. **Modell**: `sync-3` für static / multi-person / occluded plates (kann stumme Lippen öffnen). ✅ haben wir bereits seit v62.
2. **ASD bei Multi-Face**: deterministisch (`auto_detect:false` + `frame_number` + `coordinates`) **oder** `bounding_boxes_url`. ✅ haben wir bereits (v82 `bbox-url-pro`).
3. **ASD bei Single-Face Crop**: `auto_detect:true` ist explizit empfohlen. ✅ haben wir seit v115.
4. **Plate-Qualität**: ≥480p (1080p empfohlen), Gesicht klar sichtbar, kein Motion-Blur, nicht abgeschnitten. ⚠️ **prüfen wir aktuell NICHT vor dem Dispatch.**
5. **Doc-strict Options**: nur `sync_mode` + `active_speaker_detection`, sonst nichts. ✅ v106.
6. **Segments-API mit 1 Call**: dokumentiert für `lipsync-2`, mit `sync-3` historisch instabil (v41/v54/v56/v58 → `provider_unknown_error`, in v79 entfernt, FROZEN I.2). **Bleibt verboten** für N≥2.

Was uns also fehlt sind nicht „mehr Sync.so-Features", sondern **bessere Inputs**.

## Root Cause Analyse (DB-Beweis, Szene `7470be0d…`)
- **Pass 4 (Sarah)** — preclip-face-gate `faces=0`: Cached `faceMap` zeigte auf eine Bounding-Box, die im realen Plate-Frame leer war. Crop enthielt Hintergrund statt Sarah.
- **Pass 2 (Matthew)** — `provider_unknown_error`: v114 center-coords landeten auf einem **anderen** Gesicht (vermutlich Sprecher 3). Sync.so beschwert sich, weil ASD-Box ≠ erwartetes Gesicht.

Beide Failures = **dasselbe Problem**: die cached Identity-Map (`audio_plan.twoshot.faceMap`) wurde einmal pro Szene mit Gemini Vision gebaut und nie gegen den realen Plate-Frame verifiziert. Bei 4 Personen ist die Map oft falsch zugeordnet (Symmetrie, Hairstyle-Mismatch, gleiche Wardrobe).

## Soll (3 chirurgische Fixes, alle innerhalb v60-Chain)

### Fix A — Live Identity-Verifikation pro Pass (Pflicht)
**Datei**: `supabase/functions/_shared/twoshot-face-map.ts` + `compose-dialog-segments/index.ts` (~Zeile 1800–1900, vor Pass-Dispatch).

- Vor jedem Pass-Dispatch: Plate-Frame an Position `pass.reference_frame_number` ziehen (FFmpeg-Lambda gibt es schon via `composer-frames` bucket).
- Gemini Vision (`gemini-2.5-flash`) mit Prompt: *„Welche der folgenden Personen ist im Bounding-Box [x1,y1,x2,y2] zu sehen? Antworte mit character_id."* Cache als `dialog_shots.passes[i].verified_identity`.
- **Mismatch** → Coords aus aktuellem Plate-Frame neu berechnen (Gemini Vision: `"Wo ist character X im Frame? Box-Koordinaten."`) bevor wir Sync.so callen.
- Cost: ~€0.001/Pass × 4 Passes = vernachlässigbar.

### Fix B — Face-Gate Self-Repair (statt Hard-Fail)
**Datei**: `supabase/functions/_shared/pass-face-preclip.ts`.

Aktuell: Preclip-Crop hat `faces=0` → Pass failed, ganzer Chain bricht ab.
Neu: bei `faces=0`:
1. Crop um +30% expandieren (mehr Headroom + Chinroom), erneut Face-Detection.
2. Wenn immer noch 0 → +60% expandieren.
3. Wenn nach 2 Repair-Versuchen weiterhin 0 → erst dann failen mit klarer Message (*„Plate enthält Charakter X nicht erkennbar — Plate neu rendern"*).

### Fix C — Plate-Quality-Gate VOR Sync.so-Dispatch
**Datei**: neue `supabase/functions/_shared/plate-quality-gate.ts`, eingehängt in `compose-dialog-segments` direkt nach `probeMp4Dims`.

Vor dem ersten Sync.so-Call einmalig prüfen:
- Auflösung ≥720p (sonst Plate-Re-Render auslösen).
- Plate-Face-Detect: Anzahl Gesichter ≥ Anzahl Sprecher und keines „cut at edge" oder kleiner als 8% der Plate-Höhe (Sync.so-Doku-Schwelle).
- Wenn Gate failed → `clip_status='pending'`, `clip_url=null`, klarer User-Error („4 Personen müssen alle im Frame sein, Plate wird neu gerendert"), **kein Sync.so-Call, keine Credits verbrannt**.

Damit fangen wir das Sora-typische „Person teilweise out of frame" Problem ab, **bevor** Sync.so Geld kostet.

### Fix D — Per-Pass Diagnostics (zum Lernen)
**Datei**: `syncso_dispatch_log` (Tabelle existiert).

Persist pro Pass:
- ASD-Mode, `face_count_in_crop`, `crop_box`, `coords_sent`, `verified_identity_match` (boolean), `repair_attempts`.
- Damit sehen wir endlich nach jedem Run, OB die richtigen Coords ankamen — kein Blindflug mehr.

## Was NICHT geändert wird
- **Dispatch-Architektur**: v60 Serial-Chain mit `sync-3` bleibt — Sync.so-doku-konform und stabil für N=1/2/3.
- **Segments-API mit 1 Call**: bleibt verboten für N≥2 (FROZEN I.2, historisch instabil mit `sync-3`).
- **v115 Preclip auto_detect**: bleibt für N=1.
- **v82 bbox-url-pro Ladder**: bleibt unverändert.
- **Pricing, Refunds, Locks, Webhook-Chain**: alles unverändert.

## Erwartetes Ergebnis nach v116
- N=4 Szene `7470be0d…`: Fix A fängt die Sarah-Map ab und korrigiert auf reale Box → preclip-faces=1 → auto_detect:true → Pass durch. Matthew-Pass bekommt verifizierte Coords statt center-fallback → kein `provider_unknown_error`.
- N=4 mit kaputtem Plate (Person out of frame): Fix C blockt Dispatch, refundet 0 Credits, zwingt Plate-Re-Render.
- Diagnostics zeigen pro Pass: gesendete Coords vs. erkannte Identität vs. Sync.so-Ergebnis → wir können künftig in 5 min debuggen statt in 5 Stunden.

## Betroffene Dateien
- `supabase/functions/_shared/twoshot-face-map.ts` — neue `verifySpeakerIdentity()` + `recomputeCoordsFromPlate()`.
- `supabase/functions/_shared/pass-face-preclip.ts` — Self-Repair Loop (3 Versuche).
- `supabase/functions/_shared/plate-quality-gate.ts` — neu.
- `supabase/functions/compose-dialog-segments/index.ts` — Plate-Gate vor Dispatch, Live-Verify vor jedem Pass, erweiterte `syncso_dispatch_log` Felder.
- `mem/architecture/lipsync/v116-identity-lock-and-plate-gate.md` — neu.
- `mem/index.md` — Eintrag.

## Verifizierung
1. Szene `7470be0d…` resetten (`reset-lipsync-scene`), `dialog_shots`+`scene_anchor_cache` clearen, neu dispatchen.
2. `syncso_dispatch_log` zeigt für jeden Pass: `verified_identity_match=true`, `face_count_in_crop=1`, kein `provider_unknown_error`.
3. Künstlich kaputten Plate (Person außerhalb Frame) hochladen → Plate-Gate failt, 0 Credits abgebucht, klarer User-Error.
4. N=1/2/3 Regression-Check: alle bisherigen Tests grün (kein Pfadwechsel bei diesen Counts).

## Was wenn N=4 trotzdem failed?
Dann ist das Problem **nicht mehr in unserer Pipeline**, sondern auf Sync.so-Seite — und wir haben mit Fix D den ersten echten Beweis dafür (Coords waren korrekt, Identität verified, trotzdem Fail). Erst dann macht ein Ticket bei Sync.so Support Sinn, vorher würden sie uns abwimmeln.

## Risiko / Rollback
- Fix A/B/D sind additiv und betreffen nur den Multi-Speaker-Pfad. N=1 unverändert.
- Fix C kann via `FORCE_SKIP_PLATE_GATE=true` env-Flag deaktiviert werden, falls zu strikt.
- Kein Replicate/Provider-Wechsel, keine Schema-Migration nötig.
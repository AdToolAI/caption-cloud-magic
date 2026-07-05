# Face-Visibility Failure: von "hart failen" zu "smart recovern"

## Befund (verifiziert in DB)

Szene `cbfe0e84-520a-42ee-a0de-a3679946ec6c`:
- `syncso_dispatch_log`: `PREFLIGHT_BLOCKED` / `v132_turn_visibility` / `Sarah Dusatko@7.51s(faces=0)`
- Kling hat einen Plate gerendert, in dem Sarah zum exakten Turn-Zeitpunkt (7.51s) nicht im Bild ist (Cut, Kameraschwenk, oder angeschnitten).
- Der v132-Preflight blockt korrekt und refundet — der letzte Deadlock-Fix greift, aber das Kernproblem bleibt: **jeder Re-Render bei Kling ist ein Glücksspiel**.

## Ziel

Wenn die Face-Detection den Sprecher im exakten Turn-Frame nicht findet, aber **innerhalb eines nahen Zeitfensters** frontal sichtbar ist, soll Sync.so mit diesem Fenster als Anchor arbeiten — statt hart zu failen. Nur wenn der Sprecher **im gesamten Turn** unsichtbar ist, wird auf Cinematic-Sync (per-Sprecher i2v + lipsync-2-pro) umgeschaltet.

## Änderungen

### 1. Nearest-Window Snap im Turn-Visibility Preflight
**Datei:** `supabase/functions/compose-dialog-segments/index.ts` (v132-Block)

Statt bei `faces=0 @ turnCenter` sofort zu blocken:
- Sample die Face-Map in einem Fenster `[turnStart − 0.5s, turnEnd + 0.5s]` in ~10-Frame-Schritten.
- Wenn mindestens 1 Frame mit sichtbarem Zielsprecher gefunden wird → dieser Frame wird zum neuen `frame_number` + `coordinates` Anchor (Sync.so animiert dann ab diesem Punkt).
- Nur wenn **kein** Frame im Fenster den Sprecher zeigt → weiter zum Fallback.

Log-Tag: `v188_turn_visibility_snap` mit `snapped_from_sec`, `snapped_to_sec`, `snap_offset_ms`.

### 2. Automatischer Cinematic-Sync Fallback
**Datei:** `supabase/functions/compose-dialog-segments/index.ts` (nach v188-Snap)

Wenn v188 keinen sichtbaren Frame findet:
- `twoshot_stage` wird auf `cinematic_sync_fallback` gesetzt (statt `needs_clip_rerender`).
- Trigger `compose-dialog-scene` (bestehende Cinematic-Sync-Pipeline: pro Sprecher ein Hailuo i2v Plate + lipsync-2-pro, ffmpeg concat).
- User-Feedback: "Multi-Speaker Plate hat Sarah nicht sichtbar gerendert — schalte auf Cinematic-Sync (garantiert sichtbare Sprecher, +~€0.65)."

### 3. UI-Anpassung
**Datei:** `src/components/video-composer/SceneInlinePlayer.tsx`

Neue Failure-Overlay-Variante bei `clip_error` mit `v132_turn_visibility`:
- Zwei Buttons: "Neu rendern (Kling)" + "Auf Cinematic-Sync wechseln (empfohlen)".
- Kurze Erklärung: "Der Kling-Plate zeigt Sarah zu ihrem Sprech-Moment nicht — Cinematic-Sync rendert jeden Sprecher einzeln und garantiert Sichtbarkeit."

### 4. Sofort-Fix für die aktuelle Szene
DB-Update: Szene `cbfe0e84` bekommt einen "Auf Cinematic-Sync wechseln"-CTA, User entscheidet.

## Nicht angefasst

- v129.x doc-strict payload contract
- v126 unified preclip pipeline
- Sync.so Modell / Optionen
- Watchdog, Retry-Ladder, Locking
- Bestehender v132-Refund-Pfad (bleibt der finale Fallback)

## Validierung

Nach Deploy:
- Neue Row in `syncso_dispatch_log` mit `sync_status='DISPATCH_ATTEMPT_STARTED'` und `meta->>'v188_snap_offset_ms'` gesetzt (wenn Snap greift), ODER
- `twoshot_stage='cinematic_sync_fallback'` und neue Dispatch-Row aus `compose-dialog-scene` (wenn Fallback greift).

## Technische Details (verifiziert)

- v132-Preflight ist in `compose-dialog-segments/index.ts`; nutzt bereits `frame_face_cache` (Tabelle existiert, 13 Spalten).
- Cinematic-Sync Pipeline ist deployed als `compose-dialog-scene` + `poll-dialog-shots` (siehe Memory: Dialog-Shot Pipeline).
- `SceneInlinePlayer.tsx` hat bereits die v124-Failure-Overlay-Infrastruktur (siehe Memory v124-sync3-doc-strict-end-to-end).

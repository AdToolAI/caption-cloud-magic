# Sync.so Dialog Lipsync — Stufe D: "It just works"

Ziel: **Multi-Speaker-Dialog-Szenen sprechen jedesmal die richtigen Worte mit den richtigen Mündern — oder schlagen sauber + refundet fehl. Keine "stumme Münder" mehr, keine "unknown errors" ohne Begründung.**

Stufen A+B+C sind live (Retry-Matrix, Audio-Normalize, Preflight-Probes, Dispatch-Log). Was jetzt noch fehlt, ist der **letzte Härtungsring**: Face/Coords vor dem Dispatch validieren, Telemetrie sichtbar machen, und die Pipeline aus echten Daten lernen lassen.

## Was wir bauen

### 1. Face-Validation vor jedem Coords-Dispatch (Säule 4)
Aktuell schicken wir `mode="coords"` an Sync.so und hoffen, dass am `frame_number_override` wirklich ein Gesicht an genau den Koordinaten sichtbar ist. Wenn nicht → `unknown_error` oder falscher Mund animiert.

**Lösung:** Eine neue `validate-frame-face` Edge-Function:
- Input: `video_url`, `frame_number`, `target_coords {x,y,w,h}`
- Extrahiert das eine Frame (ffmpeg via Replicate `lucataco/video-to-frames` ODER günstigster Weg: Gemini 2.5 Flash Vision direkt mit Video-URL + Zeitstempel)
- Liefert: `{ faceVisible, faceBox, mouthVisible, coordsInsideFace, suggestedFrameOffset }`
- Cache pro `(video_url, frame_number)` in neuer Tabelle `frame_face_cache` (24h TTL)

In `poll-dialog-shots` vor jedem `startSyncTurnJob` mit `mode="coords"`:
- Wenn `faceVisible=false` oder `coordsInsideFace=false`: shift `frame_number` um ±8/±16/±24 Frames (max 3 Versuche), bis Validator OK gibt
- Wenn nach 3 Shifts immer noch kein gültiger Frame → `prepareShotRetry('face_validation_failed')` → nächster Attempt nutzt anderen `sync_source_kind` (master statt preclip oder umgekehrt)
- Wenn auch das nicht hilft → `hard_fail` mit klarer Message "kein Gesicht im Frame" + Refund

### 2. Coords-Sanity in compose-dialog-segments
`compose-dialog-segments` schickt heute alle Turns in einem 1-Call. Wenn das `faceMap` veraltet ist (Charakter hat zwischendurch die Position gewechselt), kippt der ganze Call. 
- Vor Dispatch: für jeden Turn `validate-frame-face` am Mittel-Frame der `voicedRange`
- Bei Mismatch: Turn wird per fallback auf `engine='cinematic-sync'` (v4 chain) zurückgeroutet, der dann pro Turn das Preclip + Face-Validation neu macht
- Telemetrie-Log: `error_class='precheck_face_mismatch'`

### 3. Auto-Tuning aus Telemetrie
`syncso_dispatch_log` sammelt jetzt jeden Versuch. Wir bauen einen täglichen pg_cron-Job `analyze-syncso-failures`:
- Aggregiert letzte 24h: error_class → count, success-rate pro `mode`, pro `sync_source_kind`, pro `audio_lead_in_sec`, pro `audio_dur_sec`-Bucket
- Schreibt nach `syncso_tuning_hints` (eine Zeile pro Tag): z.B. `{ best_lead_in: 0.30, best_min_dur: 3.2, preferred_source: 'master', avoid_mode: 'auto' }`
- `poll-dialog-shots` und `compose-dialog-segments` lesen den letzten Hint und passen Defaults an (statt hartcodiert 0.25s/3.0s)
- → Pipeline wird **selbstheilend** mit jedem Tag besser

### 4. Admin-Cockpit Tab "Sync.so Health"
Neuer Tab in `src/pages/Admin.tsx`:
- Live-Feed der letzten 200 Dispatches aus `syncso_dispatch_log`: Scene-Link, Turn-Idx, Attempt, Mode, Status, Error-Class, Audio-Peak-dBFS, Lead-In
- Error-Class Pie-Chart (24h / 7d)
- Success-Rate Trend pro Tag
- "Erzwinge Stage-D Recheck"-Button pro Szene
- Filter nach `engine` (`sync-segments` vs `cinematic-sync`)
- Sichtbar nur für `admin`-Rolle (RLS gibt's schon)

### 5. UI: Sauberer Fehlerstatus pro Turn
In `SceneCard.tsx` Dialog-Sektion:
- Statt nur "Lip-Sync fehlgeschlagen" pro Turn anzeigen: welcher Sprecher, welches Wort, welcher Grund (aus `dialog_shots.shots[i].error_class`)
- Bei `face_validation_failed`: Button "Faces neu erfassen" → triggert `rebuild-twoshot-anchor` für die Szene
- Bei `preflight_audio_*`: Button "Voiceover neu generieren" für genau diesen Turn

### 6. Webhook-Härtung
`sync-so-webhook` (Stage 5 B.1) bekommt:
- Logging in `syncso_dispatch_log` bei jedem Webhook-Hit (status, latency)
- Bei terminal FAILED: gleicher Retry-Pfad wie der Cron-Poller (nicht nur "mark failed + refund"), also Face-Validation + Frame-Shift + nächster Attempt
- → Webhook wird zur primären Fast-Path-Recovery, Cron nur als Safety-Net

## Was sich NICHT ändert

- Pricing (`ceil(durationSec) × 9 × passes`)
- Engine-Auswahl-UI (`sync-segments` vs `cinematic-sync` bleibt)
- HeyGen/Hailuo/Vidu/Talking-Head Pipelines
- Director's Cut, Composer-Stitch, Lambda-Render
- Wallet-Refund-Logik (bleibt idempotent über `state.refunded`)

## Reihenfolge

**D.1** Face-Validation Edge-Function + `frame_face_cache` Tabelle + Cache-Helper
**D.2** Integration in `poll-dialog-shots` (Frame-Shift-Loop + neue error_classes)
**D.3** Integration in `compose-dialog-segments` (Pre-Dispatch Face-Check + Fallback auf v4 chain)
**D.4** `analyze-syncso-failures` pg_cron + `syncso_tuning_hints` Tabelle + Default-Override-Logik
**D.5** Webhook-Härtung (Retry-Pfad statt Hard-Fail)
**D.6** Admin-Cockpit Tab "Sync.so Health"
**D.7** SceneCard UI: Per-Turn Error-Detail + gezielte Recovery-Buttons

## Erwartetes Ergebnis

- "unknown error" Rate **<1%** (heute ~25% laut Logs vor Stage A, ~5% nach Stage B/C)
- "Falscher Mund spricht"-Bug: **eliminiert** durch Pre-Dispatch Face-Validation
- "Stumme Münder im finalen Stitch": **eliminiert** durch strikte Integrity-Gate (schon live aus Stage A)
- Jeder verbleibende Fail ist **klassifiziert, im Log sichtbar, refundet** und der User bekommt einen klaren Recovery-Pfad
- Die Pipeline tunet sich aus echten Daten — wir müssen Defaults nicht mehr raten

## Frage an dich vor dem Bauen

Frame-Extraction für `validate-frame-face`: 
- **(A)** Gemini 2.5 Flash Vision mit Video-URL + Zeitstempel — billig (~€0.0005/Check), gut bei klarer Sicht, ungenau bei kleinen Gesichtern
- **(B)** Replicate `lucataco/video-to-frames` + separater Vision-Call — präziser, ~€0.01/Check, +2-3s Latenz
- **(C)** Hybrid: A für den Schnellcheck, B nur wenn A unsicher ist

Empfehlung: **C**. Default A, Fallback B. Bei ~3 Turns/Szene × 99% A-Hit ≈ €0.0015/Szene, vernachlässigbar.

Sag "go" und ich baue D.1 → D.7 nacheinander.

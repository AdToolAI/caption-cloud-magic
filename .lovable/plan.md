## Status: nein, der vorherige Plan repariert nur das UI-Symptom

Der vorherige Plan markiert nur die hängengebliebene Szene als „failed“ und gibt Credits zurück. Das eigentliche Problem — Sync.so liefert für jede der vier Sprecher-Passes `An unknown error occurred.` (provider_unknown_error, kein error_code) — bleibt bestehen. Beim nächsten Lauf hängt die UI zwar nicht mehr, aber jeder 4-Sprecher-Dialog scheitert weiterhin sofort und es gibt keine bewegten Münder.

## Was die offizielle Sync.so-Doku sagt (sync-3 / v2/generate)

Quellen:
- `https://sync.so/docs/developer-guides/speaker-selection`
- `https://sync.so/docs/api-reference/api/generate-api/create`

Relevante Regeln, die wir derzeit verletzen:

1. **`active_speaker_detection` ist nur für Clips mit mehreren Gesichtern gedacht.**  
   Zitat: „Speaker selection helps you target the right face when a clip or image contains multiple people.“  
   Bei einem 512×512 Single-Face-Preclip (genau unser v69/v77-Output) gehört **kein** `active_speaker_detection`-Block in den Payload — oder höchstens `{ auto_detect: true }`.

2. **`bounding_boxes` muss pro Video-Frame eine Box liefern (oder `null`), Länge = exakte Frameanzahl des Videos.**  
   Wir berechnen die Länge aus `ceil(audio_tight.dur_sec * 30)`. Das ist die Audio-Frameanzahl, nicht die Video-Frameanzahl, und unsere ASSUMED_FPS=30 stimmt nicht zwingend mit dem Remotion-Preclip-MP4 überein.

3. **`bounding_boxes` ist als Detektions-Hilfe für multi-face Plates gedacht.**  
   Wir füllen das Array mit derselben statischen Box für jeden Frame eines bereits einseitigen 512×512 Preclips. Das ist genau das Anti-Pattern, das in der Doku nicht beschrieben ist — und es triggert reproduzierbar `provider_unknown_error` ohne `error_code` (DB-bestätigt für alle 4 Passes der Szene `720fd0b1…`).

4. **`temperature`-Default ist `0.5`, Bereich 0–1.** Wir senden hart `1.0` für jeden Pass. Erlaubt, aber am Rand und nicht von der Doku empfohlen.

5. **`occlusion_detection_enabled: true`** ist erlaubt, verlangsamt aber sync-3 spürbar. Für Single-Face-Preclips überflüssig.

6. **sync-3 handhabt Locked-Camera / Still-Frame Plates und Single-Face nativ** — die Doku erklärt explizit, dass sync-3 globales Verständnis pro Shot baut. Genau dafür wurde Preclip → sync-3 + `auto_detect: true` in v68/v69 designed und hat im Log auch funktioniert (Samuel/Kailee/Sarah lipsyncten, Frame-Diff 5.85 / 6.97 / normal). Nur Matthew war stumm — das war ein Einzelfall.

## Was v99 wirklich falsch gemacht hat

v99 hat als Reaktion auf den Einzelfall „Matthew Mund zu“ für ALLE Preclip-Dispatches `auto_detect: true` durch hartcodierte per-Frame `bounding_boxes` ersetzt. Damit:

- 3 vorher funktionierende Sprecher (Samuel, Kailee, Sarah) fallen jetzt in denselben verdächtigen Code-Pfad,
- Sync.so erhält ein Anti-Pattern (statisches Bbox-Array auf einem Single-Face-Crop),
- sämtliche 4 Passes der nächsten Szene scheitern mit `provider_unknown_error` — und der gesamte Retry-Ladder (coords-pro → coords-pro-box → sync3-coords) feuert dieselbe ungültige Form erneut ab,
- nach 9 fehlgeschlagenen Versuchen läuft der Watchdog rein, refundet die Credits, aber lässt `lip_sync_status='running'` stehen → UI hängt bei 95 %.

## Plan

### A. Sync.so-Payload doku-konform bauen
Datei: `supabase/functions/compose-dialog-segments/index.ts` (Bereich um Zeile 2465–2540, der v99-Block)

1. **Single-Face Preclip-Dispatch (`usePassPreclip === true`)**  
   Wieder zur doku-konformen Variante:
   - `active_speaker_detection = { auto_detect: true }`
   - Keine `bounding_boxes`, keine `frame_number`, keine `coordinates`.
   - Begründung: Der Preclip wurde explizit als 512×512 Single-Face Crop gerendert (v69 + v77 Face-Gate). Sync.so/sync-3 ist genau für diesen Fall gemacht.

2. **`v99_preclip_bbox` Logging-Tag entfernen**, durch `v100_preclip_autodetect` ersetzen, damit Edge-Logs den neuen Pfad eindeutig zeigen.

3. **`temperature` auf den Doku-Default `0.5` zurücksetzen**, statt hart `1.0`. Optional pro Retry-Variante leicht variieren (0.5 → 0.6 → 0.4) — keine 1.0 mehr.

4. **`occlusion_detection_enabled`** für den Preclip-Pfad weglassen (Single-Face, keine Occlusion zu erwarten). Auf dem `bbox-url-pro` Voll-Plate-Pfad bleibt es an.

### B. Den Matthew-Spezialfall sauber lösen
Datei: `supabase/functions/compose-dialog-segments/index.ts` (Preclip-Render-Block, v76 neighbor-aware preclip)

Statt am Sync.so-Payload zu drehen, korrigieren wir die Ursache (Matthews 278→512 hochskalierter Crop, den Sync.so übersah):
- Mindest-Crop-Größe von 232/242 auf **mindestens 384 Pixel** anheben (kein Upscale-Faktor > 1.5), damit Sync.so genug Pixel hat.
- Wenn der neighbor-aware Crop kleiner werden müsste, lieber den siblings-Filter lockern (etwas vom Nachbarn akzeptieren) statt einen 232er-Mini-Crop zu erzwingen.
- Logging: `v100_preclip_minsize source=… requested=232 enforced=384`.

### C. Bounding-Box-Pfad (Multi-Face-Plate) doku-konform machen
Datei: `supabase/functions/compose-dialog-segments/index.ts` (Block um Zeile 2552–2632, `coords-pro-box` / `bbox-url-pro`)

Hier ist der Bbox-Pfad legitim (Voll-Plate mit ≥2 Gesichtern). Trotzdem korrigieren:
- Frame-Anzahl auf **Video-Frames** umstellen (nicht Audio-Frames). Das ist die Spec.
- `null` einsetzen für Frames außerhalb der Speaker-Sprechzeit (Doku: „or null when no face is present“), statt überall dieselbe Box. Das ist das eigentliche Multi-Speaker-Pattern.
- `temperature` ebenfalls auf 0.5.

### D. UI / Watchdog-Symptom-Fix (aus dem alten Plan, gekürzt)
Damit bei einem zukünftigen Hard-Fail die UI nicht erneut bei 95 % hängt:
- `supabase/functions/_shared/lipsync-fail.ts`: offene Passes auf `canceled_by_scene_failure` markieren.
- `supabase/functions/lipsync-watchdog/index.ts`: wenn `dialog_shots.status='failed'` aber top-level `lip_sync_status='running'` → sofort top-level auf `failed`.
- `supabase/functions/sync-so-webhook/index.ts`: `retrying` mit ausgeschöpftem Budget zählt nicht als „alive sibling“.
- Aktuelle Szene `720fd0b1…` einmalig auf `failed` korrigieren (Credits wurden bereits zurückgezahlt).

### E. Deployment & Verifikation
Deploy:
- `compose-dialog-segments`
- `sync-so-webhook`
- `lipsync-watchdog`

Akzeptanz-Test mit derselben 4-Sprecher-Szene:
- Edge-Log zeigt `v100_preclip_autodetect` für alle 4 Passes, kein `bounding_boxes` mehr im POST-Body an Sync.so.
- Sync.so liefert `COMPLETED` für mindestens 3/4 Passes; verbleibender 1/4 (falls Matthew weiter stumm bleibt) wird per größerem Preclip retried, nicht per ASD-Bbox.
- Wallclock < 5 min für 4 Sprecher (vorher >10 min mit Komplett-Fail).
- UI: zeigt „Lip-Sync läuft… 4/4“ → „audio_muxing“ → „angewendet“, nicht endlos 95 %.
## Befund (anhand Szene `0b8a8727…`)

Lip-Sync ist im Prinzip korrekt aufgesetzt — Audio, Fenster, Coords und FaceMap stimmen. Der Fehler entsteht ausschließlich im **Retry-Pfad** von `poll-dialog-shots`:

- Shot 0 (Samuel, Satz 1) lief beim ersten Versuch mit `deterministic_coords=true` durch → korrekt.
- Shot 1 (Matthew, Satz 2): erster Versuch schlug fehl. Retry-Logik in `prepareShotRetry()` setzt bei Mode=`coords` zwingend `force_coords=false` + `deterministic_coords=false` → Sync.so läuft im **auto_detect-Modus** auf einem isolierten Speaker-WAV mit nur 0.88s Sprache → Sync.so findet keinen aktiven Sprecher und animiert **keinen Mund** → „niemand spricht".
- Shot 2 (Samuel, Satz 3): genau dieselbe Retry → auto_detect. Im 2.6s-Fenster pickt Sync.so willkürlich ein Gesicht — hier Matthew (der näher am Frame-Center / höhere VAD-Energie ist) → animiert das **falsche Gesicht** für Samuels Zeile.

Das deckt sich exakt mit dem Userbericht: Satz 1 perfekt, Satz 2 stumm, Satz 3 vom falschen Charakter.

## Plan

1. **Auto_detect-Fallback in Multi-Speaker-Szenen entfernen.** In `supabase/functions/poll-dialog-shots/index.ts → prepareShotRetry()`: wenn die Szene 2+ Sprecher hat **und** für diesen Shot `target_coords` existieren, darf der Retry NIE auf `auto_detect` herunterfallen. Stattdessen wird mit `force_coords=true` + `deterministic_coords=true` neu dispatched, aber mit einer Variation, die den ursprünglichen Fehler umgeht (siehe Punkt 2). Auto_detect-Retry bleibt nur für echte Single-Speaker-Szenen ohne Coords erlaubt.

2. **Frame-Number-Variation beim Coords-Retry.** Der häufigste Auslöser des Erstfehlers ist Sync.sos „unknown error", wenn `frame_number` auf einen Frame fällt, an dem Hailuo gerade einen Cut/Blink/Bewegungsblur hat. Beim Retry verwenden wir statt `floor(start * 24)` die Mitte des Fensters (`round((start+end)/2 * 24)`). Damit bleibt Coord-Targeting erhalten, nur das Sampling-Frame wechselt.

3. **Per-Shot-Failure härten (kein stille Mund-Aufgabe mehr).** Wenn auch der Coords-Retry scheitert, wird der Shot **terminal `failed`** + `clip_error='lipsync_turn_failed'` markiert (statt mit auto_detect zu raten). Der Refund-Pfad greift dann ohne falsche „Erfolgs"-Stitches. `poll-dialog-shots` darf in diesem Fall NICHT zur Stitch-Phase übergehen.

4. **Stitch-Gate verschärfen.** Im Übergang `all_ready → stitching` zusätzlich prüfen, dass jeder Shot mit Multi-Speaker-Kontext entweder `deterministic_coords=true` ODER `speaker_idx` eindeutig matched. Shots mit `deterministic_coords=false` + Multi-Speaker werden als invalid markiert und triggern Refund + UI-Hinweis „Bitte Szene neu rendern" — niemals ein falsch-animiertes Endprodukt ausliefern.

5. **Diagnose-Log erweitern.** Bei jedem Sync.so-Job zusätzlich loggen: `mode`, `coords`, `frame_number`, `windowDur`, `retry_count` — damit künftige Fehlruns sofort sichtbar sind.

6. **Betroffene Szene reparieren.** Szene `0b8a8727-df27-4d7f-9ec5-c8087940a914` zurücksetzen (`dialog_shots=null`, `lip_sync_status='pending'`, `twoshot_stage='master_clip'`, `lip_sync_applied_at=null`, `clip_url` bleibt — der Hailuo-Master ist intakt) und `compose-dialog-scene` einmal direkt anstoßen. Mit der neuen Retry-Policy sollten alle 3 Shots korrekt durchlaufen.

7. **Validierung.** Logs prüfen: keine `auto_detect`-Retries bei 2-Speaker-Szenen. DB prüfen: alle drei Shots haben `deterministic_coords=true` final. UI-Preview: Satz 1 → Samuel, Satz 2 → Matthew, Satz 3 → Samuel — jeweils richtige Lippen.

## Technische Details (Codepunkte)

- `supabase/functions/poll-dialog-shots/index.ts` Zeile 107-137: `dispatchModeForShot` + `prepareShotRetry` umschreiben. Neuer Helper `isMultiSpeakerScene(allShots)` = `new Set(allShots.map(s => s.speaker_idx)).size >= 2`.
- `supabase/functions/poll-dialog-shots/index.ts` Zeile 196-209: `frameNumber` aus optionalem `shot.frame_number_override` lesen, sonst Default. `prepareShotRetry` setzt diesen Override auf `round((start+end)/2 * ASSUMED_MASTER_FPS)`.
- `supabase/functions/poll-dialog-shots/index.ts` Stitch-Dispatch-Stelle (im `processScene`): Vor `render-dialog-stitch` Validierung über alle Shots; bei Fail Markieren + Refund über bestehende `refundOnce()`-Helper.

Keine DB-Schema-Änderung nötig. `dialog_shots.version` bleibt 4.

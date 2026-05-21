## Problem

Der aktuelle Screenshot zeigt nicht primär einen Sync.so-Fehler, sondern einen vorgeschalteten Fehler:

- Die aktive Szene `2ed6d519-...` hat `clip_status = failed`, `clip_url = null`, `twoshot_stage = master_clip`.
- Der Hailuo-Masterclip ist also fehlgeschlagen, bevor `compose-dialog-scene` überhaupt starten konnte.
- Deshalb gibt es auch keine `compose-dialog-scene` Logs und `dialog_shots = null`.
- Die alte Szene `7b93dffc-...` ist weiterhin ein Legacy-Sync.so-Ergebnis (`replicate_prediction_id = sync:...`, `dialog_shots = null`) und sollte nicht als Qualitätsreferenz weiterverwendet werden.

Zusätzlich ist im aktuellen Dialog-Chain-Code ein Qualitäts-/Timing-Risiko: pro Turn wird ein zugeschnittenes WAV an Sync.so geschickt, aber das `segments_secs` Fenster bleibt in der Zeitposition des Gesamtvideos. Das kann Sync.so falsch interpretieren, weil die Audio-Datei bei 0 beginnt, das Video-Fenster aber z. B. bei 2.7s liegt. Für Artlist-Qualität muss die volle Master-WAV in allen Turn-Passes verwendet werden, nicht geslicete Teil-Audios.

## Umsetzung

1. **Dialog-Chain auf Master-Audio umstellen**
   - In `poll-dialog-shots` keine WAV-Slices mehr erzeugen/uploaden.
   - Jeder Sync.so-Turn bekommt dieselbe volle `master_audio_url`.
   - `segments_secs` bleibt ausschließlich am Video-Input und begrenzt den jeweiligen Sprecher-Turn.
   - Das vermeidet Offset-Drift und entspricht der stabileren Two-Shot-Policy.

2. **Masterclip-Fehler nicht als Lip-Sync-Fehler hängen lassen**
   - Wenn eine Cinematic-Sync-Szene beim Masterclip (`twoshot_stage = master_clip`) fehlschlägt, wird `lip_sync_status` nicht als wartender Lip-Sync angezeigt.
   - UI/State sollen klar sagen: Masterclip fehlgeschlagen; Lip-Sync wurde noch nicht gestartet.
   - Auto-Trigger darf Lip-Sync nur starten, wenn `clip_url` vorhanden und `clip_status = ready` ist.

3. **Retry-Reset für betroffene Szene**
   - Szene `2ed6d519-60dc-4fdd-947d-ff53a5a4ee39` wird auf einen sauberen Neuversuch gesetzt:
     - `clip_status = pending`
     - `replicate_prediction_id = null`
     - `clip_url = null`
     - `lip_sync_status = pending`
     - `twoshot_stage = master_clip`
     - `dialog_shots = null`
   - Danach kann der Masterclip erneut generieren; erst nach `clip_url` startet die Dialog-Chain.

4. **Legacy-Lip-Sync endgültig aus dem Weg räumen**
   - Alte Legacy-Funktionen (`compose-twoshot-lipsync`, `poll-twoshot-lipsync`, ggf. `twoshot-lipsync-watchdog`) bekommen einen frühen 410-Stop, damit kein alter Pfad mehr versehentlich schlechtere Ergebnisse produziert.
   - Bestehende Legacy-Szenen können gezielt auf Masterclip + neue Dialog-Chain zurückgesetzt werden.

5. **Qualitäts-Härtung für Multi-Speaker**
   - Face-Koordinaten bleiben Pflicht bei 2+ Sprechern; ohne `faceMap` wird hart abgebrochen statt Auto-Detect-Speaker-Swap zu riskieren.
   - Turn-Fenster behalten Lead-in/Tail, aber ohne Audio-Slicing.
   - Logs enthalten pro Turn: Speaker, Fenster, Koordinaten, Temperatur, Sync.so Job-ID.

6. **Deploy & Validierung**
   - Geänderte Edge Functions deployen.
   - `poll-dialog-shots` direkt gegen eine Testszene anstoßen, sobald der Masterclip bereit ist.
   - Datenbank prüfen:
     - `dialog_shots.version = 2`
     - pro Turn `status = ready`
     - `final_url` gesetzt
     - `clip_url = final_url`
     - `lip_sync_status = done`

## Dateien

- `supabase/functions/poll-dialog-shots/index.ts`
- `src/hooks/useTwoShotAutoTrigger.ts`
- `src/components/video-composer/ClipsTab.tsx`
- `supabase/functions/compose-twoshot-lipsync/index.ts`
- `supabase/functions/poll-twoshot-lipsync/index.ts`
- `supabase/functions/twoshot-lipsync-watchdog/index.ts`
- optional: Projekt-Memory zur aktualisierten Dialog-Chain-Policy

## Datenänderung

Einmaliger Reset der aktuell betroffenen Szene `2ed6d519-60dc-4fdd-947d-ff53a5a4ee39`, damit sie nicht im fehlgeschlagenen Masterclip-Zustand hängen bleibt.
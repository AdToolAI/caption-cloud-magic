## Befund

Der aktuelle Fehler ist nicht AWS/Upload-bezogen. Die betroffene Szene `70a34582-178c-4ed9-a357-5f4725e7902a` scheitert bei Sync.so:

- Pass 1 wurde nach Fallback erfolgreich gerendert.
- Pass 2 schlägt mit `An error occurred in the generation pipeline` fehl.
- Danach markiert das System die Szene als `source_clip_unusable_for_lipsync`.
- Im Fallback wird aktuell noch `temperature: 0.6` verwendet, obwohl die neue Lip-Ready-Policy `0.7` vorsieht.
- Zusätzlich ist der Fallback global als „schon versucht“ markiert, dadurch bekommt Pass 2 keinen eigenen Auto-Detect-Fallback mehr, wenn Pass 1 bereits fallbacken musste.

## Plan

1. **Per-Pass-Fallback statt globalem Fallback**
   - In `poll-twoshot-lipsync` den Fallback-Status pro Job/Pass auswerten.
   - Pass 2 darf seinen eigenen `isolated_track_auto_detect` Fallback starten, auch wenn Pass 1 bereits fallbacken musste.
   - Erst wenn derselbe Pass face-targeted und auto-detect wirklich verweigert, wird die Szene final als fehlgeschlagen markiert.

2. **Temperatur vereinheitlichen**
   - Fallback-Submit in `poll-twoshot-lipsync` von `temperature: 0.6` auf `0.7` anheben.
   - Retry-Submit soll die ursprüngliche Job-Temperatur übernehmen oder ebenfalls auf `0.7` fallen.
   - Job-Metadaten sollen die verwendete Temperatur speichern, damit spätere Diagnosen eindeutig sind.

3. **Pass-2-Fallback robuster machen**
   - Beim Pass-2-Fallback weiterhin die per-turn `segments_secs` verwenden.
   - Den bisherigen Pass-1-Output als Video-Input beibehalten, aber die Fallback-Entscheidung nur auf den aktuell fehlgeschlagenen Job beziehen.
   - Diagnose-Einträge um Pass, Modus und Fenster erweitern.

4. **Betroffene Szene sauber neu starten**
   - Nach Code-Fix die Szene `70a34582…` zurücksetzen:
     - `lip_sync_status = pending`
     - `twoshot_stage = master_clip`
     - `replicate_prediction_id = null`
     - `clip_error = null`
     - alte `syncJobs` entfernen, aber Audio/FaceMap behalten
   - Dadurch kann „Clip + Lip-Sync neu rendern“ bzw. der Auto-Trigger ohne erneuten Upload sauber starten.

5. **Validierung**
   - Edge Functions neu deployen: `poll-twoshot-lipsync` und falls nötig `compose-twoshot-lipsync`.
   - Lip-Sync für die Szene erneut anstoßen.
   - Prüfen, dass:
     - Pass 1 und Pass 2 jeweils eigene Fallbacks nutzen können,
     - `temperature: 0.7` in den Sync.so Payloads steht,
     - `lip_sync_status` am Ende `done` wird oder eine präzisere Fehlermeldung entsteht,
     - Credits bei finalem Provider-Fehler automatisch refundet bleiben.

## Technische Änderungen

- Hauptdatei: `supabase/functions/poll-twoshot-lipsync/index.ts`
- Optional nur bei Inkonsistenz: `supabase/functions/compose-twoshot-lipsync/index.ts`
- Datenreset: einmaliges Update auf `public.composer_scenes` für Szene `70a34582-178c-4ed9-a357-5f4725e7902a`
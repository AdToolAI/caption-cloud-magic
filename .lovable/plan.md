## Befund

Das Problem ist nicht nur die Anzeige. In der aktuellen DB steht die betroffene Szene z. B. so:

```text
clip_status = ready
clip_url = vorhanden
audio_plan.twoshot.url = vorhanden
twoshot_stage = audio
lip_sync_status = null
dialog_shots = null
replicate_prediction_id = null
```

Damit sieht die Kachel „Audio wird vorbereitet…“, aber der v5-Dispatch startet nicht, weil `useTwoShotAutoTrigger` Kandidaten mit `twoshot_stage='audio'` grundsätzlich blockiert. Nach erfolgreichem `compose-twoshot-audio` wird `twoshot_stage` aktuell nicht auf `master_clip`/`null` weitergeschaltet. Ergebnis: Audio ist fertig, aber die Szene bleibt in `audio` hängen; der globale Balken verschwindet, weil `usePipelineProgress` frühe Stages (`audio`, `master_clip`, `preflight`) nur dann als laufend zählt, wenn `lip_sync_status='running'` ist.

## Plan

1. **Audio-Prep nach Erfolg freigeben**
   - In `src/hooks/useTwoShotAutoTrigger.ts` nach erfolgreichem `compose-twoshot-audio` die Szene aus `twoshot_stage='audio'` auf `master_clip` setzen, sofern der Master-Clip vorhanden ist.
   - In derselben Tick-Logik zusätzlich stale Fälle heilen: `twoshot_stage='audio'` + `audio_plan.twoshot.url` vorhanden + `clip_url` vorhanden + kein Lip-Sync gestartet → sofort auf `master_clip` setzen.
   - Dadurch greift der bestehende v5-Kandidatenfilter im nächsten Poll-Tick und ruft `compose-dialog-segments` auf.

2. **v5-Queue/Deferred-Stages nicht blockieren**
   - Der Kandidatenfilter blockiert aktuell alle Stages außer `master_clip`/`failed`. Backend kann aber `deferred` oder `circuit_open` setzen.
   - Diese wartenden Stages sollen nicht als Fehler verschwinden, sondern sichtbar bleiben und automatisch wieder dispatchen dürfen, sobald Slots frei sind.

3. **Globalen Fortschrittsbalken stabil halten**
   - In `src/hooks/usePipelineProgress.ts` frühe Lip-Sync-Stages (`audio`, `master_clip`, `preflight`, `deferred`, `circuit_open`) als aktive Pipeline zählen, auch wenn `lip_sync_status` noch `null`/`pending` ist.
   - `audioPlan.twoshot.url`, `clipUrl`, `twoshotStage` und `dialogShots.version === 5` als v5-Fortschrittssignale berücksichtigen.
   - Dadurch verschwindet der Balken nicht mehr nur deshalb, weil Sync.so noch nicht den Job-Status geschrieben hat.

4. **Kachelstatus ehrlicher machen**
   - In `src/components/video-composer/SceneInlinePlayer.tsx` die Labels erweitern:
     - `audio` ohne URL: „Audio wird vorbereitet…“
     - `audio` mit URL: „Audio fertig — Lip-Sync wird gestartet…“
     - `master_clip`/`deferred`: „Wartet auf Sync.so-Slot…“ bzw. „Sync.so wird gestartet…“
     - `syncso_pass_*`/`syncso_segments`: „Lip-Sync läuft…“
     - `failed`: klare Fehlermeldung statt verschwindender Spinner
   - Optional eine kleine Prozent-/Step-Zeile in der Kachel anzeigen, damit der Nutzer sieht, ob es bei Audio, Queue oder Sync.so steht.

5. **Kein Datenbank- oder Provider-Umbau**
   - Keine Migration nötig.
   - Keine Änderung an Sync.so, Credits oder Tabellen.
   - Die v5 Pipeline (`compose-dialog-segments`) bleibt der einheitliche Pfad; wir reparieren den Übergang von Audio-Prep zu v5 und die Fortschrittsableitung.
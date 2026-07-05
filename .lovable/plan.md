## Befund

Der aktuelle Stillstand ist **kein Sync.so-/Face-Detect-Problem**, sondern ein neuer **Client-Status-Deadlock**:

- Szene `cbfe0e84-520a-42ee-a0de-a3679946ec6c` hat einen fertigen Audio-Plan (`audio_plan.twoshot.url` existiert, 3 Speaker-Tracks gemerged).
- Status steht auf `lip_sync_status='pending'`, `twoshot_stage=null`.
- Gleichzeitig steht `clip_error='audio_plan_not_ready_self_heal'` — geschrieben vom v172-Self-Heal-Zweig in `compose-dialog-segments`, gedacht als reiner Recovery-Marker.
- Der Client-Filter `isRealizedScene()` lehnt aber **jede** Zeile mit irgendeinem `clip_error` ab.
- Ergebnis: Die Szene sieht für die UI aus wie „Lip-Sync wird gestartet…", wird aber vom Auto-Trigger nie wieder an `compose-dialog-segments` übergeben — endlose Warteschleife ohne echten Job.

## Plan

1. **Self-Heal-Marker nicht als harte Fehler behandeln**
   - `isRealizedScene()` so anpassen, dass reine Recovery-/Info-Marker wie `audio_plan_not_ready_self_heal` und `auto-reset: stale audio prep` die Lip-Sync-Pipeline nicht blockieren.
   - Harte Fehler (echte Terminal-Reasons) bleiben weiterhin blockierend.

2. **Audio-Done-Bridge absichern**
   - In `useTwoShotAutoTrigger` beim Übergang `audio_plan.twoshot.url vorhanden → twoshot_stage='master_clip'` gleichzeitig den temporären `clip_error` löschen.
   - Dadurch kann der nächste Tick die Szene sauber als Kandidat erkennen.

3. **Candidate-Start robuster machen**
   - Wenn `audio_plan.twoshot.url` bereits existiert und `twoshot_stage=null` ist, direkt auf `master_clip` promoten.
   - Keine Änderung an failed/running/canceled-Szenen; die Server-owned-State-Machine (v23) bleibt erhalten.

4. **Bestehende hängende Szene einmalig lösen**
   - Für Szene `cbfe0e84-...` den temporären `clip_error` entfernen und `twoshot_stage='master_clip'` setzen, damit der Auto-Trigger sofort fortsetzt.

5. **Validierung**
   - Nach Deploy: prüfen, dass die Szene von `compose-dialog-segments` erneut aufgerufen wird (Log: `DISPATCH_ATTEMPT_STARTED`).
   - Erwartung: Weg von „Lip-Sync wird gestartet…" hin zu echtem Running/Dispatch oder sauberem Terminalfehler; kein stiller Pending-Zustand mehr.

## Technische Details

- Datei 1: `src/lib/composer/isRealizedScene.ts` — `clip_error`-Check auf harte Fehler einschränken (Whitelist der Recovery-Marker).
- Datei 2: `src/hooks/useTwoShotAutoTrigger.ts` — im `audioReadyButNotAdvanced`-Zweig zusätzlich `clip_error: null` mit-updaten.
- DB-Nachpflege: einmaliges `UPDATE composer_scenes SET clip_error=null, twoshot_stage='master_clip' WHERE id='cbfe0e84-520a-42ee-a0de-a3679946ec6c'`.
- Kein Anfassen von `compose-dialog-segments`, kein Sync.so-Modellwechsel, keine Änderung am v187-Preclip-Pfad.
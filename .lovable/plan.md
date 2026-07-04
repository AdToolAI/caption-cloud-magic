## Ziel
Der Button „Lipsync komplett zurücksetzen“ soll nicht nur den Backend-Job abbrechen, sondern sofort und dauerhaft im UI als gestoppt erscheinen. Keine Szene und kein Basis-Video wird gelöscht.

## Umsetzung
1. **UI-Progress nach Cancel beenden**
   - Nach erfolgreichem `cancel-dialog-lipsync` zusätzlich ein `lipsync:end` Pipeline-Event senden.
   - Dadurch verschwindet der globale Lip-Sync-Fortschrittsbalken sofort statt weiterzulaufen.

2. **Lokale Szene vollständig als deaktiviert markieren**
   - Im `onUpdate`-Patch neben `lipSyncStatus: 'canceled'` auch alle sichtbaren Lip-Sync-Aktivitätsfelder neutralisieren.
   - Wichtig: `clipUrl`, `clipStatus`, `referenceImageUrl`, `replicatePredictionId` des Basis-Videos bleiben unangetastet.

3. **Progress-/Badge-Logik korrigieren**
   - Stellen, die `twoshotStage`, `lipSyncStatus` oder Dialog-Shots als aktive Arbeit zählen, sollen `canceled` explizit als terminalen Zustand behandeln.
   - Ergebnis: keine Anzeige „Lip-Sync startet…“ oder laufender Balken mehr, wenn der Status `canceled` ist.

4. **Auto-Trigger gegen Cancel absichern**
   - Bestehende Kandidatenfilter lassen `lip_sync_status='canceled'` bereits nicht erneut starten.
   - Ich ergänze nur dort eine Absicherung, wo Prep-/Self-Heal-Logik vor dem Kandidatenfilter noch alte Stages wie `audio`/`master_clip` sehen könnte.

5. **Server-Race absichern**
   - Prüfen, ob `cancel-dialog-lipsync` alle bekannten Job-IDs erwischt und den Row-Status eindeutig terminal setzt.
   - Falls nötig: bei `reset: true` zusätzlich die sichtbaren Dispatch-Marker so setzen, dass spätere Webhooks/alte Polls den UI-Zustand nicht wiederbeleben.

## Verifikation
- Szene mit laufendem Lip-Sync abbrechen.
- Erwartung: Toast erscheint, Scene-Overlay hört sofort auf, globaler Lip-Sync-Balken endet, Button bleibt verfügbar/terminal, Basis-Video bleibt sichtbar.
- Nach dem nächsten Poll/Realtime-Update darf Lip-Sync nicht erneut starten.
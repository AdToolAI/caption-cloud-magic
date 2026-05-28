## Befund

Die Szene ist in der Datenbank nicht mehr wirklich in der Szenengeneration:

- Szene 1 hat `clip_status = ready`
- `clip_url` ist vorhanden
- `lip_sync_status = pending`
- `dialog_shots = null`
- In den Logs gibt es keinen Aufruf von `compose-dialog-scene` für diese Szene

Das heißt: Der Master-Clip ist fertig, aber der automatische Übergang zum Lip-Sync wurde nicht zuverlässig gestartet. Die UI zeigt weiter „Szene wird gebaut…“, weil sie bei Cinematic-Sync `status === ready + lip_sync pending` als laufende Arbeit interpretiert.

## Problem

Der aktuelle Auto-Trigger hängt zu stark am Client/Tab-Polling und an `EdgeRuntime.waitUntil` im Clip-Webhook. Wenn der Webhook-Background-Task oder der Client-Trigger ausfällt, bleibt die Szene im Zwischenzustand:

```text
clip ready -> lip_sync pending -> kein dialog_shots State -> kein poll-dialog-shots -> kein Lip-Sync
```

Das ist genau der Zustand im Screenshot.

## Plan

1. **Backend-Übergang robust machen**
   - `compose-clip-webhook` soll den Lip-Sync-Start für Cinematic-Sync nicht nur als stillen Background-Fetch versuchen.
   - Nach erfolgreichem Master-Clip wird ein verlässlicher Startmarker gesetzt bzw. `compose-dialog-scene` so angestoßen, dass Fehler sichtbar in `clip_error` landen.
   - Falls der direkte Start nicht klappt, bleibt die Szene nicht unsichtbar hängen.

2. **Client Auto-Trigger erweitern**
   - `useTwoShotAutoTrigger` soll genau diesen Zustand erkennen:
     - `engine_override = cinematic-sync`
     - `clip_status = ready`
     - `clip_url` vorhanden
     - `lip_sync_status = pending/null`
     - `dialog_shots = null`
   - Dann `compose-dialog-scene` erneut anstoßen, auch wenn `twoshot_stage` leer ist.
   - Wichtig: keinen Optimistic-Lock, der die Edge Function wieder blockiert.

3. **UI ehrlich machen**
   - In der Szenenkarte nicht mehr „Szene wird gebaut…“ anzeigen, wenn der Clip schon fertig ist.
   - Stattdessen: „Lip-Sync startet…“ oder „Lip-Sync läuft“, damit klar ist, welche Phase hängt.
   - Wenn nach einer Wartezeit keine `dialog_shots` entstehen, Fehler/Retry-Hinweis statt endloser Bau-Overlay.

4. **Poller-Recovery ergänzen**
   - `poll-dialog-shots` bleibt zuständig, sobald `dialog_shots` existieren.
   - Der Client soll laufende `dialog_shots` weiter anpollern, aber nicht mehrere parallele Starts auslösen.

5. **Betroffene Szene neu anstoßen**
   - Szene `63ca7ed3-5771-4d4e-8e84-a8df3e78bb36` auf sauberen Lip-Sync-Pending-State setzen und `compose-dialog-scene` einmal direkt starten.
   - Danach sollte `dialog_shots` angelegt werden und der Status von `pending` auf `running/lipsyncing` wechseln.

## Dateien

- `src/hooks/useTwoShotAutoTrigger.ts`
- `src/components/video-composer/SceneInlinePlayer.tsx`
- optional `src/components/video-composer/SceneClipProgress.tsx`
- `supabase/functions/compose-clip-webhook/index.ts`
- ggf. direkte Datenkorrektur für die betroffene Szene

## Erwartetes Ergebnis

Die Pipeline bleibt nicht mehr zwischen fertigem Hailuo-Clip und Lip-Sync hängen. Sobald der Master-Clip fertig ist, wird `compose-dialog-scene` zuverlässig gestartet; im UI steht dann Lip-Sync statt Szenengeneration. Wenn der Start scheitert, gibt es einen echten Fehler mit Retry statt endlosem Spinner.
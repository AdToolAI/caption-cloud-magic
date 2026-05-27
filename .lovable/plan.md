## Befund

Der gezeigte Hänger ist kein Frontend-Spinner allein: In der Datenbank liegen aktuelle Render-Jobs seit über 10 Minuten auf `rendering`. Gleichzeitig gab es vorher wiederholt `IDLE_TIMEOUT` nach 150 Sekunden. Die Ursache sitzt sehr wahrscheinlich in der Render-Start-/Tracking-Kette:

- Universal Creator startet inzwischen `render-with-remotion` asynchron.
- Die UI pollt aber zusätzlich `check-remotion-progress` mit einem Parameter-Mismatch (`render_id` vs. `renderId`), wodurch der Status nicht zuverlässig aufgeklärt wird.
- Ältere/alternative Renderpfade wie Dialog-Stitch bzw. `invoke-remotion-render` nutzen noch synchrones Lambda-Startverhalten oder warten zu lange und hinterlassen Jobs als `rendering`, wenn kein Webhook zurückkommt.
- Stale Jobs werden erst nach sehr langer Zeit oder gar nicht sauber als fehlgeschlagen markiert/refunded, dadurch bleibt die UI auf „Wird gerendert…“.

## Plan

1. **Universal Creator Polling reparieren**
   - In `PreviewExportStep.tsx` den Polling-Call an `check-remotion-progress` korrekt mit `renderId`/`render_id` handhaben.
   - Zusätzlich den einfachen DB-Status (`check-render-status` oder direkte `video_renders`-Abfrage über bestehenden Auth-Kontext) als Fallback nutzen, damit abgeschlossene/fehlgeschlagene Jobs auch ohne Realtime sofort in der UI ankommen.
   - `isRendering` zuverlässig beenden, sobald alle Jobs `completed` oder `failed` sind.

2. **Render-Progress Function robuster machen**
   - `check-remotion-progress` so anpassen, dass sie stale Jobs früher erkennt und sauber in `failed` setzt, wenn kein echtes Lambda-/S3-Tracking möglich ist.
   - Für Jobs ohne `real_remotion_render_id` und ohne auffindbare S3-Datei nach definiertem Timeout eine klare Fehlermeldung speichern.
   - Credit-Refund nur idempotent ausführen, wenn `credits_used` vorhanden ist und noch kein Refund-Marker gesetzt wurde.

3. **Noch synchrone Lambda-Pfade entschärfen**
   - `invoke-remotion-render` und relevante Dialog-Stitch-Aufrufe auf den bereits vorgesehenen Async/Event-Modus umstellen bzw. den sync wait deutlich begrenzen, damit keine 150s Edge-Function-Timeouts mehr entstehen.
   - Den realen Render-Status danach über `out_name`, `progress.json` und Webhook/S3-Reconciliation auflösen.

4. **Aktuell hängende Jobs bereinigen**
   - Die jetzt offenen `rendering`-Rows prüfen.
   - Wenn keine Output-Datei in S3 gefunden wird und sie über Timeout liegen: auf `failed` setzen, aussagekräftige Fehlermeldung speichern und Credits idempotent zurückbuchen.
   - Dadurch verschwindet der endlose Spinner in der UI und der Nutzer bekommt einen echten Fehlerstatus statt „rendering“.

5. **Deployment & Validierung**
   - Betroffene Edge Functions deployen.
   - Danach Logs/Datenbank prüfen: ein neuer Render muss schnell einen Job zurückgeben, nach Fehlern sauber `failed` werden oder bei erfolgreichem Webhook/S3-Recovery `completed` mit Download-URL erhalten.
## Befund

Der aktuelle Fehler ist nicht mehr der Edge-Function-`IDLE_TIMEOUT`. Der Render startet inzwischen und bekommt eine echte Remotion-Render-ID. Danach bricht die Remotion Lambda Runtime selbst ab:

```text
AbortError: The operation was aborted
failure_stage: lambda-runtime
```

In den letzten fehlgeschlagenen Jobs sieht man außerdem, dass die Szenen externe Pixabay-Video-URLs direkt in Remotion laden. Das ist wahrscheinlich der neue Engpass: Lambda muss mehrere Remote-MP4s plus Audio während des Renderns streamen; wenn ein Stream abbricht, meldet Remotion nur generisch `The operation was aborted`.

## Plan

1. **Remotion-Template entschärfen**
   - In `src/remotion/templates/UniversalCreatorVideo.tsx` die `[FORENSIC]`-Debug-Ausgaben von `console.error` auf normale Debug-/Info-Ausgabe umstellen oder entfernen, damit sie nicht mehr als rote Fehler im Browser erscheinen.
   - `SafeVideo` robuster machen: keine unnötige `pauseWhenBuffering`-Blockade für dekorative Hintergrundvideos, sauberer Fallback auf Gradient, wenn Remote-Video nicht lädt.

2. **Universal-Creator-Render stabilisieren**
   - In `supabase/functions/render-with-remotion/index.ts` für `UniversalCreatorVideo` zunächst einen stabilen Render-Pfad aktivieren: externe Hintergrundvideos werden vor dem Lambda-Start in sichere statische/Gradient-Fallbacks umgewandelt oder optional als Video deaktiviert.
   - Voiceover und Musik bleiben erhalten, damit der eigentliche Export weiterhin nutzbar ist.
   - Zusätzlich `customData` um Diagnosefelder ergänzen, damit Webhook/DB später eindeutig zeigen, ob ein stabilisierter Render-Pfad verwendet wurde.

3. **Webhook-Fehler richtig klassifizieren und Credits zuverlässig erstatten**
   - In `supabase/functions/remotion-webhook/index.ts` `AbortError` / `The operation was aborted` als `timeout` oder `lambda_crash` klassifizieren statt `unknown`.
   - Den Refund idempotent machen wie bei `render-with-remotion`: `credit_refund_done` prüfen und erst dann Credits zurückgeben. Aktuell steht bei den letzten Fehlern `credit_refund_done:false`, obwohl refunded wurde/werden sollte; das muss konsistent werden.

4. **Polling weniger irreführend machen**
   - In `supabase/functions/check-remotion-progress/index.ts` S3-`ListObjects`-403 nicht wiederholt als Warn-Fehler behandeln, weil die HEAD-/Webhook-Wege ausreichen. Das reduziert Log-Rauschen und falsche Fehlersuche.

5. **Deploy und Verifikation**
   - Betroffene Edge Functions deployen: `render-with-remotion`, `remotion-webhook`, optional `check-remotion-progress`.
   - Danach Logs prüfen: Render sollte nicht mehr mit `AbortError` wegen Remote-Video-Streaming abbrechen; bei echtem Lambda-Abbruch wird der Fehler korrekt kategorisiert und Credits werden genau einmal erstattet.

## Erwartetes Ergebnis

Der Render läuft nicht mehr in den Edge-Function-Timeout, und der aktuelle Lambda-Abbruch durch instabile Remote-Medien wird abgefangen bzw. vermieden. Falls AWS/Remotion dennoch abbricht, sieht die App eine klare Fehlerkategorie und Credits werden zuverlässig zurückgebucht.
## Diagnose

Der Loop kommt nicht vom Plate selbst, sondern von zwei konkreten Pipeline-Problemen:

1. **Die Live-Edge-Function läuft noch auf `v140.0`**, obwohl im Code bereits `v143.0` steht. In den Logs steht aktuell mehrfach:
   `BOOT version=v140.0`
   Dadurch ist **Plate-Rehost v143 noch nicht aktiv**.

2. **Die NOOP-Ladder wird im Dispatcher wieder neutralisiert.**
   Der Webhook eskaliert korrekt auf `bbox-url-pro`, aber `compose-dialog-segments` normalisiert diese Varianten direkt wieder zu `coords-pro` und sendet erneut:
   `sync-3 + preclip + auto_detect:true`
   Ergebnis: identischer Input → identischer NOOP → Retry-Loop.

## Plan

1. **Edge Functions deployen**
   - `compose-dialog-segments`
   - `sync-so-webhook`
   - `lipsync-watchdog`
   - `lipsync-diagnostic`

2. **NOOP-Ladder wirklich wirksam machen**
   - In `compose-dialog-segments` darf ein expliziter NOOP-Retry mit `bbox-url-pro` oder `coords-pro-box` nicht mehr zurück auf `coords-pro` normalisiert werden.
   - Für `noop_auto_escalation=true` wird die übergebene `retry_variant` respektiert.

3. **Loop-Schutz verschärfen**
   - Watchdog darf aktive NOOP-Eskalationen nicht zusätzlich per `advance:true` re-dispatchen, wenn bereits ein Job läuft oder gerade ein `noop_retry_attempt_id` aktiv ist.
   - Nach Ladder-Ende: harter Fail mit Refund und `needs_clip_rerender`, kein weiterer automatischer Retry.

4. **Verifikation**
   - Nach Deploy prüfen, dass Logs `BOOT version=v143.0` zeigen.
   - Prüfen, dass neue Dispatches `lipsync-plates` URLs nutzen.
   - Prüfen, dass bei NOOP die zweite Runde wirklich eine andere ASD-Variante sendet oder sauber terminal failed.
## Bestätigte Ursache

Die Sync.so-Verarbeitung selbst ist fertig: Alle vier Jobs der Szene `7c11bc27…` melden `COMPLETED`. Der Fortschritt bleibt hängen, weil `sync-so-webhook` bei jedem Start abstürzt:

`imagescript@1.3.0 — unsupported arch/platform: Not supported`

Dadurch kann der Webhook die fertigen Outputs nicht in `dialog_shots.passes[]` übernehmen. Die vier Passes bleiben fälschlich auf `rendering`; der Watchdog leitet sie jede Minute erneut an denselben abstürzenden Webhook weiter.

## Umsetzung

1. **Inkompatiblen Decoder entfernen**
   - Den statischen NPM-Import von `imagescript` aus `_shared/mouth-motion-verdict.ts` entfernen.
   - Eine Edge-kompatible, plattformunabhängige Bilddecodierung einsetzen, ohne native Node-Binaries.
   - Die bestehenden AWS-Still-Extraktion, Mund-Crops, Delta-Auswertung und `moved/static/passthrough/unknown`-Semantik unverändert lassen.

2. **Webhook wieder startfähig machen**
   - `sync-so-webhook` neu deployen und unmittelbar prüfen, dass kein Boot-/Architekturfehler mehr auftritt.
   - Einen fokussierten Decoder-/Motion-Probe-Test ergänzen, damit ein inkompatibler Import künftig vor dem Deployment auffällt.

3. **Aktuellen Lauf retten statt neu berechnen**
   - Den Watchdog nach dem Fix erneut laufen lassen. Er kann die vier bereits fertigen Sync.so-Jobs übernehmen; keine neue Provider-Generierung und keine erneuten Kosten.
   - Prüfen, dass Pass 1–4 von `rendering` in terminale Zustände wechseln und anschließend Mux/Finalisierung startet.

4. **End-to-End verifizieren**
   - Funktions-Logs auf Webhook-Erfolg, Motion-Verdicts und Mux-Aufruf prüfen.
   - Datenbankzustand der Szene kontrollieren: kein dauerhaftes `syncso_pass_4_of_4`, keine offenen Slot-Leases und entweder fertiges Lip-Sync-Ergebnis oder ein klarer, fachlicher Motion-Fehler statt eines Hängers.

## Sicherheitsgrenze

Dieser Fix adressiert ausschließlich den jetzt bewiesenen Hänger. Er verändert weder Sprecherzuordnung noch Preclip-Geometrie oder Provider-Retry-Strategie.
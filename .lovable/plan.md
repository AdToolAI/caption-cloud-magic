# Stripe-Webhook: ja, es ist ein echtes Problem — und zwar seit dem ersten Tag

## Befund (geprüft, nicht vermutet)

- Der Endpunkt lebt und antwortet (Testaufruf: HTTP 200 auf den internen Mock-Pfad).
- Ein Testaufruf mit absichtlich falscher Signatur liefert die Stripe-Meldung „No signatures found matching the expected signature" — die Signaturprüfung läuft also und schlägt fehl, **und der Endpunkt antwortet darauf mit HTTP 500 statt 400**.
- Die Tabelle, in der jedes verarbeitete Stripe-Ereignis vermerkt wird, ist **komplett leer — kein einziger Eintrag, nie**. Kein echtes Stripe-Ereignis hat also je die Verarbeitung erreicht.
- Stripe meldet 17 Fehlversuche mit HTTP 500 seit dem 3.9. 15:28:40 (dem Zeitpunkt des Testkaufs) und schaltet den Endpunkt am **12.9. ab**.

Daraus folgt: Die Ereignisse scheitern **vor** jeder Geschäftslogik, an der Signaturprüfung. Wahrscheinlichste Ursache: Das hinterlegte Webhook-Signaturgeheimnis passt nicht zum aktiven Live-Endpunkt (falscher oder rotierter Wert, z. B. Test- statt Live-Secret). Das ist noch nicht bewiesen — Secret-Werte sind nicht lesbar — deshalb ist die Verifikation Schritt 1.

## Was das praktisch bedeutet

- Zahlungen selbst funktionieren: Geld wird eingezogen, Guthaben wurde beim Testkauf korrekt gebucht — aber nur, weil die App das beim Zurückkehren aus dem Checkout selbst nachholt.
- Nicht abgesichert ist alles, was nur der Webhook erledigt: Guthaben, wenn jemand den Tab schließt; Abo-Plan/Wallet bei Abschluss, Verlängerung und Kündigung; Kaufmail und Rechnungsbeleg; Mahnmail bei fehlgeschlagener Zahlung; Gutschein-Einlösung und Affiliate-Provisionen.
- Ab 12.9. stellt Stripe die Zustellung ganz ein.

## Vorgehen

1. **Ursache beweisen.** Das Signaturgeheimnis des aktiven Live-Endpunkts neu aus Stripe holen und über die sichere Eingabemaske speichern (`STRIPE_WEBHOOK_SECRET`). Danach denselben Endpunkt mit einem korrekt signierten Testereignis prüfen: erwartet wird HTTP 200 und ein neuer Eintrag in der Ereignistabelle. Falls die Signatur danach weiterhin scheitert, liegt es nicht am Secret, und ich melde mich mit dem nächsten Befund, bevor irgendetwas geändert wird.
2. **Fehlerverhalten korrigieren.** Signaturfehler beantworten künftig mit HTTP 400 statt 500 — Stripe zählt 400 nicht als Serverfehler und deaktiviert den Endpunkt deswegen nicht. Interne Fehler bleiben 500 (damit Stripe erneut zustellt).
3. **Robustheit.** Kurzer Nachweis, dass der Eintrag in die Ereignistabelle wirklich schreibt (Dopplungsschutz greift sonst nie). Fehler in Nebenaufgaben (Mails, Radar, Affiliate) dürfen den Webhook nicht auf 500 ziehen — die Kernbuchung entscheidet über den Statuscode.
4. **Nachholen.** Nach dem Fix die seit dem 3.9. fehlgeschlagenen Ereignisse in Stripe erneut zustellen lassen und anschließend prüfen, ob Guthaben, Plan und Wallet der betroffenen Käufe stimmen. Alle Buchungen sind idempotent, doppelte Gutschriften sind ausgeschlossen. Muss vor dem 12.9. passieren.

## Technisch

- `supabase/functions/stripe-webhook/index.ts`: `constructEventAsync` in einen eigenen try/catch mit Status 400; Statuslogik im äußeren Catch unverändert.
- Prüfen, ob `public.stripe_webhook_events` für die Service-Rolle beschreibbar ist (Grants/Constraints), da bisher keine einzige Zeile existiert.
- Kein Eingriff in Preise, Pakete, Wallet-Logik, Creator-Rabatte oder die Video-/Lip-Sync-Pipeline.
- Deployment nur der Funktion `stripe-webhook`.

## Verifikation

- Signierter Testaufruf: HTTP 200, ein Eintrag in `stripe_webhook_events`.
- Falsch signierter Aufruf: HTTP 400.
- Nach dem Neuzustellen: Stripe-Endpunkt ohne Fehlversuche, Guthaben/Plan der betroffenen Käufe stimmen, keine Doppelbuchung im Guthaben-Journal.

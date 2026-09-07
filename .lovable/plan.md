# Stripe-Webhook: ja, es ist ein echtes Problem — und ja, es sieht nach dem falschen Webhook aus

## Befund (geprüft, nicht vermutet)

- Im Live-Konto ist genau **ein** Ziel eingetragen: `.../functions/v1/stripe-webhook` (Ereignisse: Checkout, Abo geändert/gelöscht, Rechnung bezahlt/fehlgeschlagen, Zahlung erfolgreich, Rückerstattung).
- In deinem Screenshot ist ein **zweites** Ziel zu sehen: „AdTool AI – Subscription Webhook" → `.../functions/v1/billing-update`, aktiv, 3 Ereignisse. **Diese Funktion existiert bei uns gar nicht** — ein Aufruf antwortet mit 404. Sie taucht auch nicht in der Live-Liste auf, gehört also zu einer anderen Umgebung (Test/Sandbox).
- Der aktive Endpunkt lebt: interner Testaufruf antwortet 200.
- Ein Aufruf mit absichtlich falscher Signatur liefert die Stripe-Meldung „No signatures found matching the expected signature" — und wird mit **HTTP 500 statt 400** beantwortet.
- Die Tabelle, in der jedes verarbeitete Stripe-Ereignis vermerkt wird, ist **komplett leer — kein einziger Eintrag, nie**. Kein echtes Stripe-Ereignis hat also je die Verarbeitung erreicht.
- Stripe meldet 17 Fehlversuche mit HTTP 500 seit dem 3.9. 15:28:40 (Zeitpunkt des Testkaufs) und stellt die Zustellung am **12.9.** ein.

Daraus folgt: Die Ereignisse scheitern **vor** jeder Geschäftslogik, an der Signaturprüfung. Wahrscheinlichste Ursache: Das hinterlegte Signaturgeheimnis gehört zum falschen Ziel (z. B. zum Sandbox-Endpunkt `billing-update`) statt zum aktiven Live-Endpunkt `stripe-webhook`. Bewiesen ist das noch nicht — Secret-Werte sind nicht lesbar — deshalb ist die Verifikation Schritt 1.

## Was das praktisch bedeutet

- Zahlungen selbst funktionieren: Geld wird eingezogen, das Guthaben beim Testkauf wurde korrekt gebucht — aber nur, weil die App das beim Zurückkehren aus dem Checkout selbst nachholt.
- Nicht abgesichert ist alles, was ausschließlich der Webhook erledigt: Guthaben, wenn jemand den Tab schließt; Abo-Plan und Wallet bei Abschluss, Verlängerung und Kündigung; Kaufmail und Rechnungsbeleg; Mahnmail bei fehlgeschlagener Zahlung; Gutschein-Einlösung; Affiliate-Provisionen.
- Ab 12.9. stellt Stripe die Zustellung ganz ein.

## Vorgehen

1. **Ziele aufräumen.** Nur der Live-Endpunkt `stripe-webhook` bleibt. Das Ziel `billing-update` zeigt auf eine nicht existierende Funktion und wird gelöscht bzw. bleibt ungenutzt in der Sandbox.
2. **Ursache beweisen.** Das Signaturgeheimnis **des aktiven Live-Endpunkts** neu aus Stripe holen und über die sichere Eingabemaske speichern (`STRIPE_WEBHOOK_SECRET`). Danach mit einem korrekt signierten Testereignis prüfen: erwartet werden HTTP 200 und ein neuer Eintrag in der Ereignistabelle. Scheitert die Signatur danach weiter, liegt es nicht am Secret — dann melde ich mich mit dem nächsten Befund, bevor etwas anderes geändert wird.
3. **Fehlerverhalten korrigieren.** Signaturfehler beantworten künftig HTTP 400 statt 500 — Stripe zählt 400 nicht als Serverfehler und schaltet den Endpunkt deswegen nicht ab. Echte interne Fehler bleiben 500, damit Stripe erneut zustellt.
4. **Robustheit.** Nachweisen, dass der Eintrag in die Ereignistabelle wirklich schreibt (sonst greift der Dopplungsschutz nie). Fehler in Nebenaufgaben (Mails, Radar, Affiliate) dürfen den Webhook nicht auf 500 ziehen — nur die Kernbuchung bestimmt den Statuscode.
5. **Nachholen.** Nach dem Fix die seit dem 3.9. fehlgeschlagenen Ereignisse in Stripe erneut zustellen lassen und danach Guthaben, Plan und Wallet der betroffenen Käufe prüfen. Alle Buchungen sind idempotent, Doppelgutschriften sind ausgeschlossen. Muss vor dem 12.9. passieren.

## Technisch

- `supabase/functions/stripe-webhook/index.ts`: `constructEventAsync` in eigenen try/catch mit Status 400; äußere Fehlerbehandlung unverändert 500.
- Prüfen, ob `public.stripe_webhook_events` für die Service-Rolle beschreibbar ist (Grants/Constraints), da bisher keine einzige Zeile existiert.
- Kein Eingriff in Preise, Pakete, Wallet-Logik, Creator-Rabatte oder die Video-/Lip-Sync-Pipeline.
- Deployment nur der Funktion `stripe-webhook`.

## Verifikation

- Signierter Testaufruf: HTTP 200 und ein Eintrag in `stripe_webhook_events`.
- Falsch signierter Aufruf: HTTP 400.
- Nach dem Neuzustellen: Endpunkt ohne Fehlversuche, Guthaben/Plan der betroffenen Käufe stimmen, keine Doppelbuchung im Guthaben-Journal.

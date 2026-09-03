# Mehr Zahlungsmethoden — ein Anbieter, weltweite Abdeckung

Ziel: möglichst viele Zahlungsarten anbieten, ohne einen zweiten Zahlungsanbieter einzuführen. Alles läuft weiter über Stripe; ein zweiter Anbieter würde doppelte Webhooks, doppelte Abo-Wahrheit und doppelte Fehlerquellen im Guthaben-Ledger bedeuten.

## Ausgangslage (geprüft)

Alle drei Checkout-Funktionen (`create-checkout` für Abos, `create-enterprise-checkout`, `ai-video-purchase-credits` für Guthaben) setzen **keine** feste Methodenliste. Sie nutzen Stripes automatische Zahlungsarten, d. h. es erscheint genau das, was im Stripe-Konto freigeschaltet ist. Ein früherer Versuch, `paypal` hart zu setzen, führte zu 500ern und wurde bewusst zurückgenommen (Kommentar in `create-checkout`).

Konsequenz: Der größte Hebel ist **keine Code-Änderung**, sondern die Freischaltung im Stripe-Konto. Der Code muss nur an drei Stellen nachziehen.

## Was freigeschaltet wird (Stripe-Konto, Aktion von dir)

Weltweiter Verkauf, Abo + Einmalkauf:

- **Karten** (bereits aktiv) — inkl. Apple Pay / Google Pay
- **PayPal** — größter Umsatzhebel in DACH, funktioniert für Abo und Einmalkauf
- **SEPA-Lastschrift** — EUR, Abo-tauglich, sehr niedrige Gebühren
- **Klarna** — Einmalkauf (Guthaben-Pakete), EU + US
- **iDEAL / Bancontact / Blik / P24 / EPS** — lokale EU-Methoden, Einmalkauf
- **Link** — Stripes One-Click-Checkout, kostenlos aktivierbar
- **Cash App Pay / Amazon Pay** — US-Abdeckung
- **Revolut Pay, Multibanco, Twint** — optional, je nach Nachfrage

Wichtig: Nicht jede Methode kann Abos. Stripe blendet im Abo-Checkout automatisch nur die abofähigen (Karte, PayPal, SEPA, Link, Bancontact-Mandat) ein — die restlichen erscheinen nur beim Guthaben-Kauf. Das ist gewollt und erfordert keinen Sonderfall im Code.

## Was ich im Code ändere

1. **Apple Pay / Google Pay Domain-Verifizierung** absichern: beide Custom-Domains (`captiongenie.app`, `useadtool.ai`) müssen in Stripe registriert sein, sonst zeigt der Checkout die Wallets nicht. Ich prüfe den Status und melde, was in Stripe noch zu bestätigen ist.
2. **Guthaben-Checkout (`ai-video-purchase-credits`)**: Kunden-Adresse erheben wie beim Abo (`billing_address_collection`), damit Klarna/iDEAL/SEPA nicht an fehlenden Pflichtfeldern scheitern, und die Rechnungserstellung bleibt unverändert.
3. **Abo-Checkout (`create-checkout`)**: SEPA-/PayPal-Mandate für wiederkehrende Zahlungen sauber setzen, damit Folgebuchungen nicht scheitern. Kein hartes Setzen von `payment_method_types` — der automatische Modus bleibt.
4. **Fehlerbild verbessern**: Wenn eine Methode für Währung/Land nicht verfügbar ist, aktuell 500 mit Rohtext. Stattdessen eine verständliche, lokalisierte Meldung (EN/DE/ES).
5. **Sichtbarkeit im Frontend**: Auf Pricing- und Guthaben-Seite eine dezente Zeile „Karte · PayPal · SEPA · Klarna · Apple Pay · Google Pay" im Design-System (keine Fremdlogos in Fremdfarben). Das erhöht die Conversion messbar, weil Nutzer vor dem Klick sehen, dass ihre Methode dabei ist.

## Was ausdrücklich unberührt bleibt

Preise, FX-Faktor 1,15, Creator-Rabatt, Guthaben-Ledger, Refunds, Promo-Codes, Founders-Logik, Video- und Lip-Sync-Pipeline.

## Prüfung

Typecheck, Build, gezielte Tests der Checkout-Funktionen; danach je ein Test-Checkout (Abo + Guthaben) im Stripe-Testmodus mit Kontrolle, welche Methoden angezeigt werden. Deploy nur der berührten Funktionen.

## Reihenfolge

Ich starte mit der Bestandsaufnahme deines Stripe-Kontos (welche Methoden sind schon aktiv, sind die Domains verifiziert) und liefere dir eine konkrete Klickliste. Parallel gehen die Code-Anpassungen live, damit die Methoden sofort greifen, sobald du sie freischaltest.

# Zahlungsarten: Was noch offen ist

Kurz: Code-seitig ist alles fertig und deployed. Was fehlt, ist ausschließlich der Nachweis, dass im echten Checkout wirklich die erwarteten Methoden erscheinen.

## Bereits erledigt (deployed)

- Alle drei Checkout-Funktionen (Abo, Enterprise, Guthaben) nutzen Stripes automatische Zahlungsarten — es erscheint genau das, was im Konto aktiviert ist.
- Rechnungsadresse + Name werden erhoben (`customer_update`), damit Klarna, SEPA und lokale Bank-Methoden überhaupt eingeblendet werden.
- SEPA-/PayPal-Mandat für Abos gesetzt, Enterprise auf aktuelle Stripe-API gezogen.
- Apple Pay / Google Pay Domains `captiongenie.app` und `useadtool.ai` in Stripe registriert (Status active).
- Lokalisierte Fehlermeldung, wenn eine Methode für Land/Währung nicht verfügbar ist.
- Hinweiszeile mit den Zahlungsarten auf Pricing und im Guthaben-Kauf (EN/DE/ES).

## Was ich als letzten Schritt vorschlage

Ein Verifikationsdurchlauf im Stripe-Testmodus, rein lesend ausgewertet:

1. Abo-Checkout einmal mit EUR/Deutschland und einmal mit USD/USA öffnen und protokollieren, welche Methoden Stripe tatsächlich anzeigt.
2. Guthaben-Checkout (Einmalzahlung) genauso — hier sollten deutlich mehr Methoden erscheinen als beim Abo.
3. Ergebnis als kurze Tabelle: erwartet vs. tatsächlich sichtbar, inkl. Begründung für jede fehlende Methode.

## Erwartungsmanagement

Nicht jede aktivierte Methode kann Abos. Stripe blendet im Abo-Checkout nur abofähige Methoden ein (Karte, PayPal, SEPA, Link, Amazon Pay); Klarna, iDEAL, Bancontact, BLIK, EPS und Banküberweisung erscheinen nur beim Guthaben-Kauf. Apple/Google Pay erscheinen nur auf passendem Gerät/Browser — im Test-Browser also ggf. nicht.

## Unberührt

Preise, FX-Faktor 1,15, Creator-Rabatt, Guthaben-Ledger, Refunds, Promo-Codes, Founders-Logik, Video- und Lip-Sync-Pipeline.

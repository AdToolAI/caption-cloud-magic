# Mehr Zahlungsmethoden — ein Anbieter, weltweite Abdeckung

Ziel: möglichst viele Zahlungsarten anbieten, ohne einen zweiten Zahlungsanbieter einzuführen. Alles läuft weiter über Stripe; ein zweiter Anbieter würde doppelte Webhooks, doppelte Abo-Wahrheit und doppelte Fehlerquellen im Guthaben-Ledger bedeuten.

## Ausgangslage (geprüft)

Alle drei Checkout-Funktionen (`create-checkout` für Abos, `create-enterprise-checkout`, `ai-video-purchase-credits` für Guthaben) setzen **keine** feste Methodenliste. Sie nutzen Stripes automatische Zahlungsarten, d. h. es erscheint genau das, was im Stripe-Konto freigeschaltet ist. Ein früherer Versuch, `paypal` hart zu setzen, führte zu 500ern und wurde bewusst zurückgenommen (Kommentar in `create-checkout`).

Konsequenz: Der größte Hebel ist **keine Code-Änderung**, sondern die Freischaltung im Stripe-Konto. Der Code muss nur an drei Stellen nachziehen.

## Stand deines Stripe-Kontos (aus deinen Screenshots)

Bereits aktiviert: Karten, Apple Pay, Google Pay, Amazon Pay, Link, PayPal, Revolut Pay, Samsung/Kakao/Naver Pay, PAYCO, Klarna, SEPA-Lastschrift, Bancontact, BLIK, EPS, Banküberweisung.

Damit ist die Freischaltung vollständig abgeschlossen — inklusive iDEAL. Auffällig fehlt nichts mehr; optional könntest du später Multibanco (Portugal), TWINT (Schweiz), Przelewy24 (Polen) oder Cash App Pay (USA) ergänzen, wenn du dort aktiv wirst.

Wichtig: Nicht jede Methode kann Abos. Stripe blendet im Abo-Checkout automatisch nur die abofähigen ein (Karte, PayPal, SEPA, Link, Amazon Pay) — der Rest erscheint nur beim Guthaben-Kauf. Das ist gewollt und braucht keinen Sonderfall im Code.

Dass die Methoden aktiviert sind, heißt aber noch nicht, dass sie im Checkout **erscheinen** — genau da liegt jetzt die eigentliche Arbeit.



## Was ich im Code ändere

1. **Guthaben-Checkout (`ai-video-purchase-credits`)**: Rechnungsadresse + Name erheben wie beim Abo. Ohne diese Felder blendet Stripe Klarna, SEPA und die lokalen Bank-Methoden im Checkout schlicht aus — das ist der wahrscheinlichste Grund, warum von den vielen aktivierten Methoden bisher wenig sichtbar ist. Rechnungslogik und Steuersatz bleiben unverändert.
2. **Abo-Checkout (`create-checkout`)**: SEPA-/PayPal-Mandat für wiederkehrende Zahlungen sauber setzen, damit Folgebuchungen nicht scheitern. Kein hartes Setzen von `payment_method_types` — der automatische Modus bleibt (das hatte früher 500er ausgelöst).
3. **Apple Pay / Google Pay Domain-Verifizierung** prüfen: `captiongenie.app` und `useadtool.ai` müssen in Stripe als Zahlungsmethoden-Domain registriert sein, sonst erscheinen die Wallets trotz Aktivierung nicht. Ich prüfe den Status und registriere fehlende Domains.
4. **Fehlerbild verbessern**: Wenn eine Methode für Währung/Land nicht verfügbar ist, kommt aktuell ein 500er mit Rohtext. Stattdessen eine verständliche, lokalisierte Meldung (EN/DE/ES).
5. **Sichtbarkeit im Frontend**: Auf Pricing- und Guthaben-Seite eine dezente Zeile „Karte · PayPal · SEPA · Klarna · Apple Pay · Google Pay" im Design-System (keine Fremdlogos in Fremdfarben). Nutzer sollen vor dem Klick sehen, dass ihre Methode dabei ist.

## Was ausdrücklich unberührt bleibt

Preise, FX-Faktor 1,15, Creator-Rabatt, Guthaben-Ledger, Refunds, Promo-Codes, Founders-Logik, Video- und Lip-Sync-Pipeline.

## Prüfung

Typecheck, Build, gezielte Tests der Checkout-Funktionen; danach je ein Test-Checkout (Abo + Guthaben) im Stripe-Testmodus mit Kontrolle, welche Methoden tatsächlich angezeigt werden — einmal mit EUR/DE, einmal mit USD/US. Deploy nur der berührten Funktionen.

## Dashboard-Aufgaben

Keine — alle Zahlungsmethoden sind bereits aktiviert.



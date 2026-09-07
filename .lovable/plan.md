# Umzug der Zahlungen auf das Konto „AdTool AI"

## Befund (geprüft)

- Der im Projekt hinterlegte geheime Stripe-Schlüssel gehört zum **alten Konto** „caption-cloud-magic.lovable.app" (`acct_1SH6Va1xgyPAUyx6`). Damit laufen alle Zahlungsvorgänge und der Webhook heute über das alte Konto.
- Der im Frontend hinterlegte öffentliche Schlüssel (`pk_live_51SLqO0…`) gehört dagegen zum **Konto AdTool AI** (`acct_1SLqO0DRu4kfSFxj`). Frontend und Backend zeigen also auf zwei verschiedene Konten — das ist die eigentliche Fehlerquelle.
- Sämtliche fest im Code hinterlegten Produkt- und Preis-IDs (z. B. `price_1TzLNc1xgyPAUyx6…`, `prod_UyE4edZ94ktyOt`) gehören zum alten Konto und existieren im AdTool-AI-Konto nicht.
- Im AdTool-AI-Konto ist bisher nur ein Ereignisziel eingerichtet, und zwar auf `billing-update` — nicht auf `stripe-webhook`. Deshalb erreicht das neue Konto unsere Abo-Verarbeitung gar nicht.
- Laut deiner Prüfung gibt es auf dem alten Konto nur Probeabos und keinen echten Umsatz. Damit ist ein harter Schnitt möglich.

## Vorgehen: harter Schnitt

**1. Katalog im AdTool-AI-Konto neu aufbauen**
Im Zielkonto werden angelegt: das Abo-Produkt „Beta-Basic" mit Preis in EUR und USD, die Credit-Pakete, die Enterprise-Preise sowie die Rabatt-Codes (Gründer-Rabatt und der Launch-Gutschein). Alles wird 1:1 mit den heutigen Beträgen angelegt, damit sich an der Preisliste nichts ändert.

**2. Schlüssel umstellen**
Der geheime Stripe-Schlüssel im Projekt wird auf den Live-Schlüssel des AdTool-AI-Kontos gewechselt (über das sichere Eingabefenster, der Wert läuft nicht über den Chat). Der öffentliche Schlüssel im Frontend passt bereits.

**3. Neue IDs im Code eintragen**
Alle fest hinterlegten Produkt-, Preis- und Gutschein-Kennungen werden auf die neuen Werte aus dem AdTool-AI-Konto umgestellt (Preis-Zuordnung, Credit-Pakete, Enterprise-Preise, Gründer-Gutschein, Gutschein-Einträge in der Datenbank).

**4. Ereignisziel (Webhook) im neuen Konto einrichten**
Im AdTool-AI-Konto wird ein Ziel auf unsere Abo-Verarbeitung gesetzt, mit denselben Ereignissen wie bisher. Das zugehörige Signaturgeheimnis wird als neues Projektgeheimnis gespeichert. Zusätzlich wird der bekannte Signaturfehler sauber mit „ungültige Signatur" (400) statt mit einem Serverfehler (500) beantwortet, damit Stripe solche Fälle nicht endlos wiederholt.

**5. Alte Abos beenden, altes Konto stilllegen**
Die drei Probeabos auf dem alten Konto werden gekündigt und die Testkunden in unserer Datenbank auf „kein aktives Abo" gesetzt, damit niemand versehentlich weiter belastet wird oder ein Abo behält, das es im neuen Konto nicht gibt. Das alte Ereignisziel wird deaktiviert.

**6. Abnahme**
Ein echter Testkauf mit einem Cent-Betrag bzw. der Gutschein-Weg, Prüfung dass Abo, Guthaben und Verlauf korrekt ankommen, danach Rückabwicklung des Testkaufs.

## Was unverändert bleibt

Preise, Guthaben-Pakete, Gründer-Programm (20 % auf Credit-Käufe, 1.000 Plätze), Wallet-Logik, Video- und Lip-Sync-Pipeline.

## Was ich von dir brauche

- Bestätigung, dass das AdTool-AI-Konto live freigeschaltet ist (Identität geprüft, Bankverbindung hinterlegt).
- Den geheimen Live-Schlüssel des AdTool-AI-Kontos, sobald ich das sichere Eingabefenster öffne.

## Technische Details

- Betroffen: `src/config/stripe.ts`, `src/config/pricing.ts`, `src/config/aiVideoCredits.ts`, `supabase/functions/_shared/stripe-config.ts`, `create-checkout`, `create-enterprise-checkout`, `ai-video-purchase-credits`, `check-subscription`, `customer-portal`, `redeem-promo-code`, `stripe-webhook`.
- Neues Geheimnis: `STRIPE_WEBHOOK_SECRET` (Wert des neuen Ereignisziels); `STRIPE_SECRET_KEY` wird ersetzt.
- Datenbank: `promo_codes.stripe_promo_id` auf die neuen Gutschein-IDs aktualisieren; Abo-Status der drei Testkonten zurücksetzen; bestehende `stripe_customer_id`-Werte gehören zum alten Konto und werden geleert, damit beim nächsten Kauf ein Kunde im neuen Konto entsteht.
- `stripe-webhook`: Signaturfehler → HTTP 400 statt 500, Ereignis-Idempotenz über `stripe_webhook_events` beibehalten.

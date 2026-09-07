# Umzug der Zahlungen auf „AdTool AI" — mit Multi-Währung von Anfang an

## Befund (geprüft)

- Der im Projekt hinterlegte geheime Stripe-Schlüssel gehört zum **alten Konto** „caption-cloud-magic.lovable.app" (`acct_1SH6Va1xgyPAUyx6`). Alle Zahlungen und der Webhook laufen heute darüber.
- Der öffentliche Schlüssel im Frontend (`pk_live_51SLqO0…`) gehört zum **Konto AdTool AI** (`acct_1SLqO0DRu4kfSFxj`). Frontend und Backend zeigen also auf zwei verschiedene Konten — das ist die eigentliche Fehlerquelle hinter den Webhook-Fehlern.
- Alle fest im Code stehenden Produkt- und Preis-Kennungen (z. B. `price_1TzLNc1xgyPAUyx6…`, `prod_UyE4edZ94ktyOt`) gehören zum alten Konto und existieren im Zielkonto nicht.
- Im AdTool-AI-Konto gibt es bisher nur ein Ereignisziel auf `billing-update`, nicht auf unsere Abo-Verarbeitung.
- Auf dem alten Konto laufen laut deiner Prüfung nur Probeabos (3 aktive à 9,99 €), kein echter Umsatz. Ein harter Schnitt ist damit möglich.

## Neue Vorgabe: Multi-Währung statt Doppel-Katalog

Statt für jede Währung ein eigenes Produkt/Preis-Paar anzulegen, bekommt jeder Preis **eine Basiswährung EUR plus zusätzliche Währungsvarianten** (USD, GBP) im selben Preis. Für alle übrigen Märkte übernimmt Stripe die lokale Währung automatisch. Vorteile: eine Kennung pro Produkt im Code, keine zweite Migration, wenn eine Währung dazukommt.

- **Basis/Abrechnung: EUR** — das Konto sitzt in Deutschland; Stripe verlangt für die automatische lokale Anzeige eine Auszahlungswährung als Basis.
- **Feste Verkaufspreise: EUR, USD, GBP** — echte psychologische Preise, kein tagesaktueller Wechselkurs.
- **Übrige Märkte:** automatische lokale Währung.

Zu verkaufen gibt es nur noch: **ein Abo (Beta Basic)** und die **AI-Credit-Pakete**.

**Preismatrix — noch offen, wird vor dem Anlegen zur Freigabe vorgelegt.** Es werden keine Beträge festgelegt, bevor du EUR/USD/GBP je Position bestätigt hast. Vorschlag als Diskussionsgrundlage:

| Position | EUR | USD | GBP |
|---|---|---|---|
| Beta Basic (Monat) | 14,95 € | ? | ? |
| Credit-Paket klein | ? | ? | ? |
| Credit-Paket mittel | ? | ? | ? |
| Credit-Paket groß | ? | ? | ? |

## Strikte Trennung: Zahlungswährung ≠ Guthaben

Credits bleiben eine interne Einheit. Ein Kauf desselben Pakets in USD, EUR oder GBP schreibt exakt dieselbe Credit-Menge gut. Das Wallet wird niemals „eine EUR-" oder „eine USD-Wallet". Zu jeder Buchung werden getrennt gespeichert: gezahlter Betrag, gezahlte Währung, gekauftes Paket, gutgeschriebene Credits, Stripe-Zahlungs-Kennung. Die Gutschrift wird ausschließlich über die Paket-Kennung aus dem Kaufvorgang bestimmt, nie über den Betrag oder die Währung.

## Vorgehen

**1. Katalog im AdTool-AI-Konto neu anlegen**
Ein Abo-Produkt und die Credit-Pakete, jeweils mit EUR-Basis und zusätzlichen USD-/GBP-Beträgen im selben Preis. Dazu die Gutscheine (Gründer-Rabatt auf Credit-Käufe, Launch-Gutschein). Rabatte werden als prozentuale Gutscheine angelegt, damit sie in jeder Währung funktionieren.

**2. Lokale Währungen prüfen und aktivieren**
Für die Märkte ohne festen Preis wird die automatische lokale Anzeige im Zielkonto geprüft und, wo sie greift, eingeschaltet.

**3. Schlüssel umstellen**
Der geheime Stripe-Schlüssel wird auf das AdTool-AI-Konto gewechselt (über das sichere Eingabefenster; der Wert läuft nicht über den Chat). Der öffentliche Schlüssel passt bereits.

**4. Code auf eine Kennung pro Produkt umbauen**
Die heutige Zuordnung „Plan × Währung → Preis-Kennung" wird auf „Plan → eine Preis-Kennung" reduziert; die Währung entscheidet der Kaufvorgang. Betroffen sind Abo-Kauf, Enterprise-Kauf, Credit-Kauf, Abo-Prüfung, Kundenportal und Gutschein-Einlösung.

**5. Preisanzeige auf der Website**
Die angezeigte Währung folgt Sprache/Standort: deutsche Ansicht in Euro, englische Ansicht in US-Dollar, britische Besucher in Pfund. Die angezeigte Währung wird in den Kaufvorgang übernommen, damit Anzeige und Kasse identisch sind.

**6. Ereignisziel (Webhook) im neuen Konto**
Neues Ziel auf unsere Abo-Verarbeitung mit denselben Ereignissen, das Signaturgeheimnis wird als Projektgeheimnis hinterlegt. Zusätzlich: ungültige Signaturen werden mit „ungültige Anfrage" statt mit einem Serverfehler beantwortet, damit Stripe nicht endlos wiederholt. Der Verarbeiter speichert Betrag und Währung jeder Zahlung mit.

**7. Altes Konto stilllegen**
Die drei Probeabos kündigen, die betroffenen Konten in unserer Datenbank auf „kein aktives Abo" setzen, altes Ereignisziel deaktivieren.

**8. Abnahme**
Je ein Testkauf in Euro und in US-Dollar (Abo und Credit-Paket), Prüfung: gleiche Credits trotz unterschiedlicher Währung, korrekte Währung in Rechnung, Verlauf und Buchhaltungsfeldern, Gutschein greift in beiden Währungen, Kundenportal zeigt die richtige Währung. Danach Rückabwicklung der Testkäufe.

## Was unverändert bleibt

Guthaben-Logik, Gründer-Programm (20 % auf Credit-Käufe, 1.000 Plätze), Video- und Lip-Sync-Pipeline.

## Was ich von dir brauche

- Bestätigung, dass das AdTool-AI-Konto live freigeschaltet ist (Identität, Bankverbindung).
- Freigabe der Preismatrix EUR/USD/GBP.
- Den geheimen Live-Schlüssel, sobald ich das sichere Eingabefenster öffne.

## Technische Details

- Preise werden mit `currency_options` angelegt (Basis EUR, zusätzlich USD/GBP); Checkout wählt die passende Währung. Manuell gesetzte Währungen haben Vorrang vor Adaptive Pricing.
- Betroffene Dateien: `src/config/stripe.ts`, `src/config/pricing.ts`, `src/config/aiVideoCredits.ts`, `supabase/functions/_shared/stripe-config.ts`, `create-checkout`, `create-enterprise-checkout`, `ai-video-purchase-credits`, `check-subscription`, `customer-portal`, `redeem-promo-code`, `stripe-webhook`.
- `STRIPE_PRICE_MAP` wird von `Record<Plan, Record<Currency, string>>` auf `Record<Plan, string>` reduziert; `currency` bleibt nur noch Anzeige-/Checkout-Parameter.
- Datenbank: Buchungsfelder für `stripe_amount`, `stripe_currency`, `credits_added`, `package_id`, `stripe_payment_id` prüfen und, wo sie fehlen, ergänzen; `promo_codes.stripe_promo_id` auf die neuen Gutschein-IDs setzen; bestehende `stripe_customer_id`-Werte leeren (gehören zum alten Konto); Abo-Status der drei Testkonten zurücksetzen.
- Neues Geheimnis `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` wird ersetzt.
- Nach Freigabe werden die offenen Punkte zusätzlich als Aufgabenliste in `roadmap.md` abgelegt.

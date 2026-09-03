# Marge korrigieren: Zahlungsgebühren in die Preise einrechnen

## Befund

Der Testkauf: 10,00 $ gekauft, **7,69 €** auf dem PayPal-Konto angekommen.

```text
10,00 $  Bruttopreis
/ 1,16   Wechselkurs        ->  8,62 €  Gegenwert
- 0,93 € Gebühren (10,8 %)  ->  7,69 €  netto
```

Der Wechselkurs ist also **nicht** die Ursache — die 0,93 € sind Zahlungsgebühren: Methodengebühr (PayPal über Stripe, prozentual + Fixbetrag), Cross-Border-Aufschlag (Zahler USD, Konto EUR) und der Umrechnungs-Spread. Bei 10 $ schlägt der Fixanteil überproportional durch; bei 50 $ oder 250 $ ist die Quote deutlich besser.

Zweiter Befund aus dem Code: Der Margen-Boden von 1,75x Anbieterkosten wird auf den **Brutto**-Verkaufspreis gerechnet. Netto sind es real eher 1,5x — bei kleinen Käufen noch weniger. Genau das ist die Lücke.

Nicht die Ursache und daher unangetastet: der FX-Faktor 1,15 auf den Modellpreisen. Ein USD-Kunde bekommt zwar 1:1 Guthaben-Einheiten, verbraucht sie aber 15 % schneller — das gleicht den Währungsunterschied bereits sauber aus.

## Was ich ändere

### 1. Netto-Marge statt Brutto-Marge

Eine neue Konstante `PAYMENT_NET_FACTOR` (Startwert 0,90) beschreibt, was nach Zahlungsgebühren tatsächlich ankommt. Der Margen-Boden prüft künftig gegen den **Netto**-Erlös:

```text
alt:  sellEUR            >= 1,75 x Anbieterkosten
neu:  sellEUR x 0,90     >= 1,75 x Anbieterkosten
```

Damit ist die 1,75x-Zusage erstmals echt. Modellpreise, die dadurch unter den Boden fallen, werden auf den Boden angehoben — ich liste dir vor dem Deploy jede betroffene Zeile mit alt/neu auf.

Ausnahme: Die dokumentierte Seedance-2.5-Sonderregel (10 €/30 s) bleibt bestehen und wird als bewusste Unterschreitung weiterhin explizit markiert, nicht stillschweigend hochgezogen.

### 2. Fixkosten-Drag beim kleinsten Paket entschärfen

Das 10er-Paket ist der schlechteste Deal für uns (Fixgebühr + Cross-Border auf kleinem Betrag). Zwei mögliche Wege — meine Empfehlung ist B, weil der Einstiegspreis psychologisch wichtig ist:

- **A:** Starter auf 15 anheben (15 Guthaben-Einheiten).
- **B (empfohlen):** Starter bleibt bei 10, liefert aber 9 statt 10 Einheiten — der Fixkostenanteil ist eingepreist, ohne den Einstiegspreis anzufassen. Die größeren Pakete behalten ihren Bonus (+2 %, +6 %, +15 %) unverändert, damit der Anreiz zum größeren Kauf steigt.

Ich setze B um, sofern du nicht widersprichst.

### 3. Transparenz für dich, nicht für den Kunden

Kein Hinweis auf Gebühren in der Kunden-UI. Stattdessen dokumentiere ich den Netto-Faktor dort, wo die Preise gepflegt werden, damit künftige Preisänderungen nicht wieder gegen den Bruttopreis gerechnet werden.

## Was unberührt bleibt

Wechselkurs 1,15, Creator-Rabatt 25 %, Abo-Preis 14,99, Guthaben-Ledger, Refunds, Promo-Codes, Founders-Logik, Stripe-Zahlungsarten, Video- und Lip-Sync-Pipeline.

## Technische Details

- `supabase/functions/_shared/videoPricingCatalog.ts`: `PAYMENT_NET_FACTOR = 0.90` einführen, Margen-Prüfung auf `sellEUR * PAYMENT_NET_FACTOR` umstellen, betroffene `sellEUR` auf den neuen Boden heben. USD bleibt abgeleitet (`sellEUR * 1.15`).
- Client-Spiegel `src/config/aiVideoModelRegistry.ts` (und `src/lib/cost/fx.ts` als Ort der Konstanten-Spiegelung) synchron ziehen.
- `src/config/aiVideoCredits.ts`: Starter-Paket `totalCredits` 10 -> 9 (Preis unverändert 10 EUR/USD), Stripe-Price-IDs bleiben gleich — es ändert sich nur die gutgeschriebene Menge.
- Serverseitige Gutschrift prüfen: `ai-video-purchase-credits` bzw. `ai-video-verify-purchase` müssen die Einheiten aus derselben Paket-Definition ziehen, nicht aus dem gezahlten Betrag. Falls dort der Stripe-Betrag 1:1 gutgeschrieben wird, wird das auf die Paket-Tabelle umgestellt — sonst zeigt die UI 9 an und das Konto bekommt 10.
- Tests: bestehende Margen- und Parity-Tests laufen gegen den Netto-Boden; ein neuer Test fixiert `sellEUR * 0,90 >= 1,75 x cost` für jeden Katalog-Eintrag außer der dokumentierten Seedance-Ausnahme.
- Deploy nur der Funktionen, die den Katalog oder die Guthaben-Gutschrift berühren.

## Verifikation

- Typecheck, Build, Margen- und Parity-Tests grün.
- Vorher/Nachher-Tabelle aller geänderten Modellpreise (EUR + abgeleitet USD) zur Freigabe.
- Stichprobe: 10er-Kauf zeigt in der UI 9 Einheiten an und schreibt exakt 9 gut; 50/100/250 unverändert inkl. Bonus.

# Kauffunnel A–Z: Was noch fehlt

Der Funnel steht bis zum Klick auf "Kaufen" — Landing (Hero, Proof Moment, Pricing, FAQ), Trial-Vertrag, Onboarding und Aktivierungs-Mails (Tag 0/2/5/9/13) sind live. Was fehlt, ist das Ende der Kette: der Moment nach der Zahlung, der Moment kurz vor Trial-Ende und alles, was passiert, wenn jemand abspringt oder eine Zahlung scheitert.

## Konkret offen

**1. Kein Kauf-Moment nach der Zahlung**
Nach Stripe landet der Kunde auf `/billing?success=true` — einer Verwaltungsseite. Das ist der emotionalste Moment im ganzen Funnel und aktuell komplett ungenutzt.
- Neue Seite `/willkommen`: kurze Bestätigung, was jetzt freigeschaltet ist, ein einziger CTA "Ersten Clip bauen" direkt in den Creator.
- Checkout-Success-URL auf diese Seite umstellen.
- Kauf-Bestätigungsmail (Was du bekommst + direkter Studio-Link), nicht nur die Stripe-Quittung.

**2. Abbruch-Pfad ist tot**
`cancel_url` führt zurück auf `/pricing?canceled=true` ohne jede Reaktion.
- Bei `canceled=true` ein ruhiger Hinweis-Block: häufigster Zweifel beantwortet (Kündigung jederzeit, was im Preis steckt) + Rückkehr-CTA.
- Optional: eine Erinnerungsmail 24 h nach abgebrochenem Checkout.

**3. Trial-Ende ohne Conversion-Strecke**
Es gibt den Trial-Banner, aber keine Kommunikation an den Tagen, an denen entschieden wird.
- Mails an Tag 11 ("noch 3 Tage", mit dem, was der Nutzer bereits gebaut hat) und Tag 14 ("Trial vorbei — hier weitermachen").
- In-App-Zustand nach Trial-Ende: klare Upgrade-Karte statt stiller Sperren.

**4. Zahlungsausfälle (Dunning)**
`stripe-webhook` verarbeitet Zahlungen, aber es gibt keine Reaktion auf `invoice.payment_failed`.
- Mail bei fehlgeschlagener Zahlung mit Link ins Kundenportal, zweite Erinnerung nach 3 Tagen.

**5. Kündigungs-Fluss**
Kündigung läuft heute nur über das Stripe-Portal.
- Vor dem Portal-Redirect ein kurzer Schritt: Grund abfragen (ein Klick) + Gründer-Rabatt-Verlust sichtbar machen.

**6. Trial-Daten-Altlast**
28 von 57 Konten haben kein `trial_ends_at`. Der Trigger greift für neue Konten; die Altbestände sollten einmalig sauber gesetzt oder als "bereits zahlend/abgelaufen" markiert werden, damit Banner und Gates korrekt rechnen.

**7. Messbarkeit**
Ohne Zahlen ist jede weitere Optimierung Raten.
- Funnel-Events: Landing-View → Signup → erster Clip → Checkout gestartet → gekauft, sichtbar im Admin.

## Reihenfolge

Zuerst 1 und 3 (größter Umsatzhebel), dann 2 und 4, danach 5–7.

## Technisch

- Neue Route `/willkommen` + Anpassung `success_url` in `create-checkout`.
- Cancel-State in `Pricing.tsx`.
- Neue Mail-Templates in der bestehenden Aktivierungs-Kadenz-Infrastruktur; Trial-Reminder über den vorhandenen Cron, Dunning über `stripe-webhook`.
- Einmalige Datenkorrektur für `trial_ends_at`.
- Funnel-Events in bestehende Analytics-Tabellen.

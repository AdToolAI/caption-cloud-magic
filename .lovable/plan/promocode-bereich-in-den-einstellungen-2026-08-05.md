# Promocode-Bereich in den Einstellungen

Ja, das ist sinnvoll — aber nur wenn es sauber gebaut ist. Heute gibt es Promocodes nur versteckt über `?coupon=` in der URL und ein Eingabefeld auf der Preisseite. Ein fester Bereich in den Einstellungen macht daraus einen echten, wiederverwendbaren Kanal (Product Hunt, Partner, Support-Fälle).

## Was der Nutzer sieht

Neuer Tab **„Gutschein“** in `/account` (neben Abo):

1. Eingabefeld + „Einlösen“-Knopf, Code wird automatisch großgeschrieben.
2. Sofortige Prüfung mit klarer Rückmeldung: gültig / unbekannt / abgelaufen / bereits ausgeschöpft / bereits eingelöst / du hast schon ein Abo.
3. Bei Erfolg eine Gold-Karte mit dem Vorteil im Klartext, z. B. „3 Monate Abo geschenkt — jetzt aktivieren“ plus Knopf **„Jetzt aktivieren“**, der direkt in den Stripe-Checkout mit angewandtem Rabatt führt.
4. Darunter eine kleine Historie der eingelösten Codes.
5. Hinweistext: Guthaben für Videos, Bilder und Musik ist nicht Teil des Codes — die 10 € Startguthaben bleiben, weitere Credits werden separat gekauft.

## Regeln

- Nur Nutzer **ohne aktives Abo** können einlösen. Bestehende Abonnenten bekommen eine freundliche Meldung mit Verweis auf den Support.
- Ein Code pro Nutzer, ein Nutzer pro Code — serverseitig erzwungen.
- Codes können ablaufen (`valid_until`) und ein Kontingent haben (`max_redemptions`).
- Der Rabatt wird nie im Frontend berechnet, sondern immer von Stripe angewendet.
- **Kein Founders-Status über Gutscheine.** Ein Checkout mit eingelöstem Code beansprucht keinen der 1.000 Gründer-Plätze und erhält keine Gründer-Vorteile (kein 20 %-Credit-Rabatt, keine Gold-UI). Die Plätze bleiben zahlenden Kunden vorbehalten.
- Wer nach der Gratiszeit regulär weiterzahlt, wird dadurch **nicht** nachträglich Gründer — der Platz wird beim ersten Checkout entschieden und bei Gutschein-Checkouts übersprungen.

## Der Launch-Code

`LAUNCHADTOOLAI` — 100 % Rabatt für 3 Monate auf das Beta-Abo (14,99 €), gültig bis 01.09.2026, unbegrenzt einlösbar bis dahin. Wird in Stripe als Coupon + Promotion Code angelegt und in der Datenbank verknüpft. Nach 3 Monaten läuft das Abo regulär weiter (kündbar wie immer). Ohne Gründer-Status.


## Technische Umsetzung

**Datenbank**
- `promo_codes` erweitern: `kind` (`subscription_discount` als Start, offen für spätere Typen), `benefit_label_de/en/es`, `duration_months` wird für die Anzeige genutzt.
- Neue Tabelle `promo_redemptions` (user_id, promo_code_id, status `reserved|applied`, stripe_session_id, timestamps) mit Unique-Index auf (user_id) und (user_id, promo_code_id), RLS: Nutzer liest nur eigene Zeilen, service_role schreibt. GRANTs für `authenticated` (SELECT) und `service_role` (ALL).
- Datensatz für `LAUNCHADTOOLAI` mit der Stripe-Promotion-Code-ID.

**Edge Functions**
- `redeem-promo-code` (neu, JWT-geprüft): validiert Code gegen `promo_codes` (aktiv, nicht abgelaufen, Kontingent frei), prüft per Stripe, dass der Nutzer kein aktives Abo hat, prüft Doppel-Einlösung, legt `promo_redemptions` mit Status `reserved` an und gibt Rabattbeschreibung + Promotion-Code-ID zurück.
- `create-checkout` (bestehend): nimmt zusätzlich eine reservierte Einlösung des Nutzers auf, wandelt sie in `discounts: [{ promotion_code }]` um und schreibt die Redemption-ID in die Session-Metadaten. **Wichtig:** Liegt eine Einlösung vor, wird der `claim_founders_slot`-Aufruf komplett übersprungen und `founders_slot` nicht in die Metadaten geschrieben — Gutschein-Kunden zählen nicht gegen die 1.000 Plätze und bekommen keine Gründer-Vorteile.
- `stripe-webhook` (bestehend): bei `checkout.session.completed` Redemption auf `applied` setzen und `redemptions_count` hochzählen.
- `validate-promo-code` bleibt für die Preisseite bestehen, nutzt aber dieselbe Validierungslogik aus einem neuen `_shared/promo.ts`.

**Frontend**
- `src/components/account/PromoCodeSection.tsx` — Bond-Gold-Karte, Eingabe, Statusanzeige, Historie.
- Neuer Tab in `src/pages/Account.tsx` (Raster von 7 auf 8 Spalten, mobil scrollbar).
- Texte in `src/lib/translations.ts` für DE/EN/ES.
- `PromoCodeInput.tsx` auf denselben Rückgabevertrag angleichen, damit es nur eine Wahrheit gibt.

## Nicht Teil dieses Schritts

Gratis-Credits per Code und Testphasen-Verlängerung sind vorbereitet (`kind`-Feld), werden aber erst gebaut, wenn du sie brauchst.

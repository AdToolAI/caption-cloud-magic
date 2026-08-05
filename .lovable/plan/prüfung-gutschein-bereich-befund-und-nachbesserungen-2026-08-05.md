# Prüfung Gutschein-Bereich — Befund und Nachbesserungen

Die Verdrahtung ist im Kern korrekt: Tab in den Kontoeinstellungen (8-Spalten-Raster, mobil 4), Übersetzungen in DE/EN/ES vorhanden, `redeem-promo-code` prüft JWT, Abo-Status und Doppel-Einlösung, `create-checkout` hängt den reservierten Promotion-Code an und überspringt den Gründer-Slot, `stripe-webhook` setzt die Einlösung auf `applied` und zählt hoch. `LAUNCHADTOOLAI` liegt in Stripe (100 %, 3 Monate, Ablauf 01.09.2026, nur Erstkauf) und in der Datenbank mit passender Promotion-Code-ID.

Drei Dinge sind nicht sauber und sollten vor echtem Traffic behoben werden.

## 1. Alte Codes zeigen auf einen fremden Stripe-Code (kritisch)

In `promo_codes` liegen vier Altbestände — `ADTOOLAI30`, `INFLUENCER30`, `BLACKFRIDAY30`, `RABATT30` — alle mit `stripe_promo_id = promo_1SO0b2DRu4kfSFxjiyyi5Wo1`. Dieser Promotion-Code existiert im aktiven Stripe-Konto nicht (dort gibt es nur `LAUNCHADTOOLAI` und `TRIAL20`).

`RABATT30` ist bis 31.10.2026 gültig und aktiv, wird also von der Prüfung als gültig durchgewinkt. Folge: Der Nutzer löst ein, bekommt eine Erfolgsmeldung, der Checkout scheitert danach an Stripe — und weil pro Nutzer nur eine Einlösung erlaubt ist, ist er anschließend blockiert.

Behebung: die vier Altcodes deaktivieren (`active = false`). `TRIAL20` bleibt unangetastet, ist kein Datenbank-Code.

## 2. Eine reservierte Einlösung kann den Nutzer dauerhaft blockieren

Bricht ein Nutzer den Stripe-Checkout ab, bleibt die Zeile auf `reserved` stehen. Er kann keinen anderen Code mehr einlösen, und jeder spätere Checkout hängt zwingend den Rabatt an.

Behebung:
- In `PromoCodeSection.tsx` einen Knopf „Gutschein entfernen“ für Einlösungen im Status `reserved` (nicht für `applied`).
- Neue Edge Function `release-promo-code` (JWT-geprüft), die ausschließlich die eigene `reserved`-Zeile löscht.
- Texte für DE/EN/ES ergänzen.

## 3. Robustheit der Einlösung

- `redeem-promo-code` gibt keine Rückmeldung, wenn `stripe_promo_id` fehlt oder leer ist — dann als `invalid` behandeln statt reservieren.
- `max_redemptions` wird in `checkPromoRow` geprüft, aber `redemptions_count` wird nur im Webhook hochgezählt; reservierte, noch nicht bezahlte Einlösungen zählen nicht gegen das Kontingent. Bei `LAUNCHADTOOLAI` (unbegrenzt) irrelevant, für spätere limitierte Codes zusätzlich die Anzahl offener Reservierungen mitzählen.

## Technisch

- Migration: `update promo_codes set active = false where code in ('ADTOOLAI30','INFLUENCER30','BLACKFRIDAY30','RABATT30')`.
- Neu: `supabase/functions/release-promo-code/index.ts` (löscht nur `status = 'reserved'` und `user_id = auth.uid()` über Service-Role nach JWT-Prüfung).
- Anpassung: `supabase/functions/redeem-promo-code/index.ts` — Leer-Check auf `stripe_promo_id`, optional Reservierungen ins Kontingent einrechnen.
- Anpassung: `src/components/account/PromoCodeSection.tsx` — Entfernen-Knopf plus Ladezustand.
- Anpassung: `src/lib/translations.ts` — `account.promo.release*` in DE/EN/ES.

Keine Änderung am Gründer-Vertrag: Gutschein-Checkouts beanspruchen weiterhin keinen der 1.000 Plätze.

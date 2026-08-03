# Phase 5: Beweis auf der Startseite + eine funktionierende Testphase

Onboarding (Phase 3) und die eine E-Mail-Strecke (Phase 4) stehen. Der Funnel hat jetzt zwei belegte Lücken: die Startseite nennt keinen Preis, und die Testphase existiert in der Datenbank praktisch nicht.

## Was geprüft wurde

- `src/pages/Index.tsx` rendert Hero, Demos, Arsenal, FAQ — aber **keine** Preis-Sektion. `src/components/landing/PricingSection.tsx` existiert, wird auf der Startseite nirgends eingebunden.
- In `profiles`: 57 Konten, davon **28 ohne `trial_ends_at`**, und **kein einziges** mit `trial_status = 'active'` (30 `converted`, 27 `expired`). Es läuft aktuell also keine echte Testphase — weder für Neuanmeldungen noch für Bestandskonten.

## Was gebaut wird

**1. Preis und Angebot auf die Startseite**
`PricingSection` wird zwischen Arsenal und FAQ eingebunden: ein Plan, 14,99 EUR/Monat, was enthalten ist, Gründer-Rabatt als Hinweis, ein Button — derselbe Einstieg wie überall ("Studio öffnen" → erste Produktion). Kein zweiter konkurrierender CTA.

**2. Beweis statt Behauptung**
Direkt unter dem Hero ein kurzer Vorher/Nachher-Beweis: Briefing-Text links, fertiger Clip rechts, Laufzeit sichtbar. Nutzt den vorhandenen `LiveDemoShowcase`-Aufbau, wird aber auf ein Ergebnis zugespitzt statt mehrerer Beispiele.

**3. Testphase, die wirklich existiert**
- Datenbank-Trigger bei Anmeldung: setzt `trial_ends_at = now() + 14 Tage` und `trial_status = 'active'`, falls beides leer ist.
- Einmaliger Backfill für die 28 Konten ohne `trial_ends_at`.
- Bestehende `converted`-Konten ohne Zahlung werden **nicht** rückwirkend auf `expired` gesetzt — das würde aktive Nutzer aussperren; sie bekommen eine reguläre Testphase ab jetzt.
- Ein Cron-Job setzt abgelaufene Testphasen sauber auf `grace` bzw. `expired`, damit `useTrialStatus` echte Werte liest.

**4. Der Moment am Ende der Testphase**
Im Produkt ein ruhiger Hinweis-Streifen ab Tag 12 ("Deine Testphase endet in X Tagen") mit direktem Weg zur Zahlung, plus eine Bezahlseite, die genau das zeigt, was der Nutzer schon produziert hat. Kein Blockieren vor Ablauf.

## Technische Details

- `src/pages/Index.tsx`: `PricingSection` einbinden, Beweis-Block unter dem Hero platzieren.
- Migration: Trigger auf Profil-Anlage für `trial_ends_at` / `trial_status`, plus einmaliges `UPDATE` für Konten ohne `trial_ends_at`.
- Neue Edge Function bzw. Erweiterung des bestehenden Trial-Crons: Übergang `active → grace → expired` gemäß `GRACE_PERIOD_DAYS` in `src/hooks/useTrialStatus.ts` (aktuell 14 Tage — wird auf denselben Wert wie im UI-Text vereinheitlicht).
- Trial-Banner als eigene Komponente, gespeist aus `useTrialStatus`, eingehängt im App-Layout.
- Checkout nutzt die bestehende Stripe-Verdrahtung (14,99 EUR, `FOUNDERS_VIDEO_20`) — kein neuer Zahlungspfad.

## Nicht Teil dieses Schritts

Sprachvarianten der neuen Startseiten-Blöcke werden in DE/EN/ES mitgeliefert; weitere Landing-Varianten oder A/B-Tests kommen später.

# Phase 5: Der Beweis auf der Startseite — und eine Testphase, die wirklich läuft

Ehrliche Einordnung vorab: Punkt 1 und 3 sind Handwerk, keine Kreativität — sie müssen einfach stimmen, sonst widerspricht sich das Produkt selbst. Der einzige Punkt, an dem sich Apple-Niveau entscheidet, ist der Beweis-Block. Deshalb steht er hier im Zentrum und ist konkreter ausgearbeitet als der Rest.

## Was geprüft wurde

- Der Hero nennt Preis und Testphase bereits korrekt ("Ab 14,99 €/Monat · 14 Tage testen · Kein Auto-Abo"). Danach rendert `src/pages/Index.tsx` Demos, Arsenal, FAQ — aber keine Stelle, die auflöst, was in den 14,99 € enthalten ist. `PricingSection.tsx` existiert, wird nirgends eingebunden.
- Der Trigger `trg_ensure_trial_contract` auf `profiles` existiert und setzt `trial_ends_at` nur, wenn `trial_status IS NULL` ist. Die Spalte `trial_status` hat aber den Vorgabewert `'active'` — die Bedingung greift also nie, und `trial_ends_at` bleibt leer.
- Ergebnis in den Daten: 57 Konten, **28 ohne `trial_ends_at`**, **kein einziges** mit `trial_status = 'active'` (30 `converted`, 27 `expired`). Der Hero verspricht 14 Tage; das Produkt löst sie derzeit für niemanden ein.

## Der kreative Kern: ein Beweis, kein Werbeblock

Statt eines weiteren Demo-Karussells ein einziger Moment direkt unter dem Hero, der die gesamte Behauptung in einem Atemzug belegt:

```text
 [ Dein Briefing ]                 [ Das Ergebnis ]
 "Werbeclip fuer meinen            ┌──────────────────┐
  Kaffee-Shop, 15s,                │                  │
  warm, deutsch"                   │   Clip laeuft    │
                                   │                  │
 -> Skript      0:04               └──────────────────┘
 -> Stimme      0:09                 15s · deutsch · Lip-Sync
 -> Lip-Sync    0:21
 -> Fertig      0:47
```

Links tippt sich das Briefing selbst — dieselben drei Zeilen, die der Nutzer gleich im Studio eingibt. Rechts läuft das Ergebnis. Dazwischen die Zeitleiste der Schritte, die währenddessen abhakt. Kein Ton per Vorgabe, ein Klick schaltet ihn an. Der Block läuft einmal durch, wenn er in den Blick kommt, und friert dann auf dem fertigen Bild ein — kein Dauerloop.

Warum das trägt: es zeigt genau die Arbeit, die der Nutzer sonst selbst hätte, in der Zeit, die sie mit dem Studio kostet. Der Button darunter ist derselbe wie überall, und er startet exakt mit diesem Briefing im Feld.

## Das Handwerk drumherum

**Was 14,99 € enthält**
`PricingSection` zwischen Arsenal und FAQ: ein Plan, was pro Monat drin ist, Gründer-Rabatt als Hinweis, ein Button. Der Preis bleibt im Hero die erste Nennung; hier steht nur die Auflösung, keine zweite, abweichende Zahl.

**Testphase reparieren**
- Trigger-Bedingung korrigieren: `trial_ends_at` wird gesetzt, sobald es leer ist — unabhängig davon, ob `trial_status` schon `'active'` steht.
- Einmaliger Backfill für die 28 Konten ohne `trial_ends_at`.
- Bestehende `converted`-Konten werden **nicht** rückwirkend gesperrt; sie bekommen eine reguläre Testphase ab jetzt.
- Ein Cron führt Konten sauber von `active` über `grace` nach `expired`, damit `useTrialStatus` echte Werte liest.

**Der Moment am Ende der Testphase**
Ab Tag 12 ein ruhiger Streifen im Produkt ("Deine Testphase endet in X Tagen") mit direktem Weg zur Zahlung. Die Bezahlseite zeigt, was der Nutzer in diesen 14 Tagen bereits produziert hat — sein eigenes Ergebnis als Argument, nicht eine Feature-Liste. Vor Ablauf wird nichts blockiert.

## Technische Details

- Neue Komponente `src/components/landing/ProofMoment.tsx`, eingehängt in `Index.tsx` direkt unter `BlackTieHero`; Ablauf über `IntersectionObserver` + Motion, Clip als `muted`/`playsInline`, ein Durchlauf, danach Standbild.
- CTA übergibt das gezeigte Briefing als Parameter an denselben Einstieg wie das Onboarding (`?firstProduction=1`).
- `PricingSection` in `Index.tsx` einbinden.
- Migration: `ensure_trial_contract` neu fassen (Bedingung auf `trial_ends_at IS NULL`), plus einmaliges `UPDATE` für Konten ohne Enddatum.
- Trial-Cron: Übergang `active → grace → expired` gemäß `GRACE_PERIOD_DAYS` in `src/hooks/useTrialStatus.ts` (dort aktuell 14 Tage — wird mit dem UI-Text vereinheitlicht).
- Trial-Streifen als eigene Komponente aus `useTrialStatus`, im App-Layout.
- Checkout nutzt die bestehende Stripe-Verdrahtung (14,99 EUR, `FOUNDERS_VIDEO_20`).
- Alle neuen Texte in DE/EN/ES.

## Nicht Teil dieses Schritts

Weitere Landing-Varianten und A/B-Tests. Erst wenn der Beweis-Block steht, lohnt es sich, ihn gegen etwas zu testen.

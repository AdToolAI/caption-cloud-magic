# Kein Startguthaben mehr — alle Guthaben auf 0

Ziel: Neue Nutzer bekommen kein 10-€/$-Startguthaben mehr, und alle bestehenden Konten haben ab sofort 0 Guthaben.

## 1. Bestehende Guthaben auf 0

- Guthaben aller Konten (ausnahmslos, inkl. zahlender Nutzer und eigener Konten) wird auf 0 gesetzt.
- Kauf- und Verbrauchshistorie bleibt unverändert erhalten; es wird pro Konto eine nachvollziehbare Korrekturbuchung protokolliert.
- Hinweis: Auch gekauftes Guthaben verfällt damit. Das kann Rückerstattungsansprüche auslösen — auf deinen ausdrücklichen Wunsch wird es trotzdem so ausgeführt.

## 2. Kein Startguthaben für neue Nutzer

- Die Gutschrift beim ersten Login/E-Mail-Bestätigung wird abgeschaltet: die Bonus-Funktion schreibt nichts mehr gut und meldet „deaktiviert“.
- Der Aufruf aus der E-Mail-Bestätigung entfällt.

## 3. Bonus-Anzeigen komplett ausblenden

- Willkommens-Popup wird nicht mehr angezeigt.
- Das Banner „Du hast Startguthaben — perfekt für dein erstes Video“ entfällt.
- Texte zu Startguthaben/Bonus in Onboarding und Guthaben-Anzeigen werden entfernt bzw. neutral formuliert, in Deutsch, Englisch und Spanisch gleichermaßen.

## Technisch

- Daten: `UPDATE public.ai_video_wallets SET balance_euros = 0` für alle Zeilen, plus je Zeile ein `ai_video_transactions`-Eintrag (`type: 'adjustment'`, Betrag = negativer Vorbestand, deterministischer Key `balance_reset_2026_09_12`, idempotent). `total_purchased_euros` / `total_spent_euros` bleiben unangetastet.
- `supabase/functions/grant-welcome-bonus/index.ts`: Feature-Schalter `WELCOME_BONUS_ENABLED = false`; gibt `{ granted: false, reason: "disabled" }` zurück, ohne Wallet oder Profil zu ändern. Funktion bleibt bestehen (Aufrufer brechen nicht), wird neu deployt.
- `supabase/functions/verify-email/index.ts`: Aufruf von `grant-welcome-bonus` entfernen.
- Frontend: `useWelcomeBonus` liefert konstant `shouldShow: false` (keine Netzwerkaufrufe mehr); `WelcomeBonusModal` wird nicht mehr gemountet; `FirstVideoGuide` entfernt/nicht mehr gerendert; Bonus-Texte in Onboarding/Translations bereinigen (EN/DE/ES).
- Unberührt: Preise, Abrechnungs- und Abzugslogik, Rückerstattungen, Stripe-Pakete, Founder-Rabatt, Routing, Historie, Lip-Sync.

## Prüfung

- Nach der Umstellung: Guthaben-Anzeige zeigt überall 0; ein neu registriertes Testkonto erhält kein Guthaben und sieht kein Bonus-Popup; Typecheck und Build laufen durch.

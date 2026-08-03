# Onboarding & Kauffunnel — Bestandsaufnahme und Bereinigung

## Was ich geprüft habe

Signup-Route, Onboarding-Oberflächen, E-Mail-Jobs (Cron), Trial-Lifecycle, Stripe-Checkout und die Profildaten der 57 bestehenden Accounts.

## Ist-Zustand (verifiziert)

**Funnel heute:**

```text
Landing (/) → Auth (Signup) → /auth/check-email → verify-email
   → Welcome-Bonus (10 EUR Guthaben) → /home
   → NicheTutorialModal (3 Schritte, Modal auf Home)
   → parallel existiert /onboarding (6 Schritte inkl. Plan-Auswahl)
   → Nutzung im Trial → Stripe-Checkout Beta-Basic 14,99 EUR/Monat
   → Founders: 20 % Rabatt auf Credit-Käufe (Coupon FOUNDERS_VIDEO_20)
```

**Was sauber läuft**
- Signup → Verifizierung → Welcome-Bonus greift; 55 von 57 Accounts sind verifiziert.
- Stripe: genau ein Abo-Preis (14,99 EUR), Checkout im `subscription`-Mode, Founders-Coupon nur auf Credit-Käufe — konsistent zur Beta-Strategie.
- Marketing-Mails haben eine globale 3-Tage-Frequenzsperre plus Kill-Switch; Auth-/Trial-kritische Mails umgehen sie korrekt.
- Cron aktiv: Drip stündlich, Activation täglich 10:00, Trial-Check täglich 09:00. Winback ist bewusst deaktiviert.

**Konkrete Probleme**

1. **Zwei konkurrierende Onboardings.** `/onboarding` (6 Schritte, inkl. Plan-Auswahl) und `NicheTutorialModal` auf `/home` (3 Schritte) schreiben beide in `onboarding_profiles`. Dazu kommen `OnboardingStepper`, `WelcomeModal`/`useOnboarding` (localStorage) und die `GettingStartedChecklist`. Ergebnis: unklar, was der Neukunde tatsächlich sieht.
2. **Onboarding-Abschluss wird faktisch nie gesetzt:** nur 1 von 57 Profilen hat `onboarding_completed = true`.
3. **Trial ohne Enddatum:** 29 von 57 Profilen haben `trial_ends_at = NULL`, `trial_status` steht per Default auf `active`. Für diese Nutzer feuert weder eine Trial-Warnung noch der Pause-Mechanismus — sie bleiben unbegrenzt „im Trial“ und werden nie zur Zahlung geführt. Das ist das größte Loch im Kauffunnel.
4. **Zwei überlappende Lifecycle-Serien:** `process-drip-emails` (24 h / 72 h / 7 d ab `created_at`) und `process-activation-emails` (day_0/1/3/7 ab `email_verified_at`) adressieren dieselben Nutzer im selben Zeitfenster. Die 3-Tage-Sperre verhindert Spam nur teilweise und macht zusätzlich unvorhersehbar, welche Mail gewinnt.
5. **Kein expliziter Conversion-Moment.** Es gibt keinen definierten Punkt, an dem der Trial-Nutzer die Kaufentscheidung vorgelegt bekommt (außer Upgrade-Modals bei Limits).

## Vorgeschlagene Umsetzung

**A. Ein Onboarding, eine Wahrheit**
- `/onboarding` wird der einzige Pfad; direkt nach Verifizierung wird dorthin geleitet statt nach `/home`.
- `NicheTutorialModal` auf Home entfällt (Datei bleibt, wird nicht mehr gemountet).
- Abschluss setzt zuverlässig `profiles.onboarding_completed = true` plus `onboarding_profiles`-Zeile; `GettingStartedChecklist` bleibt als Post-Onboarding-Begleiter.
- Bestandsnutzer mit vorhandener `onboarding_profiles`-Zeile werden per Migration auf `onboarding_completed = true` gesetzt.

**B. Trial-Vertrag hart machen**
- `trial_ends_at` wird bei Account-Anlage verbindlich gesetzt (Trigger auf Profilanlage, Länge als Konstante — Vorschlag 7 Tage).
- Backfill für die 29 Accounts ohne Enddatum.
- `check-trial-status` bleibt unverändert, greift dann aber für alle.

**C. E-Mail-Funnel entwirren**
- Eine Serie für Neukunden: `process-activation-emails` (Anker `email_verified_at`) bleibt.
- `process-drip-emails` wird als Neukunden-Serie stillgelegt (Cron deaktiviert), Templates bleiben erhalten.
- Trial-Serie bleibt separat und bypass-berechtigt: Tag −3, letzter Tag, Grace, Pause.

**D. Kaufmoment definieren**
- Am Ende des Onboardings und beim Trial-Warn-Zeitpunkt wird derselbe Checkout-Einstieg gezeigt (Beta-Basic 14,99 EUR, Founders-Hinweis), statt nur reaktiv bei Limits.

## Technische Details

- Migration: Backfill `trial_ends_at`/`onboarding_completed`, Trigger für neue Profile.
- `src/App.tsx` / `src/pages/Home.tsx`: Mount des Tutorial-Modals entfernen, Post-Verify-Redirect auf `/onboarding`.
- `src/pages/Onboarding.tsx`: Abschluss-Schritt schreibt beide Flags atomar und führt zum Checkout-CTA.
- Cron: `process-drip-emails-hourly` deaktivieren (kein Funktionslöschen).
- Lip-Sync-Pipeline wird nicht berührt (Feature Freeze v400 bleibt gültig).

## Offene Entscheidung

Trial-Länge (Vorschlag 7 Tage) und ob nicht verifizierte Accounts nach X Tagen automatisch verfallen.

# Funnel-Strategie „Ein Creator. Ein ganzes Studio."

Die Positionierung ist kein Caption-Generator, sondern ein komplettes Studio für Solo-Creator. Der Funnel muss dieselbe Geschichte erzählen: nicht „Tool ausprobieren", sondern „Studio beziehen und die erste Produktion abliefern".

## Leitidee

```text
Landing: "Ein Creator. Ein ganzes Studio."
   ↓
Signup = Studio-Einzug (nicht "Account anlegen")
   ↓
Studio-Setup (60-90 Sek.): Nische, Format, Marke → Cast & World Startsetup
   ↓
FIRST PRODUCTION: eine fertige Szene / ein fertiger Clip im Trial
   ↓  (der "Aha"-Moment ist ein fertiges Video, nicht ein Feature-Klick)
Studio-Abo Beta-Basic 14,99 EUR — "dein Studio bleibt offen"
   ↓
Founders-Slot: 20 % auf jeden Credit-Kauf, 24 Monate
```

Die eine Aktivierungs-Metrik des Funnels: **Time to First Finished Clip**. Alles im Funnel (Onboarding-Schritte, E-Mails, Upgrade-Momente) wird darauf ausgerichtet und alles, was davon ablenkt, fliegt raus.

## Was heute nicht dazu passt (verifiziert)

1. **Zwei konkurrierende Onboardings**: `/onboarding` (6 Schritte, inkl. Plan-Auswahl) und das `NicheTutorialModal` auf `/home` (3 Schritte) schreiben beide in `onboarding_profiles`. Dazu `OnboardingStepper`, `WelcomeModal` (localStorage) und die Getting-Started-Checkliste.
2. **Onboarding gilt faktisch nie als abgeschlossen**: 1 von 57 Profilen hat `onboarding_completed = true`.
3. **Trial ohne Ende**: 29 von 57 Profilen haben `trial_ends_at = NULL` bei `trial_status = 'active'`. Für diese Nutzer feuert weder Trial-Warnung noch Pause — es gibt keinen Kaufmoment.
4. **Zwei überlappende Neukunden-Serien**: `process-drip-emails` (24 h/72 h/7 d ab Registrierung) und `process-activation-emails` (Tag 0/1/3/7 ab Verifizierung) sprechen dieselben Leute an; die 3-Tage-Sperre entscheidet zufällig, welche gewinnt.
5. **Sprache des Funnels** ist Tool-Sprache („Post erstellen", „Limit erreicht"), nicht Studio-Sprache.

## Neuer Funnel

**1. Studio-Einzug statt Onboarding-Formular**
- `/onboarding` wird der einzige Pfad, direkt nach der Verifizierung; das Tutorial-Modal auf Home wird nicht mehr gemountet.
- Reduziert auf drei Fragen, die die erste Produktion füttern: Was machst du (Nische), welches Format, welche Marke/Look. Plan-Auswahl fliegt aus dem Onboarding raus — im Trial wird nicht verkauft, sondern produziert.
- Der Abschluss legt ein Startsetup in Cast & World an (Charakter + Location aus den Antworten) und schreibt `onboarding_completed` zuverlässig.

**2. First Production als Endpunkt des Onboardings**
- Letzter Schritt führt nicht ins leere Dashboard, sondern direkt in eine vorbereitete Produktion (Autopilot-Brief aus den Onboarding-Antworten), die der Nutzer nur noch starten muss.
- Dashboard-Zustand danach: „Deine erste Produktion" statt generischer Checkliste.

**3. Trial mit klarem Vertrag**
- `trial_ends_at` wird verbindlich bei Accountanlage gesetzt (Vorschlag: 7 Tage), Backfill für die 29 offenen Accounts.
- Trial-Kommunikation in Studio-Sprache: Tag −3 „dein Studio schließt in 3 Tagen", letzter Tag, Grace, Pause.

**4. E-Mail-Funnel: eine Serie, ein Ziel**
- `process-activation-emails` bleibt die einzige Neukunden-Serie, Anker `email_verified_at`, Inhalt auf First Production ausgerichtet:
  - Tag 0: „Dein Studio ist offen" + direkter Link in die vorbereitete Produktion
  - Tag 1: nur wenn noch kein Clip existiert — ein Beispiel-Brief aus der eigenen Nische
  - Tag 3: Cast & World — „gib deinem Studio ein Gesicht"
  - Tag 7: „Dein Studio bleibt offen" → Abo + Founders-Slot
- `process-drip-emails` wird als Neukunden-Serie stillgelegt (Cron aus, Funktion und Templates bleiben).
- Verzweigung nach Verhalten: Wer schon einen fertigen Clip hat, bekommt die Conversion-Strecke; wer nicht, bekommt die Produktions-Strecke.

**5. Ein Kaufmoment, konsistent formuliert**
- Derselbe Checkout-Einstieg an drei Stellen: nach dem ersten fertigen Clip, in der Trial-Warnung und in der Tag-7-Mail. Immer Beta-Basic 14,99 EUR plus Founders-Hinweis (20 % auf Credit-Käufe, 24 Monate, verfällt bei Kündigung).
- Upgrade-Modals bei Limits behalten dieselbe Sprache statt eigener Varianten.

**6. Wording-Durchgang**
- Onboarding, Aktivierungs-Mails, Trial-Banner, Upgrade-Dialoge und leere Zustände auf die Studio-Sprache umstellen (Studio, Produktion, Cast, Set) — konsistent zu Landing und SEO-Claim, in DE, EN und ES.

## Technische Details

- Migration: Backfill `trial_ends_at`/`onboarding_completed`, Trigger für neue Profile.
- `src/pages/Home.tsx`: `NicheTutorialModal` nicht mehr mounten; Post-Verify-Redirect auf `/onboarding`.
- `src/pages/Onboarding.tsx`: auf drei Schritte kürzen, Plan-Schritt entfernen, Abschluss legt Startsetup an und leitet in die erste Produktion.
- `supabase/functions/process-activation-emails`: Stufen-Inhalte und Verhaltens-Verzweigung; Cron `process-drip-emails-hourly` deaktivieren.
- Übersetzungen in `src/lib/translations.ts` für die betroffenen Funnel-Strings (DE/EN/ES).
- Lip-Sync-Pipeline wird nicht angefasst (Feature Freeze v400 bleibt).

## Offene Entscheidungen

- Trial-Länge: 7 Tage (Vorschlag) oder 14?
- Soll die erste Produktion im Trial kostenfrei sein (aus dem 10-EUR-Willkommensguthaben) oder ein eigenes, nicht auszahlbares „First Production"-Kontingent bekommen?

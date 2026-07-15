## Launch-Readiness Status (26.07.2026)

**Grün — kein Blocker mehr offen:**
- Founders-Priority-Warteschlange, Slot-Guard (429 + Auto-Retry), Admin-Load-Widget, `SystemLoadPill` & `FounderPriorityChip` in Motion Studio + AI Video Studio.
- Unified Pricing (14,99 € Beta), Stripe-Wiring, Founders-Rabatt + Status-Forfeit.
- Email-Pipeline (3-Tage-Cap, Suppression, Unsubscribe).
- Voice Studio, Music Studio (Replicate-Konsolidierung, Language-Lock), Cast & World IDs.
- Kling Omni DE-Silent-Lock, No-Text-Guard, Ensemble/Dedup, Content-Filter-Refunds.
- CORS Preflights, Realtime-Fallback, Header-Dropdown-Stabilität.
- Logo/Favicon final, Landing (AI Arsenal), FoundersBenefitsDialog, Legal Anchors.

**Empfohlen (nicht launch-blockierend, aber "nice-to-close" vor dem 26.07.):**
1. **Onboarding via Companion** (dein Vorschlag — Details unten).
2. **Smoke-Test-Sweep** über alle Studios (Preflight-Skript automatisiert 15 Basisflows).
3. **Status-Page-Öffentlich** (existiert intern, aber `/status` sollte öffentlich sein).
4. **Rate-Limit-Toasts** einheitlich (429/402 aus AI-Gateway – teilweise noch generisch).

Der Rest ist post-launch iterierbar. **Launch-ready: JA.**

---

## AI-Companion Onboarding — „Concierge Mode"

Ziel: Der bestehende `AICompanionWidget` (unten rechts) wird vom Support-Bot zum **adaptiven Onboarding-Concierge**, der Nutzer intelligent durch die Plattform führt — mit einstellbarem Tempo, spielerisch aber professionell.

### 1. Adaptive Persona & Tempo

Neue Companion-Setting-Kategorie **„Lernstil"** (in `CompanionSettings.tsx`):

| Modus | Popup-Frequenz | Tonalität | Zielgruppe |
|---|---|---|---|
| **Espresso** | max. 1 Tipp pro Session, nur bei echtem Bedarf | knapp, direkt | Power-User |
| **Balanced** *(default)* | ~1 Tipp pro Milestone | freundlich, kurz | Standard |
| **Guided Tour** | Schritt-für-Schritt, jede Feature-Fläche | verbindlich, warm | Einsteiger |
| **Playful** | wie Balanced + subtile Micro-Achievements | leicht verspielt, Emoji-sparsam | jüngere Kreative |

Persistiert in `companion_user_preferences.learning_pace` + `tone_profile`. Umschaltbar jederzeit im Widget-Header.

### 2. Intelligentes Popup-Switching

Neuer Hook `useCompanionCoach()` mit **Event-Trigger-Engine**:
- **Route-Trigger**: erster Besuch von `/motion-studio`, `/ai-video-toolkit`, `/composer`, `/picture-studio`, `/audio-studio`, `/cast-world` etc.
- **Intent-Trigger**: leerer Cast-Pool + Klick auf „Generieren", 3× Fehler in Folge, Wallet < 2 €, ungenutztes Feature nach 5 Sessions.
- **Milestone-Trigger**: erstes Video erfolgreich → „Nächster Schritt: Music Studio?", erste 3 Projekte → Composer-Empfehlung.
- **Anti-Nag-Guard**: pro Trigger max. 1×; nach Dismiss 7 Tage Cooldown; hartes Cap = 3 Popups pro Tag (Espresso: 1).

Alle Trigger in `companion_triggers` (neue Tabelle) mit `user_id, trigger_key, shown_at, dismissed, converted`.

### 3. Onboarding-Flow ersetzt statischen `Onboarding.tsx`

Statt starrem Stepper öffnet sich der Companion nach Signup mit einem **Concierge-Dialog**:
1. **Persönlichkeit-Setup** (3 Fragen, ~20 s): Was willst du erstellen? · Wie erfahren bist du? · Wie viel Handhaltung willst du?
2. **Live-Rundgang**: Companion navigiert automatisch (optional) — hebt UI-Elemente mit `TutorialOverlay.tsx` (existiert bereits) hervor, kommentiert jeden Studio-Bereich in 1-2 Sätzen.
3. **First-Win-Path**: führt zu einem passenden Quick-Template (Cast auswählen → Prompt → Generate) innerhalb <3 Min.
4. Existierende `/onboarding` bleibt als Fallback erreichbar.

### 4. Kontext-Awareness

Companion liest bei jedem Popup:
- Aktuelle Route + sichtbare UI (via kleinem `PageContext`-Provider).
- Founder-Status → priorisiert Founder-Perks-Hinweise.
- Wallet-Balance, letzte 5 Renders, offene Bug-Reports.
- Sprache (DE/EN/ES) — Prompts an Gateway bleiben Englisch, User-Text lokalisiert.

Ergebnis: „Ich sehe du bist im Motion Studio mit 3 Charakteren — willst du direkt in den Composer wechseln oder erst Voice zuweisen?" statt generischer Tipps.

### 5. Spielerische Elemente (dosiert)

- **Milestone-Badges** (dezent, gold-on-black): „Erste Szene", „Cast Master (5 Chars)", „Voice Pioneer" — nur in Companion-Popup, nicht in Header/Nav (keine Gamification-Overkill).
- **Progress-Ring** im Widget-Icon zeigt Onboarding-Fortschritt (5 Meilensteine → 100 %).
- Keine Streaks/Punkte/Leaderboards. Kein Confetti-Spam. Micro-Copy mit einem einzigen Emoji max.

### 6. Technische Bausteine

**Neu:**
- `src/hooks/useCompanionCoach.ts` — Trigger-Engine + Cooldown-Logik.
- `src/lib/companion/triggerRegistry.ts` — deklarative Trigger-Definitionen (Route, Intent, Milestone).
- `src/lib/companion/personaProfiles.ts` — 4 Lernstil-Presets (System-Prompt + Frequenz).
- `src/components/ai-companion/ConciergeOnboarding.tsx` — 3-Fragen-Setup.
- `src/components/ai-companion/MilestoneBadge.tsx` — dezente Badge-UI.
- `PageContext`-Provider (leichtgewichtig) für Route/Feature-Kontext.
- Edge Function `companion-coach` — nutzt bestehenden Lovable-AI-Gateway (`openai/gpt-5.5`), erhält System-Prompt aus Persona + Kontext-Snapshot, streamt Antworten.
- Migration: `companion_triggers` Tabelle (user_id, trigger_key UNIQUE, shown_at, dismissed_at, converted_at) + `companion_user_preferences` um `learning_pace`, `tone_profile`, `onboarding_completed_at` erweitern. RLS + GRANTs wie Standard.

**Erweitert:**
- `AICompanionWidget.tsx` — Persona-Umschalter im Header, Progress-Ring, Concierge-Modus-Slot.
- `CompanionSettings.tsx` — Lernstil-Auswahl + „Popups pausieren für 24 h".
- `TutorialOverlay.tsx` — von Companion aus triggerbar (Element-Highlight per selector).
- `App.tsx` — nach Login: wenn `onboarding_completed_at` null → Concierge auto-öffnen (statt `/onboarding`-Redirect).

### 7. Was NICHT gebaut wird (bewusste Constraints)

- Kein Voice-Onboarding (Voice-Input existiert schon, bleibt optional).
- Keine externen Analytics — Trigger-Metriken landen in `companion_triggers` + bestehendem `user_behavior_events`.
- Kein Auto-Nav ohne Nutzer-OK (immer „Zeig mir das" Button, nie Zwang).

---

## Vorschlag zur Reihenfolge

1. **Concierge-Onboarding + Lernstile + Trigger-Engine** (Kern, ~1 Umsetzungsrunde).
2. **Milestone-Badges + Progress-Ring** (Polish).
3. **Smoke-Test-Sweep + öffentliche Status-Page** (Launch-Härtung).
4. **Rate-Limit-Toast-Vereinheitlichung** (Feinschliff).

Sag Bescheid ob wir mit (1) starten oder ob du an einzelnen Punkten oben (Personas, Trigger-Set, Gamification-Grad) nachjustieren willst.

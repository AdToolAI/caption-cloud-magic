# Session H — Goal-Briefing, Budget-Modi & Wochen-Review

Verwandelt den Autopiloten von "Setup einmal & läuft" zu einem **wöchentlichen Briefing-Zyklus** mit klarer Zielsetzung, Budget-bewusster Content-Mix-Entscheidung und automatischen Sicherheits-Pausen.

## 1. Goal-Briefing (Pflicht vor Aktivierung)

Erweiterung des Brief-Wizards um eine neue Pflicht-Stufe **"Channel-Ziel"**:

- **Channel-Goal** (Pflichtauswahl, 1 von 5):
  - `awareness` — Reichweite & neue Follower
  - `engagement` — Community-Interaktion (Likes, Kommentare, Saves)
  - `traffic` — Klicks auf Website/Link in Bio
  - `leads` — E-Mail-Signups, DMs, Anfragen
  - `sales` — Direkter Produktverkauf
- **Content-Mix-Slider** (3 Werte, Summe = 100 %):
  - KI-Video (teuer)
  - KI-Bilder + Stock-Video-Reels (mittel)
  - Reine Bild-Posts / Karussells (günstig)
- **Wochen-Budget in EUR** (10 € / 25 € / 50 € / 100 € / Custom) — wird intern zu Credits umgerechnet (1 € ≈ 100 Credits, basierend auf bestehender Pricing-Logik).
- **Zielgruppe & USP** (2 Freitextfelder, je max. 280 Zeichen).

→ Diese Felder werden in `autopilot-plan-week` direkt in den Gemini-Strategist-Prompt injiziert, damit die KI zwischen "10-€-Woche = nur Bilder + Stock" und "100-€-Woche = 5 KI-Videos" sauber unterscheidet.

## 2. Budget-Mode-Engine

`autopilot-plan-week` bekommt eine **Cost-Aware-Allocation**:

```text
verfügbare_credits / 7 Tage
  ↓
für jeden geplanten Slot:
  format = Mix-Slider × Channel-Goal × verbleibendes_Budget
  Wenn KI-Video < verbleibendes_Budget → erlaubt
  Sonst → fallback Stock-Video oder Bild-Post
```

Niedrig-Budget-Wochen erzeugen automatisch keine `ai-video`-Slots mehr — Slots werden als `stock-reel` oder `static-image` markiert. Bestehende `autopilot-generate-slot`-Branching wird erweitert.

## 3. Samstag-Wochen-Review

Neue Edge Function `autopilot-weekly-review` (Cron: **Samstag 10:00 UTC**):

- Aggregiert Daten der vergangenen 7 Tage:
  - Posts erstellt / publiziert / abgelehnt
  - Plattform-Verteilung
  - Gesamt-Engagement (aus `post_metrics`)
  - Top- & Flop-Pillar (aus Session-F-Insights)
  - Verbrauchte vs. budgetierte Credits
- Generiert **AI-Strategie-Vorschlag für die kommende Woche** (Gemini 2.5 Flash) inkl. neuem Budget-Vorschlag.
- Speichert Ergebnis in neuer Tabelle `autopilot_weekly_reviews`.
- Setzt `briefing_required_until = Sonntag 18:00 UTC` auf den Brief.
- Sendet Notification `autopilot_weekly_review_ready` (in-app + optional E-Mail-Digest via bestehende `autopilot-daily-digest`-Infra).

## 4. Wochen-Review-UI (neuer Tab "Wochen-Review")

Im `/autopilot` Cockpit:

- Bento-Cards: Posts/Engagement/Budget-Verbrauch/Top-Pillar
- KI-Strategie-Vorschlag-Karte mit **"Bestätigen"** (= aktuelles Briefing übernehmen) oder **"Anpassen"** (= Brief-Wizard öffnen)
- Visueller Countdown bis Sonntag 18:00 UTC mit Warn-Banner

## 5. Auto-Pause-Mechaniken

Neue Cron-Function `autopilot-safety-check` (stündlich):

- **Briefing-Pause:** Wenn `briefing_required_until` < `now()` und kein neues Briefing bestätigt → setze `paused_until = now() + 30 Tage` + Notification `autopilot_paused_briefing_missing`.
- **Credit-Pause:** Vor jedem Slot-Generate prüft `autopilot-generate-slot` bereits den Credit-Stand — neu: wenn `user_credits < min_required (50)` → setze `paused_until = now() + 7 Tage` + Notification `autopilot_paused_low_credits` mit CTA "Credits aufladen".
- Beide Pausen werden im Sticky-Control-Bar prominent als roter Banner mit Fix-Button angezeigt.

## 6. Schema-Änderungen

```text
autopilot_briefs:
  + channel_goal              text       not null default 'engagement'
  + content_mix               jsonb      not null default '{"ai_video":33,"stock_reel":33,"static":34}'
  + weekly_budget_eur         integer    not null default 25
  + target_audience           text
  + usp                       text
  + briefing_required_until   timestamptz
  + last_review_completed_at  timestamptz

autopilot_weekly_reviews (neu):
  id, brief_id, user_id, period_start, period_end,
  posts_published int, total_engagement int,
  credits_spent int, credits_budgeted int,
  top_pillar text, weakest_pillar text,
  ai_recommendation jsonb,    -- {strategy_text, suggested_budget_eur, suggested_mix}
  user_decision text,         -- 'pending' | 'accepted' | 'modified'
  created_at, decided_at
```

Notification-Constraint erweitern: `autopilot_weekly_review_ready`, `autopilot_paused_briefing_missing`, `autopilot_paused_low_credits`.

## 7. Files

**Neu:**
- `supabase/functions/autopilot-weekly-review/index.ts`
- `supabase/functions/autopilot-safety-check/index.ts`
- `src/components/autopilot/AutopilotWeeklyReviewPanel.tsx`
- `src/components/autopilot/AutopilotGoalBriefingStep.tsx` (Pflicht-Step im Wizard)
- 1 Migration (Schema + Cron-Schedules)

**Geändert:**
- `src/components/autopilot/AutopilotBriefWizard.tsx` — neuer Step 1 "Channel-Ziel & Budget"
- `src/components/autopilot/AutopilotStrategyEditor.tsx` — Goal/Mix/Budget editierbar
- `src/pages/Autopilot.tsx` — neuer Tab "Wochen-Review" + Briefing-Countdown-Banner
- `src/hooks/useAutopilot.ts` — neue Hooks (`useWeeklyReview`, `useAcceptReview`)
- `supabase/functions/autopilot-plan-week/index.ts` — Goal + Mix + Budget-Modi in Prompt
- `supabase/functions/autopilot-generate-slot/index.ts` — Cost-Aware-Branching
- `src/integrations/supabase/types.ts` — auto-regen

## 8. Cron-Schedules

```text
autopilot-weekly-review     SAT 10:00 UTC  (Wochen-Review erstellen)
autopilot-safety-check      hourly          (Briefing-Deadline + Low-Credits)
```

**Bereit zur Umsetzung?**

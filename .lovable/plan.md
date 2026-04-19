

## Plan: B3 Streak-Mechanik (Activation & Retention)

Letzter Activation-Baustein. Belohnt tägliche Aktivität mit visuellem Streak-Counter, Milestones und sanften Erinnerungen — schließt das Activation-Triple (Email-Drip + Push + Streak) ab.

## Konzept

Ein User hat eine "Active Streak", wenn er an aufeinanderfolgenden Tagen mind. **eine produktive Aktion** ausführt:
- Video erstellt (jedes Studio)
- Post geplant (calendar_event)
- Caption generiert
- Social-Account verknüpft
- Brand-Kit-Update

Streak bricht, wenn ein Kalendertag (in User-Timezone, Fallback UTC) ohne Aktivität vergeht. **Grace Period:** 1 "Freeze-Token" pro Woche schützt vor versehentlichem Bruch.

## 1. DB-Migration

**Tabelle `user_streaks`** (1 Zeile pro User)
- `user_id` (PK, FK → auth.users)
- `current_streak` INT DEFAULT 0
- `longest_streak` INT DEFAULT 0
- `last_activity_date` DATE
- `freeze_tokens` INT DEFAULT 1 (max 2)
- `freeze_used_at` DATE (für Wochen-Reset-Logik)
- `total_active_days` INT DEFAULT 0
- `updated_at` TIMESTAMPTZ

**Tabelle `streak_milestones`** (Achievements-Log)
- `id`, `user_id`, `milestone_days` (3/7/14/30/60/100), `reached_at`
- Unique-Index `(user_id, milestone_days)` → kein Doppel-Trigger

**RLS:** User darf nur eigene Daten lesen; Updates nur via SECURITY DEFINER-Funktion.

**DB-Funktion `record_streak_activity(p_user_id uuid)`**
- Liest `user_streaks` für User (oder erstellt Row)
- Wenn `last_activity_date = today` → no-op (idempotent)
- Wenn `last_activity_date = yesterday` → `current_streak +1`
- Wenn Lücke = 1 Tag UND `freeze_tokens > 0` UND nicht in dieser Woche genutzt → Freeze konsumieren, Streak hält
- Sonst → Streak resetten auf 1
- Aktualisiert `longest_streak`, `total_active_days`
- Prüft Milestone-Schwellen (3/7/14/30/60/100) → Insert in `streak_milestones`

## 2. Trigger-Punkte (Frontend)

Hook `useStreakTracker` mit Funktion `trackActivity()`. Wird in folgenden Erfolgs-Events aufgerufen (nach erfolgreichem DB-Insert):
- `useGettingStartedProgress`-Quellen (video_creations, calendar_events, social_connections, brand_kits)
- Caption Generator (nach Save)
- Post-Publish-Bestätigungen

Aufruf via `supabase.rpc('record_streak_activity', { p_user_id: user.id })` — fire-and-forget, kein Toast-Spam.

## 3. Wöchentlicher Freeze-Token-Refill (Cron)

Edge Function `refresh-streak-freeze-tokens`
- Sonntags 23:00 UTC via pg_cron
- Setzt `freeze_tokens = LEAST(freeze_tokens + 1, 2)` für alle aktiven User
- Resettet `freeze_used_at = NULL` wenn älter als 7 Tage

## 4. Streak-Bruch-Detection (Cron)

Edge Function `check-streak-breaks`
- Täglich 02:00 UTC via pg_cron
- Findet User mit `last_activity_date < today - 1 day` UND `current_streak > 0`
- Falls Freeze verfügbar → konsumieren, Streak hält
- Sonst → `current_streak = 0`
- Optional: Push-Notification "Deine X-Tage-Streak ist in Gefahr ⚡" am Vorabend (22:00, wenn `last_activity_date = today - 1` und kein heutiges Event) — hängt von `notification_preferences.reminder_pushes_enabled`

## 5. Milestone-Belohnungen

Wenn `streak_milestones`-Insert triggert:
- Toast/Confetti im UI (Realtime-Subscribe auf eigene Streaks)
- Push-Notification "🔥 7-Tage-Streak erreicht!" (lokalisiert DE/EN/ES)
- Optional: Bonus-Credits (z. B. 30/7-Tage, 100/30-Tage) via existierender `increment_balance`-Funktion

## 6. UI-Komponenten

**`StreakBadge`** (Sidebar/Header)
- Flammen-Icon + Zahl (z. B. "🔥 7")
- Hover-Tooltip: "7 Tage in Folge — noch 7 für nächste Belohnung"
- Click → `/streak` Detail-Page

**`StreakCard`** im Dashboard (in der Nähe von `GettingStartedChecklist`)
- Aktueller Streak, Longest, Total Active Days
- Mini-Heatmap der letzten 30 Tage (CSS-Grid)
- Freeze-Token-Anzeige (🛡️ x1)
- "Nächster Milestone in X Tagen"

**Optional `/streak` Page** (low priority — kann B4 werden)
- Volle Heatmap-Historie + Milestone-Liste

## 7. Localization

Neue Keys in `de/en/es` für: Streak-Badge, Milestone-Texte, Push-Notifications, Tooltips.

## Aufwand

| Schritt | Zeit |
|---|---|
| DB-Migration + RPC `record_streak_activity` | 20 min |
| Hook `useStreakTracker` + Trigger-Integration (5 Punkte) | 25 min |
| Edge Functions (refresh + check) + Cron | 20 min |
| `StreakBadge` (Sidebar) | 15 min |
| `StreakCard` (Dashboard, mit Heatmap) | 25 min |
| Milestone-Push-Texte (3×3) + Realtime-Toast | 15 min |
| Localization | 10 min |
| E2E-Test (Streak +1, Freeze, Milestone) | 20 min |
| **Gesamt** | **~2.5h** |

## Was wir NICHT machen

- ❌ Public Leaderboard (gehört in C1, nicht Activation)
- ❌ NFT/Token-Belohnungen
- ❌ Eigenes Animation-Framework — nutzen `framer-motion` (bereits installiert) für Confetti/Pulse

## Reihenfolge nach Approval

1. Migration + RPC
2. Hook + Trigger-Integration
3. Cron-Edge-Functions
4. UI-Komponenten (Badge + Card)
5. Push-Texte + Localization
6. E2E-Test (manueller RPC-Call mit Datum-Manipulation)

Damit ist die **Activation-Phase (B1+B2+B3) komplett**: Email-Drip → Push-Reminder → Streak-Loop. Danach gehen wir an Phase C (Retention/Monetization).


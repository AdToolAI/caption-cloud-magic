

User möchte Streak-Belohnungen umstellen: Statt Plattform-Credits (10/30/50/100/200/500) sollen **AI-Video-Dollar-Credits** vergeben werden — und deutlich konservativer, mit **Max 25$ beim 100-Tage-Milestone**.

## Aktueller Stand
- `record_streak_activity` ruft `increment_balance(p_user_id, v_reward)` auf → das addiert auf `wallets.balance` (Plattform-Credits, nicht USD).
- Die richtige Funktion für AI-Video-Credits ist `add_ai_video_credits` oder direkt UPDATE auf `ai_video_wallets.balance_euros`.
- `streak_milestones.reward_credits` (INT) speichert aktuell Credits — wir sollten die Bedeutung umwidmen auf "USD-Cent" oder eine neue Spalte `reward_dollars` (NUMERIC) ergänzen.

## Neue Belohnungsstaffel (Dollar)

| Milestone | Belohnung | Begründung |
|---|---|---|
| 3 Tage | $0.50 | Kleiner First-Win-Boost |
| 7 Tage | $1.50 | Erste Woche durchgehalten |
| 14 Tage | $3.00 | Zwei Wochen Habit |
| 30 Tage | $7.00 | Monatsstreak — solide |
| 60 Tage | $15.00 | Power-User |
| 100 Tage | $25.00 | Legendärer Maximalbonus |

**Gesamt-Maximalkosten pro User über 100 Tage:** $52 (verteilt über >3 Monate, nur die hartnäckigsten ~1–5% erreichen alles).

## Plan

### 1. DB-Migration
- Spalte `streak_milestones.reward_dollars` NUMERIC(10,2) DEFAULT 0 ergänzen
- `reward_credits` bleibt für Rückwärtskompatibilität (alte Einträge), wird aber nicht mehr genutzt
- `record_streak_activity` RPC anpassen:
  - Neue CASE-Map auf USD-Beträge (0.50/1.50/3.00/7.00/15.00/25.00)
  - Statt `increment_balance` → direkter UPDATE auf `ai_video_wallets.balance_euros` + Insert in `ai_video_transactions` (type='bonus', description='Streak milestone reward: X days')
  - Falls noch kein Wallet existiert → Insert mit Defaults (currency='USD', balance_euros=v_reward_dollars)
  - Idempotenz bleibt via Unique-Index `(user_id, milestone_days)` erhalten

### 2. Edge Function `process-push-reminders` / Streak-Push-Texte
- Push-Body lokalisiert: „🔥 7-Tage-Streak! +$1.50 für AI-Videos" (DE/EN/ES) — falls bereits implementiert, Beträge anpassen.

### 3. UI Updates
- **`StreakCard`** (Dashboard): Milestone-Liste zeigt USD-Beträge (z. B. „🏅 7 Tage — +$1.50 AI Credits")
- **`/streak` Page**: Milestone-Tabelle mit USD-Beträgen
- **Tooltip im StreakBadge**: „Nächster Milestone in X Tagen — $Y AI-Credits"

### 4. Localization
- Neue/aktualisierte Keys in `de/en/es` für Dollar-Beträge und „AI-Video-Credits"-Wording.

### 5. E2E-Test
- Manueller RPC-Aufruf (`SELECT record_streak_activity('<uid>')` mit künstlich gesetztem `last_activity_date`) für jede Milestone-Schwelle
- Verifizieren: `ai_video_wallets.balance_euros` steigt um exakten USD-Betrag, `ai_video_transactions` hat passenden Bonus-Eintrag
- Toast/Push erscheint mit korrektem Betrag

## Aufwand: ~30 min

## Hinweis
- Bestehende Streak-Milestones (falls schon User welche erreicht haben): `reward_credits` bleibt historisch erhalten, neue Milestones bekommen `reward_dollars` — keine Rückwirkung.
- AI-Video-Wallet nutzt das Feld `balance_euros` aber speichert je nach `currency` USD oder EUR. Da Streak-Belohnungen in USD definiert werden, setzen wir bei Wallet-Erstellung `currency='USD'`. Bei existierenden EUR-Wallets vergeben wir den gleichen numerischen Betrag (ein User mit EUR-Wallet bekommt also „1.50 EUR" statt „1.50 USD" — der Differenzbetrag ist marginal und vereinfacht die Logik massiv).


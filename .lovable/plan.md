

## Plan: „Always-On Strategy Mode" — selbstheilende Wochenplanung mit Verpasst-Handling

### Vision
Sobald der Toggle „Strategie-Modus" AN ist, ist die Wochenleiste **niemals leer**. Sie ist ein dauerhafter Co-Pilot, der jede Woche neue, datenbasierte Postvorschläge generiert, sich bei verpassten Posts intelligent neu organisiert und den Creator motiviert dranzubleiben.

### Kernprinzipien

1. **Always-On**: Toggle einmal AN → läuft permanent, regeneriert sich automatisch wöchentlich.
2. **Intelligent**: Vorschläge basieren auf Performance-Daten (`post_metrics`), Nische, bisherigen Posts und besten Posting-Zeiten.
3. **Selbstheilend**: Verpasste Posts blockieren nicht — sie werden visuell markiert und mit klaren Aktionen versehen.
4. **Adaptiv**: Wenn ein Post verschoben/verworfen wird, passt sich die restliche Woche an (Verteilung, Plattformen, Zeiten bleiben optimal).

---

### Architektur

#### A) Datenmodell — neue Tabelle `strategy_posts`
```text
strategy_posts
├── id, user_id, workspace_id
├── week_start (DATE)              ← Mo der Woche
├── scheduled_at (TIMESTAMPTZ)
├── platform (TEXT)
├── content_idea (TEXT)            ← Kurztitel
├── caption_draft (TEXT)           ← AI-generierter Caption-Entwurf
├── reasoning (TEXT)               ← „Warum dieser Vorschlag"
├── status: 'pending' | 'completed' | 'missed' | 'dismissed' | 'rescheduled'
├── original_scheduled_at          ← falls verschoben, ursprünglicher Zeitpunkt
├── completed_event_id (UUID)      ← Verknüpfung zu calendar_events bei Übernahme
├── generation_batch_id            ← welche Generierung erzeugte ihn
└── created_at, updated_at
```
Eigenständige Tabelle (statt `calendar_events` zu missbrauchen) → klare Trennung zwischen „echten geplanten Posts" und „Strategie-Vorschlägen".

#### B) Edge-Function `generate-week-strategy`
Input: `user_id`, `week_start`
Logik:
1. Lädt letzte 90 Tage `post_metrics` + `calendar_events` + Profil/Nische.
2. Lädt beste Posting-Slots aus bestehender `posting_slots`-Logik (falls vorhanden) oder berechnet sie aus Top-Performance-Posts.
3. Schickt Kontext an Lovable AI (`google/gemini-3-flash-preview`) mit Tool-Call Schema:
   - 5–7 Vorschläge pro Woche
   - Pro Vorschlag: Tag, Uhrzeit, Plattform, Idee, Caption-Entwurf, Reasoning
4. Schreibt Vorschläge in `strategy_posts` mit `status='pending'`.

#### C) Edge-Function `tick-strategy-posts` (Cron, stündlich via pg_cron)
- Markiert vergangene `pending`-Vorschläge älter als 2h als `missed`.
- Sonntagabends 23:00 → ruft `generate-week-strategy` für die kommende Woche auf, falls Toggle aktiv.
- Wenn ein Vorschlag verschoben/verworfen wird und dadurch eine Plattform/Tag-Lücke entsteht → optional Re-Balancing der Restwoche.

#### D) Frontend — neue Komponenten

**`useStrategyMode` Hook** (`src/hooks/useStrategyMode.ts`)
- Toggle-State persistiert in `user_preferences` (DB) — nicht localStorage, damit geräteübergreifend.
- Beim ersten Aktivieren: ruft `generate-week-strategy` auf.
- React-Query mit `staleTime: 60s`.

**`WeekStrategyTimeline`** (`src/components/dashboard/WeekStrategyTimeline.tsx`)
Ersetzt im Strategy-Mode die normale Wochenleiste:
- 7 Tage-Spalten, pro Tag die Strategie-Vorschläge als Cards.
- Status-Visualisierung:
  - `pending` (zukünftig) → normal, Plattform-Ring
  - `pending` (vergangen, < 2h) → pulsierender gelber Ring
  - `missed` → **roter Glow + Achtungszeichen ⚠️**
  - `completed` → grüner Haken
  - `dismissed` → ausgegraut, durchgestrichen
  - `rescheduled` → blauer Pfeil-Indikator

**`MissedPostDialog`** (Klick auf einen `missed` Post)
- Zeigt: Caption-Entwurf, ursprüngliche Zeit, Plattform, Reasoning
- 3 Aktionen:
  1. **„Verwerfen"** → `status='dismissed'`, keine weiteren Hinweise
  2. **„Neu planen"** → Datepicker, neuer Slot → `status='rescheduled'`, neuer `scheduled_at`
  3. **„Jetzt posten"** → übernimmt in `calendar_events` (Schnell-planen-Flow), `status='completed'`

**`StrategyPostDialog`** (Klick auf `pending` Post)
- Zeigt vollen Vorschlag mit Caption-Entwurf
- Aktionen: „In Kalender übernehmen" / „Bearbeiten" / „Verwerfen"

#### E) Toggle-Integration in Home
- Toggle-Switch oberhalb der Wochenleiste mit Label „Strategie-Modus" + kleines Info-Tooltip.
- AN → `WeekStrategyTimeline` rendern, OFF → bestehende `WeekTimelineDay`-Logik.

---

### Smart-Features (Mehrwert)

1. **Streak-Anzeige**: „🔥 5 Wochen in Folge aktiv" → Motivation
2. **Wöchentliche Anpassung**: Performance der Vorwoche fließt in nächste Woche ein (z. B. „Reels Di 19:00 hat 8% ER → mehr davon")
3. **Plattform-Balance**: AI sorgt für Mix (nicht 7× Instagram), basierend auf vom User verbundenen Accounts
4. **Begründungen sichtbar**: Jeder Vorschlag zeigt „Warum" → Lerneffekt
5. **Notification-Hook (optional later)**: Web-Push 30 Min vor `scheduled_at`

---

### Umsetzung — Reihenfolge

1. **DB-Migration**: `strategy_posts` + `user_preferences.strategy_mode_enabled` (BOOLEAN) + RLS-Policies
2. **Edge-Function `generate-week-strategy`** (mit Lovable AI, Tool-Call Schema)
3. **Edge-Function `tick-strategy-posts`** + pg_cron stündlich
4. **Hook `useStrategyMode`** + Mutations (toggle, dismiss, reschedule, complete)
5. **Komponenten**: `WeekStrategyTimeline`, `MissedPostDialog`, `StrategyPostDialog`
6. **Home-Integration**: Toggle + Conditional Rendering

### Betroffene Dateien (neu/geändert)
- *(neu)* Migration für `strategy_posts` + `user_preferences`
- *(neu)* `supabase/functions/generate-week-strategy/index.ts`
- *(neu)* `supabase/functions/tick-strategy-posts/index.ts`
- *(neu)* `src/hooks/useStrategyMode.ts`
- *(neu)* `src/components/dashboard/WeekStrategyTimeline.tsx`
- *(neu)* `src/components/dashboard/MissedPostDialog.tsx`
- *(neu)* `src/components/dashboard/StrategyPostDialog.tsx`
- `src/pages/Home.tsx` — Toggle + Conditional Rendering

### Erwartetes Ergebnis
- Toggle AN → Wochenleiste **immer** mit 5–7 datenbasierten Vorschlägen gefüllt, jede Woche neu.
- Verpasste Posts leuchten rot ⚠️ → Klick → Verwerfen / Neu planen / Jetzt posten.
- Sonntag 23:00 generiert sich automatisch die Folgewoche.
- Vorschläge werden besser, je mehr Daten der Creator sammelt (Performance-Loop).
- Echte tägliche Stütze für Creator — keine Leere, keine Schuldgefühle, klare nächste Aktion.


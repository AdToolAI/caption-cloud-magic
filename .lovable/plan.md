# Session F: Performance-Loop & Self-Tuning

Der Autopilot zieht echte Engagement-Daten aus `post_metrics` (= Analytics Dashboard Quelle), erkennt Muster und passt zukünftige Pläne automatisch an. Trigger: ab 10 geposteten Slots automatisch.

## Was er lernt

Pro Brief werden 4 Achsen analysiert:
1. **Topic-Pillars** — welcher Pillar performt am besten (avg engagement_rate)?
2. **Plattform** — wo lohnt sich das Investment?
3. **Tageszeit/Wochentag** — welche Slots brachten Top-Engagement?
4. **Format** — Video vs. Image vs. Carousel?

Median-basiert, nicht Mean (robust gegen Ausreißer).

## Architektur

```text
┌─────────────────────────────────────────────────┐
│ post_metrics (Analytics-Tabelle, schon befüllt) │
└────────────┬────────────────────────────────────┘
             │ JOIN über social_post_id
             ▼
┌─────────────────────────────────────────────────┐
│ autopilot-performance-analyze (Edge Func)       │
│ läuft nightly via cron                          │
│ → schreibt autopilot_performance_insights       │
└────────────┬────────────────────────────────────┘
             │ liest
             ▼
┌─────────────────────────────────────────────────┐
│ autopilot-plan-week (Session D)                 │
│ injiziert "Top-Performer-Patterns" in           │
│ Gemini-Prompt → bessere nächste Woche           │
└─────────────────────────────────────────────────┘
```

## Komponenten

### 1. Migration
- **`autopilot_performance_insights`** Tabelle pro Brief:
  - `top_pillars[]`, `weakest_pillars[]`
  - `top_platforms[]`, `top_post_hours[]` (jsonb pro plattform)
  - `top_formats[]`
  - `avg_engagement_rate`, `total_posts_analyzed`
  - `analyzed_until` (timestamp), `created_at`
  - RLS: User sieht eigene; Admin alle
- **`autopilot_briefs`** bekommt `performance_loop_enabled` (default true) + `last_performance_analysis_at`

### 2. Edge Function: `autopilot-performance-analyze`
Cron nightly (03:00 UTC):
- Iteriert aktive Briefs mit ≥10 geposteten Slots
- Joint `autopilot_queue.social_post_id` → `post_metrics`
- Berechnet Median-Engagement pro Pillar/Platform/Hour/Format
- Schreibt Insights-Row (overwrite per Brief)
- Notification "📊 Performance-Auswertung bereit" wenn signifikant neue Insights

### 3. `autopilot-plan-week` Patch (Session D)
Lädt `autopilot_performance_insights` für den Brief und injiziert Block in Gemini-Prompt:
```
PERFORMANCE-LERNDATEN (letzte 30 Tage):
- Top-Pillars: [...]
- Top-Plattformen: [...]
- Top-Posting-Slots: [...]
- Empfehlung: Verstärke Top-Themen 2x, reduziere schwache.
```

### 4. UI
Neuer **"Insights"** Tab in `/autopilot`:
- Top/Weakest Pillars als Bento-Cards
- Plattform-Ranking mit avg engagement
- Beste Posting-Hours pro Plattform als Heatmap
- "Letzte Analyse: vor X Stunden"
- Bei <10 Posts: "Lernphase — sammle erst mehr Daten"

### 5. Activity-Log
Jede Analyse loggt `event_type: "performance_analyzed"` mit Metadaten.

### 6. Cron
Neue cron-Schedule: `autopilot-performance-analyze` täglich um 03:00 UTC.

## Performance-Loop ist self-contained
- Keine neuen externen API-Calls (alles aus eigener DB)
- Keine zusätzlichen Credits
- Idempotent: kann beliebig oft laufen
- Auto-Trigger ab 10 Posts, kein manuelles Anstoßen nötig
- Kann pro Brief deaktiviert werden (Toggle in Strategy-Editor)

## Reihenfolge der Umsetzung
1. Migration (Insights-Tabelle + Brief-Feld)
2. `autopilot-performance-analyze` Edge Function
3. Plan-Week-Function patchen (Insights-Injection)
4. Cron einrichten
5. UI: Insights-Tab in Autopilot-Page
6. Toggle im Strategy-Editor



## Analytics Dashboard Upgrade: Auto-Tracking, Plattform-Seiten, KI-Analyse & Kommentar-Integration

### Zusammenfassung

Jeder Post soll nach dem Publishen automatisch getrackt werden, das Analytics Dashboard bekommt eigene Plattform-Unterseiten, eine KI-Analyse mit Strategie-Tipps, und der Kommentar-Manager wird integriert.

### Aenderungen

**1. Auto-Tracking nach Publish (Edge Function `publish/index.ts`)**
- Nach erfolgreichem Publish (Zeile ~1464): fuer jeden erfolgreichen Kanal automatisch einen Eintrag in `post_metrics` erstellen mit `external_id`, `provider`, `user_id`, `caption_text`, `posted_at`
- Initiale Metriken auf 0 setzen (likes, comments, shares, views) -- werden spaeter durch `sync-metrics-cron` aktualisiert
- Zusaetzlich: `sync-social-posts-v2` nach 15 Minuten Delay triggern (delayed metrics fetch), damit erste Engagement-Daten reinkommen

**2. Plattform-spezifische Performance-Seiten**
- Neue Seite: `src/pages/Analytics/PlatformAnalytics.tsx` mit URL-Parameter `/analytics/platform/:platform`
- Zeigt fuer jede Plattform (Instagram, Facebook, YouTube, TikTok, LinkedIn, X):
  - Uebersicht-Metriken (Views, Likes, Comments, Shares, Engagement Rate)
  - Trend-Chart (letzte 7/30 Tage)
  - Top-Posts fuer diese Plattform
  - Kommentar-Uebersicht (aus `comments` Tabelle gefiltert nach Plattform)
- Navigation: Platform-Tabs oder Cards auf der Analytics-Startseite die zu den Unterseiten verlinken

**3. Analytics Startseite aufwerten (`src/pages/UnifiedAnalytics.tsx`)**
- Plattform-Karten mit Live-Status-Icons (verbunden/nicht verbunden aus `social_connections`)
- Aggregierte Metriken ueber alle Plattformen auf der Startseite
- Neuer Tab "Plattformen" mit Karten fuer jede Plattform die zur Detailseite verlinken
- Neuer Tab "KI-Kommentare" der den Kommentar-Manager einbettet

**4. KI-Analyse Button & Strategie-Tipps**
- Neuer "Analysieren" Button auf der Analytics-Startseite
- Neue Edge Function `analyze-performance-strategy/index.ts`:
  - Sammelt aktuelle Metriken aus `post_metrics` und `v_metrics_summary`
  - Sendet an Lovable AI Gateway mit System-Prompt fuer Social-Media-Strategie
  - Gibt zurueck: Staerken, Schwaechen, konkrete Tipps, kosteneffektive Wachstumsstrategien
- Ergebnis wird in einem Modal/Panel angezeigt mit Sections: Performance-Bewertung, Tipps, Strategie-Empfehlungen
- Ergebnisse optional in DB cachen (`performance_analyses` Tabelle) fuer Verlauf

**5. Kommentar-Manager Integration ins Analytics Dashboard**
- Neuer Tab "Kommentare" in UnifiedAnalytics
- Wiederverwendung der bestehenden Kommentar-Komponenten (`CommentDiagnostics`, `ReplySuggestions`)
- Plattform-Filter: zeigt Kommentare pro Plattform
- Sentiment-Uebersicht als Metriken-Karten (positiv/neutral/negativ)

**6. Datenbank-Aenderungen**
- Neue Tabelle `performance_analyses` (user_id, platform, analysis_json, created_at) fuer KI-Analyse-Cache
- Keine Aenderungen an bestehenden Tabellen noetig

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| `supabase/functions/publish/index.ts` | Nach erfolgreichem Publish: `post_metrics` Insert mit initialen Daten |
| `supabase/functions/analyze-performance-strategy/index.ts` | NEU: KI-Analyse Edge Function mit Lovable AI Gateway |
| `src/pages/Analytics/PlatformAnalytics.tsx` | NEU: Plattform-spezifische Performance-Seite |
| `src/pages/UnifiedAnalytics.tsx` | Neue Tabs "Plattformen" und "Kommentare", Analyse-Button |
| `src/components/analytics/PlatformOverviewCards.tsx` | NEU: Plattform-Karten mit Status und Metriken |
| `src/components/analytics/AIStrategyPanel.tsx` | NEU: KI-Strategie-Analyse Anzeige |
| `src/components/analytics/CommentsAnalyticsTab.tsx` | NEU: Kommentar-Tab fuer Analytics |
| `src/hooks/usePerformanceAnalysis.ts` | NEU: Hook fuer KI-Analyse |
| `src/App.tsx` | Route fuer `/analytics/platform/:platform` hinzufuegen |
| Migration SQL | `performance_analyses` Tabelle erstellen |

### Nicht angefasst
- Bestehende `sync-social-posts-v2` und `sync-metrics-cron` Logik bleibt unveraendert
- Bestehender Kommentar-Manager als eigene Seite bleibt bestehen
- Keine Aenderungen an Publishing-Logik (nur Post-Tracking danach)


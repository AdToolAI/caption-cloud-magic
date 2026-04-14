

## Plan: Meta-Metriken auf neue API umstellen (Deprecation Juni 2026)

### Was passiert
Meta entfernt bis 30. Juni 2026 die Metriken `post_impressions`, `post_impressions_unique`, `page_impressions` und `impressions` (Instagram). Diese werden durch `post_total_media_view`, `post_total_media_view_unique`, `page_media_view` etc. ersetzt.

### Betroffene Dateien (5 Edge Functions)

| Datei | Alte Metrik | Neue Metrik |
|-------|------------|-------------|
| `facebook-page-sync/index.ts` | `post_impressions`, `post_impressions_unique`, `page_impressions` | `post_total_media_view`, `post_total_media_view_unique`, `page_media_view` |
| `sync-posts-history/index.ts` | `post_impressions`, `post_impressions_unique` (FB), `impressions` (IG) | `post_total_media_view`, `post_total_media_view_unique` (FB), `ig_reels_aggregated_all_plays_count` oder `views` (IG) |
| `fetch-analytics/index.ts` | `post_impressions`, `impressions` | `post_total_media_view`, neue IG-Metriken |
| `sync-social-posts/index.ts` | `post_impressions`, `post_impressions_unique` | `post_total_media_view`, `post_total_media_view_unique` |
| `sync-social-posts-v2/index.ts` | `impressions`, `reach` (IG) | neue IG-Metriken |

### Ansatz: Fallback-Strategie (keine Verbindungen stören)

Statt hart umzuschalten, wird jede Funktion **zuerst die neue Metrik** abfragen. Falls die API einen Fehler zurückgibt (z.B. weil Meta die neuen Metriken noch nicht für alle Seiten aktiviert hat), fällt sie **automatisch auf die alte Metrik zurück**. So funktioniert alles sofort und bricht nichts.

```text
try neue Metrik (post_total_media_view)
  → Erfolg → verwenden
catch
  → try alte Metrik (post_impressions)
    → Erfolg → verwenden
    → Fehler → 0
```

### Was sich NICHT ändert
- Keine DB-Migration nötig — die Spalten `impressions` und `reach` in `post_metrics` / `fb_page_daily` bleiben gleich, nur die Datenquelle ändert sich
- Keine OAuth-Änderungen — die bestehenden Permissions reichen für die neuen Metriken
- Keine UI-Änderungen — die Anzeige bleibt identisch
- Graph API Version wird auf `v24.0` vereinheitlicht (einige nutzen noch v18.0/v21.0)

### Technische Details
- Alle `graphGet`/`fetch`-Aufrufe werden auf die neuen Metrik-Namen umgestellt
- Jeder Insights-Abruf bekommt einen try/catch-Fallback auf die alten Namen
- API-Version wird konsistent auf v24.0 gesetzt


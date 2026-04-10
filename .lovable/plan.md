
Ziel: Das Analytics Dashboard auf `/analytics` vollständig für EN/DE/ES lokalisieren. Im Screenshot ist klar, dass nicht nur einzelne Labels, sondern fast die gesamte Analytics-Erfahrung noch gemischte oder harte deutsche Strings enthält.

1. Hauptseite `src/pages/UnifiedAnalytics.tsx` bereinigen
- Alle harten UI-Texte in `t(...)` umstellen:
  - „Zuletzt aktualisiert“
  - „7 Tage / 30 Tage“
  - „Plattformen verwalten“
  - Dialogtitel für Verbindungen
  - Tabs: „Plattformen“, „KI-Analyse“, „Kommentare“
  - Karten-/Abschnittstitel, Beschreibungen, Buttons, Empty States, ROI-/Hashtag-/Campaign-Texte
- Toasts lokalisieren:
  - Auto-Refresh
  - Fehler beim Laden
  - manuelles Aktualisieren
  - Hashtag-Analyse erfolgreich/fehlerhaft
  - Best-Content-Analyse erfolgreich/fehlerhaft
- Datums-/Zeitformatierung an Sprache koppeln statt gemischt deutsch/englisch.

2. Overview-Komponenten lokalisieren
- `src/components/analytics/OverviewMetrics.tsx`
  - Deutsche Beschreibungen wie „Letzte 7 Tage“, „Alle Plattformen“, „Plattformen“, „Aktive Kanäle“ über `t(...)`
  - Zahlenformat nicht hart `de-DE`, sondern abhängig von der aktiven Sprache
- `src/components/analytics/MetricsChart.tsx`
  - Untertitel wie „Durchschnittliche Engagement-Rate“, „Likes und Views pro Plattform“, „Engagement-Verteilung pro Tag“ lokalisieren
  - Tooltip-/Datumsformatierung ebenfalls sprachabhängig machen

3. Tabellen- und Plattformkarten lokalisieren
- `src/components/analytics/TopPostsTable.tsx`
  - Export-Fehler/Erfolg
  - Tabellenüberschriften wie „Aktionen“
  - Beschreibungen/Empty State („Noch keine Posts…“)
  - Dialogtexte („Original Post ansehen“, „Keine Caption“)
  - Datums-/Zahlenformatierung sprachabhängig
- `src/components/analytics/PlatformOverviewCards.tsx`
  - „Posts“ lokalisieren
  - Bei Bedarf weitere Kleintexte absichern

4. Weitere Tabs im Dashboard lokalisieren
- `src/components/analytics/CommentsAnalyticsTab.tsx`
  - Filter „Alle Plattformen“
  - KPI-Texte wie „Kommentare gesamt“, „Positiv“, „Negativ“
  - Empty State und „Letzte Kommentare“
  - Fallback „Unbekannt“
- `src/components/analytics/AIStrategyPanel.tsx`
  - Komplette AI-Analyse-UI lokalisieren
  - Rate-limit-/Credit-/Error-Toasts
  - Button-States, Abschnittsüberschriften, Resultatkarten

5. Eingebettete Performance-Komponenten prüfen und lokalisieren
Die Analytics-Seite verwendet auch Performance-Komponenten, in denen noch harte deutsche Texte stecken:
- `src/components/performance/OverviewTab.tsx`
  - „Reach heute“, „Fans gesamt“, „Top 10 Instagram Posts (letzte 28 Tage)“, „Ansehen“, „Alle Daten aktualisieren“ usw.
  - Tabellenköpfe, Beschreibungen, Datums-/Zahlenformat
- `src/components/performance/XConnectionCard.tsx`
  - Deutsche Verbindungs-/Fehler-/CTA-Texte lokalisieren
- Optional mitprüfen: `ConnectionsTab.tsx`, falls der Dialog im Analytics-Dashboard direkt geöffnet wird und dort noch gemischte Strings erscheinen

6. Übersetzungen erweitern
- `src/lib/translations.ts`
- Bestehenden `analytics`-Namespace erweitern statt neue verstreute Keys zu erfinden
- Sinnvoll ergänzen:
  - `analytics.unified.*` für Header, Filter, Tabs, Dialoge, Toasts
  - `analytics.overview.*` für KPI-Karten und Charts
  - `analytics.topPosts.*`
  - `analytics.comments.*`
  - `analytics.ai.*`
- Falls Performance-Komponenten eingebettet bleiben:
  - fehlende Keys unter bestehendem `performance.*` Namespace ergänzen
- Keys in EN/DE/ES gleichzeitig pflegen, damit keine Fallback-Lücken entstehen

7. Technische Leitplanken
- Vorhandenes i18n-System mit `useTranslation()` weiterverwenden
- Keine neuen Übersetzungssysteme einführen
- Sprache aus dem bestehenden Context verwenden
- `Intl.NumberFormat(language)` und passende `toLocaleDateString/toLocaleTimeString`-Locales nutzen, damit auch Zahlen/Daten nicht deutsch bleiben

8. Ergebnis nach Umsetzung
- Analytics Dashboard ist in englischer UI vollständig englisch
- Keine harten deutschen Strings mehr in Header, Tabs, Cards, Dialogen, Tabellen, Toasts und Empty States
- Datums-/Zahlenformat passt ebenfalls zur gewählten Sprache

Technische Details
```text
Betroffene Kern-Dateien:
- src/pages/UnifiedAnalytics.tsx
- src/components/analytics/OverviewMetrics.tsx
- src/components/analytics/MetricsChart.tsx
- src/components/analytics/TopPostsTable.tsx
- src/components/analytics/PlatformOverviewCards.tsx
- src/components/analytics/CommentsAnalyticsTab.tsx
- src/components/analytics/AIStrategyPanel.tsx
- src/components/performance/OverviewTab.tsx
- src/components/performance/XConnectionCard.tsx
- src/lib/translations.ts
```

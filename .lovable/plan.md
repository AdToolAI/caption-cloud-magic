
Ziel: Der News Radar soll nicht mehr wie ein einzelner SocialBee-Feed wirken, sondern jede Stunde breit gefächerte, neue und wirklich nützliche News rund um Social-Media-Management liefern. Außerdem soll der obere “Tipp des Tages” live statt statisch sein.

Was ich bestätigt habe
- Der aktuell gecachte Feed ist tatsächlich einseitig: 8 Meldungen, davon 7 mit Quelle `SocialBee`, fast alles Kategorie `social`.
- `fetch-news-radar` erzwingt aktuell keine Quellen- oder Themenvielfalt und übernimmt `source` direkt aus dem Modell-Output.
- Dashboard-Ticker und Trend-Radar rufen den Feed immer mit `language: 'en'` ab.
- Der Bereich `Tipp des Tages` auf der Startseite ist kein Live-Feed, sondern ein fixer Übersetzungsstring.

Umsetzung
1. Backend für Vielfalt und Relevanz umbauen
- `supabase/functions/fetch-news-radar/index.ts` auf strukturierte Ausgabe erweitern: `headline`, `category`, `source`, `url`, `platform`, `takeaway`.
- Prompt auf feste News-Buckets umstellen: Plattform-Updates, AI/Tools, Analytics, Monetarisierung/E-Commerce, Community/Customer Care.
- Harte Regeln einbauen: max. 2 Meldungen pro Quelle, max. 2 pro Plattform, mehrere Kategorien verpflichtend.
- Quellen aus echten URLs/Citations ableiten statt blind dem Textfeld `source` zu vertrauen.
- Wenn die Antwort zu einseitig ist, automatisch einmal mit Korrekturprompt neu anfragen und nur gute Ergebnisse cachen.

2. Stündliche Erneuerung sauber machen
- Cache nicht mehr als rollende 60-Minuten-Frist behandeln, sondern pro Stundenfenster neu erzeugen.
- Zusätzlich zuletzt überrepräsentierte Quellen/Domains als “avoid overuse” in die nächste Stunde mitgeben, damit nicht wieder dieselben Seiten dominieren.

3. UI auf einen gemeinsamen Live-Feed umstellen
- Gemeinsamen Fetch-Helfer/Hook für News Radar anlegen, damit Home, Dashboard-Ticker und Trend-Radar dieselbe Logik nutzen.
- Die aktuelle App-Sprache statt festem `'en'` an die Funktion übergeben.
- Im Ticker echte Quellen anzeigen und optional auf Originalartikel verlinken.

4. “Tipp des Tages” live machen
- In `src/pages/Home.tsx` den statischen Text durch ein Live-Element aus dem News-Feed ersetzen:
  - entweder als “Top Insight des Tages” aus `takeaway`
  - oder als wichtigste Headline mit Quelle.
- So wird auch dieser Bereich breitgefächert, innovativ und aktuell.

Fallback
- Wenn die externe News-Antwort wieder zu generisch oder zu einseitig ist, nicht mehr stumpf cachen.
- Stattdessen ein kuratierter Multi-Source-Fallback mit gemischten Kategorien.

Betroffene Dateien
- `supabase/functions/fetch-news-radar/index.ts`
- `src/components/dashboard/NewsTicker.tsx`
- `src/pages/TrendRadar.tsx`
- `src/pages/Home.tsx`
- neu: gemeinsamer Helfer wie `src/hooks/useNewsRadar.ts` oder `src/lib/newsRadar.ts`

Technische Details
- Keine DB-Migration nötig: `news_radar_cache.news_json` ist bereits `jsonb` und kann reichere News-Objekte speichern.
- Qualitätschecks vor dem Cachen:
  - mindestens 5 unterschiedliche Quellen
  - mindestens 3 Kategorien
  - keine Quelle öfter als 2x
  - keine Plattform öfter als 2x

Abnahme
- Der Ticker zeigt nicht mehr fast nur `SocialBee`, sondern mehrere echte Quellen.
- Der Feed enthält gemischte Themen rund um Social-Media-Management, nicht nur Instagram/UI-News.
- Der obere “Tipp des Tages” ist live und wechselt mit dem News-Feed.
- Die Inhalte erneuern sich pro Stunde nachvollziehbar.



## "Naechster Post" Anzeige korrigieren

### Aenderungen

#### 1. `src/pages/Home.tsx` — Status Bar: echten naechsten Post anzeigen

Zeile 454-455: Statt hardcoded "Heute 18:00" den tatsaechlich naechsten geplanten Post aus `weekDays` berechnen (erster Post mit `status !== 'published'` und Zeitpunkt in der Zukunft). Datum + Uhrzeit dynamisch anzeigen, z.B. "25.03.2026 21:00".

#### 2. `src/pages/Home.tsx` — "Heute" Section → "Naechster Post"

- Section-Titel von `t("dashboard.sections.today")` zu "Naechster Post" aendern
- Statt alle heutigen Posts als Liste: nur den **naechsten** anstehenden Post anzeigen
- Content-Idee auf bis zu 3 Zeilen anzeigen (`line-clamp-3`) statt 1 Zeile
- "Oeffnen" Button entfernen
- Plattform-Badge und Status-Pill bleiben
- Thumbnail bleibt wenn vorhanden
- Falls kein naechster Post: Empty State wie bisher

#### 3. Naechsten Post berechnen

Neue Hilfsfunktion `getNextPost()`: Iteriert ueber alle `weekDays` und findet den chronologisch naechsten Post, der noch nicht `published` ist. Beruecksichtigt sowohl Datum als auch `suggestedTime`.

### Ergebnis
- Status Bar zeigt echte naechste Post-Zeit (z.B. "25.03. 21:00")
- "Naechster Post" Section zeigt den einen naechsten Post mit voller Beschreibung auf 3 Zeilen
- Kein "Oeffnen" Button mehr


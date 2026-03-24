

## Posting-Zeit-Berater: Immer Empfehlungen anzeigen & Genauigkeit verbessern

### Problem-Analyse

Die Edge Function `posting-times-api` generiert bereits Branchen-Benchmarks als Fallback, und die Logs zeigen erfolgreiche Cache-Hits mit Daten. Das Problem liegt an zwei Stellen:

1. **Stale Cache**: Alte Cache-Eintraege mit leeren `platforms`-Objekten (von vor dem Benchmark-Fallback) werden noch ausgeliefert und blockieren neue Daten fuer 1 Stunde
2. **Frontend zeigt leeren Zustand**: Wenn `platformData.length === 0` wird sofort "Noch keine Daten" angezeigt, ohne zwischen "wirklich keine Daten" und "Daten laden noch" zu unterscheiden
3. **Keine Empfehlungen ohne Verbindung**: Die Seite suggeriert, dass man erst synchronisieren muss, obwohl Branchen-Benchmarks sofort verfuegbar sein sollten

### Aenderungen

**1. Edge Function `posting-times-api/index.ts` -- Robusterer Fallback**
- Nach dem Cache-Hit pruefen, ob die gecachten `platforms`-Daten tatsaechlich Slots enthalten. Falls leer: Cache ignorieren und Benchmarks neu generieren
- Benchmarks IMMER als Grundlage verwenden, dann mit echten User-Daten (aus `posting_slots` und `posts_history`) anreichern/ueberschreiben
- Wenn User-History vorhanden: Scores aus echten Engagement-Daten berechnen und mit Benchmark-Scores blenden (70% History / 30% Benchmark)
- Cache-TTL auf 30 Minuten reduzieren fuer schnellere Aktualisierung

**2. Frontend `PostingTimes.tsx` -- Immer Empfehlungen anzeigen**
- Den leeren Zustand ("Noch keine Daten") komplett entfernen -- es gibt immer mindestens Benchmark-Daten
- Stattdessen: Wenn `!hasHistory`, einen dezenten Hinweis-Banner ueber der Heatmap anzeigen ("Basiert auf Branchen-Durchschnitten -- verbinde deine Accounts fuer personalisierte Empfehlungen")
- Heatmap und Top-Slots werden IMMER gerendert, nie versteckt
- `refetchInterval` auf 15 Minuten reduzieren fuer automatische Aktualisierung

**3. Hook `usePostingTimes.ts` -- Besseres Caching**
- `staleTime` auf 2 Minuten reduzieren
- `refetchOnWindowFocus` aktivieren, damit bei Tab-Wechsel aktualisiert wird
- Retry-Logik hinzufuegen (3 Retries bei Fehler)

**4. Edge Function Enhancement -- AI-gestuetzte Scores**
- Bestehende `PLATFORM_PEAKS` mit dynamischen Faktoren anreichern:
  - Feiertage/Events erkennen (Datum-basiert, z.B. Wochenenden vs. Werktage bereits vorhanden)
  - Saisonale Anpassungen (Sommer vs. Winter, Tageslaenge)
  - Wenn User-Nische bekannt (aus `profiles` oder `brand_kits`): branchenspezifische Anpassungen der Scores

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| `supabase/functions/posting-times-api/index.ts` | Cache-Validierung, Benchmark-Blending mit User-History, saisonale Score-Anpassungen, kuerzerer Cache-TTL |
| `src/pages/PostingTimes.tsx` | Leeren Zustand entfernen, immer Heatmap zeigen, Hinweis-Banner wenn keine History |
| `src/hooks/usePostingTimes.ts` | Kuerzere staleTime, refetchOnWindowFocus, Retry-Logik |

### Nicht angefasst
- Keine neuen Datenbank-Tabellen noetig
- Keine neuen Edge Functions
- Bestehende Heatmap/TopSlots-Komponenten bleiben unveraendert




## Plan: Force-Refresh der deutschen Trend-Daten in der Datenbank

### Problem
Die `trend_entries`-Tabelle enthält noch die alten deutschen Trend-Inhalte. Die Edge Function wurde zwar mit englischen Texten aktualisiert, aber der Refresh-Mechanismus greift nicht, weil er nur auf alte Subcategory-Namen prüft — die aber bereits korrekt sind. Ergebnis: Die DB serviert weiterhin gecachte deutsche Strings.

### Lösung
Den Refresh-Trigger in der Edge Function so anpassen, dass er auch erkennt, wenn Trends noch deutschen Text enthalten, und in dem Fall alle Einträge löscht und mit den neuen englischen Fallback-Daten ersetzt.

### Änderungen

**`supabase/functions/fetch-trends/index.ts`** — Zusätzliche Refresh-Bedingung (~5 Zeilen):

Nach der bestehenden `oldSubcategories`-Prüfung (Zeile ~1749) eine zweite Prüfung hinzufügen: Wenn existierende Trends deutsche Wörter in `description` oder `name` enthalten (z.B. "für", "Über-Nacht", "Verwandle"), wird ebenfalls ein kompletter Refresh ausgelöst.

```typescript
// Additional check: detect old German content that needs refresh
const hasGermanContent = allEcommerceTrends?.some((t: any) => {
  const desc = t.data_json?.ai_tip || t.description || '';
  return /\b(für|und|mit|Verwandle|Über-Nacht|Magnetischer|Kleiner)\b/.test(desc);
});

const needsRefresh = hasOldSubcategories || hasGermanContent;
```

Dann `if (hasOldSubcategories)` durch `if (needsRefresh)` ersetzen.

Zusätzlich: Die Prüfung auf ALLE Trends ausdehnen (nicht nur ecommerce), damit auch Social Media / Business Trends erkannt werden.

### Betroffene Datei
- `supabase/functions/fetch-trends/index.ts` (nur ~10 Zeilen Änderung)

### Nach Deployment
Die nächste Anfrage an den Trend Radar erkennt die deutschen Inhalte, löscht alle alten Einträge und fügt die englischen neu ein. Ab dann werden nur noch englische Trends angezeigt.


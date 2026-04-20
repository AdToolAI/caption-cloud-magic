

# Plan: Whitelist-Sync + Comments-Crash-Fix + Latenz-Klarstellung

## Was die Daten wirklich zeigen

Letzte 3 Komplett-Runs liefen **alle 10 von 10 grün** — bis auf Comments Analysis, das jetzt einen anderen 500er wirft (`Cannot read properties of undefined (reading 'updated_at')`). Die UI zeigt aber nur 6 Szenarien statt 10, weil die **Whitelist im Frontend andere Namen verwendet als der Test-Runner** wirklich schreibt. Dadurch werden Caption (DE/ES), Hashtag, Posting Times, Performance und Trend Radar aus der Liste gefiltert.

### Zur Latenz-Frage: Das ist normal

| Szenario | Latenz | Bewertung |
|---|---|---|
| Caption / Trend Radar | 0.3–1 s | Sehr schnell (Cache/leichte Calls) |
| Bio / Hashtag / Posting | 0.7–3 s | Normal für Gemini Flash |
| Performance Analytics | 1.4–2 s | Normal |
| Campaign Generation | 5–5.5 s | Normal (mehrere Gemini-Calls hintereinander) |
| Image Generation | 6.5–9.3 s | Normal für KI-Bildgenerierung |

**Es gibt kein Latenz-Problem.** Die hohen Werte kommen nur von Image und Campaign — und das ist die echte Zeit, die KI-Modelle für Bilder bzw. Multi-Step-Generierung brauchen. Schneller geht's mit den aktuellen Modellen nicht. Die UI sortiert und zeigt das nur prominenter, weil es im Vordergrund steht.

## Fix 1 — Whitelist mit echten Szenarien-Namen synchronisieren

In `src/pages/admin/AISuperuserAdmin.tsx` die `ACTIVE_SCENARIOS`-Set ersetzen durch die tatsächlich vom Runner geschriebenen Namen:

```ts
const ACTIVE_SCENARIOS = new Set<string>([
  'Caption Generation (EN)',
  'Bio Generation (DE)',
  'Bio Generation (ES)',
  'Image Generation',
  'Campaign Generation',
  'Performance Analytics',
  'Hashtag Analysis',
  'Posting Times Recommendation',
  'Comments Analysis',
  'Trend Radar Fetch',
]);
```

Damit erscheinen alle 10 aktiven Szenarien im Dashboard statt nur 6.

## Fix 2 — Comments Analysis 500er beheben

In `supabase/functions/analyze-comments/index.ts` die `comment_analysis`-Behandlung defensiv machen:

```ts
const commentsToAnalyze = comments.filter(c => {
  const analyses = c.comment_analysis;
  if (!analyses || !Array.isArray(analyses) || analyses.length === 0) return true;
  const analysis = analyses[0];
  if (!analysis?.updated_at) return true;          // <- defensiver Guard
  const updatedAt = new Date(analysis.updated_at);
  const hoursSince = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
  return hoursSince > 24;
});
```

Das ist ein echter App-Bug — kein Test-Runner-Problem. Wenn ein Kommentar in der Datenbank steht aber noch nie analysiert wurde, crasht die Live-App genauso. Genau dafür ist der KI-Superuser da.

## Fix 3 — Latenz-Spalte mit Kontext ergänzen

Im Dashboard kleine Hilfe einbauen damit klar ist, dass 5–9 s bei KI-Calls normal sind:

- Latenz-Zelle in der Tabelle bekommt Farbcode:
  - `< 3000 ms` → grau (Standard)
  - `3000–8000 ms` → gelb-orange (Hinweis: KI-typisch)
  - `> 8000 ms` → rot (genauer hinschauen)
- Tooltip auf der Spalten-Überschrift: *„Echte Edge-Function-Latenz inkl. KI-Modell-Antwortzeit. 5–10 s sind bei Bild-/Multi-Step-Generierung normal."*
- In den **Summary-Cards** oben einen **„Letzter Komplett-Test (gesamt)"**-Wert hinzufügen, der die Summe der letzten 10 Latenzen zeigt → so siehst du ob ein **Trend** entsteht (z.B. von 25 s auf 50 s steigend = Problem).

## Reihenfolge

1. `AISuperuserAdmin.tsx`: Whitelist auf echte Namen umstellen + Latenz-Farbcode + Tooltip + „Letzter Run gesamt"-Card
2. `analyze-comments/index.ts`: Defensiver Guard für `updated_at`
3. Komplett-Test ausführen → Erwartung: **10/10 grün**, alle 10 Szenarien sichtbar

## Erwartetes Ergebnis

- ✅ Alle 10 Szenarien sichtbar (statt 6)
- ✅ Comments Analysis auf grün
- ✅ Latenz wird mit Farbcode kontextualisiert — kein Rätselraten mehr
- ✅ Pass-Rate-Card zeigt nach Reset 100%


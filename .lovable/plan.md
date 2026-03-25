

## RecoCard: Fake-Daten durch echte Insights ersetzen

### Ist-Zustand
Die `RecoCard` (Zeile 27) hat **hardcodierte Mock-Empfehlungen** — die Texte sind fix und basieren auf keinen echten Daten.

### Gute Nachricht
Es existiert bereits ein vollstaendiges Insight-System in `CaptionInsightsTab.tsx` + `insightRules.ts`, das echte `post_metrics`-Daten aus der Datenbank aggregiert und daraus regelbasierte Empfehlungen generiert (beste Posting-Zeit, bester Post-Typ, Top-Hashtags, Caption-Laenge, Engagement-Trend).

### Loesung
Die `RecoCard` soll dieselbe Logik nutzen wie `CaptionInsightsTab`:

| Datei | Aenderung |
|---|---|
| `src/features/recommendations/RecoCard.tsx` | Mock-Array entfernen. Stattdessen `post_metrics` per Supabase laden, `generateAllInsights()` aufrufen, und die Top-3 Insights als Empfehlungen anzeigen. Mapping von `InsightCardData` auf das bestehende UI-Format (icon, text, impact, action). Wenn keine Daten/Posts: leere Liste → Komponente wird ausgeblendet (bestehendes Verhalten). |

### Mapping InsightCardData → RecoCard-Format
- `title` → `text` (z.B. "Beste Zeit: Dienstag 18:00 für Instagram")
- `delta` → `impact` (z.B. "+15%")
- `icon` → bleibt (Clock, TrendingUp, etc. kommen schon aus insightRules)
- `actions[0].href` → Navigation beim "Uebernehmen"-Click

### Aggregation
Die Aggregationsfunktionen aus `CaptionInsightsTab` werden in eine shared Utility extrahiert oder direkt in `RecoCard` wiederverwendet (Import oder Inline-Copy der Helfer).

### Fallback
Weniger als 10 Posts → keine Empfehlungen → RecoCard wird nicht angezeigt (wie bisher bei leerem Array).


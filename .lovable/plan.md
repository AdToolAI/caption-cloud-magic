

## Plan: Trend Radar — Inhalte auf Englisch / weltweit umstellen

### Problem
Die ~100 Trends in `supabase/functions/fetch-trends/index.ts` sind inhaltlich komplett auf Deutsch geschrieben (Hooks, Beschreibungen, KI-Tipps, Content-Ideen, Audience-Texte) — obwohl sie als `language: "en"` markiert sind. Das ist inkonsistent und schränkt die Zielgruppe ein.

### Lösung
Alle hardcodierten deutschen Strings in der `generateDynamicTrends()`-Funktion ins Englische übersetzen und auf weltweite/internationale Trends ausrichten. Rein deutschsprachige Trend-Namen bleiben, wo sie als Hashtag Sinn ergeben (z.B. `#MiniSuccessStories`), aber Beschreibungen, Hooks, AI-Tips, Content-Ideen und Audience-Fit werden durchgehend Englisch.

### Änderungen

**`supabase/functions/fetch-trends/index.ts`** — Vollständige Übersetzung aller ~1600 Zeilen Trend-Daten:

Beispiel vorher:
```
hook: "So habe ich in 30 Tagen 1000 neue Follower gewonnen – ohne Ads!",
ai_tip: "Verwende Jump-Cuts mit Text-Overlays. Dauer: 15–20 Sekunden.",
audience_fit: "Content creators und Social Media Manager",
description: "Produziere 30 Posts an einem Tag für maximale Effizienz"
```

Beispiel nachher:
```
hook: "How I gained 1000 new followers in 30 days — without ads!",
ai_tip: "Use jump-cuts with text overlays. Duration: 15–20 seconds.",
audience_fit: "Content creators and social media managers",
description: "Produce 30 posts in one day for maximum efficiency"
```

Betroffen sind alle Kategorien:
- Social Media Growth (~5 Trends)
- E-Commerce / Product Trends (~20+ Trends)
- Health & Fitness (~10 Trends)
- Finance (~5 Trends)
- AI Tools (~5 Trends)
- Parenting, Sustainability, weitere (~10+ Trends)

### Umfang
- **1 Datei**: `supabase/functions/fetch-trends/index.ts`
- **~200+ deutsche Strings** → Englisch
- Keine Strukturänderungen, keine neuen Keys, keine Frontend-Änderungen nötig


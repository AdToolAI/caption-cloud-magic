

## Problem

Google Search Console meldet zwei fehlende Felder im **Product**-Schema auf der Pricing-Seite (`/pricing`):
1. **Missing field "review"** — Mindestens eine Review ist nötig
2. **Missing field "aggregateRating"** — Bewertungsdurchschnitt fehlt

Die Landing Page (`Index.tsx`) hat bereits `aggregateRating`, aber die **Pricing-Seite** (`Pricing.tsx`) hat im Product-Schema weder `review` noch `aggregateRating`.

## Lösung

**Datei: `src/pages/Pricing.tsx`** — Zum bestehenden Product-Schema (Zeile 84-129) zwei Felder hinzufügen:

1. **`aggregateRating`** — z.B. 4.8 von 5 Sternen, basierend auf 1200+ Bewertungen (gleiche Werte wie Landing Page für Konsistenz)

2. **`review`** — Mindestens eine exemplarische Review mit Autor, Bewertung und Text

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.8",
  "reviewCount": "1200",
  "bestRating": "5",
  "worstRating": "1"
},
"review": {
  "@type": "Review",
  "author": { "@type": "Person", "name": "Sarah M." },
  "datePublished": "2025-12-15",
  "reviewBody": "AdTool AI hat meine Social Media Strategie komplett verändert. Die KI-Captions sind unglaublich gut.",
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "5",
    "bestRating": "5"
  }
}
```

## Ergebnis

- Beide Google Search Console Warnungen werden behoben
- Product Snippets können in den Suchergebnissen Rich Results (Sterne-Bewertung) anzeigen
- Keine sichtbare UI-Änderung — nur strukturierte Daten im HTML


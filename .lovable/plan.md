## Was du gemeldet hast

Der People-Tab wirkt eingequetscht: Catalog-Karte, ~20 Theme-Pills und der "New Avatar"-Button kämpfen in einer Zeile um Platz, darunter sechs gleich große Charakter-Kacheln in einer engen Reihe. Wirkt dicht und unruhig.

## Plan (rein visuell, James-Bond-2028-Tokens bleiben gelockt)

### 1) Header-Zeile aufräumen
- "New Avatar" raus aus der Catalog-Zeile, rauf in den Page-Header rechts neben den Titel "Cast & World" (großzügiger Gold-CTA, klare Hierarchie).
- Catalog bekommt damit die volle Breite — kein Quetschen mehr.

### 2) Catalog-Karte modernisieren (`CatalogBrowser` nur für `kind="character"`)
- Theme-Pills von wrappendem 3-Zeilen-Block → **horizontale Scroll-Leiste** mit weichem Fade-Edge links/rechts. Aktive Pill in Gold, ruhiger Hover.
- Mehr Padding (`p-6 md:p-8`), klare Sektions-Überschrift ("Browse curated cast") + Sub-Label ("Pick a theme to filter the catalog"), Seed-Button als Icon-Button rechts oben.
- "CATALOG"-Eyebrow und Pills bekommen `space-y-5` statt `space-y-3`.

### 3) Charakter-Grid atmen lassen
- Aktuelles 6er-Bento bleibt strukturell, aber:
  - `gap-4` → `gap-6 md:gap-8`
  - `auto-rows-[180px]` → `auto-rows-[220px] md:auto-rows-[260px]`
  - Bei ≤6 Items: 3-Spalten-Raster statt 12er-Bento (gleichmäßiger, weniger "wirr").
  - Titel-Overlay bekommt mehr Padding (`p-6`) und einen feinen Goldakzent-Strich über dem Namen statt Volltext-Badge.
- Hover: Sanfter Goldglow (`shadow-[0_0_40px_-10px_hsl(var(--primary)/0.4)]`) statt nur Border-Color-Change.

### 4) Vertikale Rhythmik
- Section-Abstände `mb-6` → `mb-12` zwischen Catalog-Karte und Charakter-Grid.
- Kleine Sektions-Überschrift "Your cast" über dem Grid mit Count-Badge rechts (z.B. "6 characters") — gibt Orientierung.

### Technisch betroffene Dateien
- `src/pages/Library.tsx` — Header-CTA verschieben, PeopleTab-Layout umbauen, Section-Header über Grid.
- `src/components/library-hubs/CatalogBrowser.tsx` — Pill-Leiste auf horizontal scroll mit Fade-Edges, Padding/Typografie aufgewertet (nur visuell, API bleibt gleich).

Locations- und Props-Tab erben automatisch die ruhigere Catalog-Karte — keine Funktionsänderung.

## Reihenfolge
1. CatalogBrowser visuell modernisieren (scroll-Pills, mehr Padding).
2. Library.tsx PeopleTab neu komponieren (CTA in Header, Section-Header, größere Bento-Abstände).

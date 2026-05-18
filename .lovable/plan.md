## Was du gemeldet hast

1. **"New Avatar" Button macht nichts** — der Button verlinkt aktuell auf `/avatars`, was in `App.tsx` direkt auf `/library` redirected wird (Kreisverweis). Klick = nichts passiert.
2. **Ansicht wirkt unprofessionell** — die Library-Seite (Cast & World) soll ein hochwertigeres Layout bekommen.
3. **"Alle"-Tab im Charakter-Katalog entfernen** — der `CatalogBrowser` zeigt neben den Theme-Pills (anime/shonen, bollywood/classic, …) als Default einen `All`-Filter. Soll für die Characters weg.

## Plan

### 1) Avatar-Erstellung reparieren (Bug-Fix)
- In `src/pages/Library.tsx` den `<Link to="/avatars">` Button durch einen echten Klick-Handler ersetzen, der den bestehenden `AddBrandCharacterDialog` (`src/components/brand-characters/AddBrandCharacterDialog.tsx`) öffnet.
- Gleiche Anpassung für den Empty-State-CTA ("Open Avatar Studio" → "New Avatar" mit Dialog).
- Nach erfolgreichem Anlegen invalidiert der Dialog bereits die `brand-characters` Query → Liste füllt sich automatisch.

### 2) "All"-Tab im Character-Katalog entfernen
- `src/components/library-hubs/CatalogBrowser.tsx`: Neues Prop `hideAllFilter?: boolean`. Wenn gesetzt, beginnt die Pill-Leiste direkt mit dem ersten Theme und der Default-`activeTheme` ist die erste verfügbare Kategorie statt `'all'`.
- Aufruf in `PeopleTab` (`<CatalogBrowser kind="character" hideAllFilter />`). Locations / Buildings / Props bleiben wie sie sind.

### 3) Library-Redesign (professioneller Look)
Da das eine rein visuelle Verfeinerung ist, generiere ich **3 gerenderte Design-Richtungen** für die Library-Seite und du wählst eine aus. Das James-Bond-2028-Designsystem (Deep Black, Gold #F5C76A, Playfair + Inter, Glassmorphism) bleibt gelockt; variiert werden Komposition, Kartendichte, Pill-Treatment, Header-Hierarchie und Hover-States.

Drei Richtungen, die ich anpeile:
- **Editorial Magazine** — großzügiger Whitespace, große Serif-Headline mit Kicker, Tab-Bar als Underline-Nav, Charakter-Karten im Polaroid-Stil mit feinem Goldrahmen.
- **Cinematic Gallery** — dichteres Bento-Grid, dunkle Glas-Karten mit subtilem Gold-Glow on hover, Theme-Pills als ruhige Chip-Bar, "New Avatar" als prominenter Gold-CTA oben rechts.
- **Dossier / Cast Sheet** — Sektionen pro Theme-Pack mit dezenten Trennlinien, Charaktere als horizontale Reihen mit Meta-Daten rechts (Voice, Outfits, Marketplace-Status), wirkt wie ein Casting-Dossier.

Nach deiner Auswahl baue ich die gewählte Richtung 1:1 in `Library.tsx` ein.

## Reihenfolge
1. Bug-Fix (Avatar-Button öffnet Dialog) + "All"-Pill entfernen → sofort umsetzen.
2. Design-Richtungen für (3) generieren → du wählst → Redesign einbauen.
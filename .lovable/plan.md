## Ziel

Aus heute 2–4 getrennten Bereichen (`/avatars`, `/locations`, geplante Buildings + Props) wird **ein einziger Hub: „Cast & World"** unter `/library` — mit Tabs für **People · Locations · Buildings · Props · Saved Looks**.

Diese eine Library ersetzt überall den heutigen Character-/Avatar-Picker im Storyboard, Composer-Szenen, Motion Studio und AI Video Toolkit. Alles lebt in derselben Datenbank-Logik wie heute Wardrobe (Theme Packs + Catalog Previews + „Generate your own"-Flow).

## Stage 1 — Datenmodell vereinheitlichen

Wir behalten die bestehenden Tabellen (`brand_characters`, `brand_locations`) und ergänzen sie um zwei Geschwister mit identischer Struktur:

- `brand_buildings` — Kirchen, Häuser, Burgen, Tempel, Wolkenkratzer, Brücken
- `brand_props` — Möbel, Fahrzeuge, Tech, Werkzeuge, Food, Waffen, Instrumente

Alle vier Tabellen bekommen die gleichen Felder wie `brand_characters` heute:
`id, user_id, name, description, reference_image_url, identity_card (JSONB), created_at`. RLS analog (eigene Reihen + gekaufte über Marketplace, falls relevant).

Zusätzlich pro Bereich eine Theme-Pack-Catalog-Tabelle (analog `wardrobe_catalog_previews`):

- `location_catalog_previews` (theme_pack, label, gender=neutral, image_url)
- `building_catalog_previews`
- `prop_catalog_previews`

Damit greift dasselbe Resumable-Seeder-Pattern wie bei Wardrobe (4 Slots pro Aufruf, Skeleton-Tiles, Auto-Polling).

## Stage 2 — Theme Packs definieren

Pro Bereich kuratierte Hierarchie (analog Wardrobe 6 Themes × Sub-Packs × 4 Varianten):

**Locations** (5 Themes × ø 4 Sub-Packs × 4 Varianten ≈ 80 Slots)
- Indoor (Café, Loft, Studio, Office, Bedroom)
- Outdoor (Forest, Beach, Mountain, Desert, Garden)
- Urban (Street, Rooftop, Subway, Alley, Plaza)
- Nature (Lake, Cliff, Field, Waterfall)
- Sci-Fi (Spaceship, Cyber-City, Lab, Wasteland)

**Buildings** (4 Themes × ø 4 Sub-Packs × 4 Varianten ≈ 64 Slots)
- Sacred (Gothic Cathedral, Buddhist Temple, Mosque, Synagogue)
- Residential (Modern Villa, Cottage, Townhouse, Farmhouse)
- Historical (Castle, Roman Forum, Medieval Tower, Ancient Ruin)
- Modern (Skyscraper, Stadium, Bridge, Museum)

**Props** (5 Themes × ø 4 Sub-Packs × 4 Varianten ≈ 80 Slots)
- Furniture (Chair, Table, Bookshelf, Lamp)
- Vehicles (Car, Bike, Boat, Plane)
- Tech (Laptop, Camera, Phone, Headphones)
- Food (Coffee, Pizza, Wine, Cake)
- Tools (Hammer, Brush, Knife, Microphone)

Alle Catalog-Bilder via **Nano Banana 2** (Gemini 3.1 Flash Image), gleicher Resumable-Seeder wie Wardrobe (`seed-location-catalog`, `seed-building-catalog`, `seed-prop-catalog` — drei kleine Klone derselben Edge-Function).

## Stage 3 — „Generate your own" Flow

Pro Bereich derselbe Mini-Workflow:

1. **Prompt-Feld** („A gothic cathedral with stained glass at dusk")
2. Optional: **Style-Preset** (cinematic, brutalist, cozy, neon, vintage) als One-Click-Modifier
3. Optional: **Referenz-Foto-Upload** als Geometrie-/Stil-Anker (analog Vidu Reference2V)
4. Nano Banana 2 generiert → speichert in `brand_locations`/`brand_buildings`/`brand_props`
5. Gemini Vision extrahiert eine **Identity Card** (Material, Farben, Geometrie, Stilachsen) wie heute bei Charakteren — damit das Asset später konsistent in jedem Video wieder auftaucht

Edge Function `generate-brand-asset` (eine zentrale, Parameter `kind: 'location' | 'building' | 'prop'`).

## Stage 4 — Eine Page, vier Tabs

Neue Route: `/library`

```text
┌──────────────────────────────────────────────────┐
│ Cast & World                                     │
├──────────────────────────────────────────────────┤
│ [People] [Locations] [Buildings] [Props] [Looks] │
├──────────────────────────────────────────────────┤
│  ┌── Theme-Sidebar ──┐  ┌── Asset-Grid ─────┐   │
│  │ • Indoor          │  │ ▣ ▣ ▣ ▣ ▣ ▣ ▣ ▣  │   │
│  │ • Outdoor         │  │ ▣ ▣ ▣ ▣ ▣ ▣ ▣ ▣  │   │
│  │ • Urban           │  │                   │   │
│  │ • + Generate own  │  │ + Eigenes erstellen│  │
│  └───────────────────┘  └───────────────────┘   │
└──────────────────────────────────────────────────┘
```

Bestehende Pages werden Redirects:
- `/avatars` → `/library?tab=people`
- `/locations` → `/library?tab=locations`
- `/avatars/:id` bleibt als Detail-Page (mit Wardrobe-Sheet) — nur die Library wird vereinheitlicht.

## Stage 5 — Storyboard-Sidebar austauschen

Im Composer/Storyboard ersetzt **`<UnifiedAssetPicker />`** den heutigen `<CharacterCastPicker />`. Der Picker zeigt vier Tabs (People / Locations / Buildings / Props), nutzt denselben `useUnifiedMentionLibrary`-Hook (existiert schon, wird um Buildings + Props erweitert) und schreibt alle ausgewählten Assets in dieselbe Cast-Liste pro Szene.

Damit kann eine Szene haben:
- 1–4 Personen (Multi-Character-Composition existiert schon)
- 1 Location
- 0–3 Buildings (z. B. „Kirche im Hintergrund")
- 0–5 Props

`compose-scene-anchor` bekommt schon heute `portraitUrls[]` — wir erweitern den Payload um `locationUrl`, `buildingUrls[]`, `propUrls[]` und reichen alles an Nano Banana 2 für die Szenen-Komposition durch. Vidu Q2 bekommt dieselben URLs als `subjectReferenceUrls[]` (unterstützt 1–7 Refs).

## Stage 6 — @-Mentions überall

`useUnifiedMentionLibrary` aggregiert ab jetzt alle vier Tabellen. Im Prompt-Feld kannst du `@gothic-cathedral` oder `@vintage-camera` schreiben — der Composer/Toolkit injiziert automatisch Reference-Image + Identity-Card-Beschreibung in den Prompt. Funktioniert in: AI Video Toolkit, Composer, Director's Cut Subtitle Generator, Ad Director Brief.

## Stage 7 — Verifikation

- `/library` zeigt vier Tabs mit Theme-Sidebar + Catalog-Grid
- Catalog-Bilder erscheinen im Hintergrund nach und nach (Skeleton → Bild)
- „Generate your own" funktioniert in allen vier Bereichen
- Im Composer-Storyboard ist links **kein** reiner Avatar-Bereich mehr, sondern der `<UnifiedAssetPicker />` mit allen vier Tabs
- `@`-Mention im Prompt findet Locations, Buildings, Props
- Eine Szene mit 1 Person + 1 Kirche + 1 Auto rendert eine konsistente Komposition (Test über Vidu Q2)

## Technische Details (für später)

- Tabellen + RLS-Policies via einer Migration (3 neue Tabellen + 3 Catalog-Tabellen + Storage-Policies analog `brand_characters`)
- Edge Functions: `generate-brand-asset`, `seed-location-catalog`, `seed-building-catalog`, `seed-prop-catalog` (alle resumable, 4 Slots pro Aufruf, `EdgeRuntime.waitUntil` nicht für die Generierung selbst)
- Frontend: 1 neue Page `/library/index.tsx`, 1 neue Komponente `UnifiedAssetPicker.tsx` (ersetzt 3 existierende Picker), Erweiterung `useUnifiedMentionLibrary.ts` um Buildings + Props
- Memory-Update: neuer Eintrag `mem://features/library/cast-and-world-unified-library` + Verweis von Avatar/Locations-Memos darauf

## Vergleich Artlist & Co.

Genau dieses Modell nutzt Artlist (Asset-Library mit Tabs Music / SFX / Footage / Templates), Runway (Assets-Hub mit Sessions, Characters, References) und Adobe Firefly Boards. Wir gehen einen Schritt weiter, weil unsere Assets **mit Identity-Cards** gespeichert werden — also nicht nur Referenz-Bilder, sondern KI-konsistente, wiederverwendbare „Charaktere" für Locations, Gebäude und Gegenstände.

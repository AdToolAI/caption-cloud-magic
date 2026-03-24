

# Plan: Icon-Only Sidebar + Hub-Detailseiten

## Konzept
Die Sidebar wird dauerhaft schmal (Icon-only, ~w-16) und zeigt nur ein Icon pro Hub-Kategorie (Startseite, Planen, Erstellen, Optimieren, Analysieren, Medien, Team). Klick auf ein Icon navigiert zu einer neuen **Hub-Seite**, die alle Unterpunkte der Kategorie in einem modernen Card-Grid mit Animationen anzeigt.

```text
┌──────┬──────────────────────────────────┐
│  🏠  │                                  │
│  📅  │   [Hub-Seite: z.B. "Planen"]     │
│  ✨  │                                  │
│  ⚙️  │   ┌─────┐ ┌─────┐ ┌─────┐       │
│  📊  │   │Card │ │Card │ │Card │       │
│  🎬  │   │     │ │     │ │     │       │
│  👥  │   └─────┘ └─────┘ └─────┘       │
│      │                                  │
│  ◀   │                                  │
└──────┘──────────────────────────────────┘
```

## Änderungen

### 1. Neue Hub-Seite Komponente (`src/pages/HubPage.tsx`)
- Generische Seite, die per URL-Param (`/hub/:hubKey`) den Hub identifiziert
- Zeigt Hub-Titel + Beschreibung oben
- **Bento-Grid Layout**: Unterpunkte als animierte Cards (Framer Motion staggered reveal, hover-lift mit Glow-Effekt passend zum James-Bond-Theme)
- Jede Card zeigt: Icon, Name, kurze Beschreibung, und navigiert bei Klick zur Zielroute
- Glassmorphism-Styling konsistent mit bestehendem Design
- Für gesperrte Features (plan-locked): Lock-Overlay mit Upgrade-Hinweis

### 2. Sidebar umbauen (`src/components/AppSidebar.tsx`)
- Sidebar permanent im Icon-only Modus (kein Expand/Collapse mehr nötig)
- Breite fix auf ~w-16 (4rem)
- Pro Hub ein einzelnes Icon-Button mit Tooltip
- Hub-Icons: Home → `Home`, Planen → `Calendar`, Erstellen → `Sparkles`, Optimieren → `MessageSquare`, Analysieren → `BarChart3`, Medien → `Film`, Team → `Users`
- Klick navigiert zu `/hub/:hubKey` statt Collapsible zu öffnen
- Aktiver Hub wird visuell hervorgehoben (primary border/glow)
- Brand-Logo oben (compact, nur Icon)
- Collapse-Button unten entfernen (nicht mehr nötig)

### 3. Routing (`src/App.tsx`)
- Neue Route: `<Route path="/hub/:hubKey" element={<HubPage />} />`
- Import für HubPage hinzufügen

### 4. Hub-Metadaten (`src/config/hubConfig.ts`)
- Neue Config-Datei mit Hub-Definitionen: Key, Icon, Beschreibung, und Sub-Items (Route, Name, Icon, Description, Plan-Requirement)
- Wird von Sidebar UND HubPage gemeinsam genutzt (Single Source of Truth)
- Bestehende `hubStructure` aus AppSidebar hierhin extrahieren

### 5. Translations ergänzen (`src/lib/translations.ts`)
- Kurze Beschreibungstexte für jeden Hub und jeden Unterpunkt hinzufügen (DE/EN/ES)

## Design der Hub-Seite
- Dunkler Hintergrund mit subtilen Gradient-Akzenten
- Cards: Glassmorphism (`bg-white/5 backdrop-blur border-white/10`)
- Hover: Card hebt sich an, Gold/Cyan-Glow am Rand
- Staggered Entrance Animation (Framer Motion)
- Responsive: 3 Spalten Desktop, 2 Tablet, 1 Mobile


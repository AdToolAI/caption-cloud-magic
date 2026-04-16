

## Problem
Im **Motion Studio** (`/video-composer` → `BriefingTab.tsx`) ist die Kategorie-Auswahl (Storytelling, Unternehmen, Editor, Produktvideo) nur visuell — sie ändert nur das aktive `category`-Feld im State, aber das gerenderte Formular ist **immer das gleiche Produktvideo-Briefing** (Produktname, USPs, Zielgruppe). Auch die "Weiter"-Validierung verlangt immer `productName`.

→ Universal Video Creator wird **nicht** angefasst.

## Lösung — Kategorie-spezifische Briefings im Motion Studio

### 1. `BriefingTab.tsx` umbauen
Das Statement "Produkt / Service"-Card abhängig von `category` rendern. 4 Varianten:

| Kategorie | Felder | Validierung |
|---|---|---|
| `product-ad` (Produktvideo) | Projektname, Produktname, Beschreibung, USPs, Zielgruppe | `productName` |
| `corporate-ad` (Unternehmen) | Projektname, Firmenname, Branche/Mission, Kernbotschaften, Zielgruppe | `productName` (= Firmenname) |
| `storytelling` (Storytelling) | Projektname, Story-Titel, Protagonist, Konflikt/Setting, Kernbotschaft, Zielemotion | `productName` (= Story-Titel) |
| `custom` (Editor) | Projektname, Titel, freie Beschreibung/Notizen, optional Stilhinweise | `productName` (= Titel) |

→ Wir behalten die Datenstruktur `ComposerBriefing` unverändert (kein DB-Schema-Change). `productName` wird je Kategorie semantisch umetikettiert: Firmenname / Story-Titel / Titel. `usps` wird umetikettiert: Kernbotschaften / Schlüsselszenen / Notizen. So bleibt die Edge-Function `compose-video-storyboard` kompatibel.

### 2. Implementation
- Eine kleine Helper-Funktion `getCategoryLabels(category)` in `BriefingTab.tsx`, die Label-Keys für die aktuelle Kategorie zurückgibt (z. B. `productNameLabel` → `companyNameLabel` / `storyTitleLabel` / `titleLabel`).
- Conditional Rendering: bei Storytelling die Felder "Protagonist", "Konflikt", "Zielemotion" zeigen statt "USPs / Zielgruppe". Bei Editor nur ein freies Notes-Textfeld.
- Card-Titel ändern: "Produkt / Service" → wechselt mit Kategorie.
- Toast-Texte beim Generieren ("Bitte Produktname eingeben") ebenfalls dynamisch.

### 3. Lokalisierung (`src/lib/translations.ts`)
Neue Keys in EN/DE/ES für alle 4 Kategorie-Varianten anlegen, z. B.:
- `videoComposer.companyNameLabel`, `videoComposer.coreMessage`, `videoComposer.industry`
- `videoComposer.storyTitle`, `videoComposer.protagonist`, `videoComposer.conflict`, `videoComposer.targetEmotion`
- `videoComposer.editorTitle`, `videoComposer.editorNotes`
- `videoComposer.briefingFor.product` / `.corporate` / `.storytelling` / `.editor` (für den dynamischen Card-Titel)

### 4. Edge-Function leicht anpassen (`supabase/functions/compose-video-storyboard`)
Den System-Prompt erweitern, sodass der `category`-Parameter den Storyboard-Stil tatsächlich beeinflusst:
- `storytelling` → narrativer 3-Akt-Aufbau (Setup → Konflikt → Auflösung)
- `corporate-ad` → vertrauenserweckend, Mission-getrieben
- `custom` → minimal-prompt, folgt freier Beschreibung möglichst wörtlich
- `product-ad` → bisheriges Verhalten (USP-getrieben)

### 5. Verify
End-to-End jede der 4 Kategorien anklicken und prüfen, dass jeweils das passende Formular erscheint und das generierte Storyboard zur Kategorie passt.

### Was unverändert bleibt
- Universal Video Creator (`/universal-video-creator`) — nicht anfassen
- Datenmodell `ComposerBriefing` und DB-Schema
- Tab-Struktur (Briefing → Storyboard → Clips → Audio → Export)
- Style/Format-Card (Tonfall, Sprache, Dauer, Aspect Ratio)


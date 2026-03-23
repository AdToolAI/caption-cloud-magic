

# Plan: KI Text-Studio — Prompt-Assistent als Dialog in den Caption-Generator integrieren

## Zusammenfassung
Der **Prompt-Assistent** wird als Slide-over-Dialog direkt in den **Caption-Generator** eingebettet. Beide Features leben dann unter dem neuen Namen **"KI Text-Studio"** auf einer einzigen Route (`/generator`). Die separate `/prompt-wizard`-Route wird als Redirect beibehalten (Backward-Compat). In der Sidebar erscheint nur noch ein Eintrag.

## Umsetzung

### 1. Neuer Dialog: `PromptAssistantDialog`
Neue Datei `src/components/generator/PromptAssistantDialog.tsx`:
- Sheet/Dialog, der von rechts einslided
- Enthält die komplette Prompt-Wizard-Logik (Plattform, Ziel, Tonalität, Keywords, Business-Typ)
- Ruft `generate-optimized-prompt` Edge Function auf
- "In Generator übernehmen"-Button setzt den generierten Prompt als Topic im Caption-Generator
- Zeigt Erklärung und Sample-Caption inline an

### 2. Generator-Seite erweitern (`Generator.tsx`)
- Button "Prompt-Assistent" neben dem Topic-Eingabefeld hinzufügen (Wand2-Icon)
- Öffnet den `PromptAssistantDialog`
- Callback `onPromptGenerated` setzt den optimierten Prompt direkt ins Topic-Feld

### 3. Hero-Header umbenennen (`GeneratorHeroHeader.tsx`)
- Badge-Text: "KI-Caption-Generator" → "KI Text-Studio"
- Headline anpassen auf "KI Text-Studio"
- Subtitle: Hinweis auf integrierten Prompt-Assistenten

### 4. Sidebar anpassen (`AppSidebar.tsx`)
- Den `/prompt-wizard`-Eintrag entfernen
- Den `/generator`-Eintrag umbenennen: `titleKey` → `"nav.textStudio"` mit neuem Icon (z.B. `PenTool` oder `Sparkles`)

### 5. Translations aktualisieren (`translations.ts`)
- Neuer Key `nav.textStudio: "KI Text-Studio"`
- Bestehende Wizard-Translations bleiben (werden im Dialog verwendet)

### 6. Route-Redirect (`App.tsx`)
- `/prompt-wizard` → Redirect zu `/generator` (damit alte Links/Bookmarks funktionieren)

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `src/components/generator/PromptAssistantDialog.tsx` | Neu — Dialog mit Prompt-Wizard-Logik |
| `src/pages/Generator.tsx` | Button + Dialog-Integration |
| `src/components/generator/GeneratorHeroHeader.tsx` | Umbenennung zu "KI Text-Studio" |
| `src/components/AppSidebar.tsx` | Prompt-Wizard-Eintrag entfernen, Generator umbenennen |
| `src/lib/translations.ts` | Neuer `nav.textStudio`-Key |
| `src/App.tsx` | Redirect `/prompt-wizard` → `/generator` |


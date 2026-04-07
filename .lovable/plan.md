

## Plan: Fehlende Gaming-Hub-Übersetzungen ergänzen

### Problem
Die Gaming-Hub-Seite zeigt rohe Übersetzungs-Keys (`hubs.gaming`, `hubDesc.gaming`, `hubItemDesc.streamDashboard`, etc.) statt echtem Text, weil die Einträge in `src/lib/translations.ts` fehlen.

### Änderung

**Datei: `src/lib/translations.ts`** — In allen drei Sprach-Sektionen (EN, DE, ES) folgende Keys hinzufügen:

**`hubs`-Objekt:** `gaming: "Gaming"`

**`hubDesc`-Objekt:** `gaming: "Stream tools, clip creator & content automation for gamers"` (EN) / `"Stream-Tools, Clip-Creator & Content-Automation für Gamer"` (DE) / `"Herramientas de streaming, clips y automatización para gamers"` (ES)

**`hubItemDesc`-Objekt** — 5 neue Keys:
- `streamDashboard`: Stream Dashboard Beschreibung
- `clipCreator`: Clip Creator Beschreibung
- `gamingContent`: Gaming Content Studio Beschreibung
- `streamAnalytics`: Stream Analytics Beschreibung
- `chatManager`: Chat Manager Beschreibung
- `community`: Community Beschreibung (ebenfalls fehlend)
- `videoTranslator`: Video Translator Beschreibung (falls fehlend)


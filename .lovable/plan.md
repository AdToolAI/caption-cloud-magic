

# Plan: VoicePro + Voice Library zusammenführen

## Zusammenfassung
Die **Voice Library** (Custom Voice Verwaltung, Voice Cloning) wird als neuer Tab in **VoicePro** (AudioStudio) integriert. Die separate `/voice-library`-Route wird als Redirect beibehalten. In der Sidebar bleibt nur ein Eintrag: **VoicePro**.

## Umsetzung

### 1. Neuen Tab „Voices" in AudioStudio hinzufügen (`AudioStudio.tsx`)
- Neuen Tab `voices` in die Tab-Navigation einfügen (Icon: `Mic`, Label: „Custom Voices")
- Tab zeigt die Voice Library inline an (Custom Voices Grid + Voice Clone Button)
- Der Tab ist **immer verfügbar** (auch ohne geladenes Audio), daher muss der Tab-Bereich auch im Upload-Screen erreichbar sein — oder besser: den Voices-Tab als eigenständigen Bereich neben dem Upload anzeigen

### 2. Voice Library als eingebettete Komponente extrahieren
- Neue Datei `src/components/audio-studio/VoiceLibraryPanel.tsx`
- Enthält die gesamte Logik aus `VoiceLibrary.tsx` (Voices-Grid, Play/Pause, Delete, Active-Toggle)
- Inkl. `VoiceCloneDialog`-Trigger
- Wird im `voices`-Tab des AudioStudios gerendert

### 3. Sidebar bereinigen (`AppSidebar.tsx`)
- Eintrag `/voice-library` entfernen
- `/audio-studio` bleibt als „VoicePro"

### 4. Route-Redirect (`App.tsx`)
- `/voice-library` → Redirect zu `/audio-studio` (Backward-Compat)
- `VoiceLibrary.tsx` Seite löschen

### 5. Command-Bar/Palette bereinigen
- Voice-Library-Einträge in `CommandBar.tsx` und `CommandPalette.tsx` entfernen oder auf `/audio-studio` umleiten

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/audio-studio/VoiceLibraryPanel.tsx` | Neu — Voice-Verwaltung als Panel |
| `src/pages/AudioStudio.tsx` | Neuer Tab „Custom Voices" mit VoiceLibraryPanel |
| `src/pages/VoiceLibrary.tsx` | Löschen |
| `src/components/AppSidebar.tsx` | `/voice-library`-Eintrag entfernen |
| `src/App.tsx` | Redirect `/voice-library` → `/audio-studio`, Import entfernen |
| `src/components/ui/CommandBar.tsx` | Voice-Library-Eintrag anpassen |
| `src/components/CommandPalette.tsx` | Voice-Library-Command anpassen |


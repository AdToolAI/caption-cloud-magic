

## Befund
Aktuell hat das Motion Studio 5 Tabs: **Briefing → Storyboard → Clips → Audio → Export**. Pro Szene-Card im Storyboard ist ein "Text-Overlay"-Collapsible eingebaut (Zeile 281–383 in `SceneCard.tsx`) — das wirkt überladen, die Untertitel-Logik fehlt komplett, und Text-Settings sind zwischen Prompt + Übergang gequetscht → unprofessionell.

User möchte: **eigener Tab "Text & Untertitel"** zwischen "Clips" und "Audio".

## Plan — Neuer Tab "Text & Untertitel"

### 1. Neuer Tab in der Navigation
`VideoComposerDashboard.tsx`: 6 Tabs statt 5
- Briefing → Storyboard → Clips → **Text** → Audio → Export
- Neues Icon: `Type` (lucide)
- Tab erst zugänglich, wenn mindestens 1 Szene existiert (gleiche Logik wie Audio)

### 2. Neue Komponente `TextSubtitlesTab.tsx`
Pro Szene aufgelistet (kompakte Liste mit Thumbnail + Szenenname), aufklappbar:
- **Text-Overlay-Editor** (umgezogen aus `SceneCard`): Text, Position, Animation, Farbe, Schriftgröße, Konflikt-Hinweis
- **Live-Preview-Mini** (Thumbnail + Text-Position-Indikator als Overlay)
- "Auf alle Szenen anwenden"-Button (Position/Farbe/Animation als Style-Preset)

Zusätzlich am Tab-Anfang **Globale Untertitel-Sektion**:
- Toggle "Automatische Untertitel generieren" (basierend auf Voiceover/Audio später im Audio-Tab erkannt)
- Style-Picker: Schriftart, Größe, Farbe, Hintergrund-Box, Position (top/bottom)
- Sprach-Auswahl (DE/EN/ES — default = Projekt-Sprache)
- Hinweis-Banner: "Untertitel werden im Export aus dem Voiceover automatisch transkribiert"

### 3. Datenmodell
- Pro-Szene-Overlay bleibt unverändert (`scene.textOverlay`) — wird nur in den neuen Tab verschoben
- Neuer Block in `assemblyConfig`: `subtitles: { enabled, language, style: { font, size, color, background, position } }`
- DB-Migration: `composer_projects` erhält `subtitles_config jsonb` (default off)

### 4. Aufräumen `SceneCard.tsx`
- Komplettes Text-Overlay-Collapsible (Zeile 281–383) **entfernen**
- Stattdessen kleiner Status-Hinweis: "📝 Text & Untertitel werden im Tab 'Text' bearbeitet"
- Karte wird ~30% kürzer → professioneller, fokussiert auf Clip-Generierung

### 5. Lokalisierung
Neue Keys in `translations.ts` (DE/EN/ES):
- `videoComposer.text` ("Text"), `videoComposer.textSubtitles` ("Text & Untertitel")
- Sektions-Labels, Buttons, Hinweise — analog vorheriger Pattern

### 6. Export-Anpassung
`AssemblyTab.tsx` / Render-Pipeline liest `subtitles_config` aus `assemblyConfig` und gibt es an die Render-Edge-Function weiter (snake_case `subtitles_config`).

## Geänderte / Neue Dateien
**Neu**:
- `src/components/video-composer/TextSubtitlesTab.tsx`
- DB-Migration: `composer_projects.subtitles_config jsonb`

**Bearbeitet**:
- `src/components/video-composer/VideoComposerDashboard.tsx` — 6. Tab + Routing
- `src/components/video-composer/SceneCard.tsx` — Overlay-Editor entfernt, Hinweis stattdessen
- `src/components/video-composer/AssemblyTab.tsx` — `subtitles_config` ans Render-Backend mitsenden
- `src/types/video-composer.ts` — `SubtitlesConfig` Type + Default
- `src/lib/translations.ts` — neue Keys (DE/EN/ES)

## Verify
- Motion Studio zeigt 6 Tabs: Briefing → Storyboard → Clips → **Text** → Audio → Export
- Storyboard-Karten sind aufgeräumt (kein Text-Overlay mehr inline)
- Im neuen Text-Tab: globale Untertitel-Settings + pro-Szene-Overlay-Editor mit Live-Preview-Indikator
- Bestehende Drafts mit Text-Overlays migrieren sauber (Daten bleiben in `scene.textOverlay`)
- Export berücksichtigt sowohl pro-Szene-Overlays als auch globale Untertitel

## Was unverändert bleibt
- Storyboard-Generierung, Clip-Pipeline, Audio-Tab, Pricing
- Bestehende Szenen-Daten (`textOverlay` bleibt im Schema)


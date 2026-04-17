

## Befund
Aktuell hat Motion Studio 6 Tabs: Briefing → Storyboard → Clips → **Text** (nur Overlays + Untertitel-Style) → **Audio** (Voiceover + Musik) → Export.

User möchte Umstrukturierung analog Universal Content Creator:
- **Step 4 (Text)** → wird zu **"Voiceover & Untertitel"**: Voiceover-Generierung (umgezogen aus Audio) + automatische Untertitel-Generierung **aus dem Voiceover** (analog `SubtitleTimingStep` mit `generate-subtitles` Edge-Function) + Text-Overlays pro Szene bleiben unten
- **Step 5 (Audio)** → wird zu **"Musik"**: nur noch Hintergrundmusik + Beat-Sync

So viele Premium-Stimmen wie möglich (gleicher `list-voices`-Loader + `sortVoicesPremiumFirst` wie ContentVoiceStep — der bereits alle ElevenLabs-Premium-Stimmen lädt).

## Plan

### 1. `TextSubtitlesTab.tsx` → `VoiceSubtitlesTab.tsx` umbauen
Neue Reihenfolge in der Komponente (von oben nach unten):

**A. Sequenz-Preview-Player** (bleibt oben, unverändert)

**B. Voiceover-Sektion** (umgezogen aus `AudioTab`)
- Toggle "Voiceover aktivieren"
- Sprach-Tabs DE/EN/ES (gleiches Pattern wie AudioTab Zeile 257-266)
- Premium-Voice-Dropdown mit `list-voices` + `sortVoicesPremiumFirst` + Premium-Badge + `VoicePreviewButton`
- Erweitert: Voice-Cards-Liste statt nur Dropdown (analog `ContentVoiceStep` für mehr Übersicht über alle Premium-Stimmen)
- Script-Textarea + "Aus Szenen-Texten generieren"-Button
- Generate-Button → ruft `generate-voiceover` mit `voice_settings` aus `recommended_settings` (für natürlicheren Klang) und `model_id` aus `recommended_model`
- Audio-Preview mit Play/Pause

**C. Automatische Untertitel-Sektion** (neu, analog `SubtitleTimingStep`)
- Toggle "Untertitel automatisch generieren"
- Button "Untertitel aus Voiceover generieren" → ruft `generate-subtitles` Edge-Function mit `audioUrl = voiceover.audioUrl` 
- Hinweis falls noch kein Voiceover: "Generiere zuerst dein Voiceover oben"
- Style-Picker (bleibt wie aktuell: Schriftart, Größe, Farbe, Hintergrund, Position)
- Liste der generierten Segmente mit Edit/Delete (kompakt, max-h-64)
- Speichert Segmente in `assemblyConfig.subtitles.segments`

**D. Text-Overlays pro Szene** (bleibt unten, unverändert)

### 2. Datenmodell — `SubtitlesConfig` erweitern
```ts
export interface SubtitlesConfig {
  enabled: boolean;
  language: string;
  style: { font, size, color, background, position };
  segments?: Array<{ id, text, startTime, endTime, words? }>; // NEU
}
```
Keine DB-Migration nötig (`subtitles_config` ist bereits `jsonb`).

### 3. `AudioTab.tsx` → `MusicTab.tsx` reduzieren
- Voiceover-Sektion komplett entfernen (Zeile 230-341)
- Nur noch: Hintergrundmusik-Suche + Beat-Sync
- "Weiter zu Export"-Button bleibt

### 4. `VideoComposerDashboard.tsx` — Tab-Labels & Icons
- Tab "text": Label `videoComposer.voiceSubtitles` ("Voiceover & Untertitel" / "Voice & Subtitles" / "Voz y Subtítulos"), Icon `Mic` statt `Type`
- Tab "audio": Label bleibt "Musik" / "Music" / "Música", Icon `Music` (bereits korrekt)
- Routing unverändert

### 5. Export-Anpassung (`AssemblyTab`)
- `subtitles_config.segments` mit ans Render-Backend senden (snake_case `segments`) — Render-Pipeline kann dann eingebrannte Untertitel mit echten Timings rendern statt nur Style

### 6. Lokalisierung
Neue Keys in `translations.ts` (DE/EN/ES):
- `voiceSubtitles`, `generateSubsFromVo`, `noVoiceoverYet`, `subSegmentsGenerated`, `musicOnly`, etc.

## Geänderte Dateien
- `src/components/video-composer/TextSubtitlesTab.tsx` → umbenennen/umbauen zu `VoiceSubtitlesTab.tsx` (Voiceover oben, Untertitel-Generierung Mitte, Overlays unten)
- `src/components/video-composer/AudioTab.tsx` → auf reine Musik-Verwaltung reduzieren
- `src/components/video-composer/VideoComposerDashboard.tsx` — Tab-Label & Icon
- `src/components/video-composer/AssemblyTab.tsx` — `subtitles.segments` mit exportieren
- `src/types/video-composer.ts` — `SubtitlesConfig.segments` ergänzen
- `src/lib/translations.ts` — neue Keys

## Verify
- Step 4 heißt "Voiceover & Untertitel" mit Mic-Icon
- Voiceover-Generierung mit allen Premium-Stimmen (DE/EN/ES Tabs, ~10+ Stimmen pro Sprache, Premium-Badges, Hörprobe-Button)
- Button "Untertitel aus Voiceover generieren" produziert Segmente mit Timings → erscheinen in Liste
- Step 5 heißt nur noch "Musik" — keine Voiceover-Optionen mehr
- Untertitel-Style + Segmente werden im Export-Render mit korrekten Timings eingebrannt
- Bestehende Drafts laden sauber (Voiceover bleibt in `assemblyConfig.voiceover`)

## Was unverändert bleibt
- Premium-Voice-Backend (`list-voices`, `generate-voiceover`), `generate-subtitles` Edge-Function
- DB-Schema, Pricing, Storyboard/Clips/Briefing/Export-Tabs
- Sequenz-Preview oben im Tab
- Text-Overlay-Editor pro Szene unten




## Befund

In `VideoComposerDashboard.tsx` springt der Button im **Clips-Tab** (`onGoToAudio`) direkt zum `audio`-Tab (Musik) und überspringt damit den `text`-Tab (Voiceover & Untertitel). Auch der `VoiceSubtitlesTab` selbst springt mit `onGoToAudio` direkt zu Musik weiter — also gibt es **zwei** Stellen, an denen der logische Schritt fehlt.

Korrekte Reihenfolge laut Tab-Bar: `Briefing → Storyboard → Clips → Voiceover & Untertitel → Musik → Export`

## Plan

### 1. ClipsTab: nach „Voiceover & Untertitel" weiterleiten statt zu Audio
- In `VideoComposerDashboard.tsx` (Zeile 419): Prop umbenennen zu `onGoToVoiceSubtitles` und auf `setActiveTab('text')` zeigen lassen.
- In `ClipsTab.tsx` (Zeile 305 + 309): Button-Beschriftung auf **„Weiter zu Voiceover & Untertitel"** ändern, Prop entsprechend umbenennen.
- Übersetzung in `src/lib/translations.ts`: neuen Key `continueToVoiceSubtitles` für DE/EN/ES hinzufügen (z. B. „Weiter zu Voiceover & Untertitel" / „Continue to Voiceover & Subtitles" / „Continuar a voz en off y subtítulos").

### 2. (Bereits vorhanden, nur prüfen) VoiceSubtitlesTab → AudioTab
- `VoiceSubtitlesTab` ruft schon `onGoToAudio` auf → führt korrekt von Text/Voiceover zu Musik. Hier nichts ändern.

### 3. Optional: Tab-Reihenfolge visuell klarer machen
- Nicht nötig — Reihenfolge in `TABS` (Zeile 268–275) stimmt bereits.

## Geänderte Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx` — `onGoToAudio` im ClipsTab → `onGoToVoiceSubtitles` mit `setActiveTab('text')`
- `src/components/video-composer/ClipsTab.tsx` — Prop umbenennen, Button-Label auf „Weiter zu Voiceover & Untertitel"
- `src/lib/translations.ts` — neuer Key `continueToVoiceSubtitles` (DE/EN/ES)

## Verify

1. Im Composer alle Clips generieren → Button im Clips-Tab heißt jetzt **„Weiter zu Voiceover & Untertitel"**
2. Klick darauf öffnet den Voiceover-Tab (nicht mehr Musik)
3. Im Voiceover-Tab führt der „Weiter zu Musik"-Button korrekt zu Musik
4. Sprachwechsel (DE/EN/ES) zeigt das neue Label korrekt übersetzt




## Befund

Drei zusammenhängende Probleme im Tab "Voiceover & Untertitel":

### 1. Zweiter "Player" unten = Style-Live-Preview
Zeile 663–679 in `VoiceSubtitlesTab.tsx` rendert eine separate `aspect-video`-Box, die nur einen statischen Untertitel-Platzhalter zeigt. Im Screenshot ist das der große schwarze leere Kasten unter den Segmenten. Wirkt unprofessionell und doppelt sich mit dem oberen Preview-Player.

### 2. Echte Untertitel werden nicht im Player angezeigt
In `ComposerSequencePreview.tsx` Zeile 232–249 wird ein **statischer Platzhalter-Text** (`subtitlesPreviewLine`) gerendert — unabhängig davon, ob bereits Segmente existieren. Die generierten 16 Segmente aus `subtitles.segments` werden **nirgends** zeitsynchron eingeblendet.

### 3. Voiceover-Audio nicht im Hauptplayer
Der Voiceover-Sound wird nur über einen separaten Mini-Play-Button (Zeile 458) wiedergegeben. Im Hauptplayer läuft er nicht mit → man kann generierte Untertitel gar nicht synchron erleben.

## Plan

### A. Style-Live-Preview entfernen (Zeile 663–679)
Die separate Vorschaubox komplett rauswerfen. Style-Änderungen sind im oberen Player live sichtbar (siehe Schritt B).

### B. Echte zeitsynchrone Untertitel im Hauptplayer
In `ComposerSequencePreview.tsx`:
- Den Platzhalter-Block (Zeile 232–249) **ersetzen** durch:
  - Wenn `subtitles.segments?.length > 0`: das Segment finden, dessen `[startTime, endTime]` den aktuellen `globalTime` enthält → dessen `text` rendern.
  - Wenn keine Segmente, aber `subtitles.enabled`: dezenter "Noch keine Untertitel generiert"-Hinweis (statt fixer Platzhalter), klein und nur als Hilfe.
- Styling (Font, Größe, Farbe, Position, Background) aus `subtitles.style` weiterhin anwenden.

### C. Voiceover-Audio in Hauptplayer integrieren
In `ComposerSequencePreview.tsx`:
- Neuen Prop `voiceoverUrl?: string` akzeptieren.
- Verstecktes `<audio>`-Element parallel zur Video-Wiedergabe steuern:
  - Bei `togglePlay`: Audio mit-starten/pausieren.
  - Bei `handleScrub`: `audio.currentTime = globalTime` setzen.
  - Beim Wechsel zwischen Szenen NICHT neu starten (das Audio läuft linear über das gesamte Video).
- Mute-Knopf steuert künftig **Voiceover** (Szenen-Clips bleiben sowieso meist stumm).

### D. Mini-Play-Button entfernen
In `VoiceSubtitlesTab.tsx` den separaten Play/Pause-Button (Zeile 457–461) und `toggleVoPreview`/`voAudioRef`-State **entfernen** — Wiedergabe erfolgt zentral im Hauptplayer.

### E. Prop-Durchreichung
- `<ComposerSequencePreview ... voiceoverUrl={voiceover?.audioUrl} />` in `VoiceSubtitlesTab.tsx`

### F. Optional: kleiner UX-Hinweis
Über dem Player-Kasten ein dezenter Status-Chip wenn Voiceover & Untertitel beide vorhanden sind: "🎙️ Voiceover · 16 Untertitel" damit klar ist, was abgespielt wird.

## Geänderte Dateien
- `src/components/video-composer/ComposerSequencePreview.tsx` — neuer `voiceoverUrl`-Prop, Audio-Element, zeitsynchroner Untertitel-Renderer (statt Platzhalter)
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Style-Preview-Box weg, Mini-Play-Button weg, `voiceoverUrl` durchreichen
- `src/lib/translations.ts` — neuer Key z.B. `videoComposer.subtitlesEmptyHint` (DE/EN/ES)

## Verify
- Tab "Voiceover & Untertitel": **kein** zweiter Player-Kasten unten mehr
- Untertitel generieren → die generierten Segmente erscheinen **zeitsynchron im oberen Player** während der Wiedergabe
- Beim Drücken von ▶ im oberen Player läuft das **Voiceover gleichzeitig** mit dem Video
- Scrubben in der Timeline springt Video + Voiceover gemeinsam
- Mute-Button schaltet Voiceover stumm
- Style-Änderungen (Farbe, Font, Position) sind live im oberen Player sichtbar


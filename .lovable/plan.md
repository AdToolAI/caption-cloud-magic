## Ziel
Voiceover im Universal Content Creator wird **frei auf der Timeline platzierbar**: ein Eingabefeld + Slider im Voiceover-Bereich bestimmt, ab welcher Sekunde/Millisekunde das VO startet. Gilt für **alle Voiceover-Quellen** (ElevenLabs, geklonte Stimmen, hochgeladene MP3s) — der Offset lebt zentral im Payload, nicht am Modell.

## Änderungen

### 1) Datenmodell — Startzeit im ContentConfig
`src/types/universal-creator.ts` → `ContentConfig`:
- `voiceoverStartTime?: number` — Sekunden (Float, ms-genau), default `0`.

### 2) UI — Timing-Control im Voiceover-Bereich
Direkt unter Lautstärke/Stimme im bestehenden Voiceover-Panel (ContentVoiceStep bzw. Audio-Step):
- Nummern-Input „Start bei" mit Sekunden (Float, Schritt `0.01`, Suffix „s") — für ms-genaue Eingabe.
- Slider `0` … `max(0, videoDuration - voDuration)` in `0.05s`-Schritten.
- Drei Presets: **Am Anfang** (0s) · **Mitte** (`(videoDuration - voDuration)/2`) · **Am Ende** (`videoDuration - voDuration`).
- Live-Anzeige: „VO läuft von 4.20s bis 12.70s (Video 20.00s)".
- Warnhinweis wenn `start + voDuration > videoDuration` (VO wird abgeschnitten).
- Feld ist deaktiviert, solange kein VO vorhanden ist.

### 3) Preview-Player synchron
`src/components/universal-creator/RemotionPreviewPlayer.tsx`:
- `voiceoverStartTime` aus `customizations` in `previewAudio` übernehmen.
- Im Timeupdate-Loop: VO-`<audio>` erst starten wenn `playerTime >= startTime`; davor `pause()` + `currentTime = 0`. Bei Seek: `audio.currentTime = max(0, playerTime - startTime)`.

### 4) Render-Payload — eine Quelle der Wahrheit
`src/lib/universalCreatorRenderPayload.ts`:
- `voiceoverStartTime` aus `contentConfig` in den Payload übernehmen, geclamped auf `[0, videoDuration]`, default `0`. Gilt automatisch für jede VO-Quelle, weil alle über dasselbe Feld laufen.

### 5) Remotion-Template — Offset zentral anwenden
`src/remotion/templates/UniversalCreatorVideo.tsx`:
- Zod: `voiceoverStartTime: z.number().min(0).default(0)`.
- Beide bestehenden `<Audio src={voiceoverUrl} …>`-Stellen in `<Sequence from={Math.round(voiceoverStartTime * fps)}>…</Sequence>` wrappen. Damit ist der Offset für Preview und finalen MP4-Export identisch, unabhängig vom TTS-Provider. Raw-Media-Invariante bleibt unberührt.

### 6) Backwards-Compat
- Fehlt das Feld (alte Projekte/Payloads), gilt `0` → identisches Verhalten wie heute.

## Nicht Teil dieses Plans
- Mehrere VO-Clips auf einer Timeline (bleibt Director's Cut).
- Fade-In/Out fürs VO (separater Plan, falls gewünscht).
- Änderungen am Director's Cut oder an TTS-Edge-Functions.

## Verifikation
- Eingabe `3.25s` → Preview startet VO exakt bei 3.25s, auch nach Seek.
- Presets „Anfang/Mitte/Ende" setzen korrekte Werte, Overflow-Warnung erscheint bei zu spätem Start.
- Finaler MP4-Export platziert VO an derselben Position wie das Preview.
- Verhalten identisch für ElevenLabs-VO, geklonte Stimme und hochgeladene MP3.
- Alte Projekte ohne `voiceoverStartTime` laufen unverändert (Start bei 0).
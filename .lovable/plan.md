

## Plan: Lautstärkeregler für Voiceover und Musik in Step 2

### Was gebaut wird

Zwei Lautstärke-Slider in der `ContentVoiceStep` (Step 2 "Content & Voice"):

1. **Voiceover-Lautstärke** (0–100%) — erscheint nach erfolgreicher Voiceover-Generierung, direkt im "Audio Vorschau"-Bereich
2. **Hintergrundmusik-Lautstärke** (0–100%) — erscheint sobald Musik ausgewählt wurde (wird aus Step 4 audioConfig gelesen)

Beide Werte fließen direkt in Preview und Export ein.

### Technische Umsetzung

**1. `ContentConfig` erweitern** (`src/types/universal-creator.ts`)
- Neues Feld: `voiceoverVolume?: number` (0–1, Default 1.0)

**2. `ContentVoiceStep.tsx` — Voiceover-Lautstärke-Slider**
- Im "Audio Vorschau"-Card (nach der Play/Pause-Steuerung) einen Slider (0–100%) hinzufügen
- Wert wird via `onChange` in `contentConfig.voiceoverVolume` gespeichert
- Preview-Audio (`audio.volume`) wird live synchronisiert

**3. `UniversalCreator.tsx` — Voiceover-Volume durchreichen**
- Remotion Preview (Zeile 508): `voiceoverVolume` aus `contentConfig` übergeben
- Export-Step: `voiceoverVolume` an `PreviewExportStep` weiterreichen

**4. `UniversalVideo.tsx` (Remotion Template) — Voiceover-Volume nutzen**
- Schema: `voiceoverVolume: z.number().optional()` hinzufügen
- `AudioLayer`: neuen Prop `voiceoverVolume` akzeptieren, statt hardcoded `1.0`
- Props durchreichen

**5. `render-universal-video/index.ts` — Volume aus Request nutzen**
- `voiceoverVolume` aus dem Request-Body lesen statt hardcoded `1`

**6. Musik-Lautstärke in Step 2** (optional, da Slider bereits in Step 4 existiert)
- Einen kompakten Musik-Volume-Slider in Step 2 einbauen, der `audioConfig.music_volume` steuert
- Dazu muss `audioConfig` + `setAudioConfig` an `ContentVoiceStep` übergeben werden

### Betroffene Dateien

1. `src/types/universal-creator.ts` — `voiceoverVolume` Feld
2. `src/components/universal-creator/steps/ContentVoiceStep.tsx` — beide Slider
3. `src/pages/UniversalCreator/UniversalCreator.tsx` — Props durchreichen
4. `src/remotion/templates/UniversalVideo.tsx` — voiceoverVolume im AudioLayer
5. `supabase/functions/render-universal-video/index.ts` — voiceoverVolume aus Request


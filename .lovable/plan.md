## Problem

Der Lautstärke-Slider in **Step 4 (Audio)** ändert im finalen Export-Video nichts. Zwei Ursachen:

1. **Musik landet gar nicht im Render.** In `src/pages/UniversalCreator/UniversalCreator.tsx` (Zeile 65) gibt es einen State `selectedMusicUrl`, aber dessen Setter `setSelectedMusicUrl` wird **nirgendwo aufgerufen**. Der `AudioAssetSelector` liefert nur die `background_music_id`. Im Render-Payload steht `...(selectedMusicUrl && { backgroundMusicUrl, backgroundMusicVolume })` — d.h. weil `selectedMusicUrl` immer `null` bleibt, wird **weder URL noch Volume** an Remotion geschickt. Deshalb spielt entweder gar keine Musik oder ein hartkodiertes Default — und der Slider hat keinen Effekt.

2. **Volume ist linear.** Selbst wenn Musik ankommt, ist Remotions `<Audio volume>` linear. 0.3 klingt gefühlt wie ~55 %, weil menschliches Hören logarithmisch ist. Zusätzlich wird gegen das Voiceover nicht geduckt.

## Änderungen

### A) `selectedMusicUrl` sauber auflösen — Slider bekommt überhaupt etwas zu steuern

**Datei:** `src/components/universal-creator/AudioAssetSelector.tsx`
- Neuer optionaler Prop `onMusicUrlChange?: (url: string | null) => void`.
- Immer wenn `onMusicSelect(id)` gerufen wird (Library-Klick, Stock-Add, Upload, „Remove"), zusätzlich `onMusicUrlChange(track.url ?? null)` aufrufen. Wir haben die URL an all diesen Stellen bereits in der Hand.

**Datei:** `src/pages/UniversalCreator/UniversalCreator.tsx`
- Callback im Audio-Step verdrahten: `onMusicUrlChange={setSelectedMusicUrl}`.
- Zusätzlich Reload-Safety-Net: `useEffect` — falls `background_music_id` beim Reload gesetzt ist und `selectedMusicUrl` noch `null`, aus `universal_audio_assets` per ID nachladen und setzen.

### B) Perzeptive Lautstärke + Voiceover-Ducking

An **beiden** Stellen, wo `backgroundMusicVolume` ins Payload geht (Live-Preview `UniversalCreator.tsx` Zeile 478–481 und finaler Render in `PreviewExportStep.tsx` Zeile 344):

```ts
const hasVO = !!contentConfig?.voiceoverUrl;
const raw = audioConfig.music_volume;                // 0..1 vom Slider
const perceptual = raw * raw;                        // gefühlt linear
const duckFactor = hasVO ? 0.5 : 1.0;                // -6 dB unter VO
backgroundMusicVolume: Math.max(0, Math.min(1, perceptual * duckFactor)),
```

Ergebnis: Slider auf 30 % → real ~4,5 % unter Sprache, klingt wie ein Musikbett statt wie ein Konkurrent zum VO. Slider-UI bleibt 0–100 %.

### C) Slider auch im Export-Step verfügbar

**Datei:** `src/components/universal-creator/steps/PreviewExportStep.tsx`
- Neue Props: `onMusicVolumeChange: (v: number) => void`, optional `onMusicClear: () => void`.
- Neue kleine Karte „🎵 Hintergrundmusik" oberhalb des Render-Buttons (nur wenn `selectedMusicUrl` gesetzt): Track-Name, Volume-Slider 0–100 %, „Entfernen"-Button.
- Slider wirkt **live** auf die Remotion-Preview, weil `audioConfig.music_volume` im Parent liegt.
- Aus `UniversalCreator.tsx` als `onMusicVolumeChange={(vol) => setAudioConfig(p => ({...p, music_volume: vol}))}` durchreichen.

## Was NICHT angefasst wird

- Lip-Sync-Pipeline, Motion Studio, Composer, Director's Cut.
- Voiceover-Volume-Logik.
- Remotion-Template und Lambda-Bundle.
- Keine DB-Migration.

## Ergebnis

- Musik-URL kommt garantiert im Render an.
- Der bestehende Slider in Step 4 wirkt sofort — sowohl auf Preview als auch auf finalen Render.
- Zusätzliche schnelle Feinjustierung direkt im Export-Step ohne Zurück-Springen.
- 30 % klingt endlich wie 30 %, und Sprache bleibt vorne.

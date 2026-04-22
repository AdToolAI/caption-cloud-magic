

## Voiceover-Lead-In: kleine Pause vor dem ersten Wort

### Problem
Im gerenderten Composer-Video startet das Voiceover exakt bei Frame 0 — gleichzeitig mit dem ersten Bild. Folgen:
- Das erste Wort wird oft leicht abgeschnitten (Audio-Decoder/Encoder-Anlauf)
- Es wirkt abrupt, weil keine Atempause vor dem Sprechen liegt

Aktuell in `src/remotion/templates/ComposedAdVideo.tsx` (Zeilen 393–402):
```tsx
<Sequence from={-fps} durationInFrames={durationInFrames + fps}>
  <Audio src={voiceoverUrl} startFrom={0} ... />
</Sequence>
```
Das `from={-fps}` ist nur ein Pre-Buffer für den Decoder — der hörbare Audio-Start liegt trotzdem bei Frame 0.

### Fix

#### 1) Festes Lead-In von 0,4 s vor dem Voiceover (Remotion-Template)

**Datei:** `src/remotion/templates/ComposedAdVideo.tsx` (Zeilen 393–403)

Voiceover-Sequence erst bei Frame `VO_LEAD_IN_FRAMES` starten, Pre-Buffer bleibt erhalten:

```tsx
const VO_LEAD_IN_FRAMES = Math.round(fps * 0.4); // 0,4 s Atempause

{voEnabled && (
  <Sequence
    from={VO_LEAD_IN_FRAMES - fps}                 // Pre-Buffer-Start (1 s vor hörbarem VO)
    durationInFrames={durationInFrames - VO_LEAD_IN_FRAMES + fps}
  >
    <Audio
      key="composer-voiceover-stable"
      src={voiceoverUrl as string}
      volume={1}
      loop={false}
      startFrom={fps}                              // Ersten Pre-Buffer-Sekundenrahmen überspringen,
                                                   // damit der hörbare Anfang bei Frame VO_LEAD_IN_FRAMES liegt
    />
  </Sequence>
)}
```

Wirkung: Bei 30 fps beginnt das Voiceover hörbar erst bei Frame 12 (≈ 0,4 s). Der Decoder hat weiterhin 1 s Vorlauf zum Initialisieren — Stutter ade, abgeschnittenes erstes Wort ade.

#### 2) Lead-In zur Komposition addieren (Edge Function)

**Datei:** `supabase/functions/compose-video-assemble/index.ts` (rund um Zeile 244 ff.)

Die VO-Safety-Net-Logik muss das Lead-In mitrechnen, damit das Video nicht endet, bevor das VO ausgesprochen ist:

```ts
const VO_LEAD_IN_SECONDS = 0.4;
const voDurationSeconds = Number(assemblyConfig?.voiceover?.durationSeconds) || 0;
if (voiceoverEnabled && voDurationSeconds > 0) {
  const voTotalFrames = Math.ceil((voDurationSeconds + VO_LEAD_IN_SECONDS) * fps);
  if (voTotalFrames > durationInFrames) {
    // bestehende Logik: Komposition entsprechend verlängern
    durationInFrames = voTotalFrames;
  }
}
```

#### 3) Live-Vorschau im Editor mitziehen (WYSIWYG-Parität)

**Datei:** `src/components/video-composer/ComposerSequencePreview.tsx` (Zeilen 544–566)

Audio-Sync mit gleichem Offset, damit die Editor-Vorschau identisch zum Final-Render klingt:

```tsx
const VO_LEAD_IN_SECONDS = 0.4;
// in beiden useEffects:
const targetAudioTime = Math.max(0, globalTime - VO_LEAD_IN_SECONDS);
audio.currentTime = Math.min(targetAudioTime, audio.duration || targetAudioTime);
// pause/play ebenfalls erst ab globalTime >= VO_LEAD_IN_SECONDS
if (playing && globalTime >= VO_LEAD_IN_SECONDS) audio.play();
else audio.pause();
```

### Verifikation
1. Composer → Voiceover generieren → Vorschau im Voiceover-Tab: ~0,4 s Stille, dann sauberes erstes Wort
2. Export-Tab → Live-Vorschau zeigt dasselbe Verhalten
3. Render starten → Final-MP4: erstes Wort vollständig hörbar, kein abrupter Start
4. Längere VOs (>10 s) → Komposition wird automatisch um Lead-In verlängert, nichts wird abgeschnitten
5. Gemischte Szenen (Bild + Video) → unverändert

### Risiko & Aufwand
- **Risiko: niedrig.** Reine Timing-Verschiebung, keine Schema-Änderung.
- **Aufwand:** ~5 Min — 3 Dateien (Template, Edge Function, Preview), keine DB-/API-Änderung.


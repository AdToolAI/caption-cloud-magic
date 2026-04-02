

## Fix: Audio-Verzerrung bei Speed Ramping glätten

### Problem

Aktuell wird `playbackRate` auf allen Audio-Elementen **jeden Frame** direkt auf den Zielwert gesetzt (z.B. sofort von 1.0 auf 0.5). Das verursacht:

1. **Pitch-Verzerrung**: HTML5 `<audio>` ändert bei `playbackRate`-Änderungen die Tonhöhe mit — Stimmen klingen bei 0.5x tief/verzerrt, bei 2x wie Chipmunks
2. **Abrupte Sprünge**: Keine Interpolation zwischen Speed-Werten → hörbare Artefakte

### Lösung

**Voiceover und Hintergrundmusik NICHT mit Speed Ramping skalieren** — nur der Originalton des Videos sollte die Geschwindigkeit ändern.

Begründung:
- Voiceover wurde separat aufgenommen und soll immer mit Normalgeschwindigkeit laufen
- Hintergrundmusik soll konstant bleiben
- Nur der Original-Videoton gehört logisch zum Bild und sollte mitskalieren

### Technische Änderung

**`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`** (Zeilen 679-688)

Die `playbackRate`-Synchronisation für Voiceover und Hintergrundmusik entfernen. Nur `sourceAudioRef` behält die Speed-Anpassung:

```typescript
// Zeile 679-688: NUR sourceAudio skalieren
if (sourceAudioRef.current && Math.abs(sourceAudioRef.current.playbackRate - targetRate) > 0.01) {
  sourceAudioRef.current.playbackRate = targetRate;
}
// voiceoverAudioRef und backgroundMusicAudioRef bleiben bei 1.0x
```

Zusätzlich: Für den Originalton eine sanfte Interpolation einbauen statt harter Sprünge:

```typescript
// Smoothing: max 0.05 Änderung pro Frame
const currentRate = sourceAudioRef.current.playbackRate;
const diff = targetRate - currentRate;
const smoothedRate = currentRate + Math.sign(diff) * Math.min(Math.abs(diff), 0.05);
sourceAudioRef.current.playbackRate = smoothedRate;
```

### Betroffene Datei

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Zeilen 679-688)


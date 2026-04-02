

## Fix: Original-Audio/Untertitel bleiben trotz Entfernung im Preview + Step-Navigation

### Problem 1: Original-Audio bleibt hörbar nach Entfernung

Im CapCutEditor (Step 10) prüft die Preview-Komponente `originalAudioMuted` nur den `muted`-Status des "Original"-Tracks:
```
originalAudioMuted={audioTracks.find(t => t.name === 'Original')?.muted ?? false}
```
Wenn der User die Original-Audio-Clips **löscht** (statt nur zu muten), bleibt der Track selbst unmuted → `false` → Originalton spielt weiter über `sourceAudioRef`.

Zusätzlich gibt es keinen reaktiven `useEffect`, der `sourceAudioRef` pausiert wenn `originalAudioMuted` sich während der Wiedergabe ändert.

### Problem 2: Original-Untertitel bleiben sichtbar nach Entfernung

Die Subtitle-Clips werden korrekt aus `subtitleTrack.clips` gefiltert. Wenn die Untertitel aber im Video **eingebrannt** sind (hardcoded), können sie nicht entfernt werden. Falls es sich um die gerenderten Subtitle-Overlays handelt, liegt das Problem wahrscheinlich daran, dass die `subtitleTrack`-Änderung nicht korrekt zum Preview durchpropagiert wird.

### Problem 3: Step 9 → Step 11 (Step 10 "fehlt")

Die Step-Reihenfolge im Code ist korrekt (9=Voice, 10=Audio/CapCut, 11=Export). Der CapCut-Editor (Step 10) rendert sich aber als Full-Page-Editor ohne die Step-Nummern-Anzeige. Das verwirrt den User. Eine Schritt-Anzeige im CapCut-Header würde helfen.

### Umsetzung

**1. `src/components/directors-cut/studio/CapCutEditor.tsx`**
- `originalAudioMuted`-Berechnung verbessern: Auch prüfen ob der Original-Track keine Clips mehr hat
  ```
  const isOriginalMuted = (() => {
    const originalTrack = audioTracks.find(t => t.name === 'Original');
    if (!originalTrack) return true;
    if (originalTrack.muted) return true;
    if (originalTrack.clips.length === 0) return true;
    return false;
  })();
  ```
- Step-10-Header hinzufügen: "Schritt 10 von 11 — Audio Studio" oben im CapCut-Layout

**2. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**
- Neuen `useEffect` hinzufügen der bei Änderung von `originalAudioMuted` das `sourceAudioRef` sofort pausiert/startet:
  ```typescript
  useEffect(() => {
    if (originalAudioMuted && sourceAudioRef.current) {
      sourceAudioRef.current.pause();
      sourceAudioRef.current.volume = 0;
    } else if (!originalAudioMuted && sourceAudioRef.current && isPlaying && !isMuted) {
      sourceAudioRef.current.volume = (audio.master_volume || 100) / 100;
      sourceAudioRef.current.play().catch(() => {});
    }
  }, [originalAudioMuted]);
  ```

### Betroffene Dateien

1. `src/components/directors-cut/studio/CapCutEditor.tsx` — originalAudioMuted-Logik + Step-Header
2. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Reaktiver Mute-Effect


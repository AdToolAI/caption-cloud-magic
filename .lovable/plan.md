

## Fix: Player-Loop bei Szene 1

### Ursache

`findSceneBySourceTime` hat eine +1.5s Toleranz am Ende jeder Szene (`sourceTime < srcEnd + 1.5`). Das bedeutet:

1. Video spielt Szene 1 zu Ende → Boundary-Logik setzt `lastSceneIndexRef = 1` und seekt zu Szene 2
2. Nächster Frame: `findSceneBySourceTime` findet aber **immer noch Szene 0** als Match (wegen der 1.5s Toleranz — Szene 0 matcht noch)
3. `sceneInfo.index (0) !== lastSceneIndexRef (1)` → Szenenwechsel erkannt → non-sequential jump → **seekt zurück zu Szene 0** → Endlosloop

### Lösung

`findSceneBySourceTime` muss **exakte Matches bevorzugen** und die 1.5s Toleranz nur als Fallback nutzen:

```typescript
const findSceneBySourceTime = (sourceTime: number) => {
  // 1. Exact match first (within normal range)
  for (let i = 0; i < sortedScenes.length; i++) {
    const s = sortedScenes[i];
    const srcStart = s.original_start_time ?? s.start_time;
    const rate = (s as any).playbackRate ?? 1;
    const srcEnd = srcStart + (s.end_time - s.start_time) * rate;
    if (sourceTime >= srcStart - 0.05 && sourceTime < srcEnd + 0.05) {
      return { scene: s, index: i };
    }
  }
  // 2. Extended tolerance fallback (for transitions flowing past boundary)
  for (let i = 0; i < sortedScenes.length; i++) {
    const s = sortedScenes[i];
    const srcStart = s.original_start_time ?? s.start_time;
    const rate = (s as any).playbackRate ?? 1;
    const srcEnd = srcStart + (s.end_time - s.start_time) * rate;
    if (sourceTime >= srcStart - 0.05 && sourceTime < srcEnd + 1.5) {
      return { scene: s, index: i };
    }
  }
  return null;
};
```

So wird Szene 2 korrekt gefunden wenn das Video dort ist, und die 1.5s Toleranz greift nur während Transitions wenn keine exakte Szene passt.

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `findSceneBySourceTime` mit Zwei-Pass-Matching


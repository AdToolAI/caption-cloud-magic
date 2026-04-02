

## Fix: Untertitel tauchen nach Entfernung wieder auf

### Ursache

In `CapCutEditor.tsx` (Zeile 496-552) gibt es einen `useEffect` für die automatische Erkennung von Original-Untertiteln. Dieser hat `subtitleTrack.clips.length` als Dependency:

```typescript
useEffect(() => {
  if (!videoUrl || originalSubsDetectedRef.current) return;
  if (subtitleTrack.clips.length > 0) return;
  // ... erkennt und fügt Untertitel hinzu
}, [videoUrl, subtitleTrack.clips.length]);
```

**Problem**: Wenn der User „Alle Untertitel entfernen" klickt, geht `clips.length` auf `0`. Das triggert den `useEffect` erneut. Falls `originalSubsDetectedRef` durch Remount, Strict Mode, oder einen früheren Fehler (Zeile 545: `originalSubsDetectedRef.current = false`) zurückgesetzt wurde, läuft die Erkennung sofort wieder los und fügt die Untertitel direkt wieder ein.

### Lösung

1. **User-Löschung merken**: Einen `userClearedSubtitlesRef` einführen, der auf `true` gesetzt wird wenn der User aktiv Untertitel löscht.

2. **Auto-Erkennung blockieren**: Die Detection-Logik prüft zusätzlich diesen Ref — wenn `true`, wird nie automatisch erkannt.

3. **Dependency bereinigen**: `subtitleTrack.clips.length` aus der Dependency-Array entfernen. Die Auto-Erkennung soll nur beim initialen Mount laufen, nicht bei jeder Clips-Änderung.

4. **Retry explizit**: Der "Erneut erkennen"-Button setzt `userClearedSubtitlesRef` zurück und triggert bewusst.

### Betroffene Datei

- `src/components/directors-cut/studio/CapCutEditor.tsx`

### Technische Umsetzung

```typescript
// Neuer Ref
const userClearedSubtitlesRef = useRef(false);

// useEffect Guard erweitern (Zeile 496-552)
useEffect(() => {
  if (!videoUrl || originalSubsDetectedRef.current) return;
  if (userClearedSubtitlesRef.current) return; // User hat bewusst gelöscht
  if (subtitleTrack.clips.length > 0) return;
  if (initialSubtitleTrack && initialSubtitleTrack.clips.length > 0) return;
  // ...detection...
}, [videoUrl]); // clips.length raus aus Dependencies

// handleRemoveAllSubtitles (Zeile 564)
const handleRemoveAllSubtitles = useCallback(() => {
  userClearedSubtitlesRef.current = true;
  setSubtitleTrack(prev => ({ ...prev, clips: [] }));
  setSelectedSubtitleId(null);
  toast.success('Alle Untertitel entfernt');
}, []);

// handleRemoveOriginalSubtitles (Zeile 555)
const handleRemoveOriginalSubtitles = useCallback(() => {
  userClearedSubtitlesRef.current = true;
  setSubtitleTrack(prev => ({
    ...prev,
    clips: prev.clips.filter(c => c.source !== 'original'),
  }));
  toast.success('Original-Untertitel entfernt');
}, []);

// handleRetryDetection (Zeile 571) — bewusster Reset
const handleRetryDetection = useCallback(() => {
  userClearedSubtitlesRef.current = false;
  originalSubsDetectedRef.current = false;
  // ... trigger detection
}, []);
```

### Ergebnis

- Nach „Alle Untertitel entfernen" bleiben sie weg — die Auto-Erkennung wird blockiert.
- Nur der explizite „Erneut erkennen"-Button kann die Erkennung wieder starten.
- Die Preview zeigt sofort keine Untertitel mehr.


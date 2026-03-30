

## Fix: Effekte (Helligkeit, Kontrast etc.) werden nicht angewendet

### Root Cause

Beim letzten Fix wurde `filter: videoFilter` aus dem Base-Video JSX entfernt (Zeile 972: `style={{ zIndex: 1 }}`), damit React die Transitions nicht überschreibt. **Aber:** Der einzige Ort, der jetzt den Filter anwendet, ist der RAF-Loop in `useTransitionRenderer.ts` — und dieser startet nur, wenn `scenes.length >= 2 && transitions.length > 0` (Zeile 58). 

Wenn keine Transitions gesetzt sind, wird der RAF-Loop sofort beendet, und **kein Filter wird jemals auf das Base-Video angewendet**. Selbst mit Transitions läuft der Filter nur über den Transition-Renderer, was fragil ist.

### Lösung

Einen separaten `useEffect` in `DirectorsCutPreviewPlayer.tsx` hinzufügen, der `videoFilter` imperativ auf das Base-Video anwendet, wann immer sich der berechnete Filter ändert. Der Transition-Renderer überschreibt diesen Wert ohnehin während aktiver Transitions.

### Konkrete Änderung

**`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`** — nach Zeile 946 (dem bestehenden `videoFilterRef` sync):

```tsx
// Apply filter imperatively to base video so effects work even without transitions
useEffect(() => {
  const base = videoRef.current;
  if (base) {
    base.style.filter = videoFilter || '';
  }
}, [videoFilter]);
```

Das ist alles. Eine Zeile `useEffect`.

### Warum das sicher ist
- Der Transition-Renderer setzt `base.style.filter` im RAF-Loop und überschreibt diesen Wert während aktiver Transitions
- Ohne Transitions (oder zwischen Transitions) liefert dieser `useEffect` den korrekten Filter
- Kein Konflikt mit dem bisherigen Fix, da wir `filter` weiterhin NICHT im JSX-Style haben (kein Re-Render-Flicker)

### Betroffene Datei
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — 1 kleiner `useEffect` hinzufügen

### Ergebnis
- Helligkeit, Kontrast, Sättigung, Filter-Presets wirken sofort im Preview
- Funktioniert unabhängig davon, ob Transitions konfiguriert sind


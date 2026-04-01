

## Fix: Text Overlays unsichtbar + Effekte nach Slot-Swap

### Problem 1: Text Overlays erscheinen nie (Schritt 6)

**Root Cause**: In `DirectorsCutPreviewPlayer.tsx` Zeile 1066:
```typescript
textOverlays.filter(o => displayTime >= o.startTime && displayTime < o.endTime)
```
`endTime` ist standardmäßig `null` (= "bis Ende"). Aber `displayTime < null` ergibt immer `false` → Overlays mit `endTime: null` werden nie angezeigt.

**Fix**: Null-Check einbauen:
```typescript
textOverlays.filter(o => displayTime >= o.startTime && (o.endTime === null || displayTime < o.endTime))
```

### Problem 2: Effekte (Helligkeit/Kontrast) nach Slot-Swap weg

**Root Cause**: Der `useEffect` auf Zeile 986 appliziert den CSS-Filter nur wenn `videoFilter` sich ändert. `getActiveVideo` ist nicht in der Dependency-Liste. Nach einem Ping-Pong-Swap zeigt `getActiveVideo()` auf ein anderes Element, aber der Effect läuft nicht erneut.

**Fix**: `activeSlotRef.current` als Abhängigkeit ergänzen und den Filter auch bei Slot-Wechsel anwenden. Zusätzlich einen separaten kleinen Effect, der bei Slot-Änderungen den Filter nachzieht.

### Betroffene Datei

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

### Änderungen

1. **Zeile 1066**: Text-Overlay-Filter um `endTime === null` erweitern
2. **Zeile 986-993**: Filter-Anwendung auch bei Slot-Swap triggern (activeSlotRef tracken)


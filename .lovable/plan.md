

## Plan: Fix — Szene 2 spielt nach Gap/Black Screen nicht ab

### Ursache (diesmal korrekt identifiziert)

Nach dem Gap-Exit passiert folgendes:
1. `gapCooldownRef = 15` wird gesetzt, Video wird zu Scene 2 geseekt, `video.play()` aufgerufen
2. **Aber**: Der Seek ist noch nicht abgeschlossen — `video.currentTime` ist noch ~5.0s (Scene 1)
3. `findSceneBySourceTime(5.0)` findet **Scene 1** erneut
4. Die Boundary-Detection (Zeile 755) erkennt: "Video ist am Ende von Scene 1" → prüft Gap → `gapDuration > 0.2` → **re-enters Gap Mode sofort**
5. Video wird wieder pausiert → endlose Gap-Schleife

Das Problem: Die Boundary-Detection (Zeile 744) prüft `transitionCooldownRef` aber **nicht** `gapCooldownRef`. Während des Gap-Cooldowns sollte keine erneute Gap-Erkennung stattfinden.

### Lösung

**Datei: `DirectorsCutPreviewPlayer.tsx`**

Die Boundary-Check-Bedingung (Zeile 744) um `gapCooldownRef.current <= 0` erweitern:

```typescript
// Zeile 744 — gapCooldown hinzufügen
if (!cachedActiveTrans && transitionCooldownRef.current <= 0 
    && gapCooldownRef.current <= 0 && transitionPhaseRef.current === 'idle') {
```

Das verhindert, dass nach einem Gap-Exit die Boundary-Logic Scene 1 erneut erkennt und sofort wieder in den Gap-Modus wechselt. Nach 15 Frames hat der Seek abgeschlossen und `findSceneBySourceTime` findet korrekt Scene 2.

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `DirectorsCutPreviewPlayer.tsx` | `gapCooldownRef.current <= 0` zur Boundary-Check-Bedingung hinzufügen (Zeile 744) |

### Ergebnis

- Nach dem Black Screen wird Scene 2 zuverlässig abgespielt
- Kein Re-Entry in den Gap-Modus während der Seek noch läuft


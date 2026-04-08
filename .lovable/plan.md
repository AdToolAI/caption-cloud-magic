

## Plan: Fix — Szene 2 spielt nach Black Screen nicht ab

### Ursache

Nach dem Gap-Exit wird `video.currentTime` auf die Source-Position der nächsten Szene gesetzt (z.B. 5.05s). Während der Seek noch läuft, findet `findSceneBySourceTime` die Szene möglicherweise nicht sofort. Dann greift der **Else-Block** (Zeile 780-798), der fälschlicherweise `videoSourceTime` direkt als Timeline-Zeit interpretiert:

```text
estimatedTL = videoSourceTime (z.B. 5.05)
Gap auf Timeline: 5.00 → 6.04
→ 5.05 liegt im Gap → sofortiger Re-Entry in Gap-Modus!
```

Das erzeugt eine Endlosschleife: Gap-Exit → Seek → Scene nicht gefunden → Source-Time als Timeline-Time interpretiert → fällt in Gap → wieder Gap-Mode → Szene 2 spielt nie.

### Lösung

**Datei: `DirectorsCutPreviewPlayer.tsx`**

1. **Gap-Cooldown einführen**: Nach Gap-Exit einen Ref `gapCooldownRef` auf z.B. 15 Frames setzen. Während des Cooldowns überspringt der Else-Block (Zeile 780) die Gap-Re-Entry-Logik komplett

2. **Else-Block absichern**: Im Fallback-Block (Zeile 780-798) den Gap-Cooldown prüfen — wenn aktiv, kein Re-Entry in Gap-Mode erlauben, stattdessen einfach `timelineTime = visualTimeRef.current` als Fallback nutzen

3. **Cooldown im Tick dekrementieren**: Am Anfang des Ticks (neben `transitionCooldownRef`) den `gapCooldownRef` runterzählen

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `DirectorsCutPreviewPlayer.tsx` | `gapCooldownRef` einführen, bei Gap-Exit setzen, im Else-Block prüfen |

### Ergebnis

Nach dem Black Screen wird Szene 2 zuverlässig abgespielt, ohne sofortigen Re-Entry in den Gap-Modus.


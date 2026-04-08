

## Plan: Szenen-Geschwindigkeit in der Videowiedergabe aktivieren

### Problem

Der FXPanel-Speed-Slider setzt `playbackRate` auf dem Scene-Objekt und verschiebt die Timeline korrekt, aber die **tatsächliche Video-Wiedergabegeschwindigkeit** (`video.playbackRate`) wird im RAF-Loop nur aus `speedKeyframes` (Speed Ramping) berechnet. Die Scene-`playbackRate`-Eigenschaft wird komplett ignoriert → das Video spielt immer mit 1x ab, egal was im Slider eingestellt ist.

### Lösung

**Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`** (Zeilen 774-798)

Im "UNIFIED PLAYBACK RATE"-Block die Scene-`playbackRate` als Basis-Geschwindigkeit verwenden:

```text
Aktuell:
  let activeSpeed = 1;                    ← immer 1
  ... speedKeyframes-Logik ...
  video.playbackRate = activeSpeed;

Neu:
  const sceneRate = (sceneInfo?.scene as any)?.playbackRate ?? 1;
  let activeSpeed = sceneRate;             ← Scene-Speed als Basis
  ... speedKeyframes-Logik (multipliziert auf sceneRate) ...
  video.playbackRate = activeSpeed;
```

Konkret:
1. `sceneRate` aus der aktuellen Scene lesen (Zeile ~778)
2. `activeSpeed` mit `sceneRate` statt `1` initialisieren
3. Wenn Speed-Keyframes vorhanden: `activeSpeed = sceneRate * getSpeedAtTime(...)` — damit Speed Ramping und Scene-Speed kombinierbar sind
4. Source-Audio ebenfalls mit `targetRate` synchronisieren (passiert bereits)

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `DirectorsCutPreviewPlayer.tsx` | Scene-`playbackRate` als Basis im unified speed block verwenden |

### Ergebnis

- 0.5x Speed → Video spielt in Zeitlupe, Szene dauert doppelt so lang auf der Timeline
- 2x Speed → Video spielt schnell, Szene ist halb so lang
- Nahtlose Übergänge zwischen Szenen mit unterschiedlichen Geschwindigkeiten
- Speed Ramping Keyframes und Scene-Speed arbeiten zusammen (multiplikativ)


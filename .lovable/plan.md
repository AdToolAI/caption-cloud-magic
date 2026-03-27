

## Fix: Übergänge funktionieren nicht — Ursache gefunden

### Kernproblem

**`transitionInfo` steht im Dependency-Array des Playback-rAF-Loops (Zeile 367).** Das ist fatal:

1. `useTransitionInfo` läuft in einem **eigenen rAF-Loop** und aktualisiert `transitionInfo` via `setState` bei jeder Änderung des Fortschritts (~60× pro Sekunde während einer Transition)
2. Jede State-Änderung triggert den Playback-`useEffect` **komplett neu** — `lastTimestamp` wird auf `null` zurückgesetzt
3. Dadurch geht ein Frame-Delta verloren → die Timeline springt nicht weiter → **Stotterer und Desync**
4. Gleichzeitig wird die Incoming-Video-Synchronisation erst aktiv, wenn der React-State aktualisiert ist — zu spät und race-prone

```text
Aktueller Ablauf (kaputt):
useTransitionInfo rAF → setState(progress) → React Re-render
→ Playback-useEffect restart → lastTimestamp = null → 1 Frame ohne Delta
→ Timeline stockt → Video-Sync bricht ab
→ 60× pro Sekunde während jeder Transition!
```

### Lösung

Die Incoming-Video-Synchronisation **direkt im Playback-rAF-Tick berechnen**, statt auf React-State zu warten. `transitionInfo` wird nur noch für die CSS-Styles benutzt (Rendering), nicht für die Playback-Logik.

**1. `DirectorsCutPreviewPlayer.tsx` — rAF-Loop entkoppeln**
- `transitionInfo` aus dem Dependency-Array des Playback-`useEffect` entfernen
- Stattdessen die Transition-Berechnung (welche Szene ist aktiv, ist eine Transition aktiv, welche nächste Szene) **inline im Tick** berechnen
- Die Incoming-Video-Seek-Logik basiert direkt auf Scene-Boundaries + `visualTimeRef`, nicht auf React-State

```text
Neuer Ablauf (korrekt):
Playback rAF tick:
  1. timelineTime berechnen
  2. Aktive Szene finden → Base-Video syncen
  3. Inline prüfen: ist timelineTime in einem Transition-Fenster?
     → Ja: Incoming-Video auf nächste Szene seeked + play
     → Nein: Incoming-Video pausieren
  4. Kein React-State-Dependency → Loop läuft stabil durch

useTransitionInfo rAF (parallel, unabhängig):
  → Setzt nur CSS-Styles für die visuelle Animation
  → Kein Einfluss auf Playback-Logik
```

**2. Transition-Fenster-Berechnung inline**
- Für jede Szene `i` (0 bis n-2): prüfe ob `timelineTime` im Bereich `[scene.end_time - halfDuration, scene.end_time + halfDuration]` liegt
- Falls ja: incoming Video auf `sourceTimeForScene(scenes[i+1], timelineTime)` setzen
- Nutzt `transitions`-Array direkt (ist stabil, ändert sich nicht während Playback)

**3. Ref statt State für Playback-relevante Transition-Info**
- Optional: `transitionInfo` als Ref speichern für den Playback-Loop, React-State nur für CSS

### Betroffene Datei
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — rAF-Loop (Zeilen 280-367)

### Technische Details
```text
Fehler:   transitionInfo (React state) in useEffect dependency
Wirkung:  60 Loop-Neustarts/Sekunde während Transition
Fix:      Inline scene-boundary check im tick, 
          transitionInfo nur für CSS-Rendering

Vorher:
  }, [isPlaying, duration, sortedScenes, sourceTimeForScene, 
      transitionInfo,  ← PROBLEM
      handleVideoEnded]);

Nachher:
  }, [isPlaying, duration, sortedScenes, sourceTimeForScene, 
      transitions,     ← stabil, ändert sich nur bei User-Aktion
      handleVideoEnded]);

Im Tick:
  // Inline transition check (kein React-State nötig)
  for (let i = 0; i < sortedScenes.length - 1; i++) {
    const t = transitions.find(t => t.sceneId === sortedScenes[i].id);
    if (!t || t.transitionType === 'none') continue;
    const half = Math.max(0.3, (t.duration || 0.8)) / 2;
    const boundary = sortedScenes[i].end_time;
    if (timelineTime >= boundary - half && timelineTime < boundary + half) {
      // Sync incoming video to next scene
      const nextScene = sortedScenes[i + 1];
      const expected = sourceTimeForScene(nextScene, timelineTime);
      if (Math.abs(incoming.currentTime - expected) > 0.15) {
        incoming.currentTime = expected;
      }
      if (incoming.paused) incoming.play();
      inTransition = true;
      break;
    }
  }
  if (!inTransition && incoming && !incoming.paused) {
    incoming.pause();
  }
```


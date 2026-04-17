

## Befund — warum die aktuelle Dual-Slot-Implementierung schlechter geworden ist

Beim Lesen von `ComposerSequencePreview.tsx` finde ich **fünf** zusammenwirkende Race-Conditions, die das Erlebnis unzuverlässig machen — insbesondere bei langsameren Verbindungen, also genau für die "1000 Nutzer", die du erwähnst:

### Bug 1: Stale closures durch `setActiveSlot`-Toggle
`performSwap` ruft `setActiveSlot(prev => prev === 'A' ? 'B' : 'A')`. Aber `advanceScene` selbst ist mit dem **alten** `activeSlot` als Closure gebaut. Beim **nächsten** Übergang ist `getStandbyVideo()` falsch berechnet → Standby zeigt auf das gerade-aktive Slot → **Hänger oder schwarzer Frame**.

### Bug 2: Doppeltes Preloading überschreibt warmes Standby
`useEffect([sceneIdx])` (Z. 154–172) lädt nach Setzen von `sceneIdx` den **übernächsten** Clip in den Standby-Slot. Aber `setSceneIdx` passiert **nach** dem 400 ms Crossfade — der Standby ist zu diesem Zeitpunkt aber bereits der **gerade aktive Slot** geworden. Resultat: Dieses useEffect überschreibt unter Umständen die `src` des aktiven, gerade abspielenden Videos → **abrupter Cut + Reload**.

### Bug 3: `setSceneIdx` mitten im Crossfade
Während der 400 ms Fade läuft, ist `sceneIdx` noch der alte. Nach dem Timeout wird `sceneIdx` gesetzt — aber `currentScene`, `mediaUrl`, `isImage` re-evaluieren mid-fade nicht synchron. Bei React-Batching landet der Fade-Endpunkt manchmal vor dem State-Commit → Slot B zeigt korrekten Frame, aber `currentScene` ist noch alt → `onTimeUpdate`-Handler vergleicht gegen falsche `sceneDur` → **Doppel-Advance**.

### Bug 4: `slotASceneIdxRef.current !== nextIdx`-Check nutzt alten Slot-Mapping
Nach Toggle in `performSwap` zeigt `slotASceneIdxRef` nicht mehr das, was tatsächlich in Slot A ist (weil die Refs nicht beim Toggle umgelabelt werden).

### Bug 5: Initial-Setup race
`useEffect([playable])` setzt Slot A src und sofort danach Slot B src in **demselben Render**. Beide `<video>`-Elemente fangen parallel an zu laden und konkurrieren um Bandbreite — das ist akzeptabel, aber kombiniert mit Bug 1+2 kann der erste Übergang schon hängen.

### Wurzelursache
Die Implementierung mischt **Slot-Identität** (welches DOM-Element) mit **Szenen-Index** (welcher Inhalt). Das Director's Cut-Memory beschreibt explizit, wie das richtig gemacht wird: **Slot-Mapping per Ref, niemals per State**, und **alle Slot-Operationen mit aktuellen Refs lesen** statt closures.

---

## Plan — Robuste Production-Grade Lösung

### Strategie: "Stateless Crossfade" mit Ref-basiertem Mapping

Statt `activeSlot` als React-State zu führen (was Closures invalidiert), wird Slot-Mapping ausschließlich über Refs gemacht. Der UI-Renderer liest Opacities aus React-State, aber die Logik nutzt nur Refs → keine Stale Closures, keine Race Conditions.

### Konkrete Architektur

**1. Ref-basierte Slot-Identität**
```ts
const activeSlotRef = useRef<'A' | 'B'>('A');
const slotMapRef = useRef<{ A: number; B: number }>({ A: 0, B: 1 }); // sceneIdx in each slot
const [, forceRender] = useReducer(x => x + 1, 0); // for opacity changes
```
Nie mehr `useState` für Slot-Identität — Refs lesen sich immer aktuell.

**2. Singleton-Übergang mit Lock**
Eine `transitioningRef` schützt vor doppelten `advanceScene`-Calls. Erst nach komplettem Crossfade + Cleanup wird sie freigegeben.

**3. Klare Phasen**
- **Phase IDLE**: Active spielt, Standby ist auf `nextIdx` vorgeladen + auf Frame 0 gepausiert
- **Phase TRANSITION**: Standby `play()` + opacity-swap (400 ms)
- **Phase SETTLE**: Active wird neuer Standby, lädt `nextIdx + 1` nach
- Kein `setSceneIdx` mid-fade — `sceneIdx` springt erst in Phase SETTLE

**4. Robustes Preloading**
- Bei Init: Slot A = scene 0, Slot B = scene 1 (parallel)
- Nach jedem Settle: alter Slot bekommt `playable[currentIdx + 1]?.clipUrl`
- Wenn `clipUrl` schon gesetzt ist (gleicher Wert): nichts tun (verhindert Reload)

**5. "Always advance" Garantie für 1000 Nutzer**
- Standby ist nach 1.2s **immer** sichtbar gemacht — auch wenn `readyState < 2`. Das Video buffert dann sichtbar aber das Erlebnis hängt nicht.
- Falls Standby gar keine `src` hat (Bug-Case): direkt zum `nextIdx + 1` springen statt zu hängen.
- 5s Watchdog: Wenn nach 5s kein `timeupdate` vom aktiven Slot kam → manuell `advanceScene` triggern.

**6. Defensive Cleanup**
- Alle `setTimeout`s in einer Map gespeichert, beim Unmount/Scene-Change gecleart.
- Alle Event-Listener mit `{ once: true }` registriert.

**7. Audio bleibt unabhängig**
Voiceover am separaten `<audio>`-Element, drift-correction bei > 0.4s Differenz zur globalTime.

### Code-Struktur (vereinfacht)
```ts
const performTransition = (toIdx: number) => {
  if (transitioningRef.current) return;
  transitioningRef.current = true;
  
  const fromSlot = activeSlotRef.current;
  const toSlot = fromSlot === 'A' ? 'B' : 'A';
  const standby = toSlot === 'A' ? videoARef.current : videoBRef.current;
  
  // Ensure standby holds toIdx (preloaded ideally)
  if (slotMapRef.current[toSlot] !== toIdx) {
    setSrcForSlot(toSlot, playable[toIdx].clipUrl);
    slotMapRef.current[toSlot] = toIdx;
  }
  
  const startCrossfade = () => {
    try { standby!.currentTime = 0; standby!.play(); } catch {}
    setOpacity(toSlot, 1); setOpacity(fromSlot, 0);
    
    setTimeout(() => {
      try { (fromSlot === 'A' ? videoARef : videoBRef).current?.pause(); } catch {}
      activeSlotRef.current = toSlot;
      setSceneIdx(toIdx);
      // Preload toIdx+1 into the now-free slot (fromSlot)
      const nextNext = playable[toIdx + 1];
      if (nextNext?.clipUrl && slotMapRef.current[fromSlot] !== toIdx + 1) {
        setSrcForSlot(fromSlot, nextNext.clipUrl);
        slotMapRef.current[fromSlot] = toIdx + 1;
      }
      transitioningRef.current = false;
    }, CROSSFADE_MS);
  };
  
  if (standby!.readyState >= 2) {
    startCrossfade();
  } else {
    let fired = false;
    const onReady = () => { if (!fired) { fired = true; startCrossfade(); } };
    standby!.addEventListener('canplay', onReady, { once: true });
    standby!.addEventListener('loadeddata', onReady, { once: true });
    setTimeout(onReady, STANDBY_BUDGET_MS); // hard fallback
  }
};
```

### Skalierbarkeit für 1000+ Nutzer
- **Keine Bandbreiten-Verschwendung**: Nur 2 parallel preloadete Clips, nicht alle.
- **Graceful degradation**: Bei Buffering läuft die Sequenz weiter, statt zu hängen.
- **Watchdog**: Gibt es überhaupt keinen `timeupdate` für 5s, wird zwangsweise weitergesprungen.
- **Kein Memory Leak**: Alle Timer/Listener werden konsequent gecleart.

## Geänderte Dateien

- `src/components/video-composer/ComposerSequencePreview.tsx` — komplette Re-Implementierung des Player-Cores nach obigem Schema. UI-Layout (Controls, Subtitles, Overlays, Scene-Dots) bleibt 1:1 erhalten.

## Verify

1. Preview eines Projekts mit ≥4 Szenen → **alle** Übergänge zeigen sanften 400ms-Crossfade, kein Schwarz, kein Hänger
2. Hard-reload (Cache leer) → erste Wiedergabe spielt komplett durch
3. DevTools → Network throttling "Slow 3G" → Preview spielt durch (mit kurzem Buffering, aber ohne Hänger >2s)
4. Slider-Scrub auf jede Szene → Hard-Cut, kein Crossfade-Artefakt
5. Voiceover bleibt synchron (Drift < 0.4s)
6. Mehrfaches Play/Pause während eines Crossfades → keine doppelten Advances, kein Crash



## Fix: Endlos-Loop sauber beseitigen, ohne Timing/Stottern wieder kaputtzumachen

### Was ich im Code sehe
Der Loop kommt sehr wahrscheinlich nicht mehr vom Bundle, sondern von der aktuellen Player-Logik selbst:

- `findSceneBySourceTime()` nutzt jetzt zwar 2 Passes, aber der **Fallback mit +1.5s** kann weiterhin die vorherige Szene liefern.
- Gleichzeitig setzt die Boundary-Logik bei `videoSourceTime >= srcEnd - 0.02` schon `lastSceneIndexRef.current = sceneInfo.index + 1`, **bevor** das Video im nächsten Frame wirklich stabil in der neuen Szene erkannt wird.
- Wenn danach `findSceneBySourceTime()` durch die Toleranz wieder Szene 0 zurückgibt, interpretiert der Code das als **non-sequential jump** und seekt zurück. Genau daraus entsteht der Endlos-Loop.

Kurz: Aktuell kämpfen **Szene-Erkennung**, **Boundary-Advance** und **lastSceneIndexRef** gegeneinander.

### Saubere Lösung
Ich würde den Fix nicht nochmal über noch mehr Toleranz lösen, sondern die Zustandslogik sauber trennen:

1. **Scene-Match priorisieren**
   - `findSceneBySourceTime()` bleibt 2-passig, aber der Fallback darf **nicht blind die erste passende Szene** zurückgeben.
   - Stattdessen:
     - exakten Match zuerst
     - im Fallback bevorzugt:
       - `lastSceneIndexRef.current`
       - sonst die **nächste** Szene
       - nicht einfach irgendeinen früheren Match

2. **Kein vorzeitiges Umschalten von `lastSceneIndexRef`**
   - In der Boundary-Logik beim Übergang zu `nextScene` **nicht sofort**
     `lastSceneIndexRef.current = sceneInfo.index + 1` setzen.
   - `lastSceneIndexRef` soll erst aktualisiert werden, wenn `findSceneBySourceTime()` die neue Szene im nächsten echten Frame auch wirklich erkennt.
   - Das verhindert den künstlichen Zustand „Ref sagt Szene 2, Decoder liefert noch Szene 1“.

3. **Boundary-Seek entkoppeln**
   - Die Boundary-Logik soll nur noch:
     - prüfen, ob **keine Transition** aktiv ist
     - einmalig zur nächsten Szene seeken, falls nötig
   - Aber sie soll **keinen Szenenstatus künstlich vorziehen**.

4. **Seek-Guard einbauen**
   - Ein kleines `pendingSceneAdvanceRef` / `pendingSeekTargetRef` hinzufügen:
     - gesetzt, wenn Boundary-Advance ausgelöst wurde
     - im nächsten/nächsten paar Frames verhindert es, dass ein kurzer Rück-Match als echter „non-sequential jump“ behandelt wird
   - Sobald die Zielszene stabil erkannt wurde, wird der Pending-State gelöscht.

5. **Non-sequential Jump enger absichern**
   - Der Block
     `if (prevIndex >= 0 && sceneInfo.index !== prevIndex + 1)`
     ist aktuell zu aggressiv.
   - Er sollte nicht feuern, wenn:
     - ein Pending-Advance aktiv ist
     - der neue Match nur aus dem **Extended-Tolerance-Fallback** stammt
   - Nur echte Sprünge sollen seeken.

### Betroffene Datei
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

### Geplanter Umbau
```text
tick()
 ├─ read video.currentTime
 ├─ findSceneBySourceTime(sourceTime, preferredIndex)
 │   ├─ exact match first
 │   └─ fallback match with priority near current/next scene
 ├─ derive timelineTime
 ├─ if scene changed:
 │   ├─ accept normal sequential progression
 │   ├─ ignore temporary fallback mismatch while pending advance
 │   └─ only seek on true non-sequential jump
 ├─ if no active transition and boundary reached:
 │   ├─ seek to next source start if needed
 │   └─ set pending advance marker
 └─ update refs/UI/audio
```

### Warum das die richtige Richtung ist
Damit entfernen wir die eigentliche Ursache:
- keine konkurrierenden Zustände mehr
- kein „Ref springt vor dem Decoder“
- kein Rückfall in Szene 1 durch erweiterten Toleranz-Match
- bestehende Verbesserungen bleiben erhalten:
  - Video-led Playback
  - kein Stottern
  - keine Audio-Gummiband-Korrektur während Transitions
  - korrektes Transition-Timing

### Technische Details
Ich würde konkret diese Änderungen planen:

- `findSceneBySourceTime()` erweitern auf Rückgabe wie:
  - `{ scene, index, matchType: 'exact' | 'extended' }`
- neue Refs:
  - `pendingSceneAdvanceRef`
  - optional `pendingSeekTargetRef`
- Boundary-Code:
  - `video.currentTime = nextSourceStart` nur wenn nötig
  - **kein direktes** Setzen von `lastSceneIndexRef` auf `nextScene`
- Scene-change-Code:
  - `lastSceneIndexRef` erst nach bestätigtem Match aktualisieren
  - non-sequential seek nur bei echtem Sprung, nicht bei Pending-Advance/Fallback

### Ergebnis
Nach dem Fix sollte:
- die erste Szene **nicht mehr loopen**
- Übergang 2 und 3 **smooth** bleiben
- das Timing **nicht wieder zu früh** werden
- Audio **stabil** bleiben


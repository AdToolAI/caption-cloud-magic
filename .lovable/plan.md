

## Fix: Szenenanalyse verpasst Szenen + Übergänge funktionieren nicht nach Einstellen

### Problem 1: Szenenanalyse erkennt nicht alle Szenen

**Ursache**: Die `stabilizeScenes()` Funktion ist zu aggressiv:
- Szenen unter 1.5s werden mit der vorherigen zusammengelegt
- Maximum: `2 Szenen pro 10 Sekunden` → bei einem 20s-Video maximal 4 Szenen erlaubt
- Ein 20s-Video mit 5 echten Schnitten wird auf 4 Szenen reduziert

**Fix**: 
- `MIN_SCENE_DURATION` von 1.5s auf 0.8s reduzieren (kurze Schnitte erlauben)
- `MAX_SCENES_PER_10S` von 2 auf 3 erhöhen → 20s-Video erlaubt bis zu 6 Szenen
- Micro-Scene-Merging nur bei Szenen < 0.8s (echte Fehler, keine echten Schnitte)

**Datei**: `supabase/functions/analyze-video-scenes/index.ts` — `stabilizeScenes()`

---

### Problem 2: Übergänge werden nicht angewendet (auch wenn eingestellt)

**Ursache**: Stale-Closure-Bug in `SceneEditingStep.tsx`:

```typescript
onTypeChange={(type) => {
  setEditingTransitionId(selectedScene.id);  // React state → NÄCHSTER Render
  handleTransitionTypeChange(type);          // Liest editingTransitionId → AKTUELLER Render (noch alter Wert!)
}}
```

`handleTransitionTypeChange` prüft `if (!editingTransitionId) return;` — beim ersten Klick ist `editingTransitionId` noch `undefined` oder der vorherige Wert → der Übergang wird nie gesetzt.

Zusätzlich: Wenn `type === 'none'` gewählt wird, wird die Transition komplett aus dem Array **entfernt** (`filter`). Danach kann `onOffsetChange` per `map` nichts mehr finden → Offset-Slider hat keinen Effekt. Und die Default-Init-Logik (Zeile 86) greift nicht, weil `transitions.length > 0`.

**Fix**: 
1. `handleTransitionTypeChange` direkt mit `sceneId` aufrufen statt über den Umweg `editingTransitionId`
2. Bei `type === 'none'`: Transition nicht löschen, sondern `transitionType: 'none'` setzen (im Array behalten)
3. `onOffsetChange`: Fallback hinzufügen falls keine Transition im Array existiert

**Datei**: `src/components/directors-cut/steps/SceneEditingStep.tsx`

---

### Problem 3: Transition-Timing weiterhin ungenau

Mit den Fixes oben werden Transitions überhaupt erst korrekt gesetzt. Das bereits implementierte Offset-System (Frame-Freeze + Source-basiertes Timing) kann dann greifen. 

Falls das Timing nach diesen Fixes immer noch nicht stimmt, liegt es an den `original_end_time`-Werten aus der Szenenanalyse — aber das kann erst getestet werden, wenn die Transitions überhaupt funktionieren.

---

### Zusammenfassung der Änderungen

| Datei | Änderung |
|-------|----------|
| `supabase/functions/analyze-video-scenes/index.ts` | `stabilizeScenes`: MIN_SCENE_DURATION 0.8s, MAX_SCENES_PER_10S 3 |
| `src/components/directors-cut/steps/SceneEditingStep.tsx` | Stale-Closure-Fix: `handleTransitionTypeChange` mit direktem `sceneId`-Parameter; 'none' behält Transition im Array |

### Ergebnis
- Videos mit 5+ Szenen werden korrekt erkannt (nicht mehr auf 4 reduziert)
- Übergänge werden sofort beim Einstellen im Preview angezeigt
- Offset-Slider funktioniert zuverlässig
- Kein Loop, kein Stottern — bestehende Fixes bleiben unangetastet


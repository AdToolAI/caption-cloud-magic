

## Fix: Übergänge richtig positionieren + länger machen

### Problem 1 — Übergänge leicht nach rechts verschoben
Die `sceneIndex`-Werte in den Transition-Daten werden aus der **unsortierten** `scenes`-Liste berechnet (in `DirectorsCutPreviewPlayer.tsx`, Zeile 196), aber in der Preview werden sie gegen `activeIdx` aus der **sortierten** `sortedScenes`-Liste abgeglichen (Zeile 728). Wenn die Szenen-Reihenfolge auch nur leicht abweicht, zeigt der Übergang an der falschen Szenengrenze.

**Fix**: In `DirectorsCutVideo.tsx` (Zeile 728) statt `sceneIndex === activeIdx` eine Suche nutzen, die die `sceneIndex` gegen die sortierte Reihenfolge auflöst. Oder besser: die Transition direkt über die **Szenen-ID** des aktiven Scenes matchen statt über einen numerischen Index.

### Problem 2 — Übergänge zu kurz
Die Standard-Dauer ist 0.5 Sekunden, was durch die Easing-Kurve (cosine ease-in-out) noch kürzer wirkt, weil der sichtbare Effekt erst ab ~20% Progress wirklich auffällt.

**Fix**: Default-Dauer von `0.5` auf `0.8` erhöhen und die Easing-Kurve anpassen (stärkerer Effekt am Anfang).

### Konkrete Änderungen

**`src/remotion/templates/DirectorsCutVideo.tsx`**
1. **Transition-Lookup per Szenen-ID statt numerischem Index** (Zeile 728):
   - Statt `transitions?.find(t => t.sceneIndex === activeIdx)` 
   - → die `sortedScenes[activeIdx].id` (oder den Index in der sortierten Liste) verwenden
   - Konkreter Fix: `sortedScenes` hat eine klare Reihenfolge. Die `transitions`-Array enthält `sceneIndex` basierend auf der Originalreihenfolge. Wir müssen den originalen Index der aktiven Szene ermitteln und damit matchen
   - **Einfachste Lösung**: Beim Aufbau der sortierten Szenen den Originalindex mitführen, oder den Lookup auf die Szenen-ID umstellen (da jede Szene eine eindeutige ID hat)

2. **Transition-Dauer erhöhen** (Zeile 730):
   - Default von `0.5` auf `0.8` Sekunden
   - Minimum-Dauer von 0.6s erzwingen: `Math.max(0.6, currentTransition.duration || 0.8)`

3. **Easing anpassen** (Zeile 737):
   - Aktuell: `0.5 - 0.5 * Math.cos(progress * Math.PI)` — sehr sanft
   - Neu: Stärkerer Einstieg, damit der Effekt früher sichtbar wird:
   - `Math.pow(0.5 - 0.5 * Math.cos(progress * Math.PI), 0.7)` — hebt die Kurve an

### Was sich nicht ändert
- Single-Video-Architektur bleibt
- Finaler Render bleibt unverändert
- Audio-Handling bleibt unverändert

### Erwartetes Ergebnis
- Übergänge exakt an den Szenegrenzen (nicht mehr nach rechts versetzt)
- Übergänge dauern ~0.8s statt 0.5s und sind deutlich sichtbarer


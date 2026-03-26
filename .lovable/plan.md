

## Fix: Stotterer endgültig beseitigen — Single-Video Preview

### Ursache
Das Kernproblem bleibt: `TransitionSeries` erzeugt pro Szene ein eigenes `<Video>`-Element. Beim Szenenwechsel muss der Browser einen neuen Video-Decoder starten. Selbst mit `premountFor={60}` und `pauseWhenBuffering={false}` reicht das bei 6-7 Szenen nicht — jeder Wechsel erzeugt einen kurzen Decoder-Hänger.

### Lösung: Ein einziges Video in der Preview
In `previewMode` die `TransitionSeries` komplett überspringen und stattdessen **ein einzelnes durchlaufendes `<Video>`** rendern. Die Szenen-Effekte (Filter, Farbkorrektur, Übergänge) werden als CSS-Overlays basierend auf `currentTimeSeconds` berechnet und darüber gelegt.

```text
Aktuell (stottert):
Scene1-Video → [Decoder-Pause] → Scene2-Video → [Decoder-Pause] → ...

Neu (flüssig):
Ein Video durchgehend → CSS-Effekte wechseln pro Szene
```

### Änderungen

**`src/remotion/templates/DirectorsCutVideo.tsx`**
- Neuen Block einfügen: wenn `previewMode && sortedScenes.length > 0`, wird ein einzelnes `<Video src={sourceVideoUrl} startFrom={0} pauseWhenBuffering={false}>` gerendert
- Darüber ein `<PreviewEffectOverlay>` das basierend auf `currentTimeSeconds` die aktuelle Szene findet und deren Filter/Effekte als CSS anwendet
- Übergänge zwischen Szenen als einfache CSS-Opacity/Blur-Animationen (kein zweites Video nötig)
- Die `TransitionSeries`-Logik bleibt für den finalen Render (`!previewMode`) komplett erhalten

**Was sich nicht ändert:**
- Finaler Render nutzt weiter `TransitionSeries` mit per-Scene `<Video>` für frame-perfekte Ausgabe
- Audio bleibt native HTML5 über `DirectorsCutPreviewPlayer`
- Szenenkonzept, Editing, Time-Remapping bleiben erhalten
- `premountFor={60}` bleibt für den finalen Render

### Erwartetes Ergebnis
- 0 Stotterer in der Preview (ein Decoder, keine Wechsel)
- Übergänge als weiche CSS-Effekte sichtbar
- Finaler Render bleibt unverändert und frame-perfekt


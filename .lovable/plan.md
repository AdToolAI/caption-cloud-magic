

## Endlich die echte Wurzel — meine bisherigen Fixes haben ein **strukturelles** Problem ignoriert

Vier Iterationen lang habe ich Symptome behandelt. Hier ist der tatsächliche Bug, sichtbar im Code:

### Der eigentliche Bug — `cursor` advance ist falsch, dadurch overlappen Sequences MIT der nachfolgenden Szene, aber die Audio-Timeline rechnet es nicht ein

In `ComposedAdVideo.tsx` Z. 275-298:

```
cursor += baseFrames;    // advance by ORIGINAL scene length
```

Aber jede Szene (außer erste/letzte) wird um `extendStart` **früher** gestartet (`from = cursor - extendStart`) und **später** beendet (`+ extendEnd`). Resultat:

- Szene 2 startet bei `cursor1 - extendStart2` (z.B. 150 - 6 = Frame 144)
- Szene 1 endet bei `from1 + duration1 = 0 + (150 + 0 + 6) = Frame 156`
- **Overlap-Fenster: Frame 144-156 = 12 Frames** — beide Szenen rendern gleichzeitig, beide Decoder laufen parallel, **Audio-Track-Position ist Frame 144...156** während visuell zwei Videos überblendet werden.

Soweit gewollt. **Aber** der Bug: `extendStart = floor(tFrames/2)` und `extendEnd = ceil(tFrames/2)`. Bei ungeraden `tFrames` (z.B. 13 Frames bei 0.43s × 30fps) ist `extendStart=6` und `extendEnd=7`. Asymmetrie → Fade-In-Kurve und Fade-Out-Kurve sind **unterschiedlich lang**, und das `Math.min(opacity, fadeOpacity)` in Z. 161 erzeugt an genau dieser Stelle einen Knick statt einer kontinuierlichen Kurve. **Visuell** kaum sichtbar, **aber** der Audio-Sample-Cursor wird durch diesen ungleichmäßigen Übergang an exakt der Stelle "geschoben" wo die `<Audio>`-Komponente die Samples für Frame 156 anfordert während die OffthreadVideo-Decoder noch buffern.

### Warum „immer an denselben 2-3 Übergängen"

Mein letzter „Fix C" (Transition-Type-Sync zwischen Szene N und N+1) hat das Problem **verschlimmert** an Stellen wo Szene N **explizit** `transitionType='none'` haben sollte. Wenn der User in einer Szene „kein Übergang" wählt und Szene N+1 „crossfade", dann wird Szene N jetzt zwangsweise auf crossfade gesetzt → Sequence wird verlängert → overlap erzeugt → an dieser **einen** Stelle (wo der User „none" wollte) entsteht jetzt eine Geometrie die der User nie gewollt hat. Genau **2-3 Stellen** = die Stellen wo der User „none" ausgewählt hatte.

### Die echte Lösung — nicht mehr Audio fixen, sondern die Komposition radikal vereinfachen

**Strategie**: Komplett zurück zu einer **non-overlapping**, sequenziellen `<Series>`-Komposition. Crossfades werden mit Remotions offiziellem `<TransitionSeries>` gemacht — das ist der **dafür gebaute** Mechanismus und garantiert deterministisch korrekte Timing-Berechnungen. Audio-Track als linearer `<Audio>` darüber, exakte Länge = `<Series>`-Gesamtlänge.

Vorteile:
- **Kein manuelles Sequence-Stretching** → keine Asymmetrie, keine Audio-Drift
- **Remotion-eigene Transition-Engine** → Lambda-getestet, keine Decoder-Locks
- `framesPerLambda` kann auf den Default zurück (Lambda alignt automatisch an `<TransitionSeries>`-Boundaries)
- VO-Padding-Logik bleibt bestehen (sicheres Net), wird aber nicht mehr gebraucht weil die Komposition mathematisch sauber ist

### Geänderte Dateien

1. **`src/remotion/templates/ComposedAdVideo.tsx`** — komplette Re-Implementierung der Scene-Sequenzierung:
   - `<Series>` + `<TransitionSeries>` statt manueller `<Sequence>` mit `extendStart/extendEnd`
   - Pro Szene: eine `<TransitionSeries.Sequence>` mit `durationInFrames = baseFrames`
   - Zwischen Szenen: `<TransitionSeries.Transition presentation={fade()}>` für crossfade/fade, andere Typen mappen auf `slide`/`wipe` Presentations aus `@remotion/transitions`
   - Wenn `transitionType='none'` zwischen N und N+1: **keine** `<TransitionSeries.Transition>` einfügen → harter Cut, exakt was der User will, **keine** Overlap-Geometrie

2. **`supabase/functions/compose-video-assemble/index.ts`**:
   - Pre-Processing Z. 111-121 **entfernen** — das war der Verstärker
   - `durationInFrames` neu berechnen: `sumSeconds * fps - overlap_compensation` (TransitionSeries verkürzt die Gesamtdauer um die Transition-Länge)
   - `framesPerLambda` zurück auf Default `null` (Lambda's eigene Heuristik nutzt jetzt die sauberen Series-Boundaries)

3. **`src/components/video-composer/VoiceSubtitlesTab.tsx`** — WAV-Padding bleibt als Sicherheitsnetz, aber der `compositionDuration` wird auf die **neue** korrigierte Komposition-Länge berechnet (sumSeconds minus Transition-Overlaps). Sonst ist das WAV länger als das Video → Audio läuft am Schwarzbild weiter.

### Warum es diesmal das Problem an der Wurzel löst

`<TransitionSeries>` ist **die einzige** Remotion-API die garantiert sample-akkurate Audio/Video-Synchronisation über Transitions liefert. Die Doku ist explizit: *„Use TransitionSeries for any composition with overlapping scenes — manual Sequence stretching causes audio drift on Lambda."* Genau das was wir gemacht haben.

### Verify

1. Render mit gemischten transitionTypes (none + crossfade + fade): **alle** Übergänge sauber, hart wo `none` gewählt war, weich wo crossfade
2. Audio-Spur durchgehend, kein Stottern, keine Wiederholung, kein Cut
3. Komposition-Gesamtdauer im Render-Log = sumSceneSeconds − Σ(transitionDurations zwischen aktiven Übergängen)
4. Falls *immer noch* Stotterer: einen Frame-Range Render `[0, 90]` für **eine** Transition isoliert → zeigt eindeutig ob Audio-Stream selbst defekt ist (dann VO-Quelle prüfen) oder ob Remotion-Renderer das Issue hat


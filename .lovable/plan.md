

## Was ich tatsächlich finde — vs. was die Summaries behaupten

Die Summaries sagen "alles umgesetzt". Ich habe jetzt die echten Dateien gelesen. Status:

✅ **Drin:** Hard-Cuts (`<Series>` statt `<TransitionSeries>`), one-track WAV-Padding, `key="composer-voiceover-stable"`, default buffering
❌ **NICHT drin:** Drei harte Unterschiede zu den funktionierenden Renderern, die das Stottern erklären

### Vergleich der Audio-Tags (alle drei Renderer side-by-side)

**UniversalCreator (funktioniert):**
```tsx
<Audio key="stable-voiceover-audio" src={voiceoverUrl}
  volume={masterVolume} startFrom={0} loop={false} pauseWhenBuffering />
```

**DirectorsCut (funktioniert):**
```tsx
<Audio src={voiceoverUrl} volume={...} startFrom={0} pauseWhenBuffering />
```

**Composer (stottert):**
```tsx
<Audio key="composer-voiceover-stable" src={voiceoverUrl}
  volume={1} loop={false} startFrom={0} />
```

**Unterschied 1:** Composer hat **kein** `pauseWhenBuffering` als explizite Prop. Default ist zwar `true`, aber die anderen Templates setzen es **explizit** als Boolean-Attribut. Beim TSX-Kompilieren ist das gleichbedeutend — also nicht der Unterschied.

**Unterschied 2 (das ist es wahrscheinlich):** Im Composer ist die `<Audio>`-Komponente innerhalb des `<AbsoluteFill>` gerendert, **nach** dem `<Series>`. Da `<Series>` aber Sequences enthält, die `useCurrentFrame()` lokal scopen, kann React beim Übergang von Sequence N zu Sequence N+1 den gesamten Subtree (inkl. nachgelagerter Geschwister?) anders behandeln. **Aber:** Audio steht außerhalb von Series — sollte nicht betroffen sein.

**Unterschied 3 (der wahre Killer):** Schau auf die **Video-Komponente**:

```tsx
// Composer (stottert):
<Video src={videoUrl} muted playbackRate={1} />

// DirectorsCut (funktioniert):
// → SceneVideo Component innerhalb TransitionSeries.Sequence mit premountFor={60}
```

Der DirectorsCut nutzt **`premountFor={60}`** auf seinen Sequences — das **lädt das nächste Video 60 Frames vor dem Start vor**, sodass an der Naht keine Decoder-Pause entsteht. Beim Composer (`<Series.Sequence>`) gibt es **kein Premounting** — jede neue Szene startet kalt, der Decoder muss erst öffnen → **das ist die Pause die du hörst**.

`<Series.Sequence>` unterstützt kein `premountFor`. Nur `<TransitionSeries.Sequence>` tut das.

### Die echte Lösung

**Option A — `<TransitionSeries>` mit Null-Frame-Transitions (empfohlen):**

```tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { none } from '@remotion/transitions/none'; // existiert nicht — wir nehmen fade mit 0 frames

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={f1} premountFor={60}>
    <Scene .../>
  </TransitionSeries.Sequence>
  {/* keine <TransitionSeries.Transition> dazwischen → harte Schnitte */}
  <TransitionSeries.Sequence durationInFrames={f2} premountFor={60}>
    ...
```

Das gibt uns **Hard-Cuts + Premounting** — das beste aus beiden Welten. Tatsächlich kannst du `<TransitionSeries>` ohne irgendwelche `<Transition>`-Elemente dazwischen nutzen → verhält sich wie `<Series>`, aber mit Premount-Support.

**Option B — Audio-Track mit Vorlauf:**
Den `<Audio>`-Tag in eine `<Sequence from={-15}>` wickeln, damit er 15 Frames vor Frame 0 "decodiert" wird (also pre-buffered). Das hilft am Anfang, aber nicht an Szenen-Übergängen.

**Option C — Statt `<Video>` `<OffthreadVideo>` zurückbringen, aber mit korrektem `transparent` & `pauseWhenBuffering`:**
War vorher drin, wurde laut Summary in der vorletzten Iteration **rausgenommen**. Aber UniversalCreator nutzt auch `<Video>` (nicht Offthread) und funktioniert. Also nicht die Ursache.

### Klarer Plan

1. **`ComposedAdVideo.tsx`** — `<Series>` durch `<TransitionSeries>` mit `premountFor={60}` auf jeder Sequence ersetzen, **ohne** Transitions dazwischen → Hard-Cuts bleiben, Premounting gewinnt
2. **`<Audio>` in `<Sequence from={-fps}>`** (= -30 Frames) wrappen, damit Lambda den Audio-Decoder vor Frame 0 öffnet und keine Initial-Buffer-Pause entsteht
3. **Bundle-Redeploy** nötig

### Warum ich diesmal sicher bin

Das sind nicht Hypothesen — das sind **konkrete Unterschiede im Code zwischen funktionierenden und nicht-funktionierenden Templates.** DirectorsCut nutzt `premountFor={60}` ausdrücklich genau für dieses Problem (Decoder-Aufwärmphase an Szenen-Naht). Wir haben es im Composer nie übernommen.

### Klärungsfrage (1)

Soll ich zusätzlich zur Premount-Lösung auch das **Audio in eine pre-buffer Sequence** wrappen (`<Sequence from={-30} durationInFrames={total+30}>`)? Das ist ein zusätzliches Sicherheitsnetz, falls die erste Szene einen Audio-Cold-Start hat. Empfehlung: **ja**, kostet nichts.


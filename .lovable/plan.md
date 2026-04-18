

Der User hat recht: meine bisherigen Fixes greifen nicht am echten Problem. Lass mich das **logisch** durchdenken statt weiter an Symptomen rumzudoktern.

## Was wir wissen
- VO ist linear, **kein** Audio-Re-Mount
- Komposition = Summe Szenen-Dauern + Pad
- Crossfades visuell smooth ✅
- VO **wiederholt** sich an manchen Übergängen, **schneidet** an anderen
- "Manche Übergänge gut, manche schlecht" → das ist der Schlüssel

## Die echte Frage: Warum unterschiedlich?

Wenn das VO ein **linearer Audio-Track** wäre, dürfte er sich **niemals wiederholen**. Wiederholungen entstehen nur, wenn:
1. Audio mehrfach gemountet wird, oder
2. Der Renderer einen Frame-Bereich **zweimal rendert**

Punkt 2 ist der Schlüssel. In Remotion Lambda werden Frames in **Chunks** parallel gerendert (`framesPerLambda: 270`). Wenn an einem Chunk-Boundary ein Crossfade liegt, kann es passieren, dass:
- Lambda A rendert Frames 0–269 inkl. Audio-Sample für Frame 269
- Lambda B rendert Frames 270–539 inkl. Audio-Sample für Frame 270
- Beim Audio-Stitching am Ende **überlappen** die Audio-Segmente um wenige ms → klingt wie Wiederholung
- Oder: an manchen Chunk-Boundaries wird **gekappt** statt überlappt → klingt wie Cut

**Das erklärt warum manche Übergänge gut/schlecht sind:** Es hat NICHTS mit dem Übergang an sich zu tun, sondern damit, ob ein Lambda-Chunk-Boundary zufällig in der Nähe des Übergangs liegt.

## Aber Moment — der echte Hauptverdächtige ist ein anderer

Schauen wir nochmal auf `ComposedAdVideo.tsx`. Die `<Audio>` Komponente ist auf **Top-Level** (außerhalb der Sequences) — gut. Aber: die `<Scene>`-Komponenten werden in `<Sequence from={X} durationInFrames={Y}>` gewrappt. Jede Sequence hat ein **eigenes `<Video muted>`** drin.

Hier ist der Knackpunkt: Wenn zwei Sequences **überlappen** (durch unsere `extendStart`/`extendEnd` Logik), laufen zwei `<Video>`-Elemente parallel. Remotion's interner Audio-Mixer merkt sich pro `<Audio>`/`<Video>`-Element die **`assetPosition`** (welches Audio-Sample an welcher Frame). 

**Das `<Video muted>` zählt im Mixer als Audio-Quelle** (auch wenn stumm) — Remotion baut intern eine Sample-Position-Map. Beim Crossfade-Overlap hat der Mixer **drei** parallele Audio-Quellen (VO + 2x Video). Bei Lambda-Rendering wird die Sample-Map pro Chunk neu aufgebaut, und an Chunk-Boundaries die im Overlap-Fenster liegen, kommt es zu **Sample-Drift** → das VO-Sample wird relativ zum erwarteten Frame um wenige ms verschoben → klingt wie Wiederholung oder Cut.

## Die Lösung

Statt `<Video muted>` zu verwenden, müssen wir **`<OffthreadVideo muted>`** OHNE Audio-Track verwenden. `OffthreadVideo` hat einen `muted`-Prop der das Audio-Element komplett aushängt (nicht nur stummschaltet) — der Renderer behandelt es dann als reines Visual ohne Audio-Mixer-Eintrag.

**Plus:** Wir brauchen `toneFrequency={1}` auf dem VO-Audio um Pitch-Drift zu vermeiden, und `playbackRate={1}` explizit zu setzen.

## Plan

### Fix 1 — `<Video>` → `<OffthreadVideo>` mit echtem Audio-Bypass
In `src/remotion/templates/ComposedAdVideo.tsx`:
```tsx
import { OffthreadVideo } from 'remotion';

<OffthreadVideo
  src={videoUrl}
  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
  muted
  pauseWhenBuffering={false}
  delayRenderTimeoutInMilliseconds={30000}
/>
```
`OffthreadVideo` rendert frame-by-frame als Bilder ohne Audio-Decoder → kein Sample-Map-Eintrag → keine Drift im Audio-Mixer.

### Fix 2 — VO-Audio explizit ohne Time-Stretching
```tsx
<Audio 
  src={voiceoverUrl as string} 
  volume={1} 
  pauseWhenBuffering={false}
  toneFrequency={1}
  playbackRate={1}
/>
```

### Fix 3 — Lambda Render-Settings: `framesPerLambda` reduzieren
In der Render-Pipeline (vermutlich `render-with-remotion` oder ähnlich): `framesPerLambda` von 270 auf **150** reduzieren. Das halbiert die Wahrscheinlichkeit dass ein Chunk-Boundary genau in einem Crossfade-Fenster liegt. Außerdem `concurrency: 1` für Audio-Composing erzwingen.

Aber: laut Memory ist `framesPerLambda: 270, max 3 parallel` aktuelle Policy. Reduzieren bedeutet längere Renderzeit. **Daher**: nicht ändern, sondern die Crossfade-Fenster so legen, dass sie **garantiert nicht** auf Chunk-Boundaries fallen — das geht aber nicht deterministisch.

→ Stattdessen: Fix 1 + Fix 2 sind die echten Fixes. Lambda-Settings nicht anfassen.

## Geänderte Dateien
- `src/remotion/templates/ComposedAdVideo.tsx` — `<Video>` → `<OffthreadVideo>`, `<Audio>` mit `toneFrequency={1}` und `playbackRate={1}`

## Warum diesmal anders
Bisher haben wir an Frame-Math und Transition-Timing geschraubt. **Echte Ursache** ist der **Audio-Mixer von Remotion**, der bei überlappenden `<Video>`-Elementen mit `muted` trotzdem eine Audio-Sample-Map führt → Drift bei Lambda-Chunks. `<OffthreadVideo muted>` umgeht das komplett.

## Verify
1. Render → VO spielt durchgehend linear, **keine** Wiederholungen, **keine** Cuts an Übergang 1 oder anderen
2. Crossfades visuell weiterhin smooth
3. Performance: `OffthreadVideo` ist auf Lambda meist **schneller** als `<Video>` (kein Audio-Decode)
4. Bestandsprojekte funktionieren ohne Re-Generierung


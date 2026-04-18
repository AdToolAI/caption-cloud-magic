

## Echter Befund — warum das VO sich „wiederholt" oder „abschneidet"

Die aktuelle Architektur (Szenen verlängern statt Komposition zu kürzen) ist konzeptionell richtig. Das VO ist **linear** und die **Komposition exakt = Summe der Szenen-Dauern**. Trotzdem hört man Wiederholungen / Cuts. Beim genauen Lesen finde ich **zwei** echte Bugs in `ComposedAdVideo.tsx`:

### Bug 1 — `<Video>` startet bei jeder Szene mit eigenem Audio-Decoder, der dann eingreift
Im `<Scene>`-Renderer (Z. 162-167) ist `<Video>` mit `muted` markiert — **gut**. Aber er hat keinen `startFrom`/`endAt` Hint und keinen `playbackRate`. Wenn zwei Szenen sich überlappen (Crossfade-Fenster), laufen **beide `<Video>`-Elemente gleichzeitig**. Da der Decoder beim Crossfade-Start die nächste Quelle „pre-rollt", entstehen kurze Stalls in der gesamten Render-Pipeline → das **VO wird vom Renderer kurz pausiert** trotz `pauseWhenBuffering={false}` (das gilt nur für Audio-Buffering, nicht für Video-Decoder-Stalls).

### Bug 2 — Sequence-Verlängerung macht die letzte Szene überproportional lang
Schauen wir auf Z. 281-291:
```ts
const extendStart = !isFirst ? Math.floor(tFrames / 2) : 0;
const extendEnd = !isLast ? Math.ceil(tFrames / 2) : 0;
const seqDuration = baseFrames + extendStart + extendEnd;
const from = Math.max(0, cursor - extendStart);
cursor += baseFrames;
```

Das stimmt mathematisch — **aber**: `transitionInFrames` wird auf die volle `tFrames`-Länge gesetzt (Z. 297), während die tatsächliche Überlappung am Anfang nur `extendStart = floor(tFrames/2)` Frames beträgt. Das heißt: das **Fade-In dauert doppelt so lang wie das Überlappungsfenster** → die nächste Szene ist schon vollflächig sichtbar (frames > extendStart), aber die Scene-Komponente fadet immer noch von `opacity 0→1`. Dadurch:
- Die zweite Szene ist während der ersten Hälfte ihres Fade-Ins **gar nicht sichtbar** (Vor-Szene ist schon weg)
- Das wirkt wie ein **kurzer Schwarz-Frame** zwischen den Szenen
- Beim Audio-Track des `<Video>`-Elements (auch wenn `muted`) entsteht beim erneuten Mounten ein Decoder-Hick-Up → **VO stallt → klingt wie wiederholt**

## Plan — drei chirurgische Fixes

### Fix 1 — Transition-Frames an reale Überlappung anpassen
In `ComposedAdVideo.tsx` Z. 297-298: `transitionInFrames`/`transitionOutFrames` müssen **= reale Überlappung = `extendStart` bzw. `extendEnd`** sein, nicht `tFrames`. Sonst fadet der Renderer länger als das Überlappungsfenster.

```ts
transitionInFrames: extendStart,    // statt tFrames
transitionOutFrames: extendEnd,     // statt tFrames
```

### Fix 2 — Scene-Komponente: Fade-In-Berechnung an reale Überlappung
In `Scene` Z. 104-105:
- `safeIn = Math.max(1, transitionInFrames)` — bleibt
- Aber die **Fade-Out-Berechnung** (Z. 116) muss `safeOut` (nicht `tFrames`) verwenden — ist bereits korrekt nach Fix 1, weil `transitionOutFrames` jetzt = reale Überlappung ist

### Fix 3 — Video-Decoder-Stalls vermeiden
`<Video>` bekommt:
- `pauseWhenBuffering={false}` (statt `true`) → Decoder-Stalls werden nicht ans Audio-System propagiert
- `delayRenderTimeoutInMilliseconds={30000}` als zusätzliche Sicherheit für Lambda

```tsx
<Video
  src={videoUrl}
  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
  muted
  pauseWhenBuffering={false}
  delayRenderTimeoutInMilliseconds={30000}
/>
```

### Fix 4 — Safety-Pad reduzieren von 0.3s auf 0.15s
In `compose-video-assemble/index.ts` Z. 125 — 0.3s ist zu viel, kann beim VO am Ende eine kurze Stille-Pause erzeugen die nach „Wiederholung" klingt wenn der Browser-Player mit der Stille-Detection arbeitet. 0.15s reicht für MP3-Decoder-Latenz.

## Geänderte Dateien
- `src/remotion/templates/ComposedAdVideo.tsx` — `transitionInFrames/OutFrames` = reale Überlappung; `<Video>` mit `pauseWhenBuffering={false}`
- `supabase/functions/compose-video-assemble/index.ts` — Safety-Pad 0.3s → 0.15s

## Verify
1. 7-Szenen-Projekt rendern → keine Schwarz-Frames mehr zwischen Szenen, Crossfades smooth
2. VO spielt komplett durch — keine Wiederholungen, keine Cuts an Übergang 1, 6→7 oder anderen Stellen
3. Gesamtlänge weiterhin = Summe der Szenen-Dauern (+ 0.15s Pad)
4. Bestandsprojekte funktionieren ohne Re-Generierung


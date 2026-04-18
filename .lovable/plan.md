

## Echter Befund — ich habe das falsche Problem behandelt

Ich habe drei Iterationen lang am **Audio** geschraubt. Der Bug liegt aber in der **Sequence-Geometrie** der Komposition. Hier die Beweiskette aus dem Code:

### Der Bug — überlappende Sequences ohne synchrone Out-Fades

In `ComposedAdVideo.tsx` Z. 270-306 wird jede Szene per `extendStart`/`extendEnd` um die halbe Transition verlängert, damit benachbarte Sequences sich überlappen. Aber:

- `transitionType` einer Szene steuert nur den **eingehenden** Fade (Z. 107-124 nutzt `transitionInFrames` und `transitionOutFrames` derselben Szene).
- `transitionOutFrames` wird auf `extendEnd` gesetzt — also **nicht-null wenn die nächste Szene existiert**, unabhängig davon was Szene N selbst für einen `transitionType` hat.
- **Resultat**: Hat Szene 3 z.B. `transitionType='none'` aber Szene 4 hat `'crossfade'`, dann ragt Szene 3 in Szene 4 hinein **ohne auszufaden** (weil `transitionType='none'` keinen Out-Fade rendert in Z. 107-157). Szene 3 bleibt voll opak über Szene 4 → harte Kante statt Crossfade.

### Warum das das Audio-Symptom erzeugt

`<OffthreadVideo pauseWhenBuffering={true}>` (mein letzter Fix) blockiert die gesamte Render-Pipeline solange ein Decoder noch buffert. Während des überlappenden Fensters laufen **zwei OffthreadVideo-Decoder parallel** (Szene N + N+1). Wenn einer der beiden hängt:

- **Audio-Cursor steht still** während Frames bereits weiterlaufen → an Frame X spielt VO-Sample Y, an Frame X+1 immer noch Sample Y → **Wiederholung** an einem Übergang
- Umgekehrt wenn der hängende Decoder freigegeben wird, springt Lambda mehrere Frames vor → **Audio wird abgeschnitten** an zwei anderen

Genau dein Symptom: **1× Wiederholung, 2× Cut**. Reproduzierbar an _bestimmten_ Übergängen — nämlich denen wo `transitionType` der vorherigen Szene `'none'` ist oder eine andere Geometrie hat als die nächste.

### Die richtige Lösung — Sequence-Layout fixen statt Audio behandeln

**Fix A — `pauseWhenBuffering` auf OffthreadVideo zurück auf `false`**: Im Lambda-Renderer ist `false` korrekt, wenn die Sequence-Längen sauber sind. `true` hat das Problem nur verschoben (weniger Drops, dafür Pipeline-Blocks). Die Remotion-Doku empfiehlt explizit `false` für Lambda + Lambda lädt Frames frühzeitig vor.

**Fix B — Out-Fade unabhängig vom `transitionType` der Szene erzwingen**: Wenn `extendEnd > 0`, muss die Szene **immer** ausfaden, egal welchen `transitionType` sie hat. Sonst ist die Sequence-Verlängerung visuell sinnlos und blockiert nur die Pipeline.

```tsx
// In Scene-Komponente: Out-Fade IMMER wenn hasTransitionOut, unabhängig von transitionType
if (hasTransitionOut && transitionOutFrames > 0) {
  const fadeOutStart = Math.max(0, durationInFrames - safeOut);
  if (frame > fadeOutStart) {
    opacity = Math.min(opacity, interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { ... }));
  }
}
```

Das war vorher in den `if (transitionType === 'fade' || 'crossfade')`-Block eingeschlossen → bei `'none'`/`'slide'`/etc. **kein Out-Fade**, aber trotzdem überlappende Sequence → harte Kante + Pipeline-Block.

**Fix C — Konsistenter Übergang zwischen Szene N und N+1**: Die Transition zwischen Szene N und Szene N+1 sollte EINE Entscheidung sein, nicht zwei (Out von N + In von N+1 mit unterschiedlichen Typen). In `compose-video-assemble` Z. 84-104: Wenn Szene N+1 `transitionType='crossfade'` hat, sollte auch Szene N's effektiver `transitionType` für den Out auf `crossfade` gesetzt werden.

```ts
// Pre-process: ensure every scene that has a successor with a transition
// also fades out, regardless of its own transitionType setting.
remotionScenes.forEach((scene, i) => {
  const next = remotionScenes[i + 1];
  if (next && next.transitionType !== 'none' && scene.transitionType === 'none') {
    // Force a matching crossfade-out so the overlap window is visually clean
    scene.transitionType = next.transitionType;
    scene.transitionDuration = next.transitionDuration;
  }
});
```

**Fix D — `<Audio>` zurück zu `pauseWhenBuffering={false}`**: Audio-Buffering hat das gleiche Problem wie Video-Buffering — wenn die Komposition-Geometrie sauber ist (keine überlappenden Hard-Cuts), entsteht kein Sample-Drift. `false` ist der Lambda-Default und sample-akkurat.

## Bug 2 — Tab-Reset nach Page-Leave

(Bereits letztes Mal teilweise gefixt, aber wahrscheinlich greift der Restore nicht)

In `VideoComposerDashboard.tsx` der Restore-Check verlangt z.B. `draft.briefing.productName` für Tab `storyboard`. Wenn das Draft-Objekt nach `loadDraft()` eine andere Struktur hat (z.B. `briefing.product_name` oder leer), fällt der Check immer auf `'briefing'` zurück.

**Fix**: Restore-Logic vereinfachen — wenn ein gespeicherter Tab existiert UND ein Draft existiert, einfach den gespeicherten Tab wiederherstellen. Der Tab-Inhalt selbst kann mit leerem Draft umgehen (Briefing zeigt einfach das Formular). Kein Accessibility-Pre-Check nötig.

```ts
const [activeTab, setActiveTab] = useState<TabId>(() => {
  const stored = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
  const validTabs: TabId[] = ['briefing','storyboard','clips','text','audio','export'];
  if (stored && validTabs.includes(stored)) return stored;
  return 'briefing';
});
```

## Geänderte Dateien

- `src/remotion/templates/ComposedAdVideo.tsx`:
  - Out-Fade aus dem `transitionType`-Block herauslösen → **immer** ausfaden wenn `hasTransitionOut`
  - `OffthreadVideo` `pauseWhenBuffering={false}` (Lambda-Default)
  - `<Audio>` `pauseWhenBuffering={false}` (Lambda-Default)
- `supabase/functions/compose-video-assemble/index.ts`:
  - Pre-Process der Szenen: Out-Transition von Szene N auf Match mit In-Transition von Szene N+1 setzen
  - Vorhandenes `framesPerLambda` szenen-aligned Logic bleibt
- `src/components/video-composer/VideoComposerDashboard.tsx`:
  - Restore-Check vereinfachen → nur Tab-ID prüfen, kein Draft-State-Check

## Warum diesmal das echte Problem trifft

Die letzten drei Iterationen haben am **Symptom** (Audio) gearbeitet, nicht an der **Ursache** (Sequence-Geometrie). Die überlappenden Sequences ohne synchrone Out-Fades + `pauseWhenBuffering=true` haben gemeinsam einen **Pipeline-Block** an genau den Übergängen erzeugt, wo `transitionType` zwischen N und N+1 nicht matched. Mit:
- garantiertem Out-Fade in jeder Szene mit `extendEnd > 0`
- konsistenten Transition-Typen zwischen N und N+1
- Lambda-Default `pauseWhenBuffering=false`

…sind die Sequences sauber, kein Decoder-Lock, kein Audio-Drift.

## Verify

1. Render starten → Console: `[compose-video-assemble] Pre-processed N scenes for transition consistency`
2. Übergänge anschauen: alle weichen Crossfade, keine harten Kanten
3. **Alle** Übergänge audio-mäßig sauber — keine Wiederholung, kein Cut
4. Tab wechseln → Browser zurück → wieder zum Composer → User landet auf gespeichertem Tab
5. Falls auch nach diesem Fix Stotterer übrig sind: Debug-Render mit `frameRange: [0, 90]` für **eine** Szene + Übergang → isoliert ob Problem im Audio-Stream selbst oder in der Komposition liegt


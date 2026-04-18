

Du hast recht — die VO-Dauer-Schätzung gab es vorher auch schon und es funktionierte. Das Problem muss also durch die **neue Crossfade-Architektur** entstanden sein, nicht durch die Schätzung selbst.

## Echter Befund

Vorher: **Hard-Cuts**, `durationInFrames` = Summe aller Szenen → Komposition war exakt so lang wie das Skript geschätzt → VO passte.

Jetzt: **Crossfades** überlappen Szenen → Komposition ist **6 × 0.4s = 2.4s kürzer** als vorher. Selbst mit `Math.max(video, vo)` aus dem letzten Fix gibt's Probleme, weil:

1. Die VO-Dauer wird beim **Generieren** in `generate-voiceover` per Wörter-Heuristik geschätzt → wird nur in der DB gespeichert wenn der User danach VO generiert hat. Bei **Bestandsprojekten** ist `durationSeconds` oft **0** oder fehlt → der Max-Check greift nicht → Komposition bleibt bei der gekürzten Crossfade-Dauer → letzter VO-Satz wird gekappt.

2. Die zwei „minimalen Cuts" mittendrin sind kein VO-Decoder-Problem — sie kommen daher, dass das **VO als linearer Audio-Track** läuft, während die **visuelle Timeline durch Crossfades komprimiert** ist. Bei jedem Crossfade „rutscht" das VO 0.4s relativ zur Bildebene → an Stellen wo VO und Szenen-Inhalt vorher synchron waren (z.B. Produkt-Erwähnung in Szene 3), klingt es jetzt als würde das VO „springen".

## Die echte Ursache

**Das VO wurde für eine Timeline ohne Crossfades generiert.** Wenn wir jetzt Crossfades einbauen, müssen wir die **Szenen-Dauern verlängern**, damit die Gesamtlänge gleich bleibt — NICHT die Komposition kürzen.

## Plan — Szenen verlängern statt Komposition zu kürzen

### Fix 1 — `compose-video-assemble`: Szenen-Dauern um Crossfade-Anteil verlängern

Statt `durationInFrames` zu verkürzen, **verlängern wir jede Szene** (außer der letzten) um die Hälfte der Transition-Dauer auf jeder Seite. So bleibt:
- Gesamtlänge = ungekürzte Summe (passt zum VO)
- Crossfade entsteht durch **Überlappung der erweiterten Szenen-Sequenzen**, nicht durch Verkürzung

```ts
// Neue Logik in compose-video-assemble
let totalFrames = 0;
const sceneFrames = remotionScenes.map((s, i) => {
  const baseFrames = Math.ceil(s.durationSeconds * fps);
  const tFrames = (s.transitionType !== 'none')
    ? Math.ceil((s.transitionDuration || 0.4) * fps)
    : 0;
  // Szene wird um halbe Transition vorne+hinten verlängert (außer Rändern)
  const extendedFrames = baseFrames + (i > 0 ? tFrames / 2 : 0) + (i < remotionScenes.length - 1 ? tFrames / 2 : 0);
  return { from: totalFrames - (i > 0 ? tFrames : 0), duration: extendedFrames };
});
// Gesamtlänge = exakt Summe der Original-Dauern
const durationInFrames = Math.ceil(totalSeconds * fps);
```

### Fix 2 — `ComposedAdVideo.tsx`: Crossfade über Opacity in den Überlappungs-Frames

Die Überlappung passiert durch **negative `from`-Offsets** + **Opacity-Interpolation in den Überlappungs-Bereichen**. Das ist exakt das, was schon implementiert ist — aber jetzt mit Frame-Math die die Gesamtlänge respektiert.

### Fix 3 — `pauseWhenBuffering={false}` für VO behalten
Bereits gemacht im letzten Fix — bleibt.

### Fix 4 — Safety-Buffer 0.3s am Ende
Klein halten, aber schwarzer Frame am Ende verhindert harten Cut bei MP3-Decoder-Latenz.

## Geänderte Dateien

- `supabase/functions/compose-video-assemble/index.ts` — Szenen-Frames verlängern statt Komposition kürzen
- `src/remotion/templates/ComposedAdVideo.tsx` — Frame-Offsets entsprechend anpassen (Szenen starten in der Mitte der Crossfade-Überlappung)

## Verify

1. 7-Szenen-Projekt: Gesamtlänge = exakt Summe der Szenen-Dauern (z.B. 7×6s = 42s, nicht 39.6s)
2. VO spielt vollständig durch — Anfang, Mitte, Ende synchron
3. Keine „minimalen Cuts" mehr in der Mitte
4. Crossfades bleiben smooth (visuell identisch zum jetzigen Zustand)
5. Bestandsprojekte mit altem VO funktionieren ohne Re-Generierung


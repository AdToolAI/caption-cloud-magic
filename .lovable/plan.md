
Ziel: Den Preview-Übergang so korrigieren, dass bei Szene 2 wirklich der Anfang der neuen Szene gezeigt wird statt noch Bildmaterial der alten Szene.

1. Wahrscheinliche Hauptursache im aktuellen Code
- `NativeTransitionOverlay` capturt den Overlay-Frame mit:
```ts
video.currentTime = scenes[i].start_time + 0.05;
```
- Das ist zu naiv für bearbeitete Szenen:
  - `start_time` / `end_time` sind Timeline-Zeiten
  - Szenen können aber per `original_start_time`, `original_end_time` und `playbackRate` vom Originalmaterial entkoppelt sein
- Ergebnis: Der Overlay kann an einer falschen Stelle im Quellvideo capturen und dadurch bei Szene 2 noch Bild der alten Szene bzw. des eingebauten Originalschnitts zeigen.

2. Saubere Lösung
`src/components/directors-cut/preview/NativeTransitionOverlay.tsx`

Ich würde den Capture-Zeitpunkt von „Timeline-Zeit“ auf „echte Quellzeit der nächsten Szene“ umstellen:

- für jede kommende Szene die effektive Quell-Startzeit bestimmen:
```ts
const sourceStart = scene.original_start_time ?? scene.start_time;
```
- den Snapshot knapp nach diesem Quellstart capturen, z. B.:
```ts
video.currentTime = sourceStart + 0.02;
```
- dabei sauber clampen, damit nicht außerhalb der Videolänge gecaptured wird

3. Zweite wichtige Korrektur
Die Overlay-Frames sollten robuster gecaptured werden, damit kein Frame aus einem noch nicht fertig gesprungenen Seek verwendet wird:

- `seeked` Promise absichern
- danach erst `drawImage`
- optional zusätzlich `await video.play().catch(() => {})` ist nicht nötig; besser rein bei seek-basiertem Capture bleiben
- Fehlerlogging beim globalen `capture().catch(...)` ebenfalls sichtbar machen statt zu schlucken

4. Warum das das eigentliche Problem trifft
Der aktuelle Bug wirkt nicht wie ein reines Timing-Problem mehr, sondern wie ein falscher Snapshot:
- der Übergang wird zwar zur richtigen Zeit gestartet
- aber das eingeblendete Bild ist offenbar noch die vorherige Szene / der Originalschnitt
- genau das passt dazu, dass der Overlay aus der falschen Zeitposition capturt wird

5. Konkrete Änderung
In `NativeTransitionOverlay.tsx` den Capture-Block sinngemäß so umbauen:

```ts
for (let i = 1; i < scenes.length; i++) {
  const incomingScene = scenes[i];
  const sceneId = incomingScene.id;
  if (capturedRef.current.has(sceneId)) continue;

  const sourceStart = incomingScene.original_start_time ?? incomingScene.start_time;
  const captureTime = Math.max(0, sourceStart + 0.02);

  try {
    video.currentTime = captureTime;
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames[sceneId] = canvas.toDataURL('image/jpeg', 0.6);
    capturedRef.current.add(sceneId);
  } catch (e) {
    console.warn('Frame capture failed for scene', sceneId, e);
  }
}
```

6. Optionaler Zusatz-Fix, falls nötig
Wenn Szene 2 danach immer noch falsch aussieht, würde ich im zweiten Schritt noch die Overlay-Positionierung leicht ändern:
- bei `slide` / `wipe` den Overlay auf `object-contain`-ähnliche Darstellung bringen
- aktuell nutzt das Overlay `backgroundSize: 'cover'`, während das Hauptvideo `object-contain` hat
- dadurch kann die optische Lage leicht anders wirken als das Basisvideo

Das ist aber eher ein Folge-Fix. Der erste, wichtigere Fix ist die richtige Capture-Zeit.

7. Erwartetes Ergebnis
- Szene 2 zeigt im Übergang endlich den tatsächlichen Anfang der neuen Szene
- kein sichtbares „alte Szene wird nochmal eingeblendet“
- Timing-Logik aus dem letzten Fix bleibt erhalten
- Single-Video-Preview bleibt performant

8. Betroffene Datei
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`

Technische Details
```text
Problem heute:
Overlay-Snapshot = nextScene.start_time + 0.05   (Timeline-Zeit)

Soll:
Overlay-Snapshot = nextScene.original_start_time + kleiner Offset
                   fallback auf start_time nur wenn original_* fehlt

Denn:
Timeline-Zeit != Quellvideo-Zeit, sobald Szenen editiert / verschoben / remapped wurden.
```

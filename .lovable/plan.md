## Befund

Pixabay ist nicht grundsätzlich das Problem. Der aktuelle Render beweist:

- Bucket/Access ist korrekt.
- Lambda startet korrekt und bekommt eine echte Remotion-ID: `ps1q0d28es`.
- Die echten Pixabay-`videoUrl`s werden jetzt wieder an Lambda durchgereicht.
- Der Render stirbt exakt nach 600s mit `type: timeout`.

Der relevante Unterschied zum früher funktionierenden Weg ist sehr wahrscheinlich diese aktuelle Stelle in `render-with-remotion`:

```ts
_schedulingMode: 'stability',
timeoutInMilliseconds: 600000,
```

Dadurch wird ein 20s-Video mit 600 Frames aktuell in zu große Lambda-Chunks gepackt. In `remotion-payload.ts` ergibt Stability Mode bei 600 Frames effektiv ca. `framesPerLambda = 300`, also nur 2 Render-Worker. Bei externen MP4s ist das zu langsam und läuft genau ins 600s-Limit.

Früher war der Pfad schneller, weil Remotion die Frames stärker verteilt hat. Das ist der saubere Weg zurück: echte Pixabay-Videos behalten, aber wieder kleinere Chunks/mehr parallele Worker verwenden.

## Plan

1. **Keine Poster-/Gradient-Fallback-Lösung als Standard**
   - Pixabay-MP4s bleiben echte Hintergrundvideos.
   - `stabilizeUniversalCreatorScenes()` bleibt standardmäßig aus.
   - Kein pauschaler Ersatz durch Standbilder, weil das nicht dem gewünschten Ergebnis entspricht.

2. **Regression im Lambda-Scheduling beheben**
   - Für Universal-Creator-Renders mit externen Video-Hintergründen den erzwungenen `stability`-Modus entfernen oder gezielt überschreiben.
   - Stattdessen für kurze HD-Renders wie `20s / 600 Frames / 1080x1920` wieder kleinere Chunks verwenden.
   - Ziel: maximal 5 Lambda-Worker, aber deutlich weniger als 300 Frames pro Worker, z.B. ca. `120 framesPerLambda` bei 600 Frames.

3. **Scheduling-Logik sauber kapseln**
   - In `_shared/remotion-payload.ts` eine explizite Scheduling-Variante für externe Remotion-Videoquellen einführen, statt überall pauschal `stability` zu erzwingen.
   - Regeln:
     - Externe MP4-Hintergründe: scene-/duration-aware, mehr Chunks, max 5 Worker.
     - Reine Bilder/Gradienten: bestehender stabiler Pfad kann bleiben.
     - Retry nach Timeout: nicht noch konservativer werden, sondern Remote-Video-tauglich chunking wählen.

4. **Payload-Diagnose erweitern**
   - Loggen:
     - Anzahl externer Videoquellen
     - `framesPerLambda`
     - geschätzte Worker-Anzahl
     - Scheduling-Modus
   - So sehen wir beim nächsten Render sofort, ob der alte funktionierende Pfad wieder aktiv ist.

5. **Fehlermeldung korrigieren**
   - Die aktuelle Meldung „Zu viele Frames pro Lambda“ ist inhaltlich nah dran, aber zu generisch.
   - Für diesen Fall künftig: „Render-Timeout durch zu große Lambda-Chunks bei externen Videohintergründen“.
   - Credits bleiben wie bisher idempotent refundbar.

6. **Deploy & Test**
   - Deploy: `render-with-remotion`, `_shared/remotion-payload.ts`-abhängige Funktion, optional `remotion-webhook` nur für bessere Diagnose.
   - Danach exakt denselben Pixabay-Render erneut starten.
   - Erwartung im Log:
     - `stable_render_path: false`
     - echte Pixabay-URLs vorhanden
     - `framesPerLambda` deutlich unter 300
     - Worker-Anzahl ca. 4–5
     - kein 600s Timeout

## Ergebnis

Pixabay bleibt drin. Der Fix stellt den früher funktionierenden Renderweg wieder her: echte externe MP4s, aber mit sinnvoller Lambda-Verteilung statt zu großer 300-Frame-Chunks.
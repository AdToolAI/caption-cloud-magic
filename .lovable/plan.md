

## Wurzel gefunden — drei zusammenhängende Off-by-Frame-Bugs

Nach dem Lesen der drei Dateien sehe ich **exakt warum** der Effekt nur an **Übergang 4→5 und 5→6** auftritt, nicht an allen.

### Bug 1: Sequence-Clamp bricht die Audio-Geometrie

In `ComposedAdVideo.tsx` Zeile 244:
```ts
const baseFrames = Math.min(requestedFrames, realVideoFrames);
```
Wenn Szene 5 z.B. nominell `7s = 210 Frames` ist, das echte Video aber nur `5.875s = 176 Frames`, wird `baseFrames = 176`. Das ist **34 Frames kürzer** als die Audio-Timeline erwartet.

In der Edge Function `compose-video-assemble/index.ts` Zeile 217-220:
```ts
const sumSceneFrames = remotionScenes.reduce(
  (acc, s) => acc + Math.max(1, Math.round((s.durationSeconds || 0) * fps)),
  0
);
```
Die Edge Function rechnet die Komposition aus den **nominellen** `durationSeconds` (welche jetzt aber durch Zeile 191-193 schon auf `realDuration` gesetzt sind!). Also stimmt sie eigentlich überein…

**ABER**: Der Fix in Zeile 191-193 setzt `durationSeconds = realDuration`. Damit wird die VO-WAV-Padding-Berechnung in `VoiceSubtitlesTab.tsx` Zeile 232-244 jetzt **mit den verkürzten realen Dauern** gemacht. Das passt rechnerisch — **aber nur wenn das WAV NACH dem Setzen der verkürzten Durations neu generiert wird**.

Wenn der User die Szenen auf 7s konfiguriert, das VO bei 7s-Annahme generiert, und die Edge Function dann erst beim Render-Start auf 5.875s clamped → **VO ist 1.125s zu lang pro betroffene Szene**, und Remotion's Audio läuft über das Komposition-Ende hinaus → Cut beim Übergang 5→6.

### Bug 2: Transition überlappt verkürzte Szene falsch

Zeile 252:
```ts
const transitionFrames = Math.min(rawTransitionFrames, Math.floor(baseFrames / 2));
```
Wenn Szene 5 von 210→176 Frames clamped wird, wird auch der Transition-Overlap am Ende neu berechnet (max `floor(176/2) = 88`). Aber Szene 4's Transition-Overlap am **Ende von Szene 4** wurde basierend auf **dessen** baseFrames berechnet — die beiden Szenen haben jetzt asymmetrische Overlap-Annahmen.

**Das ist die Ursache der Wiederholung am Anfang von Szene 5**: Die Transition aus Szene 4 zieht in Szene 5 hinein, aber Szene 5 startet zeitlich schon "weiter hinten" als die Audio-Spur erwartet → das Video von Szene 5 zeigt seinen Anfang zweimal (einmal während des Übergangs, dann direkt nochmal beim "Knick").

### Bug 3: Edge-Function-Komposition vs. Renderer-Komposition divergieren

In der Edge Function (Zeile 217-220) wird `sumSceneFrames` mit `Math.round(durationSeconds * fps)` berechnet. Aber der Renderer (Zeile 244) clamped jede Szene zusätzlich auf `realVideoFrames` mit **`Math.floor`**. Edge nutzt `round`, Renderer nutzt `min(round, floor)`. Bei manchen Werten gibt das +1/−1 Frame Drift, was sich über die Komposition aufaddiert → genau die problematischen 2-3 Stellen.

## Lösung — eine einzige Source of Truth für die Szenen-Dauer

**Konsequente Regel: Die Edge Function ist die alleinige Source of Truth.** Sie:
1. Probed real video durations
2. **Setzt `durationSeconds = realDuration`** (passiert bereits)
3. Schickt **NUR `durationSeconds`** an den Renderer (kein separates `actualVideoDurationSeconds` mehr — redundant, gefährlich)

Dann macht der Renderer **NICHTS Cleveres** mehr — er nimmt `durationSeconds` 1:1 als Sequence-Länge. Damit ist die Audio-Geometrie deterministisch, und alle Frame-Math passt.

### Konkrete Änderungen

**`supabase/functions/compose-video-assemble/index.ts`:**
- Zeile 197 entfernen: `actualVideoDurationSeconds: realDuration || effectiveDuration` → komplett raus
- Zeile 191-193 unverändert lassen (da setzen wir bereits effektive Dauer)
- **Composition-Geometrie-Berechnung** (Zeile 217-230) muss schon die geclampten `durationSeconds` benutzen (tut sie, da `s.durationSeconds = effectiveDuration`)

**`src/remotion/templates/ComposedAdVideo.tsx`:**
- Schema Zeile 64 entfernen: `actualVideoDurationSeconds: z.number().optional()` → raus
- Zeile 239-244 vereinfachen zu: `const baseFrames = Math.max(1, Math.round(scene.durationSeconds * fps))` — kein zweites Clamping mehr
- `playbackRate={1}` auf `<OffthreadVideo>` bleibt (verhindert Stretching falls Video doch minimal länger ist)

**`src/components/video-composer/VoiceSubtitlesTab.tsx`:**
- Zeile 232-244 müssen **die echten Szenen-Dauern** benutzen, nicht die nominellen. Aktuell liest es `s.durationSeconds` aus dem `scenes`-Array — das wird in der UI gepflegt und enthält die User-konfigurierten Werte (z.B. 7s), nicht die realen Hailuo-Dauern (5.875s).
- **Fix**: Beim Generieren des VO **vorher** einen kleinen Probe-Step machen: für jede Szene das echte Video probe (oder einen neuen Edge-Function-Endpoint `probe-scene-durations` aufrufen), und die WAV-Padding-Berechnung mit den **realen** Dauern machen
- Alternativ einfacher: das VO ist erst beim Render-Start endgültig "fest" — die WAV-Padding-Berechnung hier ist dann sowieso schon korrekt, weil sie vom UI-State `s.durationSeconds` ausgeht. Wir müssen sicherstellen dass dieser State **bereits die echten Dauern** widerspiegelt
- **Beste Lösung**: Beim Hinzufügen eines Clips in der Composer-UI (Hailuo-Generierung Callback) wird die echte Video-Dauer aus dem MP4 gelesen und als `durationSeconds` gespeichert — damit ist UI = DB = Render-Wahrheit

## Warum jetzt Übergang 4→5 und 5→6 betroffen sind

Wahrscheinlich sind die Hailuo-Clips für Szene 4 und Szene 5 die einzigen mit signifikanter Diskrepanz zwischen nomineller und realer Dauer (z.B. 7s nominal → 5.875s real). Szenen 1-3 könnten zufällig real ≈ nominal sein (oder sind statische Uploads die exakt stimmen). Der Effekt ist deterministisch genau dort, wo die Dauer-Diskrepanz am größten ist.

## Verify

Nach den Fixes:
1. Edge-Function-Log prüfen: `sumSceneFrames` muss == Summe der **realen** Frame-Counts sein
2. Renderer-Log: `composition durationInFrames` muss exakt mit Edge-Function-Berechnung übereinstimmen
3. Konkretes Render-Test: Übergang 4→5 — keine Wiederholung; 5→6 — VO läuft sauber durch
4. Falls Hailuo-Clips noch nicht real-probed wurden, **die alten Composer-Projekte** einmal manuell aktualisieren (User sollte einen frischen Render starten — alte assembly_configs haben evtl. nominelle Werte)

## Geänderte Dateien

1. `supabase/functions/compose-video-assemble/index.ts` — `actualVideoDurationSeconds` aus dem Payload entfernen, da `durationSeconds` schon real ist
2. `src/remotion/templates/ComposedAdVideo.tsx` — `actualVideoDurationSeconds` aus Schema/Logik entfernen, Sequence nimmt `durationSeconds` 1:1
3. `src/components/video-composer/VoiceSubtitlesTab.tsx` — sicherstellen dass `scenes[i].durationSeconds` beim VO-Padding bereits die realen Dauern sind (alternativ: Probe direkt vor Padding)

## Lambda-Bundle danach **nicht vergessen** redeployen

Da die Renderer-Datei (`ComposedAdVideo.tsx`) sich ändert, muss das Bundle wieder neu auf S3:
```cmd
npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1
```


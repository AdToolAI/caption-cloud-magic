
Aktueller Befund (präzise):
- Der Scheduling-Fehler ist behoben. Die Invocation läuft jetzt stabil durch:
  - `invoke-remotion-render` liefert 200
  - echte `real_remotion_render_id` wird zurückgegeben
  - Payload enthält korrekt `framesPerLambda`, `concurrency: null`, `concurrencyPerLambda: 1`
- Der neue Crash kommt aus dem Remotion-Lambda-Render selbst (Webhook-Error), nicht mehr aus dem Invocation-Guard:
  - `TypeError: Cannot read properties of undefined (reading 'length')`
  - Stack kommt aus gebündeltem Lambda-Code (`/var/task/index.js`), also aus Render-/Template-Pfad.

Isolierte relevante Dateien:
1) `src/remotion/components/ProfessionalLottieCharacter.tsx`
2) `src/remotion/components/LottieIcons.tsx`
3) `src/remotion/utils/premiumLottieLoader.ts`
4) `supabase/functions/auto-generate-universal-video/index.ts` (InputProps-Aufbau)
5) `src/remotion/templates/UniversalCreatorVideo.tsx` (Schema/Props-Härtung)

Web/Docs-Abgleich:
- Remotion-Doku zu Lambda-Fehlern bestätigt: Bei solchen Fehlern liegt die Ursache oft in React-/Template-Code oder Input-Daten des Bundles (nicht im Invoke-Transport).
- Damit passt das Fehlerbild: Invocation erfolgreich, Render fällt später mit Runtime-TypeError.

Do I know what the issue is?
- Ja: Sehr wahrscheinlich wird an mindestens einer Stelle ungültiges Lottie-JSON als `animationData` akzeptiert und an `@remotion/lottie` übergeben. Dort wird intern typischerweise auf Arrays wie `layers` zugegriffen; wenn diese fehlen, entsteht genau `reading 'length'`.
- Zusätzlich existiert ein zweiter Risikofaktor: inkonsistente Scene-Daten (`type: "benefit"`/fehlendes `order`) gegenüber dem `UniversalCreatorVideoSchema`. Das muss ebenfalls gehärtet werden, damit der Render robust bleibt.

Exaktes Problem:
- Die Pipeline ist transportseitig korrekt, aber der Render-Bundle-Pfad vertraut externen/variablen JSON-Daten (Lottie + Szenenstruktur) zu stark.
- Dadurch kann ein invalides Objekt bis in den Renderer rutschen und dort mit `.length` auf `undefined` crashen.

Umsetzungsplan (gezielt, in Reihenfolge):
1) Lottie-Validierung zentral erzwingen
- In `premiumLottieLoader.ts` eine strikte Guard-Funktion ergänzen (z. B. `isValidLottieData(data)`), die mindestens prüft:
  - Objekt vorhanden
  - `v` als String vorhanden
  - `layers` ist Array
  - optionale weitere Strukturfelder plausibel
- Nur validierte Daten aus `loadFromLocal`/`loadFromCDN` übernehmen.
- Bei invaliden Daten: Quelle verwerfen und nächste Quelle/fallback nutzen (nie invalides JSON an `<Lottie />` geben).

2) LottieIcons ebenfalls absichern
- In `LottieIcons.tsx` nach `response.json()` dieselbe Validierung anwenden.
- Bei invalidem JSON sofort `error: true` setzen -> Emoji-Fallback.
- Keine direkte Übergabe unvalidierter `animationData`.

3) Runtime-Fallback im Character härten
- In `ProfessionalLottieCharacter.tsx` vor dem Rendern des `<Lottie />` nochmals final prüfen:
  - Wenn `animationData` ungültig: statt `<Lottie />` direkt SVG-Fallback rendern.
- Dadurch ist selbst bei zukünftigen Regressionen ein Hard-Crash ausgeschlossen.

4) Input-Daten für Szenen robust machen
- In `auto-generate-universal-video/index.ts` bei `remotionScenes`:
  - `order` explizit setzen (`index + 1`)
  - nicht unterstützte Typen (z. B. `benefit`) auf erlaubte Typen mappen (z. B. `feature`)
- In `UniversalCreatorVideo.tsx` Schema tolerant halten bzw. Mapping vor Schema sicherstellen, damit keine fragile Enum-Kante bleibt.

5) Forensik-Logging erweitern (einmalig)
- Beim Start kurz loggen:
  - gewählter Character-Renderpfad (`lottie` vs `svg`)
  - Validierungsresultat der geladenen Lottie-Quelle
  - finaler Scene-Type pro Szene nach Mapping
- Damit ist der nächste Fehler direkt zuordenbar statt „minified stack only“.

Validierung nach Fix:
1) Frischen Universal-Run starten (kein Retry).
2) Erwartet:
- `invoke-remotion-render` weiter erfolgreich
- kein Webhook-Fehler `reading 'length'`
- Status geht zu `completed`
3) Negativtest:
- Lottie absichtlich „kaputt“ simulieren (bzw. invalid source) -> Render darf nicht crashen, sondern muss mit SVG/Emoji-Fallback weiterlaufen.
4) Ergebnisprüfung:
- Video in Media Library vorhanden
- `video_renders.error_message` bleibt leer/null.

Risiko/Trade-off:
- Kurzfristig kann die visuelle Qualität einzelner Szenen auf SVG/Emoji-Fallback zurückfallen, wenn externe Lottie-Quellen invalid sind.
- Vorteil: Render wird stabil und bricht nicht mehr hart ab.

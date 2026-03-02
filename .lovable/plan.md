
Problem rephrased (klar und präzise):
Der Fehler ist weiterhin **„Both 'framesPerLambda' and 'concurrency' were set“**.  
Der entscheidende Punkt: Beim neuesten fehlgeschlagenen Universal-Run ist im gespeicherten `lambdaPayload` **kein `framesPerLambda` mehr**, aber weiterhin `concurrencyPerLambda: 1`. Trotzdem meldet Remotion später den Konflikt. Das bedeutet: Der Konflikt entsteht sehr wahrscheinlich **innerhalb der Remotion-Lambda-Runtime / Payload-Interpretation**, nicht nur in unserem offensichtlichen Caller-Code.

Do I know what the issue is?
**Ja – mit hoher Wahrscheinlichkeit.**  
Die aktuelle Normalisierung setzt standardmäßig `concurrencyPerLambda: 1`. In Kombination mit Remotion v4.0.424 kann das intern als konkurrierende Scheduling-Strategie enden (zusammen mit intern gesetztem `framesPerLambda` bzw. `concurrency`), wodurch genau dieser Fehler entsteht.

Was ich im System verifiziert habe:
1. In `universal_video_progress` (neuester betroffener Run) sind Top-Level-Keys im Payload:
   - `concurrencyPerLambda` vorhanden
   - `framesPerLambda` **nicht** vorhanden
2. Trotzdem steht in `video_renders.error_message` derselbe Konflikt.
3. Remotion-Source (validate-frames-per-function) zeigt: Der Error wird geworfen, wenn intern sowohl `framesPerFunction` als auch `concurrency` ungleich `null` sind.
4. Dadurch ist der beste stabile Fix: **keine Scheduling-Felder erzwingen** (weder `framesPerLambda` noch `concurrency` noch `concurrencyPerLambda`) außer explizit gewollt.

Umsetzungsplan (robuster Fix statt weiterer Einzelfixes):
1) Shared Normalizer auf „neutrales Scheduling“ umstellen
- Datei: `supabase/functions/_shared/remotion-payload.ts`
- Änderung:
  - `concurrencyPerLambda` **nicht mehr defaulten** auf `1`
  - `framesPerLambda` **nicht defaulten**
  - `concurrency`-Alias immer entfernen
  - Standardpfad: alle drei Scheduling-Felder löschen, wenn nicht explizit angefordert
- Ziel: Remotion entscheidet Scheduling vollständig selbst (Default-Algorithmus), kein Konfliktfeld mehr im Start-Payload.

2) Invoke-Hardening erweitern (forensisch + deterministisch)
- Datei: `supabase/functions/invoke-remotion-render/index.ts`
- Änderung:
  - Vor AWS-Call `payload_key_flags` und `scheduling_strategy` in `video_renders.content_config` persistieren (nicht nur loggen)
  - Damit ist bei jedem Fail in DB sofort sichtbar, welche Scheduling-Keys wirklich gesendet wurden.
- Nutzen: Kein Blindflug mehr bei nächsten Fehlern.

3) Universal Creator Flows explizit scheduling-frei halten
- Dateien:
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - `supabase/functions/render-directors-cut/index.ts`
- Änderung:
  - Sicherstellen, dass dort keinerlei Scheduling-Felder gesetzt werden.
- Hinweis: `durationInFrames/fps/width/height` bleiben explizit erhalten (wichtig für stabile Metadata-Berechnung).

4) Stale-Run-Schutz im UI-Fehlerbild
- Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Änderung:
  - Bei Fehleranzeige klar an den aktuellen `renderId` koppeln und alte fehlgeschlagene Runs nicht erneut als „aktueller“ Fehler anzeigen.
- Nutzen: Verhindert, dass alte Fehlermeldungen als neuer Fix-Fehlschlag wirken.

5) Validierung nach Umsetzung
- Einen komplett neuen Universal-Video-Run starten (kein Retry alter Job-ID).
- Erwartung:
  - In `universal_video_progress.result_data.lambdaPayload` keine Scheduling-Keys (`framesPerLambda`, `concurrency`, `concurrencyPerLambda`)
  - `video_renders.content_config.payload_key_flags` bestätigt scheduling-frei
  - Kein Fehlertext mehr mit „Both framesPerLambda and concurrency“
  - Statuskette endet in `completed`.

Technischer Hintergrund (kurz):
- Bisherige Fixes haben offensichtliche Doppelbelegung reduziert, aber der Default `concurrencyPerLambda: 1` bleibt ein Risiko.
- Bei Remotion v4.0.424 existiert zusätzlich das neue `concurrency`-Konzept; diese Überschneidung macht „explizite Scheduling-Steuerung“ fragil.
- Deshalb ist die stabilste Strategie in eurem Fall: **Scheduling vollständig Remotion überlassen**, nur Render-Metadaten explizit senden.

Reihenfolge der Implementierung:
1. `_shared/remotion-payload.ts` (zentraler Hebel)
2. `invoke-remotion-render` Persistenz der Diagnostics
3. Caller-Funktionen säubern
4. UI-Stale-Fehlerdarstellung härten
5. End-to-end Verifikation mit frischem Job

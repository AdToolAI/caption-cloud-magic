
## Ziel
Remotion-“Cloud” (egal ob Managed/Cloud Run) kann **dieselbe Videoqualität** liefern wie Lambda, weil die Qualität primär von **eurem Remotion-Template (UniversalCreatorVideo)**, den **Assets** und den **Encoding-Settings** abhängt – nicht davon, *wo* gerendert wird.  
Euer akutes Problem ist nicht “Qualität vs. Lambda”, sondern **Stabilität / Infrastruktur-Fehler**, die verhindern, dass überhaupt ein Video fertig wird.

Da du in den Fragen “**Lambda stabilisieren**”, “**Qualität + Stabilität**” und “**Canary Rollout**” gewählt hast, ist der schnellste Weg zu “volle Qualität”:

1) **Rendering muss zuverlässig fertig werden**, ohne die Quality-Baseline (30fps, Effekte, Lottie, etc.) zu senken.  
2) Danach kann man *optional* auf andere Render-Infrastrukturen wechseln – aber das ist aktuell nicht der Engpass.

---

## Was wir aus euren Daten jetzt sicher wissen (Root Causes)
Aus DB-Auswertung der letzten 14 Tage (source = universal-creator):

- **Completed: 4** vs **Failed: 249** (extrem niedrige Erfolgsquote)
- Häufigste Failure-Snippets:
  1. **113×** `Cannot read properties of undefined (reading 'length')`
  2. **90×** `AWS Concurrency limit reached`
  3. **6×** `Both framesPerLambda and concurrency were set`
  4. **6×** Lottie `delayRender ... not cleared`
  5. **7×** `ffprobe` Exit 1 (Audio kaputt)
  6. **6×** `Version mismatch ... 120sec` (deutet auf inkonsistente Lambda/Site-Konfiguration hin)

Zusätzlich: `error_category` ist bei **177** Failures **null** → wir können viele Fehler aktuell nicht sauber steuern (Retry-Strategie, Canary-Auswertung, etc.).

---

## Einschätzung “Remotion Cloud / Cloud Run statt Lambda?”
### Qualität
- **Ja**, gleiche Qualität ist grundsätzlich möglich, weil die gleichen Compositions/Assets gerendert werden.
- Unterschiede betreffen **Speed, Limits, Stabilitätsfeatures**, nicht die Bild-/Tonqualität.

### Preis
- Laut Remotion-Doku ist **Cloud Run compute-seitig oft günstiger** (kein Distributed Rendering), aber:
  - Cloud Run ist **Alpha / nicht aktiv weiterentwickelt** (offiziell so dokumentiert).
  - Ihr verliert Features/Ergonomie, die ihr gerade braucht (Webhooks, Polling, ausgereifte Tooling/Fehlerbilder).
- Für euren konkreten Fall wäre ein Infrastrukturwechsel jetzt **Risikotreiber**, weil ihr zuerst die “Pipeline deterministisch” bekommen müsst (Fehlerklassifikation, Audio-Validierung, Scheduling-Guards, Bundle/Version-Sync).

**Fazit:** Cloud Run/“Remotion Cloud” löst nicht automatisch eure Root Causes. Es kann Concurrency-Probleme reduzieren, aber ihr habt zusätzlich `.length`/Bundle/Schema-Themen, Audio-Korruption, Version-Mismatch.

---

## Plan (r39) — “Volle Qualität” durch Stabilitäts-Fixes (ohne Qualitätsreduktion) + Canary Rollout

### A) Observability & deterministische Steuerung (Pflicht, sonst drehen wir uns weiter)
**Ziel:** Jede Failure bekommt **immer** eine strukturierte Kategorie + Fingerprint, damit wir:
- retrybar vs. fatal sauber unterscheiden
- Canary sauber auswerten
- zielgerichtet gegen Root Causes arbeiten

**Änderungen**
1. `supabase/functions/invoke-remotion-render/index.ts`
   - Bei **immediate failures** zusätzlich `content_config.error_category` **immer setzen** (analog zu classifyImmediate).
2. `supabase/functions/remotion-webhook/index.ts`
   - Sicherstellen, dass bei `type=error|timeout` **immer** `content_config.error_category` gesetzt ist (auch wenn Matching/RenderRow nicht sauber gefunden wird).
3. `supabase/functions/check-remotion-progress/index.ts`
   - Wenn `progress.json` errors liefert, `error_category` persistieren (teilweise vorhanden) – und sicherstellen, dass auch `universal_video_progress.result_data.errorCategory` konsistent gesetzt wird.

**Akzeptanzkriterium**
- `video_renders.status='failed'` hat in >95% Fälle `content_config.error_category` != null.

---

### B) Concurrency-Root-Cause entschärfen, ohne Quality-Downgrade
**Ziel:** 30fps + volle Effekte behalten, aber **AWS Concurrency Limit** nicht mehr reißen.

**Ansatz (Canary Rollout): “Stabilitäts-Scheduling”**
1. `supabase/functions/_shared/remotion-payload.ts`
   - Neue Option in `calculateScheduling()` / `normalizeStartPayload()`:
     - `schedulingMode: 'distributed' | 'stability'`
   - In `stability`:
     - **deutlich weniger Lambdas** (z.B. `TARGET_MAX_LAMBDAS=1..2`), kein fps drop
     - D.h. `framesPerLambda = durationInFrames` (1 Lambda) oder `ceil(durationInFrames/2)` (2 Lambdas)
2. `supabase/functions/auto-generate-universal-video/index.ts`
   - Canary-Rollout-Logik: z.B. 10–20% neuer Jobs (oder nur für bestimmte Nutzer) nutzen `stability` Mode.
   - Für Retries nach `rate_limit` soll **früher** auf `stability` Mode geswitcht werden (statt nur “maxLambdas - 2”).
3. `supabase/functions/invoke-remotion-render/index.ts`
   - Logging: Persistiere `content_config.scheduling_mode`, `framesPerLambda`, `estimatedLambdas`.

**Warum das “volle Qualität” unterstützt**
- Kein Abschalten von Lottie/FX als Standard.
- Kein fps-Reduktion als Standard.
- Wir opfern primär Geschwindigkeit, um Zuverlässigkeit zu gewinnen.

**Akzeptanzkriterium (Canary)**
- Canary-Gruppe zeigt deutlich höhere Success Rate als Control, bei identischen Qualitätsparametern (30fps, gleiche Resolution).

---

### C) Audio-Korruption an der Quelle eliminieren (statt später “Audio strip”)
**Ziel:** Nicht erst beim ffprobe-Crash reagieren, sondern **vor Renderstart** sicherstellen, dass Audio nutzbar ist.

**Änderungen**
1. `supabase/functions/auto-generate-universal-video/index.ts`
   - `selectBackgroundMusic()`:
     - Statt `limit: 1` → `limit: 5`
     - Pro Track: `HEAD` Request + Check `Content-Type` (audio/*) + `Content-Length` > Mindestwert
     - Nimm **den ersten validen**; sonst fallback auf kuratierte “known-good” URLs.
   - Gleiches Prinzip optional für `voiceoverUrl` (falls extern gehostet / instabil).

**Akzeptanzkriterium**
- `ffprobe` Fehler gehen gegen 0, ohne dass Standard-Qualität “ohne Audio” wird.

---

### D) Die “framesPerLambda vs concurrency” Konflikte komplett ausschließen
Ihr habt noch 6× den Scheduling-Konflikt. Das sollte “unmöglich” sein.

**Änderungen**
- In `normalizeStartPayload()`/Buildern explizit erzwingen:
  - `concurrency = null` (bereits vorhanden)
  - zusätzlich sicherstellen, dass nirgends `concurrency` versehentlich gesetzt wird (auch im strict-minimal payload ist `downloadBehavior` aktuell anders strukturiert – dort sollten wir ebenfalls sauber bleiben).
- In `invoke-remotion-render` ist bereits ein Guard; wir ergänzen Logging, welche Keys final in Payload landen.

**Akzeptanzkriterium**
- 0 neue Failures mit “Both framesPerLambda and concurrency were set”.

---

### E) Version-/Bundle-Synchronisation als “Stop-the-bleeding” SOP
Der `Version mismatch ... 120sec` Fehler zeigt, dass mindestens zeitweise eine **falsche Lambda-Funktion** oder ein **falsches ServeURL-Site** verwendet wird.

**Änderungen im Code**
- `getLambdaFunctionName()` in eine Shared-Funktion verschieben (z.B. `supabase/functions/_shared/aws-lambda.ts`) und in allen Render-Funktionen identisch verwenden, damit keine divergierenden Defaults/Parser existieren.

**Manuelle/konfig-Seite (außerhalb Code)**
- Einmalig prüfen/setzen:
  - `REMOTION_LAMBDA_FUNCTION_ARN` zeigt wirklich auf `...-600sec`
  - `REMOTION_SERVE_URL` zeigt auf die dazugehörige Site/Bundleversion
- Wenn ihr am Remotion-Template arbeitet: **Site muss redeployed werden**, sonst rendert Lambda alten Code.

**Akzeptanzkriterium**
- 0 neue “Version mismatch … 120sec” Events.

---

## Dateien (geplant)
- `supabase/functions/_shared/remotion-payload.ts` (stability scheduling mode + logging)
- `supabase/functions/auto-generate-universal-video/index.ts` (Canary routing + Audio validation + retry strategy)
- `supabase/functions/invoke-remotion-render/index.ts` (error_category persistence + scheduling metadata persistence)
- `supabase/functions/remotion-webhook/index.ts` (robust error_category persistence)
- `supabase/functions/check-remotion-progress/index.ts` (error_category + progress linkage consistency)
- optional: neue `_shared` Utility für Lambda-Function-Namen (single source of truth)

---

## Rollout (Canary)
1) Canary 10–20% “stability scheduling” aktivieren  
2) Metriken 24h beobachten:
   - success rate
   - median render time
   - cost per successful minute (aus euren Credits/Costs)
3) Schrittweise erhöhen auf 50% → 100% sobald stabil

---

## Validierung / Testplan
1) 5 Testvideos in Canary (unterschiedliche Kategorien/aspect ratios, mit Musik + Voiceover)  
2) Prüfen:
   - Fertigstellung (completed) ohne manuelle Eingriffe
   - Audio vorhanden & synchron (kein “strip”)
   - 30fps beibehalten
   - Keine Version-mismatch Fehler
3) Vergleich Control vs Canary Success Rate

---

## Antwort auf deine Frage (klar)
- **Ja**, Remotion auf anderer Infrastruktur kann die **gleiche Qualität** liefern.
- Aber: In eurem aktuellen Setup blockieren euch **Infrastruktur- und Konsistenzfehler**. Ein Wechsel “auf Remotion Cloud/Cloud Run” ist kein garantiertes Heilmittel und bringt neue Risiken (Cloud Run ist laut Doku Alpha/nicht aktiv entwickelt).
- Der schnellste Weg zu “volle Qualität” ist: **Lambda stabilisieren** (stability scheduling + Audio validation + deterministische errorCategories + Versionsync), per **Canary Rollout**, ohne Qualitätsreduktion als Standard.

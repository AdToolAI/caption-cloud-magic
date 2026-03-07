
Ziel: Den Fehler nicht mehr “vermuten”, sondern pro Renderlauf eindeutig isolieren (welches Subsystem crasht zuerst und warum).

Was wir bereits sicher wissen (aus Runtime-Daten):
- Aktueller Hauptfehler ist nicht mehr primär 429, sondern `lambda_crash` mit  
  `delayRender("Waiting for Lottie animation to load") not cleared after 298000ms`.
- Die letzte Retry-Kette enthält bereits `disableAllLottie=true`, `disableCharacter=true`, `disableLottieIcons=true`, `disableMorphTransitions=true`, läuft aber trotzdem in Lottie-Timeouts.
- In Logs steht gleichzeitig: `framesPerLambda=1440, fps=24, estTime=2880s, timeout=600s` → diese Konfiguration ist rechnerisch instabil und verfälscht die Diagnose.

Umsetzungsplan (r42: Error Isolation Mode)
1) Deterministische Forensik pro Versuch
- In `invoke-remotion-render` und `remotion-webhook` pro Attempt persistieren:
  - `attempt_id`, `source_progress_id`, `retry_attempt`
  - vollständige effective Flags (`diag`, `muted`, `audioCodec`, `framesPerLambda`, `fps`, `durationInFrames`)
  - `first_error_signature` (errorType + erste Stack-Zeile)
  - `failure_stage` (`invoke`, `lambda-runtime`, `webhook`, `progress-reconciliation`)
- Ziel: Jeder Fehlversuch ist 1:1 nachvollziehbar, ohne Console-Raten.

2) “Unmögliche” Scheduling-Kombinationen verhindern
- In `_shared/remotion-payload.ts` + Retry-Builder:
  - Wenn `needsFpsReduction===true`, zwingend reagieren (fps runter oder 2 Lambdas) statt trotzdem mit garantiertem Timeout zu starten.
  - Zusätzlich `est_runtime_sec` und `timeout_budget_ok` speichern.
- Ziel: Keine Runs mehr, die per Design nicht fertig werden können.

3) Harte Isolationsleiter statt generischer Retry
- Für `lambda_crash` feste Sequenz:
  - Attempt A: current stability mode
  - Attempt B: `disableAllLottie + disableSceneFx + disablePrecisionSubtitles + useCharacter=false + characterType=svg`
  - Attempt C: `strict-minimal payload` (nur minimal valid props, gleiche Infrastruktur)
- Entscheidung je Step anhand `error_signature` (nicht nur category).
- Ziel: Klar trennen, ob Crash aus Template-Subsystem, Payload-Form oder Infrastruktur kommt.

4) UI-Diagnosepanel auf “Root Cause sichtbar” erweitern
- In `UniversalAutoGenerationProgress` anzeigen:
  - aktiver Isolations-Step (A/B/C)
  - effektive Flags des laufenden Attempts
  - letzte `error_signature` + `failure_stage`
  - “Warum nächster Retry so konfiguriert ist”
- Ziel: Kein Blindflug mehr bei “Erneut versuchen”.

5) Verifikation mit reproduzierbarer Testserie
- 5 identische Runs mit gleichem Input (kein wechselnder Prompt) im Isolationsmodus.
- Erfolgskriterien:
  - Jeder fehlgeschlagene Attempt hat vollständige Forensikdaten.
  - Kein Attempt läuft mit `timeout_budget_ok=false`.
  - Es bleibt maximal eine dominante `error_signature` übrig.
  - Danach gezielter Fix nur für diese Signatur (statt weiterer Broad-Fixes).

Technische Details (kompakt):
- Betroffene Dateien:
  - `supabase/functions/_shared/remotion-payload.ts`
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - `supabase/functions/invoke-remotion-render/index.ts`
  - `supabase/functions/remotion-webhook/index.ts`
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Wichtigster Designpunkt:
  - Retry-Strategie von “best effort” auf “experimentell-deterministisch” umstellen (jede Stufe hat klare Hypothese).
- Erwarteter Effekt:
  - Innerhalb eines Debug-Zyklus ist eindeutig sichtbar, ob der verbleibende Fehler aus Lottie-Mounting, Payload-Normalisierung oder Laufzeitbudget stammt.

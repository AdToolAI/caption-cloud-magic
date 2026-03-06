
Ziel: Den neuen Render-Fehler `A delayRender() "Waiting for Lottie animation to load"` stabil beheben, ohne den normalen 30fps-Qualitätspfad grundsätzlich zu verschlechtern.

1) Befund aus den neuen Logs
- Fehler tritt reproduzierbar in `video_renders` auf, Kategorie wird aktuell als `unknown` gespeichert.
- Stack zeigt klar `@remotion/lottie` (`Lottie`-Komponente hängt im internen `delayRender`).
- Dadurch greift im Retry aktuell die falsche Strategie (FPS-Reduktion), statt gezielt Lottie zu entschärfen.

2) Implementierungsplan (r32: Lottie-Stall-Recovery)
- Schwerpunkt: saubere Fehlerklassifikation + gezielte Retry-Strategie für Lottie-Hänger.

A. Fehlerklassifikation vereinheitlichen (Backend + UI)
- Dateien:
  - `supabase/functions/remotion-webhook/index.ts`
  - `supabase/functions/check-remotion-progress/index.ts`
  - `supabase/functions/invoke-remotion-render/index.ts`
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Änderung:
  - Neue Erkennung für Muster wie:
    - `waiting for lottie animation to load`
    - `delayRender() ... lottie`
  - Diese Fehler werden als `lambda_crash` (statt `unknown`) klassifiziert.
  - Reihenfolge der Regex-Prüfung wird so angepasst, dass nicht versehentlich `timeout` matcht (weil im Text ein docs-link mit `timeout` vorkommt).

B. Retry-Strategie in Render-Only für Lottie-Crashes korrigieren
- Datei: `supabase/functions/auto-generate-universal-video/index.ts` (`runRenderOnlyPipeline`)
- Änderung:
  - Wenn `sourceErrorCategory === 'lambda_crash'` und Error-Message Lottie-Stall enthält:
    - Kein FPS-Downgrade (30fps bleibt).
    - Retry 1: Lottie-last reduzieren (mind. `disableLottieIcons=true`, `disableMorphTransitions=true`, `forceEmbeddedCharacterLottie=true`).
    - Retry 2/3: harter Fallback (`disableAllLottie=true`, inkl. Character-Lottie-Aus) für maximale Render-Stabilität.
  - Die gesetzten Fallback-Flags werden in `result_data` mitpersistiert, damit UI/Debug eindeutig zeigt, welcher Schutz aktiv war.

C. Observability/Canary korrigieren
- Datei: `supabase/functions/invoke-remotion-render/index.ts`
- Änderung:
  - `bundle_probe`-Canary auf r31/r32-Stand bringen (aktuell steht dort noch `r29-lambda240s`, was Debugging verfälscht).

3) Warum dieser Ansatz
- Der Fehler ist kein klassischer Kapazitäts- oder FPL-Fehler, sondern ein Lottie-Initialisierungs-Hänger.
- Deshalb ist „mehr/weniger FPS“ allein ineffektiv.
- Mit gezielter Lottie-Degradierung nur im Fehlerpfad bleibt der Standard-Qualitätspfad unangetastet, aber Retries werden zuverlässig.

4) Technische Details (kompakt)
- Kein Datenbankschema-Change nötig.
- Nur Code-Änderungen in Edge-Funktionen + Frontend-Klassifikation.
- Bestehende r31-Infrastruktur (600s / 8 Lambdas) bleibt unverändert.
- Retry-Backoff-Mechanik bleibt erhalten; nur die Fehlerroute wird präziser.

5) Validierung nach Umsetzung
- Testfall 1: Ein Run mit Lottie-Stall provozieren → Kategorie muss `lambda_crash` sein (nicht `unknown`).
- Testfall 2: Auto-Retry muss in Lottie-safe-Mode wechseln (sichtbar in `result_data`/Debug).
- Testfall 3: Render schließt erfolgreich ab (spätestens mit Retry 2/3).
- Testfall 4: Normale Runs ohne Lottie-Stall bleiben im vollen Qualitätsmodus (keine unnötigen Deaktivierungen).
- Testfall 5 (E2E): Vollen Universal-Flow inkl. Retry-Pfad manuell durchtesten (UI-Status, Retry-Zähler, finaler Output).

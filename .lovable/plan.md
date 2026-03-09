
Ziel: Fehler bleibt trotz „Deploy“, weil aktuell nicht der gleiche Code läuft wie im Repo.

1) Was ich verifiziert habe (Ist-Zustand)
- In `supabase/functions/auto-generate-universal-video/index.ts` ist der Scope-Fix im Repo vorhanden:
  - `functionStartTime` + `FUNCTION_TIMEOUT_MS` stehen in `runGenerationPipeline()` (Zeile ~484).
- Runtime-Logs zeigen aber weiterhin alten Build:
  - `ReferenceError: functionStartTime is not defined` in `generateSceneVisual` bei `index.ts:890`.
  - Diese Zeilen passen nicht zum aktuellen Repo (dort ist Zeile ~890 bereits Voiceover-Teil).
- DB-Status bestätigt das:
  - letzte Runs (`universal_video_progress`) sind `failed` mit `status_message: Fehler: functionStartTime is not defined`.
- Dein Screenshot zeigt ein Remotion-Site/Bundling-Deploy (S3 Serve URL), nicht zwingend ein aktualisiertes Backend-Funktions-Build.

2) Implementierungsplan (stabiler Fix + Deployment-Sync sichtbar machen)

A. Scope-Fix „hart“ und eindeutig machen (Code)
- In `auto-generate-universal-video/index.ts`:
  - Timing-Variablen in `runGenerationPipeline` auf eindeutige Namen umstellen:
    - `pipelineStartTime`
    - `pipelineTimeoutMs`
  - `generateSceneVisual` nutzt ausschließlich diese Pipeline-Variablen.
  - Unbenutzte gleichnamige Variablen im `serve()`-Handler entfernen, damit es keine Namens-Verwechslung mehr gibt.

B. Build-Version im Runtime-Log verankern (Diagnose)
- Konstante hinzufügen, z. B. `AUTO_GEN_BUILD_TAG = "r43-scopefix-2026-03-09-1"`.
- Bei Start von `serve()` und `runGenerationPipeline()` Build-Tag loggen.
- Build-Tag zusätzlich in `result_data` beim Progress speichern (z. B. `result_data.buildTag`), damit UI/DB sofort zeigt, welcher Build wirklich lief.

C. Fehlerdiagnose im UI robuster machen
- In `UniversalAutoGenerationProgress.tsx`:
  - Bei `status === failed` und Fehlertext `functionStartTime is not defined` klare Nutzer-Meldung:
    - „Backend-Version noch nicht synchron – bitte Retry starten“
  - Optional: dedizierter „Neu versuchen“-Pfad direkt anbieten (existierende Retry-Logik nutzen), statt nur generischer Fehler.

D. Deployment-Sync erzwingen
- Durch die obigen echten Codeänderungen wird ein frischer Backend-Funktions-Deploy ausgelöst.
- Danach gezielt prüfen, dass in Logs der neue `AUTO_GEN_BUILD_TAG` erscheint (das ist der harte Nachweis, dass nicht mehr der alte Build läuft).

3) Technische Details (kurz)
```text
Root Cause:
Repo-Code != aktiver Runtime-Build der Backend-Funktion.

Warum trotz „Deploy“?
Remotion-Bundle/Site-Deploy aktualisiert die Render-Site,
aber nicht automatisch denselben Backend-Funktions-Build,
der den Auto-Generation-Pipeline-Code ausführt.
```

4) Abnahme / Verifikation
- Log-Check:
  - neuer `AUTO_GEN_BUILD_TAG` sichtbar
  - kein `functionStartTime is not defined` mehr
- DB-Check:
  - neuer `universal_video_progress`-Run geht über `generating_visuals` hinaus
  - am Ende `status=completed` + `result_data.outputUrl` gesetzt
- End-to-End:
  - komplette Auto-Generierung im UI durchlaufen
  - danach müssen Play/Download wieder sichtbar sein.

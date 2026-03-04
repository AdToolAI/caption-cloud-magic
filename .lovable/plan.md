
Ziel nach Sichtung der aktuellen Logs
- Die r8-Kette ist jetzt wirklich aktiv (kein Deployment-Drift mehr):
  - `bundle_probe`: `r8-profileG-disableAllLottie-forensics,sanitizer=v8`
  - `diagnosticProfile` läuft A→G durch
  - `progressId` wird sauber bis in den Webhook durchgereicht
- Trotzdem scheitern alle Profile inkl. **G (disableAllLottie=true)** mit demselben Fehler:
  - `Cannot read properties of undefined (reading 'length')`
- Damit ist der Crash mit hoher Wahrscheinlichkeit **außerhalb** der drei Lottie-Komponenten.

Umsetzungsplan (nächste Iteration)
1) Diagnosematrix auf Nicht‑Lottie erweitern (H→J)
- Dateien:
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
  - `supabase/functions/auto-generate-universal-video/index.ts`
- Neue Profile:
  - H: `disablePrecisionSubtitles=true`
  - I: `disableSceneFx=true` (SceneTypeEffects + FloatingIcons)
  - J: `disableAnimatedText=true` (TextOverlay auf Plain Text ohne AnimatedText)
- Ziel: deterministisch isolieren, ob Untertitel, Scene-Effects oder Textanimation den `.length`-Pfad auslösen.

2) Neue harte Diag-Flags im Render-Template verdrahten
- Datei: `src/remotion/templates/UniversalCreatorVideo.tsx`
- Maßnahmen:
  - `DiagToggleSchema` um `disableSceneFx`, `disableAnimatedText` erweitern.
  - Guards:
    - `PrecisionSubtitleOverlay` nur wenn `!disablePrecisionSubtitles`
    - `SceneTypeEffects` + `FloatingIcons` nur wenn `!disableSceneFx`
    - `TextOverlay` nutzt bei `disableAnimatedText` reinen String-Render statt `AnimatedText`
- Ziel: klare, reproduzierbare Subsystem-Abschaltung ohne Qualitätsverlust im Standardprofil A.

3) Forensik auf Frame-0 Marker für Nicht‑Lottie ausbauen
- Datei: `src/remotion/templates/UniversalCreatorVideo.tsx`
- Neue Marker (Frame 0 / Scene-Start):
  - `[FORENSIC] ENTER_SCENE_FX`
  - `[FORENSIC] ENTER_TEXT_ANIM`
  - `[FORENSIC] ENTER_PRECISION_SUBTITLE`
  - plus Profil/Flags im selben Logblock
- Ziel: letzter erreichter Block vor Crash sofort erkennbar.

4) Retry-Dedupe im Frontend (verhindert doppelte Retrigger)
- Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Problem aus Console-Verhalten: `onRetry` kann aus mehreren Pfaden fast gleichzeitig feuern (DB-Update + Polling).
- Fix:
  - `retryTriggeredRef` einführen, pro Lauf nur **ein** Auto-Retry zulassen.
  - Bei Retry sofort Polling/Subscription strikt stoppen und Ref erst beim Neu-Mount zurücksetzen.
- Ziel: keine Doppel-Inkremente, keine vorzeitige „Max retries reached“-Kaskade.

5) Stale/Zombie-Status bereinigen (historische Altlasten)
- Dateien:
  - `supabase/functions/check-remotion-progress/index.ts`
  - optional `supabase/functions/debug-render-status/index.ts`
- Maßnahmen:
  - Beim Polling nur den aktuellen Lauf über `progressId`/`renderId` finalisieren.
  - Alte `processing`/`pending` Einträge (über TTL) sichtbar als „stale“ kennzeichnen und kontrolliert auf `failed` ziehen.
- Ziel: Diagnose-Rauschen reduzieren; UI zeigt nur den relevanten aktiven Lauf.

Technische Details (kurz)
- Bereits verifiziert:
  - `auto-generate` schreibt Profil G inkl. `disableAllLottie: true`.
  - `invoke-remotion-render` persistiert `diag_flags_effective`, `payload_hash`, `bundle_probe`.
  - `remotion-webhook` matched jetzt primär via `progressId` und setzt aktuellen Progress korrekt auf `failed`.
- Daraus folgt:
  - Nächster sinnvolle Isolationsschnitt ist **nicht-Lottie** (H/J Pfade), nicht erneut Lottie-Sanitizer.

Abnahmekriterien
- Ein frischer Lauf zeigt Profile A→J mit korrekten `diag_flags_effective`.
- Kein doppeltes Auto-Retry im UI (ein Fehler => ein Profilsprung).
- Entweder:
  - ein Profil wird `completed`, oder
  - ein einzelnes Nicht-Lottie-Subsystem wird eindeutig als Crash-Ursache identifiziert.
- Keine neuen „hängenden“ Einträge für aktuelle Läufe in `universal_video_progress`.


Ziel: Kein 2-Sekunden-„SMOKE TEST K“ mehr für normale User-Runs, sondern stabile Full-Quality-Render (Profil A) mit allen Features (Lottie, Character, Subtitles, Beat-Sync).

1) Befund aus dem aktuellen System
- In den Render-Daten läuft eine klare Kette A → B → … → K.
- Jeder fehlgeschlagene Lauf hat denselben Fehler: „AWS Concurrency limit reached (Rate Exceeded)“.
- Das ist kein Content-/Schemafehler, sondern ein temporäres Infrastruktur-Throttling.
- Dadurch darf niemals auf Bare-Minimum/Smoke-Profil gewechselt werden.

2) Effektiver Fix (in der richtigen Reihenfolge)

A. Backend-Guard zuerst (damit auch alte Frontend-Sessions sicher sind)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Logik ergänzen:
  - „requestedProfile“ (vom Client) und „effectiveProfile“ (serverseitig erzwungen) trennen.
  - Wenn letzter Fehler „rate_limit/concurrency“ war: Profilwechsel blockieren, gleiches Profil wiederverwenden.
  - Deep-Diagnostic-Profile K/L/M/N/O nur noch mit explizitem Debug-Flag erlauben; im Normalbetrieb max. A–J (optional sogar nur A–D).
- Ergebnis: Selbst wenn Frontend aus Versehen hochzählt, rendert Backend nicht mehr in Smoke/Bare-Minimum.

B. Strukturierte Fehlerklassen statt String-Matching
- Dateien:
  - `supabase/functions/remotion-webhook/index.ts`
  - `supabase/functions/check-remotion-progress/index.ts`
  - (optional ergänzend) `supabase/functions/invoke-remotion-render/index.ts`
- Einführen von `errorCategory` (`rate_limit` | `lambda_crash` | `validation` | `unknown`) in Persistenz + API-Response.
- Frontend nutzt primär `errorCategory`; Regex nur als Fallback.

C. Frontend-Retry-Vertrag korrigieren
- Dateien:
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
- `onRetry` zu einem reason-basierten Handler machen:
  - `reason: "rate_limit"` => same profile (kein `retryCount++`)
  - `reason: "diagnostic_crash"` => nächstes Profil
- Wichtig: Auch manuelle „Erneut versuchen“-Buttons müssen bei `rate_limit` den same-profile Retry nutzen (nicht Profil erhöhen).
- Rate-Limit-Retry-Zähler in den Wizard-State verlagern (nicht nur Ref im Child), damit Remounts den Zähler nicht verfälschen.

3) Qualitäts-Schutz (damit echte Videos priorisiert werden)
- Normale User-Flows dürfen kein „erfolgreiches“ K/L/N-Smoketest-Video als Endergebnis bekommen.
- Wenn nur Diagnoseprofil rendert, UI als „Diagnose-Output“ markieren und nicht als finales Kundenvideo behandeln.
- Default-Policy: Full-Quality priorisieren, bei Rate-Limit warten + gleiches Profil erneut versuchen.

4) Konkrete Dateien
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- `src/components/universal-video-creator/UniversalVideoWizard.tsx`
- `supabase/functions/auto-generate-universal-video/index.ts`
- `supabase/functions/remotion-webhook/index.ts`
- `supabase/functions/check-remotion-progress/index.ts`
- optional: `supabase/functions/invoke-remotion-render/index.ts`

5) Abnahme (Definition of Done)
- Bei erneutem „Rate Exceeded“ bleibt `diagnosticProfile` konstant (z. B. A → A → A), kein Sprung zu K.
- Keine neuen `video_renders` mit `diagnostic_profile = K/L/M/N/O` im normalen Flow.
- Finales Video ist >2s und enthält echte Szenen/Features (nicht Smoke-Frame).
- Debug-Panel zeigt `requestedProfile`, `effectiveProfile`, `errorCategory` transparent an.

6) Rollout-Empfehlung
- Schritt 1: Backend-Guard + errorCategory deployen.
- Schritt 2: Frontend-Retry-Flow umstellen.
- Schritt 3: Einen vollständigen End-to-End-Lauf mit neuem Projekt durchführen und DB/Logs gegen obige Abnahmekriterien prüfen.

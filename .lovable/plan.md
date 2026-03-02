
Problem (klar neu formuliert)
- Der Fehler ist weiterhin derselbe: `Cannot read properties of undefined (reading 'length')` im Remotion-Lambda-Bundle.
- Ihr Hinweis „Bundle wurde neu deployed“ ist plausibel – aber die aktuellen Laufzeitdaten zeigen zusätzlich ein zweites Problem: Teile der Backend-Logik laufen noch auf einem älteren Stand als der aktuelle Code.

Do I know what the issue is?
- Ja. Sehr wahrscheinlich sind es zwei kombinierte Ursachen:
  1) **Deployment Drift**: Edge-Functions laufen auf älterem Stand (nicht auf dem zuletzt geänderten Code), dadurch greifen die neueren Diagnose-/Isolation-Fixes nicht zuverlässig.
  2) **Nicht aktivierte Isolationsprofile im effektiven Lauf**: In den letzten Fehlläufen sind die `diag`-Flags effektiv immer Full-Mode (alle `false`), daher wurde der crashende Subpfad nicht isoliert.

Was ich konkret verifiziert habe (Evidence)
- DB `video_renders` (neueste Fehlläufe):
  - `diag_flags_effective` mehrfach nur mit `disableMorphTransitions:false`, `disableLottieIcons:false`, `disableCharacter:false`.
  - `diagnosticProfile` fehlt (`null`), obwohl Retry-Profil-Strategie existiert.
  - `bundle_probe` zeigt ältere Canary (`r5-diag-active`, `sanitizer=v4-deep`) statt des neuesten geplanten Stands.
- Edge-Logs `auto-generate-universal-video`:
  - `InputProps diagnostics` zeigen weiterhin `payload-sanitizer-v4-deep`.
  - Start-Log enthält nicht den erwarteten `diagnosticProfile`-Anteil.
- Edge-Logs `remotion-webhook`:
  - Fehler bleibt exakt in Lambda (`/var/task/index.js`), also Runtime-Pfad, nicht Request-Start.
- Code-Audit:
  - `UniversalVideoWizard` und `UniversalAutoGenerationProgress` reichen `diagnosticProfile` grundsätzlich durch.
  - In `auto-generate-universal-video/index.ts` ist die Profile-Logik angelegt, aber Übergabe/Nutzung muss konsistent bis in die Pipeline und Persistenz erzwungen werden.
- Externe Referenz (Remotion/Lottie/StackOverflow-Muster):
  - Dieser `.length`-Fehler ist typisch bei Lottie-Daten, wenn intern Arrays wie `layers/assets/chars` in einem bestimmten Pfad unerwartet sind.

Isolierte Hotspots
1) `supabase/functions/auto-generate-universal-video/index.ts`
2) `supabase/functions/invoke-remotion-render/index.ts`
3) `src/components/universal-video-creator/UniversalVideoWizard.tsx`
4) `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
5) `src/remotion/templates/UniversalCreatorVideo.tsx`
6) `src/remotion/utils/premiumLottieLoader.ts`
7) `src/remotion/components/ProfessionalLottieCharacter.tsx`
8) `src/remotion/components/LottieIcons.tsx`
9) `src/remotion/components/MorphTransition.tsx`

Umsetzungsplan (priorisiert)
1. **Deployment-Sync zuerst erzwingen (kritisch)**
   - Edge-Functions gezielt neu deployen:  
     `auto-generate-universal-video`, `invoke-remotion-render`, `check-remotion-progress`, `remotion-webhook`.
   - Danach sofort per Log-Canary verifizieren, dass wirklich der neue Code aktiv ist (nicht nur Bundle).
   - Grund: Ohne diesen Schritt debuggen wir sonst weiterhin den alten Runtime-Pfad.

2. **Profilfluss Ende-zu-Ende hart verdrahten**
   - `diagnosticProfile` von Request → Pipeline → `inputProps.diag` → DB (`result_data` + `content_config`) durchgängig und explizit persistieren.
   - Sicherstellen, dass `runGenerationPipeline(...)` die Profilinfos als Parameter erhält (kein impliziter Scope).
   - `diag.diagnosticProfile` und `diag_flags_effective` immer speichern.

3. **Deterministische Retry-Isolation aktivieren**
   - A: Full, B: Morph aus, C: Icons aus, D: Character aus.
   - Retry muss je Versuch garantiert anderes Profil senden.
   - Im UI-Diagnosepanel sichtbar machen: aktives Profil + effektive Flags + Payload-Hash.

4. **Lottie-Final-Gates härten (gezielt)**
   - Vor jedem `<Lottie />` strikt prüfen (nicht nur `layers/assets/markers`, auch häufige Problemfelder wie `chars/fonts/list`).
   - Bei Sanitizer-Fehler immer harter Fallback (SVG/Emoji), niemals Lottie-Player auf „unsicheres“ Objekt lassen.
   - `forceEmbeddedCharacterLottie` im Character-Pfad als harte Umschaltung beibehalten.

5. **Robuste Forensik für die nächste Iteration**
   - Pro Renderlauf speichern:
     - `diagnosticProfile`
     - `diag_flags_effective`
     - `payload_hash`
     - `bundle_probe`
     - `real_remotion_render_id`
   - Damit ist beim nächsten Fehler sofort klar, welcher Profil-Lauf scheitert.

Technische Reihenfolge
1) Deployment-Sync + Canary-Verifikation  
2) Profil-Parameterfluss in `auto-generate-universal-video` fixen  
3) Persistenz/Forensik in `invoke-remotion-render` vereinheitlichen  
4) Lottie-Sanitizer auf allen drei Komponenten final schärfen  
5) Kontrollierte A/B/C/D-Runs zur exakten Ursachenisolation

Abnahmekriterien
- Ein frischer Lauf erreicht `completed`.
- Kein `reading 'length'` mehr im Webhook.
- `diagnosticProfile` und `diag_flags_effective` sind pro Lauf korrekt gesetzt (nicht mehr dauerhaft Full/false).
- Premium-Qualität bleibt Standard; nur das identifizierte Subsystem erhält gezielten Fallback.

Erwartetes Ergebnis
- Wir brechen die Fehler-Schleife, weil zuerst der Runtime-Stand synchronisiert wird und danach die Isolationsprofile tatsächlich wirksam sind.
- Anschließend kann der konkrete crashende Subpfad sauber identifiziert und final behoben werden, ohne pauschalen Qualitätsverlust.

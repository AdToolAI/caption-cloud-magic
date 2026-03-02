
Zielbild nach Sichtung der neuen Logs
- Die neuen Logs zeigen weiterhin denselben Crash: `Cannot read properties of undefined (reading 'length')` in der Lambda-Runtime.
- Gleichzeitig zeigen die aktuellen Runtime-Daten einen klaren Drift zwischen Codebasis und laufender Backend-Version:
  - Laufende Canary in DB/Logs: `r7.../sanitizer=v7` (nicht `r8`).
  - `diag_flags_effective` für Profile `E/F/G` sind faktisch nicht aktiv (bei `G` sogar ohne `disableAllLottie`-Wirkung).
  - Webhook-Payload enthält kein `progressId` in `customData`, obwohl es im aktuellen Code vorgesehen ist.
- Das bedeutet: Die geplante r8-Isolation wird in den gezeigten Läufen noch nicht tatsächlich ausgeführt.

Do I know what the issue is?
- Ja: Es sind zwei gekoppelte Ursachen:
  1) **Runtime/Deployment-Drift** (aktiver Codepfad ist älter als der aktuelle Stand im Repo).
  2) **Dadurch unwirksame Diagnosematrix** (Profile E/F/G laufen nominell, aber nicht mit den erwarteten Flags).
- Solange dieser Drift nicht sauber geschlossen und verifiziert ist, bleibt jede weitere Ursachenanalyse im Blindflug.

Umsetzungsplan (priorisiert, deterministisch)

1) Deployment-Sync hart verifizieren (vor jedem weiteren Fix)
- Backend-Funktionen gezielt neu deployen:
  - `auto-generate-universal-video`
  - `invoke-remotion-render`
  - `remotion-webhook`
  - `check-remotion-progress`
  - `debug-render-status`
- Danach sofort Verifikation per Laufzeitdaten:
  - `auto-generate` muss in Logs `sanitizerVersion: v8-profileG-disableAllLottie` zeigen.
  - `invoke-remotion-render` muss `bundle_probe` mit `r8-profileG-disableAllLottie-forensics` persistieren.
  - `webhook payload customData` muss `progressId` enthalten.
- Abbruchkriterium: Wenn einer dieser Marker fehlt, keine weitere Fachanalyse, sondern Deploy-Kette erneut fixen.

2) Diagnoseprofil-Wirkung Ende-zu-Ende beweisen (nicht nur Profilname)
- Für einen frischen Lauf A→G nachweisen:
  - `diagnosticProfile` korrekt pro Versuch.
  - `diag_flags_effective` pro Versuch korrekt:
    - B: `disableMorphTransitions=true`
    - C: `disableLottieIcons=true`
    - D: `disableCharacter=true`
    - E: Morph+Icons true
    - F: Morph+Icons+Character true
    - G: `disableAllLottie=true` plus die übrigen true
- Zusätzlich in Diagnosepanel anzeigen:
  - `diagnosticProfile`
  - `diag_flags_effective`
  - `bundle_probe`
  - `payload_hash`
  - `real_remotion_render_id`

3) Fortschritts-Zuordnung stabilisieren (Zombie-Einträge eliminieren)
- Matching-Reihenfolge im Webhook verbindlich:
  1. `progressId` (primär)
  2. `pending_render_id`
  3. `real_remotion_render_id`
  4. `out_name`/Suffix
- Bei Fehlern immer beide Tabellen finalisieren:
  - `video_renders.status='failed'`
  - `universal_video_progress.status='failed'`, `current_step='failed'`, `progress_percent=0`
- Optionaler Sicherheitsabgleich:
  - Wenn `video_renders` failed und zugehöriger Progress nach kurzer Frist noch `processing`, automatisch nachziehen.

4) Falls Crash nach verifiziertem r8 weiterhin in Profil G auftritt: Nicht-Lottie-Pfad isolieren
- Dann ist die Hypothese „nur Lottie“ widerlegt.
- Nächster gezielter Schnitt über neues Diagnostik-Flag (z. B. `disableNonEssentialOverlays`) für:
  - `FloatingIcons`
  - `SceneTypeEffects`
  - `TextOverlay`-Animationen
  - `PrecisionSubtitleOverlay`
- Reihenfolge für zusätzliche Profile:
  - H: Subtitles aus
  - I: SceneTypeEffects/FloatingIcons aus
  - J: TextOverlay-Animationen auf Plain-Text
- Ziel: letzten crashenden Subpfad deterministisch eingrenzen, ohne Full-Quality dauerhaft zu reduzieren.

5) Abschluss-Validierung (Abnahme)
- Ein frischer Durchlauf zeigt:
  - korrekte r8-Marker in Logs/DB,
  - konsistente A→G Flag-Wirkung,
  - kein hängender `processing`-Eintrag.
- Entweder:
  - mindestens ein Profil endet `completed`, oder
  - Profil G/H/I/J liefert eindeutigen Beweis, welches Nicht-Lottie-Subsystem crasht.
- Erst danach finaler Minimalfix im betroffenen Subsystem.

Technischer Hinweis (wichtig für Erwartungsmanagement)
- Die aktuellen „neuen“ Logs sind verwertbar, aber sie belegen primär den alten Runtime-Pfad (r7) statt des geplanten r8-Pfads.
- Der nächste sinnvolle Schritt ist daher nicht „noch ein breiter Code-Fix“, sondern **erst harte Runtime-Synchronisierung mit Canary-Beweis**, dann gezielte Isolation.

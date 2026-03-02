
Problem neu eingegrenzt
- Der Fehler ist weiterhin derselbe (`Cannot read properties of undefined (reading 'length')`) und tritt reproduzierbar im Render-Lambda-Bundle auf.
- Die Datenlage ist jetzt klar:
  - `diag`-Flags kommen korrekt an (`diag_flags_effective` ist gefüllt).
  - Payload ist schema-konform, null-bereinigt, versioniert, und Scheduling ist korrekt.
  - Bundle/Serve-URL sind konsistent und neuere Forensik-Felder werden gespeichert.
- Damit ist der primäre Restverdacht nicht mehr „Payload-Shape“, sondern ein Laufzeitpfad im Remotion-Render (sehr wahrscheinlich im Lottie-Subsystem).

Do I know what the issue is?
- Ja, mit hoher Sicherheit: Wir haben aktuell **keine aktive, gesteuerte Isolationssequenz** pro Retry, obwohl die Toggle-Infrastruktur vorhanden ist.
- Ergebnis: Jeder Retry läuft erneut im selben Full-Quality-Profil und trifft denselben crashenden Pfad.
- Zusätzlich ist `forceEmbeddedCharacterLottie` zwar gesetzt, aber aktuell nicht als harte Umschaltung im Character-Pfad verdrahtet – dadurch bleibt ein Teil des Risikos bestehen.

Was ich konkret implementieren würde (nächster Fix-Schritt)
1) Diagnostik-Profil pro Retry wirklich aktiv schalten (Frontend → Backend)
- Dateien:
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Umsetzung:
  - Retry-Zähler in ein explizites `diagnosticProfile` mappen (A/B/C/D).
  - Dieses Profil beim Start an `auto-generate-universal-video` mitgeben.
- Ziel:
  - Jeder Retry testet bewusst einen anderen Subsystem-Pfad statt immer denselben.

2) Profil in `auto-generate-universal-video` auf `diag`-Flags mappen
- Datei:
  - `supabase/functions/auto-generate-universal-video/index.ts`
- Umsetzung:
  - `diagnosticProfile` aus Request lesen.
  - `diag` je Profil setzen:
    - A: Full Quality (alles an)
    - B: `disableMorphTransitions=true`
    - C: `disableLottieIcons=true`
    - D: `disableCharacter=true` (nur für Isolation)
  - Profilname + Flags in `inputPropsDiagnostics` und `content_config` persistieren.
- Ziel:
  - Exakte Identifikation des crashenden Subsystems in maximal 3 Retries.

3) `forceEmbeddedCharacterLottie` technisch wirksam machen
- Dateien:
  - `src/remotion/templates/UniversalCreatorVideo.tsx`
  - `src/remotion/components/ProfessionalLottieCharacter.tsx`
- Umsetzung:
  - `forceEmbeddedCharacterLottie` als Prop bis in den Character durchreichen.
  - Im Character bei aktivem Flag **hart** embedded-only Pfad verwenden (kein local/CDN branch).
- Ziel:
  - Character-Lottie in Lambda deterministisch machen.

4) Lottie-Runtime-Härtung vor `<Lottie />` zentralisieren
- Dateien:
  - `src/remotion/utils/premiumLottieLoader.ts`
  - `src/remotion/components/LottieIcons.tsx`
  - `src/remotion/components/MorphTransition.tsx`
  - `src/remotion/components/ProfessionalLottieCharacter.tsx`
- Umsetzung:
  - Gemeinsame `sanitizeForLottiePlayer()` Utility (strikter als `isValidLottieData`), inkl. defensiver Defaults für häufig fehlende Felder.
  - Wenn Sanitizer fehlschlägt: **kein** `<Lottie />`, sofort Emoji/SVG-Fallback.
- Ziel:
  - `layers.length`-Crashpfad in lottie-web zuverlässig vermeiden.

5) Forensik im UI sichtbar machen
- Datei:
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Umsetzung:
  - Im Diagnose-Panel zusätzlich anzeigen:
    - `diagnosticProfile`
    - `diag_flags_effective`
    - `payload_hash`
    - `real_remotion_render_id`
- Ziel:
  - Sofort sichtbar, welcher Profil-Run erfolgreich war bzw. scheitert.

Technische Reihenfolge
1. Retry-Profil-Transport (Wizard/Progress → Edge Function).
2. Profil-zu-Flags-Mapping in `auto-generate-universal-video`.
3. `forceEmbeddedCharacterLottie` tatsächlich im Character-Pfad anwenden.
4. Zentraler Lottie-Sanitizer + Fallback-Gates in allen drei Lottie-Komponenten.
5. UI-Diagnose erweitern.

Abnahmekriterien
- Primär:
  - Mindestens ein Profil-Run endet auf `completed`.
  - Kein `reading 'length'` mehr im Webhook-Fehlerpfad.
- Isolationskriterium:
  - Wenn A fehlschlägt, zeigt B/C/D eindeutig, welcher Subpfad den Crash auslöst.
- Qualitätskriterium:
  - Nach Identifikation wird nur das betroffene Subsystem gehärtet; Full-Quality bleibt Standard.

Erwartetes Ergebnis
- Wir verlassen den Retry-Loop ohne Blindflug.
- Die Ursache wird deterministisch isoliert.
- Danach kann der gezielte Fix auf das konkrete Subsystem gesetzt werden, ohne pauschalen Qualitäts-Downgrade.

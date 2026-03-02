
Ziel
- Den persistenten Render-Abbruch `Cannot read properties of undefined (reading 'length')` endgültig eliminieren, ohne die Premium-Qualität (Lottie-Charaktere/Maskottchen/Effekte) dauerhaft zu degradieren.

Aktueller Befund (aus Logs + Code-Review)
- Invocation ist stabil:
  - `invoke-remotion-render` startet erfolgreich (`status=200`, echte `real_remotion_render_id` vorhanden).
  - Payload-Scheduling ist korrekt (`framesPerLambda` gesetzt, `concurrency: null`, `concurrencyPerLambda: 1`).
  - Metadaten sind explizit im Payload (`durationInFrames`, `fps`, `width`, `height`).
- Crash passiert im Remotion-Lambda-Bundle selbst:
  - `remotion-webhook` meldet weiterhin denselben Stack: `/var/task/index.js ... reading 'length'`.
- Der zuletzt gesendete Input ist bereits schema-nah:
  - `category: social-reel`, `storytellingStructure: hook-problem-solution`, `characterType: lottie`.
- Daraus folgt:
  - Der reine Enum-Fix war richtig, aber nicht ausreichend.

Do I know what the issue is?
- Ja, mit hoher Wahrscheinlichkeit ist es ein Kombinationsproblem aus:
  1) verbleibendem Laufzeitpfad im Bundle, der bei bestimmten Input-Kombinationen weiterhin `.length` auf `undefined` trifft (wahrscheinlich in einem optionalen Effekt-/Lottie-/Subtitle-Pfad),
  2) fehlender deterministischer Bundle-Version-Transparenz (wir sehen den Fehler, aber nicht sicher genug, welcher Bundle-Stand effektiv läuft).

Isolierte Dateien / Hotspots
- `supabase/functions/auto-generate-universal-video/index.ts`
  - InputProps-Building, Flags, Sanitisierung, Diagnostik.
- `supabase/functions/invoke-remotion-render/index.ts`
  - Persistenz von Forensikdaten je Run, ServeURL-/Bundle-Indikatoren.
- `src/remotion/templates/UniversalCreatorVideo.tsx`
  - zentrale Render-Orchestrierung, Lottie/Transition/Subtitle/Audio-Pfade.
- `src/remotion/components/ProfessionalLottieCharacter.tsx`
- `src/remotion/components/LottieIcons.tsx`
- `src/remotion/components/MorphTransition.tsx`
- `src/remotion/utils/premiumLottieLoader.ts`

Umsetzungsplan (qualitäts-erhaltend, priorisiert)

1) Harte Preflight-Validierung vor Lambda (fail fast, klare Fehlermeldung)
- In `auto-generate-universal-video` eine zentrale Preflight-Validierung für das finale `inputProps` einbauen:
  - Strikte Enum-Validierung (bereits teilweise vorhanden) konsolidieren.
  - Tiefe Null/Undefined-Sanitisierung rekursiv (nicht nur top-level).
  - Strukturcheck für verschachtelte Felder (`scene.background`, `scene.transition`, `textOverlay`, `subtitleStyle`, `phonemeTimestamps`, `beatSyncData`).
- Wenn Preflight fehlschlägt: verständlicher Fehler + kein Lambda-Start (statt späterem Minified-Crash).

2) Deterministische Forensik pro Run in DB persistieren
- In `invoke-remotion-render` und `auto-generate-universal-video` folgende Felder in `video_renders.content_config` persistieren:
  - `input_props_diagnostics` (counts, enum values, scene summary),
  - `payload_hash` (stabiler Fingerprint des serialisierten `inputProps`),
  - `serve_url_full` (nicht nur gekürzt),
  - `bundle_probe` (Canary-String + erwartete Render-Flags).
- Ziel: Nächster Fehler ist sofort korrelierbar (welcher Input + welcher Bundle-Hinweis).

3) Qualitätsmodus bleibt Standard, aber gezielte Diagnose-Toggles (kein globaler Downgrade)
- Full Quality bleibt default (`characterType: lottie`, originale scene types).
- Ergänze temporäre, fein-granulare Render-Flags im Payload (nur für Debug-Runs):
  - `disableMorphTransitions`
  - `disableLottieIcons`
  - `forceEmbeddedCharacterLottie`
  - `disablePrecisionSubtitles`
- Diagnose-Reihenfolge:
  - Run A: Full Quality (alle Features an)
  - Run B: nur Morph aus
  - Run C: nur Icons aus
  - Run D: nur embedded character lottie
- So wird der exakte Crash-Pfad isoliert, ohne pauschal Qualität zu opfern.

4) Lottie-Quelle stabilisieren, ohne Featureverlust
- In `premiumLottieLoader` deterministische Priorisierung + robuste Quellenhärtung:
  - Für Render-Lambda bevorzugt lokale/embedded Lottie-Daten (nicht volatile externe Quellen),
  - CDN nur optionaler Fallback,
  - vor Übergabe weiterhin `isValidLottieData + normalizeLottieData`.
- Ergebnis: Lottie bleibt aktiv, aber weniger fragil.

5) Bundle-Sync-Verifikation als Pflichtschritt im Workflow
- Nach Remotion-Änderungen:
  - Bundle neu veröffentlichen unter derselben Site,
  - `REMOTION_SERVE_URL` verifizieren,
  - neuen Run starten und Forensikdaten prüfen.
- Zusätzlich: Canary im Template behalten, aber durch DB-Forensik ergänzen, damit wir nicht nur auf schwer zugängliche Runtime-Logs angewiesen sind.

Technische Reihenfolge
1. Preflight-Validator + rekursive Sanitisierung in `auto-generate-universal-video`.
2. Forensik-Persistenz in `auto-generate-universal-video` und `invoke-remotion-render`.
3. Diagnostik-Toggles im Payload + Auswertungspfad in `UniversalCreatorVideo`.
4. Lottie-Loader-Härtung (lokal/embedded-first für Lambda-Stabilität).
5. Bundle-Sync + verifizierter Testlauf.

Abnahmekriterien
- Primär:
  - Frischer Run endet auf `completed`.
  - Kein `reading 'length'` im Webhook.
  - Video ist abspielbar.
- Qualitätskriterien:
  - Lottie-Charaktere bleiben aktiv.
  - Lottie-Icons/Morph-Transitions funktionieren im Full-Quality-Run.
- Diagnostikkriterien:
  - Jeder Run hat persistente `payload_hash`, `input_props_diagnostics`, `serve_url_full`.
  - Bei Fehler ist klar identifizierbar, welcher Subsystem-Flag den Fehler triggert oder verhindert.

Risiko / Trade-off
- Kurzfristig können einzelne Debug-Runs mit gezielt deaktiviertem Teil-Effekt laufen.
- Kein dauerhafter Qualitätsverlust: Standard bleibt Full-Quality; Toggles dienen nur zur Isolation und finalen Stabilisierung.

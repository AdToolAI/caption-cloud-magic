
Zustand nach den neuen Logs (A–M):
- Der Fehler ist unverändert und deterministisch: `TypeError: Cannot read properties of undefined (reading 'length')` bei `GDe (/var/task/index.js:155:44884)`.
- Profil **L (SmokeTest ohne Schema/calculateMetadata)** und **M** schlagen ebenfalls fehl.
- `serve_url_full` in der DB ist korrekt (`.../sites/adtool-remotion-bundle/index.html`), also kein offensichtlicher Serve-URL-Fehler.
- `real_remotion_render_id` wird sauber erzeugt, der Crash passiert danach in der Lambda-Runtime.
- `lambda_error_full` ist weiterhin leer in `video_renders`, weil der detaillierte Fehler aktuell primär im Webhook-Log liegt und nicht konsequent in `content_config` persistiert wird.

Do I know what the issue is?
- **Ja, mit hoher Wahrscheinlichkeit auf Ebene Payload-/Runtime-Kompatibilität**, nicht in den Video-Komponenten:
  - SmokeTest scheitert genauso wie UniversalCreator.
  - Das spricht gegen Scene/Subtitles/Lottie/AnimatedText und für Start-Payload-Interpretation bzw. internen Lambda-Initialisierungspfad.

r12 Umsetzungsplan (Root-cause-first, kurz & gezielt):

1) Payload-Format als Hauptverdacht isolieren (N/O)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Neue Diagnoseprofile:
  - **N**: `SmokeTest` + **minimal offizielles Payload-Profil** (nur dokumentierte Kernfelder, keine Zusatzfelder aus der aktuellen Normalisierung).
  - **O**: `UniversalCreatorVideo` (minimal props) + gleiches minimales Payload-Profil.
- Ziel: beweisen, ob die aktuelle `normalizeStartPayload`-Form den Crash triggert.

2) Zweites Normalisierungsprofil in Shared Utility
- Datei: `supabase/functions/_shared/remotion-payload.ts`
- Neben „current normalized“ ein „strict-official-minimal“-Pfad:
  - `downloadBehavior` exakt docs-konform (`{ type: 'play-in-browser' }` ohne `fileName`).
  - keine unnötigen Felder im Start-Payload.
  - explizite Metadaten mit den v4.0.424-kompatiblen Override-Feldern.
- Ziel: interne Lambda-Parser/Validator-Kante umgehen, die derzeit als `.length` endet.

3) `inputProps`-Transport dual testen
- Dateien:
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - `supabase/functions/invoke-remotion-render/index.ts`
- Für N/O zwei Varianten kontrolliert erlauben:
  - A) aktuelles `{ type: 'payload', payload: JSON.stringify(...) }`
  - B) strikt minimiertes, offiziell erwartetes InputProps-Format.
- Ziel: endgültig klären, ob der Crash aus dem InputProps-Container kommt.

4) Forensik fixen: Webhook-Error vollständig in DB speichern
- Datei: `supabase/functions/remotion-webhook/index.ts`
- Bei `type=error|timeout`:
  - komplette `errors`-Struktur in `video_renders.content_config.lambda_error_full` persistieren (inkl. stack/name/message/renderId/customData).
  - `error_fingerprint` bilden (z. B. stack first frame), damit Wiederholungen messbar sind.
- Ziel: nicht nur Logs, sondern belastbare DB-Forensik für jede Iteration.

5) UI-Diagnosekette erweitern
- Datei: `src/components/universal-video-creator/UniversalVideoWizard.tsx`
- Retry-Matrix von A–M auf A–O erweitern, inklusive korrekter Endmeldung.
- Ziel: automatische Isolation ohne manuelle Eingriffe fortsetzen.

Abnahmekriterien:
- N/O laufen in derselben Session durch und schreiben vollständige `diag_flags_effective` + `payload_mode`.
- Mindestens ein Profil liefert ein differenziertes Ergebnis:
  - **N erfolgreich, O fehlschlägt** → Problem in UniversalCreator-Pfad.
  - **N fehlschlägt ebenfalls** → Problem sicher in Start-Payload/Lambda-Runtime-Kompatibilität.
- `video_renders.content_config.lambda_error_full` ist bei jedem Fehlschlag gefüllt (nicht mehr `null`).

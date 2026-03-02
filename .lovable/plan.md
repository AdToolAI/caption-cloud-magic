
Problemzusammenfassung (neu formuliert)
- Der Fehler bleibt identisch: `Cannot read properties of undefined (reading 'length')` kommt weiterhin aus dem Remotion-Lambda-Bundle (`/var/task/index.js`), obwohl das Bundle neu deployed wurde.
- Die Invocation selbst ist stabil (Start erfolgreich, echte `real_remotion_render_id` vorhanden). Der Crash passiert danach im Renderlauf.

Was ich konkret verifiziert habe
- Letzter fehlgeschlagener Run:
  - `render_id`: `a6ni8nr6yf`
  - `real_remotion_render_id`: `2n46e3tb45`
  - `serve_url_full`: `.../sites/adtool-remotion-bundle/index.html`
  - `payload_hash`: vorhanden
  - Fehler weiterhin identisch im Webhook.
- Input ist inzwischen schema-nah:
  - `category: social-reel`
  - `storytellingStructure: hook-problem-solution`
  - `characterType: lottie`
  - `sceneCount: 5`, `phoneme_len: 818`, `subtitles_len: 0`
- Wichtiger Fund:
  - Die neuen Diagnose-Toggles werden aktuell **nicht wirksam** im Template:
    - in der Edge Function werden sie als `_diag` in `inputProps` gesendet,
    - das Zod-Schema (`UniversalCreatorVideoSchema`) kennt `_diag` nicht -> Feld wird gestript,
    - im Template sind `diagToggles` aktuell hardcoded auf `false`.
  - Ergebnis: Unsere geplante subsystem-genaue Isolation (Morph/Icon/Subtitles/Character) wurde faktisch nie ausgeführt.

Do I know what the issue is?
- Ja, mit hoher Sicherheit ist das Kernproblem jetzt:
  1) Die Diagnostik-Flags greifen nicht (Schema-Strip + hardcoded toggles), dadurch konnten wir den fehlerhaften Subpfad noch nicht isolieren.
  2) Der Crash liegt sehr wahrscheinlich in einem Lottie-Runtime-Pfad (Character/Icons/Transition), nicht mehr im Enum/Payload-Grundschema.

Isolierte Hotspots
1) `supabase/functions/auto-generate-universal-video/index.ts`
   - `_diag` Aufbau, Render-Strategie, Retry/Isolation.
2) `src/remotion/templates/UniversalCreatorVideo.tsx`
   - `diagToggles` hardcoded; Flags nicht aus Props.
3) `src/remotion/templates/UniversalCreatorVideo.tsx` + Lottie-Verwendung
   - `ProfessionalLottieCharacter`, `LottieIcons`, `MorphTransition`.
4) `src/remotion/utils/premiumLottieLoader.ts`
   - Lambda-Ladepfad, Embedded/CDN-Priorisierung.
5) Optional ergänzend:
   - `src/remotion/components/ProfessionalLottieCharacter.tsx`
   - `src/remotion/components/LottieIcons.tsx`
   - `src/remotion/components/MorphTransition.tsx`

Umsetzungsplan (priorisiert, ohne dauerhaften Qualitätsverlust)

1) Diagnosepfad wirklich aktivieren (entscheidend)
- `UniversalCreatorVideoSchema` um ein optionales, streng typisiertes Diagnose-Objekt erweitern (z. B. `diag` statt `_diag`).
- Im Template `diagToggles` aus Props lesen statt hardcoded.
- In `auto-generate-universal-video` Flags unter dem schema-konformen Feldnamen senden.
- Ziel: Die toggles wirken endlich im Lambda-Render.

2) Harte Binär-Isolation in einem kontrollierten Ablauf
- Standardrun bleibt Full Quality.
- Bei genau diesem Fehler automatische kontrollierte Retry-Sequenz:
  - Run A: Full Quality (alles an)
  - Run B: nur Morph aus
  - Run C: nur Lottie Icons aus
  - Run D: nur Character-Lottie aus (SVG fallback nur für diesen Diagnoserun)
- Pro Run in `content_config` speichern:
  - aktive Flags
  - `payload_hash`
  - `bundle_probe`
  - `real_remotion_render_id`
- Ziel: In einem Durchlauf exakt isolieren, welches Subsystem crasht.

3) Lottie-Runtime härten (nur im identifizierten Subsystem)
- Nach Isolation gezielt den Schuldpfad härten:
  - bei Character: robustere Pre-Validation / dedizierter Lambda-safe fallback nur dort,
  - bei Icons/Transition: strengeres Guarding vor `<Lottie>`-Render.
- Wichtig: keine pauschale Deaktivierung aller Premium-Effekte.

4) Forensik verbessern (damit kein Blindflug mehr)
- In `invoke-remotion-render` und `auto-generate-universal-video` erweitern:
  - `diag_flags_applied: true/false`
  - `diag_flags_effective` (was im finalen `inputProps` wirklich angekommen ist)
  - `input_props_subset` (kleiner, relevanter Snapshot)
- Ziel: sofort sichtbar, ob ein Flag im Bundle tatsächlich angekommen ist.

5) Akzeptanzkriterien
- Technisch:
  - Kein `reading 'length'` mehr im Webhook.
  - Render endet auf `completed`.
- Qualität:
  - Full-Quality-Profil bleibt Standard.
  - Nur falls nötig wird ein einzelnes Subsystem fallback-sicher gemacht.
- Transparenz:
  - Jeder Run hat nachvollziehbare Flag-/Hash-/Probe-Daten.

Risiko / Trade-off
- Kurzfristig zusätzliche Diagnose-Runs (mehr Laufzeit).
- Dafür endlich deterministische Ursachenanalyse statt weiterer Trial-and-Error-Schleifen.
- Dauerhafte Qualitätsdegradierung wird vermieden: Fallbacks nur subsystem-spezifisch, nur wenn als Fehlerquelle bestätigt.

Technischer Abschnitt (konkret)
- Schema:
  - `UniversalCreatorVideoSchema` um `diag` erweitern (optional).
- Edge:
  - `_diag` -> `diag` umstellen.
- Template:
  - hardcoded `diagToggles` entfernen; aus `props.diag` mergen.
- Orchestrierung:
  - Retry-Plan mit isolierten Flags + Persistenz je Versuch.

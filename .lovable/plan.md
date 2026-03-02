
Brauchbare Erkenntnisse aus den neuen Logs (wichtig)
- Die neuen Logs sind sehr hilfreich: Der Fix-Stand ist aktiv, aber der Fehler bleibt.
- Verifiziert aus Laufzeitdaten:
  - Canary/Bundlestand ist neu: `canary=2026-03-02-r7-autoProfileChain-deepSanitizeV7,sanitizer=v7`.
  - Diagnoseprofile laufen wirklich durch: `A`, `B`, `C`, `D` wurden jeweils mit korrekten `diag_flags_effective` ausgeführt.
  - Alle vier Läufe enden trotzdem mit demselben Fehler: `Cannot read properties of undefined (reading 'length')`.
- Das heißt:
  1) Es ist kein reines Deploy-Problem mehr.
  2) Der aktuelle A/B/C/D-Schnitt reicht zur Isolation nicht aus.
- Zusätzlich gesehen:
  - Es bleiben inkonsistente `universal_video_progress`-Einträge (z. B. ein D-Lauf auf `ready_to_render`/`processing`, obwohl ein anderer schon `failed` ist). Das erzeugt Debug-Rauschen und erschwert eindeutige Zuordnung.

Wahrscheinlichste Restursache
- Es ist weiterhin sehr wahrscheinlich ein Runtime-Pfad, der mit Lottie zusammenhängt, aber durch die aktuelle Profil-Matrix nicht sauber isoliert wird.
- Grund: Die Profile deaktivieren derzeit jeweils nur einzelne Subsysteme. Es gibt noch keinen harten „alles Lottie aus“-Lauf.
- Alternativ (falls selbst „alles Lottie aus“ scheitert): Dann liegt die Ursache außerhalb Lottie (z. B. anderer Renderpfad mit unguarded `.length`).

Umsetzungsplan (gezielt auf die jetzige Evidenz)
1) Diagnosematrix von 4 auf 7 Profile erweitern (deterministisch)
- Dateien:
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
  - `supabase/functions/auto-generate-universal-video/index.ts`
- Neue Reihenfolge:
  - A: Full
  - B: Morph aus
  - C: Icons aus
  - D: Character aus
  - E: Morph + Icons aus
  - F: Morph + Icons + Character aus
  - G: Hard „No-Lottie“ (alle Lottie-Komponenten garantiert aus)
- Ziel:
  - In einem Lauf eindeutig feststellen, ob der Fehler von Lottie kommt oder nicht.

2) Neues hartes Diag-Flag `disableAllLottie` einführen
- Dateien:
  - `src/remotion/templates/UniversalCreatorVideo.tsx` (Schema + Render-Guards)
  - ggf. `src/remotion/components/ProfessionalLottieCharacter.tsx`, `LottieIcons.tsx`, `MorphTransition.tsx`
- Umsetzung:
  - `diag.disableAllLottie` im Schema hinzufügen.
  - Bei aktivem Flag niemals `<Lottie />` rendern (nur SVG/Emoji/Fallback).
  - Character/Lottie-Icons/MorphTransition global über dieses Flag blockieren.
- Ziel:
  - Harte Beweisführung: wenn Profil G fehlschlägt, ist es nicht mehr der Lottie-Pfad.

3) Forensik auf „letztes erreichte Subsystem“ erweitern
- Dateien:
  - `src/remotion/templates/UniversalCreatorVideo.tsx`
  - `supabase/functions/invoke-remotion-render/index.ts`
- Umsetzung:
  - Frame-0 Marker logs für Subsysteme (z. B. `ENTER_SCENE_BACKGROUND`, `ENTER_TEXT_OVERLAY`, `ENTER_SUBTITLE_OVERLAY`, `ENTER_LOTTIE_ICONS`, `ENTER_MORPH`, `ENTER_CHARACTER`).
  - Marker + Profil + Payload-Hash weiterhin in `content_config` persistieren.
- Ziel:
  - Beim nächsten Fail sofort sichtbar, welcher Block zuletzt sicher erreicht wurde.

4) Progress/Webhook-Zuordnung robust machen (Debug-Rauschen entfernen)
- Dateien:
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - `supabase/functions/invoke-remotion-render/index.ts`
  - `supabase/functions/remotion-webhook/index.ts`
- Umsetzung:
  - `progressId` zusätzlich in `customData`/`content_config` durchreichen.
  - Webhook updatet `universal_video_progress` zuerst per `progressId` (primär), erst dann Fallback via `renderId`.
  - Bei Fehlern keine „hängenden processing/rendering“-Leichen.
- Ziel:
  - Jede Fehlermeldung gehört eindeutig zu genau einem Lauf/Profil.

5) Sicherheitsnetz für Nicht-Lottie-Fall vorbereiten
- Dateien:
  - `src/remotion/templates/UniversalCreatorVideo.tsx`
  - `src/remotion/components/PrecisionSubtitleOverlay.tsx`
- Umsetzung:
  - Zusätzliche defensive Guards an kritischen String/Array-Stellen (nur dort, wo noch direkte `.length`-Pfade ohne harte Typklemme bestehen).
  - Keine Qualitätsreduktion im Normalfall; nur defensive Klemmen.
- Ziel:
  - Falls Profil G ebenfalls crasht, ist der nächste Fix direkt vorbereitet.

Technische Reihenfolge
1. Profil-Matrix + Retry-Kette auf A→…→G erweitern.
2. `disableAllLottie` bis in Template und Komponenten verdrahten.
3. Forensik-Marker auf Frame 0 ergänzen.
4. Progress/Webhook-Matching via `progressId` stabilisieren.
5. Frischen End-to-End-Lauf ausführen und anhand Profil/Marker entscheiden, ob Lottie oder Nicht-Lottie-Fix finalisiert wird.

Abnahmekriterien
- Es gibt einen vollständigen Lauf mit klarer Profilspur A…G ohne Zuordnungschaos in `universal_video_progress`.
- Entweder:
  - ein Profil läuft auf `completed`, oder
  - Profil G zeigt weiterhin denselben Fehler und beweist damit „nicht Lottie“.
- Keine hängenden `processing/rendering`-Einträge für alte Versuche.
- Diagnosepanel zeigt pro Versuch konsistent: Profil, effektive Flags, Payload-Hash, real render ID.

Erwartetes Ergebnis
- Wir kommen aus dem aktuellen Blindflug heraus.
- Der Fehlerpfad wird in der nächsten Iteration deterministisch auf „Lottie“ oder „nicht Lottie“ eingegrenzt.
- Danach kann ein finaler, kleiner Ziel-Fix gesetzt werden statt weiterer breitflächiger Trial-and-Error-Änderungen.

# Lip-Sync-Pipeline — Feature Freeze v400

Ja: einfrieren ist an dieser Stelle der sauberste und professionellste Schritt. Die Pipeline hat gerade zum ersten Mal seit dem 27.07. auf allen 4 Sprechern korrekt getroffen — dieser Zustand muss reproduzierbar konserviert werden, bevor irgendetwas anderes daran angefasst wird.

Wichtig: „Einfrieren" heißt nicht nur „nichts mehr ändern". Ein Freeze ohne technische Absicherung ist nur eine Absichtserklärung. Der Plan hat deshalb drei Ebenen: dokumentieren, technisch absichern, überwachen.

## Ebene 1 — Freeze dokumentieren

Neue Datei `.lovable/LIPSYNC-FEATURE-FREEZE.md` nach dem Muster der bestehenden UDC-Freeze-Datei:

- **Status:** FROZEN as of v400 (Anchor/Plate-Kohärenz + Run-Identität)
- **Gefrorener Scope:** die Dateien der Lip-Sync-Kette (Liste unten)
- **Erlaubt bleiben:** P0-Crash-Fixes, Credit-Refund-Korrekturen, Copy/Übersetzung, reine Telemetrie
- **Verboten:** neue Gates, neue Schwellenwerte, neue Provider, Umbau des Preclip-Framings, Änderungen an der Reprojektion
- **Unfreeze:** nur durch ausdrückliche Aussage „unfreeze lipsync" mit konkretem Scope

Zusätzlich `docs/lipsync-pipeline-v400.md`: die vollständige Spezifikation (T1–T16, Fehlercode-Referenz, Schwellenwerte, Nachbau-Checkliste), damit der Sollzustand schriftlich fixiert ist und nicht nur im Code steht.

## Ebene 2 — Technisch absichern

Ein Freeze wirkt nur, wenn eine Abweichung automatisch auffällt.

**Konstanten zentralisieren:** Alle magischen Zahlen der Pipeline wandern in eine einzige Datei `supabase/functions/_shared/lipsync-frozen-contract.ts` — Mindest-Gesichtsbreite 120 px, Face-Gate-Mindestgröße 144 px, Face-Share-Floor 0.24, Mund-Höhenposition 62 %, Masken-Radius 55–63 %, Frame-Konsens 6 Frames, Watchdog 6 Minuten. Die bestehenden Module lesen ab dann aus dieser Datei statt aus lokalen Literalen.

**Contract-Test:** `supabase/functions/_shared/lipsync-frozen-contract.test.ts` prüft jeden Wert gegen den eingefrorenen Sollwert. Wer eine Schwelle verstellt, bricht den Test — die Änderung wird dadurch zu einer bewussten Entscheidung statt zu einem Nebeneffekt.

**Invarianten-Test:** ein zweiter Test sichert die vier Verträge strukturell ab:
1. Geometrie wird nur auf `reference_image_url` gemessen (kein Zugriff auf `lock_reference_url` im Geometriepfad)
2. Jeder Lauf startet über `beginSceneRun()` — kein direkter Schreibzugriff auf `active_run_id` außerhalb
3. Der Webhook schreibt nur bei passender `active_run_id`
4. Verdict `unknown` oder `static` darf nie zum Muxing führen

## Ebene 3 — Referenzlauf und Überwachung

**Golden Run:** Der jetzt erfolgreiche 4-Sprecher-Lauf wird als Referenz festgehalten — Szenen-ID, `active_run_id`, `plate_generation`, Anchor-URL, die vier Preclip-Geometrien und die gemessenen Motion-Deltas. Abgelegt in `docs/lipsync-golden-run-v400.md`. Das ist die Vergleichsbasis für jeden künftigen Verdacht auf Regression.

**Smoke-Test-Funktion:** eine leichte Edge Function `lipsync-selftest`, die auf Abruf einen synthetischen Zwei-Sprecher-Lauf durchschickt und die Kette bis zum Verdict prüft, ohne Credits zu verbrauchen. Damit ist vor jedem Deploy in einer Minute feststellbar, ob die Pipeline noch steht.

## Gefrorener Dateiscope

Backend: `_shared/scene-run-begin.ts`, `_shared/scene-run.ts`, `_shared/pass-face-preclip.ts`, `_shared/syncso-face-gate.ts`, `_shared/syncso-preflight.ts`, `_shared/plateFaceSlotRouter.ts`, `_shared/plate-face-detect.ts`, `_shared/plate-face-identity.ts`, `_shared/twoshot-face-map.ts`, `_shared/camera-path.ts`, `_shared/compute-mouth-centered-crop.ts`, `_shared/face-detect-mediapipe.ts`, `_shared/rek-image-space.ts`, `_shared/cast-clause.ts`, `_shared/lipsync-fail.ts`, `_shared/plate-attempt.ts`, sowie die Funktionen `compose-video-clips`, `compose-dialog-segments`, `sync-so-webhook`, `remotion-webhook`, `lipsync-watchdog`.

Frontend/Remotion: `src/remotion/templates/DialogStitchVideo.tsx`, `src/remotion/templates/DialogTurnFaceCropVideo.tsx`.

## Reihenfolge

1. Freeze-Dokument und Spezifikation schreiben (keine Codeänderung, null Risiko)
2. Golden-Run-Daten aus der Datenbank ziehen und festhalten
3. Konstanten in die Contract-Datei zentralisieren, Module umstellen
4. Contract- und Invarianten-Tests ergänzen
5. `lipsync-selftest` bauen und einmal grün laufen lassen

Schritt 3 ist der einzige, der bestehenden Code berührt. Er ist rein mechanisch — gleiche Werte, andere Herkunft — und wird durch die Tests aus Schritt 4 unmittelbar verifiziert.

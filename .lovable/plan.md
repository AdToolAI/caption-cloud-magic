# Lip-Sync-Abgleich: Guide (v400-Text) gegen den tatsächlichen Code

Kurzantwort: Die Kette ist **strukturell intakt** — alle vier Verträge stehen im Code. Aber der von dir gepostete Guide beschreibt an mehreren Stellen einen Stand, der so **nicht mehr im Code ist**; er wurde beim chirurgischen Rollback vom 27.07. (Baseline v283) entfernt. Der Guide ist damit teils Wunschbild, teils historisch.

## Was heute verifiziert im Code steht

- `beginSceneRun()` existiert und ist der Einstieg in `compose-video-clips` (T2, Run-Identität).
- `run_guard_discarded` ist im `sync-so-webhook` aktiv (T11).
- Watchdog-Zeiten stimmen exakt mit dem Freeze überein: Preflight 4 min, Provider 10 min, Audio-Mux 6 min, Hard 25 min, Dispatch-Recovery 30 s.
- Slot-Zuordnung row-major ist in `plateFaceSlotRouter.ts` implementiert.
- Der Freeze-Guard-Test (`lipsyncFrozenContract.test.ts`, 10 Tests) läuft grün — die eingefrorenen Werte sind unverändert.
- Die v427-Arbeiten (Job-Ledger, Callback-Guard, Kreditreservierung) laufen additiv und flag-gesteuert; sie schreiben keine Lip-Sync-Zustände.

## Wo Guide und Code auseinanderlaufen

| Guide sagt | Code sagt | Bewertung |
|---|---|---|
| Face-Gate: Gesichtsanteil ≥ 24 %, Mindestgröße 144 px, Mund-Randabstand, fail-closed | `syncso-face-gate.ts` ist der v252-Rekognition-Gate: prüft Vorhandensein/Koordinate/Mehrfachgesichter; `probe_unavailable` ist **nicht blockierend** | echte Abweichung — v331-Schwellen sind im Rollback entfallen |
| Mund bei 62 % Höhe (Mouth-Priority-Framing) | keine 0.62-Konstante in Preclip/Crop/Remotion-Template | entfallen; Framing läuft über `targetFaceShare 0.42` |
| Harte Maske 55–63 % Radius | weiche radiale Maske 30 % → 78 % (im Freeze festgeschrieben und getestet) | bewusster Freeze-Wert, Guide ist veraltet |
| `mouth-motion-verdict.ts`, `static` failt Szene, `unknown` blockiert Mux | Modul existiert nicht; `report-lipsync-motion-probe` ist reine Telemetrie | echte Abweichung — Passthrough-Erkennung ist derzeit nicht scharf |
| `rek-image-space.ts`, `lipsync-closeup-contract.ts` (120 px Mindestbreite) | Dateien existieren nicht | entfallen; nur `anchor-min-face-size.ts` |
| Geometrie ausschließlich auf `reference_image_url` | im Geometriepfad korrekt, aber `lock_reference_url` wird an mehreren Stellen weiter geschrieben/gelesen (`face-frame-extract`, `plate-face-detect`, `visual-inputs`) | Restrisiko: die alte Ursache des 27.07.-Bugs ist nicht strukturell ausgeschlossen |

## Was ich vorschlage (in dieser Reihenfolge)

1. **Guide als Dokument korrigieren, nicht den Code.** `docs/lipsync-pipeline-v400.md` wird zur ehrlichen Ist-Spezifikation umgeschrieben, mit einem Abschnitt „bewusst nicht implementiert (Rollback 27.07.)". Damit hört der Guide auf, falsche Erwartungen zu erzeugen. Null Risiko.
2. **Anker-Kohärenz strukturell absichern.** Ein Guard-Test, der verbietet, dass `lock_reference_url` im Geometriepfad (`face-frame-extract`, `plate-face-detect`, Preclip) als Messgrundlage dient. Keine Verhaltensänderung, nur ein Netz gegen den bekanntesten Regressionspfad.
3. **Passthrough-Erkennung: erst messen, dann entscheiden.** Die vorhandene Telemetrie (`report-lipsync-motion-probe`) über ein paar echte Läufe auswerten. Erst wenn die Verdicts belastbar sind, entscheiden wir, ob `static` wieder scharf schalten soll — das wäre ein Unfreeze und braucht deine ausdrückliche Freigabe.
4. **Face-Gate-Schwellen (24 % / 144 px) bleiben aus**, solange kein Vier-Sprecher-Referenzlauf zeigt, dass sie gebraucht werden. Sie wieder einzuschalten ist die Änderung, die die Kette 2026 zweimal zum Kippen gebracht hat.

## Technische Notizen

- Kein Schritt oben verändert Gates, Schwellenwerte, Framing, Maskengeometrie, Provider-Payloads oder die Zustandsmaschine. Schritte 1 und 2 sind Dokumentation und Tests, Schritt 3 ist Auswertung.
- Vor jedem Deploy an der Kette bleibt `lipsync-selftest` (GET, kreditfrei) der Health-Check: HTTP 200 = grün.
- Schritte 3 und 4 sind ausdrücklich **Entscheidungen**, keine automatischen Umsetzungen — sie fallen unter „unfreeze lipsync".

# Lip-Sync: Ist der Stand vom 03.08. noch intakt?

Du hast recht mit dem Datum — der Text ist vom 03.08.2026, 23:31, also 25 Minuten nach dem Freeze-Commit (`cae9730f8`, 03.08. 23:06 UTC). Ich habe deshalb nicht gegen mein Gedächtnis geprüft, sondern **den heutigen Code gegen genau diesen Commit gediffed**.

## Ergebnis: die Kette ist intakt

Diff des gesamten eingefrorenen Scopes (alle `_shared/`-Lip-Sync-Module, `compose-video-clips`, `compose-dialog-segments`, `sync-so-webhook`, `remotion-webhook`, `lipsync-watchdog`, `reset-lipsync-scene`, beide Remotion-Templates) zwischen Freeze-Commit und HEAD:

- **Unverändert, Byte für Byte:** `scene-run-begin.ts`, `scene-run.ts`, `pass-face-preclip.ts`, `syncso-face-gate.ts`, `plateFaceSlotRouter.ts`, `plate-face-detect.ts`, `plate-face-identity.ts`, `twoshot-face-map.ts`, `camera-path.ts`, `compute-mouth-centered-crop.ts`, `face-*.ts`, `cast-clause.ts`, `lipsync-fail.ts`, `plate-attempt.ts`, `anchor-min-face-size.ts`, `lipsync-frozen-contract.ts`, `lipsync-watchdog`, `reset-lipsync-scene`, `DialogTurnFaceCropVideo.tsx`.
- **`sync-so-webhook`:** nur Übersetzungen der Fehlermeldungen (`tl(...)`) und der `withLang`-Wrapper. Run-Guard, Pass-Logik, Retry-Leiter unangetastet.
- **`compose-dialog-segments`:** ebenfalls nur i18n der Gate-Meldungen.
- **`remotion-webhook`:** interne Preclip/Stitch-Artefakte landen nicht mehr in der Mediathek. Kein Einfluss auf die Kette.
- **`DialogStitchVideo.tsx`:** eine optionale Ambience-Spur (v418), Lautstärke auf [0,1] geklemmt. Maske weiter `30 % → 78 %`, Reprojektion unverändert.
- **`compose-video-clips`:** die große Änderung (+769 Zeilen), aber additiv außen herum — v425-Provider-Vertrag, v426-Kontinuitätskette, v427-Ledger/Guard/Reservierung, alle flag-gesteuert. Einzige Löschung: die alte lokale `SUPPORTED_AI_SOURCES`-Liste, ersetzt durch die zentrale Quelle.
- Der Freeze-Guard-Test läuft grün (10/10).

## Wo der Text und der Code auseinandergehen

Der Guide beschreibt einige Dinge, die **schon am 03.08. nicht im Code waren** — nicht seither entfernt, sondern beim Rollback vom 27.07. verschwunden und im Text als Sollzustand mitgeschrieben. Verifiziert direkt am Freeze-Commit:

| Guide | Am 03.08. im Code | Heute |
|---|---|---|
| `mouth-motion-verdict.ts`, `static` failt, `unknown` blockiert Mux | Datei existierte nicht | existiert nicht; `report-lipsync-motion-probe` ist reine Telemetrie |
| `rek-image-space.ts` | existierte nicht | existiert nicht |
| `lipsync-closeup-contract.ts`, 120 px Mindest-Gesichtsbreite | existierte nicht | existiert nicht (`anchor-min-face-size.ts` deckt einen Teil ab) |
| Face-Gate: 24 % Gesichtsanteil, 144 px, Mund-Randabstand, fail-closed | nicht im Gate; `syncso-face-gate.ts` war schon v252 (Rekognition, Präsenz/Koordinate) | identisch |
| Mund bei 62 % Höhe | keine 62-%-Konstante | keine |
| Harte Maske 55–63 % | weiche Maske 30 % → 78 % | identisch |

Der funktionierende Lauf vom 03.08. lief also **ohne** diese Bausteine. Das ist die wichtige Erkenntnis: sie sind nicht die Ursache des Erfolgs, sie sind ein älterer Entwurf, der in den Text gerutscht ist.

## Vorschlag

1. **Guide-Text auf den bewiesenen Ist-Stand korrigieren.** `docs/lipsync-pipeline-v400.md` bekommt die tatsächlichen Werte plus einen Abschnitt „im Text beschrieben, aber bewusst nicht im Code (Rollback 27.07.)". Damit hört der Guide auf, bei jedem künftigen Verdacht falsche Fährten zu legen.
2. **Drift-Wächter gegen den Freeze-Commit.** Ein Test, der die eingefrorenen Dateien gegen ihre Hashes vom Commit `cae9730f8` prüft und Abweichungen benennt. Erlaubte Ausnahmen (i18n-Strings) werden explizit gelistet. Danach ist „ist die Kette noch intakt?" eine Testfrage, keine Recherche.
3. **Kein Code an der Kette anfassen.** Face-Gate-Schwellen, 62-%-Framing und scharfe Passthrough-Erkennung bleiben aus, bis du ausdrücklich „unfreeze lipsync" mit Scope sagst — sie waren am erfolgreichen Referenztag nicht aktiv.

## Technische Notizen

- Vergleichsbasis: `cae9730f845fa5d40217dd5899bd3cc8e8c82039` (03.08.2026 23:06 UTC), der letzte Commit vor dem Zeitstempel deiner Datei.
- Beide Schritte sind Dokumentation und Tests — null Laufzeitrisiko, keine Deployments an Chain-Funktionen nötig.
- `lipsync-selftest` (GET, kreditfrei) bleibt der Health-Check vor jedem Deploy an der Kette.

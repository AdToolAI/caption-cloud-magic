## Befund (verifiziert im Code)

Der Fehler `face_gate_probe_unavailable:exact_preclip_face_probe_error:rekognition_zero_faces` entsteht aus zwei Ursachen, die gerade vermischt sind:

1. **Semantik-Fehler.** `_shared/face-detect-mediapipe.ts` (Zeile 353–359) meldet „Rekognition hat sauber gelaufen, aber 0 Gesichter gefunden" als **Fehler** (`ok:false, error:"rekognition_zero_faces"`). Das Gate (`_shared/syncso-face-gate.ts`, Zeile 379–390) prüft nur `rek.ok` und macht daraus `probe_unavailable` — obwohl darunter (Zeile 393) längst ein korrekter `no_face`-Pfad existiert. Die Szene stirbt mit einer Meldung, die eine Messstörung behauptet, obwohl eine Messung stattgefunden hat.

2. **Wahrscheinlich leeres Still.** Der Preclip ist beim Rendern mit `preclip_face_count = 1` validiert worden. Dass exakt dieses Artefakt plötzlich 0 Gesichter zeigt, deutet auf ein leeres/schwarzes Still aus `renderAwsStill` hin (Seek per `startSec` in `DialogTurnFaceCropVideo`, Frame 0). Das wird heute nirgends geprüft — ein schwarzes PNG erzeugt zuverlässig „zero faces".

## Was gebaut wird

**1. Nulltreffer ist ein Messergebnis, kein Ausfall**
- `detectFacesMediaPipe` gibt bei erfolgreicher Rekognition-Antwort ohne Treffer `ok: true, faces: []` zurück (neues Feld `zeroFaces: true`). `error` bleibt nur für echte Ausfälle (Credentials, Fetch, HTTP).
- Alle Aufrufer, die `!rek.ok` als „keine Gesichter" interpretieren, werden auf `faces.length` umgestellt (Suche über `supabase/functions`).
- Das Gate liefert dann `no_face` statt `probe_unavailable` — Fehlermeldung im UI wird eindeutig.

**2. Blank-Frame-Erkennung vor dem Urteil**
- Neues Modul `_shared/still-sanity.ts`: lädt das gerenderte Still, prüft Bytegröße und Luminanz-Varianz (nahezu uniformes/schwarzes Bild → `still_blank`).
- Ein `still_blank` ist ausdrücklich **kein** `no_face`, sondern ein Messausfall und löst den Retry aus.

**3. Konsens statt Einzelframe**
- Vor einem harten `no_face` probt das Gate bis zu 3 Frames (geprüfter Index, sowie ±15 % der dekodierten Preclip-Länge, alle über `checkPreclipFrame` validiert).
- `no_face` nur, wenn mindestens zwei auswertbare (nicht-blanke) Stills übereinstimmend 0 Gesichter zeigen.
- Sind alle Stills blank/nicht ladbar: Verdikt `probe_unavailable` mit präziser Ursache (`still_blank_all` statt `rekognition_zero_faces`).

**4. Degradierter Vertrauenspfad (eng begrenzt)**
- Nur wenn (a) alle Stills blank sind, (b) `preclip_face_count === 1` und (c) die v396-Geometrie-Roundtrip-Prüfung des Passes grün war, wird der Dispatch mit `probe_degraded` freigegeben und im Pass-Forensikobjekt markiert. Die Passthrough-Bewertung nach dem Lauf bleibt scharf und fängt einen Fehlgriff weiterhin ab.
- In allen anderen Fällen bleibt es fail-closed mit Refund wie bisher.

**5. Forensik**
- Pro Pass werden `probe_still_urls`, `probe_still_bytes`, `probe_frame_indices`, `probe_verdicts` persistiert, damit der nächste Fehlerfall am Bild statt am Fehlertext untersucht werden kann.

## Technische Details

- Dateien: `_shared/face-detect-mediapipe.ts`, `_shared/syncso-face-gate.ts`, neu `_shared/still-sanity.ts`, `compose-dialog-segments/index.ts` (Persistenz + Verdikt-Mapping, Bereich ab Zeile 7668).
- Neue Gate-Codes: `still_blank`, `probe_degraded`; `no_face` bleibt bestehen und wird jetzt korrekt getroffen.
- Tests: Erweiterung der v396-Regressionssuite um Fälle „zero faces mit gültigem Still", „alle Stills blank", „Konsens 1 von 3".
- Kein Eingriff in Crop-/Transformationslogik von v396 — die bleibt unverändert.

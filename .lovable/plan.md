## Ausgangspunkt (verifiziert an Szene `7c11bc27…`, 4 Sprecher)

- Die Face-Map stammt aus dem **Anchor-Standbild**, alle 4 Slots mit exakt `matchConfidence: 0.93` — kein echtes Unterscheidungssignal.
- Die Dispatch-Coords werden auf dem **gerenderten Clip** neu bestimmt. Sarahs Preclip-Crop (x 954–1111) enthält ihr Face-Map-Gesicht (x-Center 1149) **nicht** → ihr Audio läuft auf ein fremdes Gesicht. Kailees Crop trifft nur den Rand.
- Alle 4 Pässe: `motion_verdict = unknown`, Grund `motion_probe_unavailable:decoded_0` — Frames kommen an, das Dekodieren scheitert zu 100 %, `frameToGrid()` verschluckt den Fehler mit `catch { return null }`.
- Im Repo verwendet: `DetectFaces` + `CompareFaces` (Schwellwert-Matching). **Nicht** verwendet: `CreateCollection` / `IndexFaces` / `SearchFacesByImage`.

Wir wissen vor dem Render, wer wo ist — geben dieses Wissen aber nirgends verbindlich weiter, sondern lassen es nach dem Render neu erraten.

**Was dieser Plan garantiert und was nicht:** Die Charakter-Zuordnung wird deterministisch (A–C) — falsche Zuordnung und doppelte Charaktere sind danach ausgeschlossen bzw. werden hart geblockt. Ob danach *jede* Lippenbewegung sichtbar ist, hängt zusätzlich davon ab, ob der Provider überhaupt animiert; das können wir heute nicht messen. D stellt die Messung her, damit wir das erstmals belegen statt vermuten.

---

## Plan v349

### A. Rekognition Face Collection pro Workspace (deterministische Identität)
- Einmalig pro Nutzer eine Collection anlegen; jedes Cast-&-World-Portrait per `IndexFaces` mit `ExternalImageId = <brand_character_id>` indexieren. `FaceId`s am Charakter speichern, Re-Index nur bei Portrait-Änderung.
- Statt `CompareFaces`-Score-Matrix + Hungarian + Gemini-Cross-Check: pro erkannter Gesichtsbox im Clip **ein** `SearchFacesByImage` → liefert direkt die `brand_character_id`.

### B. Bekannte Geometrie verbindlich weiterreichen
- Die Anchor-Face-Map (Slot-Boxen + Charakter-IDs) dient als Erwartungswert. `DetectFaces` auf dem Clip-Frame, jede Box per A identifiziert — nur Boxen mit passender Identität dürfen die Coords eines Sprechers setzen.
- Kein "nächstliegende Box gewinnt" mehr, das Sarahs Crop 117 px daneben legt.

### C. Harte Gates vor Credit-Abzug und Dispatch
- Zwei Sprecher auf derselben `FaceId`/Region → `v349_clip_duplicate_identity` (dein Fall).
- Ein Sprecher ohne Treffer im Clip → `v349_clip_missing_cast`.
- Coord außerhalb der identifizierten Box → `v349_coord_identity_mismatch`.

Jeweils: Szene auf `clip_status='pending'` + `twoshot_stage='needs_clip_rerender'`, **volle Credit-Erstattung**, klare deutsche Meldung ("Der gerenderte Clip zeigt einen Charakter doppelt — Szene wird neu gerendert").

### D. Motion-Probe messbar machen
- `frameToGrid()` gibt Fehler aus statt sie zu schlucken: HTTP-Status, Byte-Länge, Decoder-Fehlertext pro Frame in `frameErrors` und ins Log.
- Decoder robust: nicht mehr allein der dynamische `npm:imagescript`-Import (wahrscheinlicher Ausfallpunkt im Edge-Runtime), plus Byte-Hash-Vergleich als letzte Instanz (identische Frames = No-Op auch ohne Pixel-Decoder erkennbar).
- Regressionstest mit zwei synthetischen Frames, erwartet `moved` bzw. `static`.
- `unknown` bleibt vorerst durchlässig; sobald `framesDecoded ≥ 2` in den Logs steht, blockt `static` wieder hart.

### Betroffene Dateien
- neu: `supabase/functions/_shared/rekognition-face-collection.ts`
- `supabase/functions/_shared/resolveIdentityViaRekognition.ts` (Collection primär, CompareFaces nur Fallback)
- `supabase/functions/compose-dialog-segments/index.ts` (Identitätsbindung + Gates C)
- `supabase/functions/_shared/mouth-motion-verdict.ts`, `_shared/aws-frame-probe.ts` (Decoder + Forensik)
- Migration: `rekognition_face_ids` an `brand_characters`, inkl. GRANTs
- Doku: `mem://architecture/lipsync/v349-rekognition-face-collection-identity`

### Was dieser Plan bewusst NICHT tut
Keine neuen Face-Share-Schwellen, keine neuen Retry-Leitern, keine Preclip-Geometrie-Änderung.

### Verifikation nach dem Deploy
Ich rendere eine frische 4-Sprecher-Szene und melde dir drei konkrete Zahlen zurück: (1) ob jeder Sprecher eine eindeutige `FaceId` bekommen hat, (2) ob jeder Crop seine identifizierte Box enthält, (3) den tatsächlichen `motion_verdict` pro Pass. Erst danach schrauben wir weiter — nicht vorher.

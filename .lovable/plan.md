# v129.22.3 — Auto-Snap auf Rekognition-Center bei `WAS_INFERRED=true`

## Was die Forensics jetzt zeigt

| Feld | Wert | Bedeutung |
|---|---|---|
| `PROVIDER` | `AWS_REKOGNITION` ✅ | AWS funktioniert seit deinem IAM-Fix |
| `MEDIAPIPE_FACES` | `1` | Rekognition findet das Gesicht |
| `MEDIAPIPE_OK` | `true` | Erkennung sauber, Plate hat genau 1 Person |
| `COORD` | `[152, 144]` | **Intent-Koord**, an die wir Sync.so schicken wollten |
| `WAS_INFERRED` | **`true`** | Diese Koord stammt aus einem Heuristik-Fallback, **nicht** aus Rekognition |
| `VERDICT` | `yes_but_not_at_coord` | Gesicht da, aber nicht an `[152, 144]` |

## Root-Cause

Beim ursprünglichen Dispatch (vor dem IAM-Fix) hat Rekognition `AccessDenied`
geworfen → `detectPlateFaces` lieferte `null` → `compose-dialog-segments` ist in
den **Heuristik-Fallback** in `index.ts:1379-1401` gefallen (gleichmäßig
verteilte Slots auf der Horizontal-Mittellinie + 5 % Margin-Clamp). Dabei kam
für Sarah `[~144, ~360]` raus, das wurde auf `[152, 144]` geclamped/persistiert.

Diese **inferred Koord ist jetzt im DB-State der Szene gespeichert.** Beim
Re-Preflight läuft Rekognition zwar grün, das echte Face sitzt aber bei
~`[360, 360]` (Bildmitte) — Verdict `yes_but_not_at_coord`. Sync.so kriegt
weiter die alte Heuristik-Koord, der Face-Gate blockt korrekt, Preclip wird
nicht dispatcht.

Das ist **kein neuer Bug**, sondern stale Daten. Aber: würde die Logik nach
einem fehlgeschlagenen Run einfach die echte Rekognition-Koord übernehmen,
wäre das Problem selbstheilend.

## Fix in 3 Teilen

### 1. Self-healing Coord-Refresh in `syncso-preflight/index.ts`

In `probeFaceAtFrame` (Zeilen ~323-348): wenn
- `mp.faces.length === 1` (genau ein Gesicht erkannt) UND
- `wasInferred === true` (Intent-Koord war Heuristik) UND
- die echte Rekognition-Koord innerhalb der **erweiterten Plate-Bounds** liegt
  (also ein plausibles Face auf der Plate, kein Geister-Detect),

dann **nicht** `yes_but_not_at_coord` failen. Stattdessen:
- Verdict `yes_one_face_at_coord_after_snap` (neu, status `pass`)
- Im Result-Objekt zusätzlich `snapped_coord: [face.cx, face.cy]` ausgeben
- Im Log-Event `face_gate_snap` mit alt/neu/delta tracken

Im Forensics-UI bekommt das einen gelben „**Auto-snapped**"-Badge + den
Delta-Vektor (alt → neu), damit transparent bleibt was passiert ist.

### 2. Caller (`compose-dialog-segments`) übernimmt den Snap

`syncso-preflight` wird vom Caller über `wasInferred` informiert (heute schon
so). Wenn der Preflight `snapped_coord` zurückgibt:
- `compose-dialog-segments` überschreibt vor dem Sync.so-Dispatch die
  `pass.coords` mit dem Snap-Wert (per-pass, terminal-safe → die v128-Guard
  von Zeile 2208 bleibt aktiv, nur nicht-terminale Passes werden refreshed).
- Loggt `COORD_AUTO_SNAPPED` mit `source: "preflight-snap"`.

### 3. Plate-Face-Cache für betroffene Szene einmalig invalidieren

Damit die aktuelle Szene `bc8ca39a…` **sofort** läuft, ohne dass du noch
einen kompletten Re-Render brauchst, invalidiere ich einmalig den
`plate_face_cache`-Eintrag für deren Plate-URL. Beim nächsten Replay läuft
Rekognition frisch durch und liefert die echte Koord.

```sql
DELETE FROM plate_face_cache
WHERE plate_url_hash IN (
  SELECT plate_url_hash FROM plate_face_cache
  WHERE plate_url = '<die plate_url aus dem aktuellen dialog_shot>'
);
```
(Ich lese die exakte URL über `read_query` bevor ich das laufen lasse — keine
fremden Cache-Einträge werden angefasst.)

## Was sich NICHT ändert

- AWS Rekognition bleibt Primary (läuft jetzt grün).
- IAM-Policy bleibt wie eingerichtet.
- Die v128-Guard für **terminale** Passes (`status: done|failed`) bleibt aktiv
  — der Auto-Snap greift nur für nicht-terminale Passes vor dem Dispatch.
- Multi-Speaker-Verdict `multiple_faces` bleibt unverändert (snap macht nur
  Sinn bei `faces.length === 1`).
- Keine neuen AWS-Permissions, keine neuen Secrets, keine neuen Provider.

## Versionierung

- `face-detect-mediapipe.ts` → unverändert (läuft sauber).
- `syncso-preflight/index.ts` → v129.22.3 (Snap-Logik).
- `compose-dialog-segments/index.ts` → v129.22.3 (Snap-Übernahme).
- `SyncsoForensicsSheet.tsx` → v129.22.3 + „Auto-snapped"-Badge.

## Verification nach Deploy

1. Cache-Invalidate für die aktuelle Szene (einmalig per SQL).
2. Replay in der UI starten.
3. Forensics zeigt:
   - `PROVIDER: AWS_REKOGNITION` (grün, wie jetzt)
   - `VERDICT: yes_one_face_at_coord_after_snap` (neu, grün)
   - Gelber Badge „**Auto-snapped** [152,144] → [≈360,≈360]"
   - **Preclip wird dispatcht**, roter „Crop-Bug"-Banner verschwindet.
4. Preclip-URL erscheint, Sync.so läuft durch, finaler Clip hat synchrone
   Lippen.

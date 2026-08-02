---
name: v397 Zero-Face-Konsens & Still-Sanity
description: Rekognition-Nulltreffer ist ein Messergebnis (ok:true, zeroFaces), leeres/schwarzes Probe-Still ist ein Messausfall; no_face braucht Konsens aus 2 auswertbaren Stills
type: architecture
---

**Problem:** `face_gate_probe_unavailable:exact_preclip_face_probe_error:rekognition_zero_faces`
vermischte zwei Dinge: "Detektor konnte nicht messen" und "Detektor hat gemessen, kein Gesicht".

**Regeln ab v397:**
1. `detectFacesMediaPipe` liefert bei sauberem Call ohne Treffer `ok:true, faces:[], zeroFaces:true`.
   `error` ist ausschliesslich echten Ausfällen vorbehalten (Credentials, Fetch, HTTP, Timeout).
2. `_shared/still-sanity.ts` → `inspectStill()` prüft jedes Probe-Still auf Bytegrösse und
   Luminanz-Varianz. Schwarz/uniform = `still_black` / `still_blank` = Messausfall, NIE `no_face`.
3. Das Face-Gate probt bis zu 3 Preclip-Frames (Basisindex, ±15 % der dekodierten Framezahl,
   alle über `checkPreclipFrame` validiert). `no_face` nur bei ≥2 übereinstimmenden auswertbaren
   Nulltreffern. Ein einzelner Nulltreffer = `probe_unavailable` (inconclusive).
4. Degradierter Pfad `probe_degraded` (ok:true) nur wenn ALLE Stills leer sind UND
   `preclipTrusted` (genau 1 Gesicht beim Preclip-Render) UND v396-Roundtrip grün.
   Die Passthrough-Bewertung nach dem Lauf bleibt scharf.
5. Forensik pro Pass: `probe_still_urls`, `probe_still_bytes`, `probe_frame_indices`,
   `probe_verdicts`, `probe_degraded`.

**Neue Gate-Codes:** `still_blank`, `probe_degraded`. Gate-Version-Tag: `v397-zero-face-consensus`.
Kein Eingriff in die v396-Crop-/Transformationslogik.

---
name: V505 Plate Action Budget
description: Lip-Sync-Plates dürfen Figurenbewegung/Aktionen zeigen; nur die Kamera bleibt gesperrt, Mund bleibt geschlossen.
type: feature
---
# V505 — Bewegungsbudget statt Bewegungsverbot (24.08.2026)

`neutralTwoShotPrompt()` und `buildCinematicSyncMasterPrompt()` in
`supabase/functions/compose-video-clips/index.ts` haben Figuren zuvor eingefroren
("heads stay steady", feste Position im Frame). Das war ein Legacy-Schutz für den
statischen v163-Crop und ist durch V452/V477 (dynamischer Face-Track, bewegter
Crop-Pfad, identische Inverse-Reprojektion) überholt.

Verbindlich ab V505:
- **Figuren dürfen agieren**: von A nach B laufen, sich zueinander drehen, Props
  handhaben, gestikulieren, Kopf drehen, miteinander interagieren.
- **Tracking-Budget (harte Grenze)**: immer vollständig im Frame, niemals Rücken
  zur Kamera, Gesicht lesbar (frontal/dreiviertel/Profil), Mund und Kiefer nie
  verdeckt. Negativ-Prompt blockt genau diese Verstöße.
- **Kamera bleibt gesperrt** (Frozen Invariant I.4): Literal
  `LOCKED static camera mounted on a tripod for the entire shot` muss bleiben.
- **Plate-Mund bleibt geschlossen** — der Mund gehört dem Lipsync-Modell.
- **Aktionen sind verbindlich**: `MANDATORY per-character action`-Direktive wird
  aus `[CastActions]` gebaut; sind die Felder leer, werden `Name: Aktion`-Sätze
  aus der Szenenbeschreibung rekonstruiert.
- **Camera-Motion-Stripper ist kamera-scoped**: nur `camera moves/tilts …`,
  `pan/zoom/dolly/push-in` werden entfernt. Unangekerte Muster wie
  `moves closer` oder `tilts up` dürfen NICHT mehr gestrippt werden, sonst
  verschwindet die Figurenbewegung.

Guard: `src/test/composer/v505-plate-motion-budget.test.ts`.

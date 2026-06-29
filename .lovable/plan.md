## Symptom

Cinematic-Sync N=1 Szene rendert jetzt zwar als korrekte Nahaufnahme mit statischer Kamera (v166 funktioniert), aber **Samuel öffnet die Lippen kaum** — der Sync-3 Lipsync greift sichtbar nicht durch, obwohl exakt dieselbe Szene "davor super funktioniert" hat.

## Root Cause (klar identifiziert)

Im Plate-Prompt für N=1 steht jetzt an **zwei** Stellen explizit "Mund zu, kein idle motion":

1. **`neutralTwoShotPrompt(n=1)`** in `compose-video-clips/index.ts` Z. 674: 
   `"mouth and jaw stay still and softly closed in the plate (no idle mouth motion, no jaw motion, no chewing, no muttering, no lip-flap)"`

2. **N=1 Closing-Clause** Z. 840-841: 
   `"The character keeps their mouth softly closed in the plate itself — no idle mouth, jaw or lip motion in the plate."`

Das widerspricht direkt dem **offiziellen Sync.so Tipp** (Z. 812-817 als Kommentar dokumentiert):
> "the character should be speaking naturally" — produziert die kleine idle mouth/jaw motion, die **sync-3 zwingend braucht**, um Lipsync auf AI-generierten Plates zu treiben. **Ohne diese Motion rendert sync-3 das Input-Plate nahezu unverändert** → genau das Symptom (Lippen öffnen sich kaum).

### Wann ist das reingekommen?
- **v171** (22. Juni) "Ghost-Speaker Fix" hat die idle-mouth-Motion **bewusst entfernt**, weil bei **parallelen Multi-Speaker-Passes** alle Sprecher gleichzeitig "ghost-mouthen" würden.
- **v173** (28. Juni) hat die N=1-Carve-Out hinzugefügt — aber den geschlossenen Mund **mitgenommen**, obwohl bei N=1 **kein Ghost-Speaker-Risiko** besteht (es gibt nur ein Gesicht und nur einen Pass).
- **v166** (heute) hat den Camera-Lock korrigiert, aber das Mund-Problem nicht angefasst — deshalb sieht der Schwenk-Bug gefixt aus, der Sync-Bug bleibt.

Nahaufnahme verschlimmert den Effekt nur optisch (man sieht es besser), Root-Cause ist nicht die Brennweite.

## Plan (v167 — N=1 Sync-Drive Restore)

### 1. N=1 Mund-Motion zurückholen (nur N=1)
`supabase/functions/compose-video-clips/index.ts`:

**`neutralTwoShotPrompt`, N=1 branch (~Z. 673-674):**
- Ersetze `"mouth and jaw stay still and softly closed in the plate (no idle mouth motion, …, no lip-flap)"` durch die v112-Formulierung:
  `"the character is speaking naturally with subtle idle mouth and jaw motion throughout the clip (small, natural openings — the downstream lipsync model needs an animatable mouth to drive)"`.
- Camera-Lock-Suffix bleibt **wortwörtlich** wie in v166 erhalten — nur die Mund-Anweisung wird gedreht.

**N=1 Closing-Clause (~Z. 840-841):**
- Ersetze `"The character keeps their mouth softly closed in the plate itself — no idle mouth, jaw or lip motion in the plate."` durch:
  `"The character is speaking naturally with small, continuous idle mouth and jaw motion in the plate — sync-3 drives the actual lip-sync in post."`.
- Lip-ready-Geometry, Augen-offen-Klausel und LOCKED-Camera-Block bleiben unangetastet.

**N≥2 bleibt 1:1 unverändert** — Ghost-Speaker-Lock auf Multi-Speaker ist weiterhin korrekt (parallele Passes auf einer geteilten Plate).

### 2. Telemetrie
- Bestehender Log `v166_camera_lock_sanitize` bleibt.
- Neuer Log `v167_n1_sync_drive enabled=true` einmal pro Build-Call wenn `speakerSlugs.length === 1`, damit man im `edge_function_logs` sieht, dass die N=1-Carve-Out aktiv ist.

### 3. Nicht angefasst (bewusst)
- `compose-dialog-segments` (Anchor-Bridge, Pre-Clip-JSON, sync-3 Dispatch) bleibt 1:1 — Pipeline-Kern ist heil, das hat der User selbst bestätigt ("v166-A-bis-Z").
- Negative-Prompt-Block `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` bleibt unverändert. Er listet "talking, lip-flap" nicht als Verbote auf für N=1, also kollidiert er nicht.
- `stripCameraMotionForPlate` Sanitizer bleibt 1:1.
- Keine DB-Migration, keine Schema-Änderung, keine Remotion-Bundle-Änderung.

### 4. Akzeptanz
- Re-Run derselben N=1 Samuel-Szene zeigt **deutlich sichtbar geöffnete Lippen** synchron zur deutschen VO, Kamera weiterhin frame-identisch statisch (v166 hält).
- Logs enthalten `v167_n1_sync_drive enabled=true` und (falls Sanitizer was zu tun hatte) `v166_camera_lock_sanitize`.

## Technische Details

| Datei | Änderung |
|---|---|
| `supabase/functions/compose-video-clips/index.ts` | N=1-Mund-Klausel in `neutralTwoShotPrompt` (Z. 674) und Closing-Clause (Z. 840-841) auf "speaking naturally with subtle idle mouth/jaw motion" zurückdrehen; Camera-Lock wortwörtlich erhalten; neues `v167_n1_sync_drive` Log. |
| `mem/architecture/lipsync/v167-n1-sync-drive-restore.md` | Neue Memory: erklärt warum N=1 idle-mouth wieder anhat, während N≥2 weiter geschlossen bleibt (Ghost-Speaker-Trennlinie). |
| DB / Migration / Remotion | unverändert |

## Was bewusst NICHT in v167 ist

- Negative-Prompt-Block bleibt — er sperrt keine "talking"-Tokens; muss also nicht gedreht werden.
- N≥2 wird nicht angefasst — die v171-Ghost-Speaker-Logik ist für Multi-Speaker weiterhin korrekt.
- Kein Dynamic-Face-Tracking-Overlay (das wäre v168, falls statischer Crop in anderen Szenarien zu eng wird).

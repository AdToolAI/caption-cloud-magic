# Restlicher Szenen-Blocker-Status nach V538 (Gate A–D)

Kurzantwort: Die vier bewiesenen Killer der letzten Wochen sind im Code behoben — aber **nichts davon läuft in Produktion**, und es bleiben drei reale Rest-Blocker. Ohne die folgenden Schritte verhalten sich Szenen weiterhin wie vorher.

## 1. Der Code ist da, die Produktion kennt ihn nicht

Alle Gate-A–C-Änderungen liegen nur im Repository (HEAD `e93b620d87`). Edge Functions werden beim Frontend-Publish nicht mit deployt.

Zu deployen, genau drei Funktionen:

- `compose-video-clips` — V538-A-Plate-Raster (Hailuo + HappyHorse)
- `compose-dialog-segments` — V538-B-Identitäts-Downgrade und bündelt `syncso-face-gate` (Gate C)
- (nur falls betroffen) keine weitere — `sync-so-webhook` und `lipsync-watchdog` bleiben unangetastet

Danach: frische Logs auf `v538_plate_resolution`, `v538_identity_veto_downgraded`, `v538c_not_at_coord_downgraded` prüfen — ohne diese Marker ist der Deploy nicht aktiv.

## 2. Verbleibender echter Blocker: Hailuo 10 s bleibt unter Spezifikation

`hiResAllowed: duration !== 10` — bei 10-Sekunden-Hailuo-Platten bleibt das Raster 768p, V538 meldet nur `blockedByProvider`. Bei 3–4 Sprechern sind die v400-Schwellen (`face_share ≥ 0.24`, `face_size ≥ 144 px`) dort rechnerisch weiterhin kaum erreichbar → `dynamic_mouth_crop_infeasible` kann erneut auftreten.

Optionen (Entscheidung nötig, nicht Teil dieses Plans):
- Mehrsprecher-Lip-Sync-Platten auf HappyHorse routen (1080p immer erlaubt), oder
- Hailuo-Dauer für Mehrsprecher-Platten auf 6 s klemmen, oder
- bewusst akzeptieren und den `blockedByProvider`-Fall vorab hart abweisen statt teuer zu rendern.

## 3. Weitere Fail-closed-Pfade, die weiterhin scharf sind

Diese wurden bewusst nicht angefasst (kein Unfreeze) und können eine Szene weiterhin beenden:

| Pfad | Wirkung |
| --- | --- |
| `v536_mouth_crop_infeasible` | Mundkrop geometrisch unmöglich → Abbruch vor Provider |
| `anchor_identity_needs_review` (V506/V508/V534) | grobe Fehlbesetzung im Anker blockt kostenfrei |
| `fa4_p0_turn_pass_mismatch` | V537 ist deployt, aber zur Laufzeit noch nie bestätigt |
| NOOP-Ladder / Motion-Probe | Provider liefert Standbild → `ssw:noop_fail`, kein Retry |
| `lipsync_anchor_input_unsupported` | Provider ohne ankertreuen Bildeingang |

## 4. Vorschlag für den nächsten Gate

1. Die zwei Funktionen deployen und die drei Marker in frischen Logs verifizieren (kein bezahlter Render).
2. Genau **einen** realen 4-Sprecher-Lauf starten, Provider HappyHorse (umgeht Punkt 2 sofort).
3. Read-only auswerten: Raster der Stills, `face_share`/`face_size` pro Pass, ob überhaupt ein Provider-Job entsteht.
4. Erst danach über die Hailuo-10-s-Frage und eventuelle Restlockerungen entscheiden.

## Technische Details

- V538-A: `_shared/v538-plate-resolution.ts`, rein, hebt nur das Render-Raster; `clip_quality`, Abrechnung, Provider-Wahl unverändert.
- V538-B: `compose-dialog-segments/index.ts` ~4938–5000 — V523/V524/V530-Identitätsveto wird zu Telemetrie, Fallback `anchor_reference_bbox` → `plate_positional_slot`.
- V538-C: `_shared/syncso-face-gate.ts` — `v461Passed` schaltet `not_at_coord` auf Snap; Mehrfachgesichter failen nur bei `dominantOverTarget`.
- Gate D ist durch V537-CAS-Ownership abgedeckt; der verbleibende `audio_plan`-Insert-Pfad ist Neuanlage und kann nicht rennen.

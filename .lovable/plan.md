# Sauberste Lösung für Ghost-Mouthing (N≥2)

Der Audit hat bewiesen: Die Pipeline ist v169-konform, der Plate-Prompt wurde in v171 gezielt gegen genau dieses Symptom gehärtet. Weitere blinde Prompt- oder Layer-Änderungen wären Rückschritt. Der professionelle Weg ist **erst diagnostizieren, dann gezielt handeln** — statt erneut zu raten.

## Phase 1 — Root-Cause-Isolation (nicht-invasiv, keine Codeänderung an der Pipeline)

Ziel: eindeutig feststellen, **wo** die Mundbewegung des Nicht-Sprechers entsteht. Es gibt genau drei Kandidaten, und ein einziger Test trennt sie sauber.

**Instrumentierung (nur Logging + Debug-Endpoint, read-only):**

1. In `compose-dialog-segments` beim erfolgreichen Abschluss einer N≥2-Szene die Debug-URLs strukturiert in die bestehende `video_creations.debug_payload` schreiben:
   - `master_plate_url` (Hailuo/Kling raw output, vor jeder Sync-Pass)
   - `preclip_urls[speakerId]` (pro Sprecher die isolierte Pre-Clip-Quelle)
   - `pass_output_urls[speakerId]` (Sync.so Output pro Pass, vor Mux)
   - `final_muxed_url` (nach `render-sync-segments-audio-mux`)
2. Kleiner interner Debug-View unter `/debug/lipsync/:creationId`, der diese 4 Ebenen nebeneinander abspielt (nur read; nutzt existierende signierte URLs).

**Diagnose-Matrix:**

```text
Non-Speaker-Mund bewegt sich in…      → Ursache               → Richtige Maßnahme
───────────────────────────────────────────────────────────────────────────────
master_plate_url                       Hailuo/Kling Modell     Phase 2A (Modell)
preclip_urls[X] außerhalb Turn(X)      Pre-Clip Segmentierung  Phase 2B (Clipping)
nur in pass_output_urls[X]             Sync.so Bleed           Phase 2C (Sync.so)
erst in final_muxed_url                Mux/Composite            Phase 2D (Mux)
```

Ohne diese Trennung ist jede weitere Änderung Ratearbeit.

## Phase 2 — Gezielte Maßnahme (abhängig vom Ergebnis)

Nur **eine** der folgenden Optionen wird umgesetzt — die, die Phase 1 als Ursache identifiziert:

**2A — Modell-Adhärenz (Hailuo/Kling reden im Plate):**
- Provider-Vergleichstest: dieselbe Szene je einmal mit Hailuo und Kling rendern, Ghost-Rate messen.
- Falls ein Provider stabil besser ist: Provider-Präferenz für N≥2 auf den besseren Provider setzen (bestehender Auswahlmechanismus, kein neues Layer).
- Falls beide gleich schlecht: minimal-invasive Prompt-Iteration **nur am Plate**, dokumentiert und A/B-getestet gegen aktuellen v175/v182-Stand. Kein Rollback auf v167.

**2B — Pre-Clip Segmentierung leaked Zeit:**
- Turn-Windows in `v204MultiSpeakerPreclipDispatch` gegen `dialog_turns` neu verifizieren (±Frame-Padding prüfen). Ein-Zeilen-Fix, keine Architekturänderung.

**2C — Sync.so Bleed innerhalb eines Passes:**
- Support-Ticket bei Sync.so mit reproduzierbarem Preclip + Output. Kein clientseitiger Workaround ohne Provider-Bestätigung.

**2D — Mux/Composite Artefakt:**
- `render-sync-segments-audio-mux` prüft, ob Slot-Bridging (v166 Anchor-Identity) korrekt zwischen Pässen wechselt. Fix lokal in der Mux-Funktion.

## Was bewusst NICHT gemacht wird

- **Kein** neuer Overlay-Layer (v183–v197 Reihe war genau der falsche Weg — siehe Memory).
- **Kein** Rollback des Plate-Prompts auf v167 (würde v171-Fix zurücknehmen).
- **Kein** erneutes „Blindraten" ohne Isolationsergebnis.

## Deliverables Phase 1

- `compose-dialog-segments`: Debug-Payload-Erweiterung (~10 Zeilen, hinter `DEBUG_LIPSYNC_URLS` Flag).
- `src/pages/DebugLipsync.tsx`: einfache 4-Panel-Playback-Ansicht.
- `mem/architecture/lipsync/v208-rootcause-isolation.md`: Protokoll + Matrix.

Nach einem einzigen N≥2-Ghost-Mouthing-Fall wissen wir, wo das Problem sitzt — und lösen es an genau einer Stelle, statt die Pipeline weiter aufzublasen.

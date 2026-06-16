# v129.2.0 — Forensik ABGESCHLOSSEN — Classification A bestätigt

**Ergebnis:** Root-Cause ist nicht v129.1-bezogen. Per-Pass Single-Face-Preclip-Pipeline (`renderPassFacePreclip` + `auto_detect:true`) ist aktiv. Pass-0 Crop schluckt vertikal benachbarten Sprecher, weil `computeFaceCrop` v92-Floor (220 px) den Neighbor-Cap (`0.88 × gap`) bei Δy ≈ 35–81 px überschreibt → Sync.so animiert die falsche Face an Pass-0-Position.

**Voller Beweis:** `docs/lipsync/v129-2-speaker0-forensics.md` (Crop-Geometrie, DB-Evidence, Math, Hotfix-Vorschlag).

**Empfohlener Hotfix v129.2.1:** 1 File (`supabase/functions/_shared/face-crop.ts`), ~6 Zeilen, härtet den Neighbor-Cap gegen den 220-Floor. Wartet auf User-Freigabe.

---

# v129.2 — Speaker-0 Lipsync Asymmetry: Forensics-First, kein Blind-Fix

## Signal vom User
Nach v129.1 Canary: **Lipsync funktioniert für alle Sprecher ausser Sprecher 1 (slotIndex 0).**
Sprecher 2..N zeigen sichtbare Mouth-ROI-Bewegung, Sprecher 1 ist no-op / falscher Mund / falsches Gesicht.

Das ist ein **enormer Fortschritt**: v129.1 Payload-Contract greift grundsätzlich (Sync.so akzeptiert doc-strict Coords und animiert). Aber es gibt eine **slot-spezifische Asymmetrie** ausschliesslich beim ersten Pass.

## Hypothesen (müssen bewiesen werden, nicht geraten)

**H1 — Face-Map Slot 0 Mis-Assignment**
Gemini-Vision liefert `assignments[]`, aber `slotIndex === 0` wird systematisch dem falschen Charakter / der falschen Bbox zugeordnet. Ursachen denkbar:
- Legacy `left|right` Backward-Compat-Parser mappt `left → slotIndex 0` ohne Identity-Check
- `pickSpeakerCoordinates` Fallback "evenly spaced" greift bei Slot 0 zu früh
- N-Slot Schema verwendet `slot: 0` aber Gemini gibt `slot: 1`-based zurück → off-by-one

**H2 — Coord-Transform am Frame-Rand**
Speaker 0 sitzt typischerweise links. Wenn `crop.x > plateX_speaker0`, wird `x'` negativ → in v129.1 zwar geblockt, aber falls die persistierten Coords bereits "korrigiert" wurden (z.B. auf 0 geclamped beim Schreiben), zeigt der Transform auf eine valide aber falsche Region.

**H3 — Multipass Pass-0 Spezialfall**
`force_multipass` Pass 0 verwendet eventuell andere Defaults (z.B. erster Pass nimmt `input_preclip_url` direkt, weitere Passes nehmen vorherigen `sync_output_url`). Wenn die Speaker-Reihenfolge an die Pass-Reihenfolge gekoppelt ist, würde Pass 0 immer Speaker 0 bekommen — und nur dort schlägt Coords-Auswahl fehl.

**H4 — `active_speaker_detection.frame_number` Off-by-One für Pass 0**
`frame_number` referenziert eventuell den Frame im Original-Plate, aber Sync.so erwartet ihn relativ zum Preclip. Wenn nur Pass 0 mit `frame_number = 0` läuft und Sync.so dort eine andere Interpretation hat, fällt es auf Auto-Detect zurück (silent).

**H5 — Audio-Mux Off-by-One (nicht Sync.so, sondern Stitch)**
Sync.so animiert korrekt, aber im finalen Stitch wird Speaker 0's lipsync-output durch das Original-Plate überschrieben (z.B. weil `audio_clips[0]` als "base track" behandelt wird).

## Plan: Read-only-Forensik (v129.2.0), KEIN Code-Change

### Stufe 1 — DB-Forensik (sofort, ohne neues Render)
Aus `syncso_dispatch_log` der letzten erfolgreichen Multi-Speaker-Runs ziehen:

```sql
SELECT
  pass_index,
  meta->'v116_diag'->>'asd_mode'     AS asd_mode,
  meta->'v116_diag'->>'coords_sent'  AS coords_sent,
  meta->'outbound_payload'->'options' AS opts,
  meta->'coord_transform'            AS transform,
  meta->'face_map'                   AS face_map,
  sync_input_url, sync_output_url
FROM syncso_dispatch_log
WHERE created_at > now() - interval '24 hours'
  AND meta ? 'coord_transform'
ORDER BY scene_id, pass_index;
```

Vergleich Pass 0 vs Pass 1..N pro Szene auf:
- `asd_mode` (muss `preclip_coords_doc_strict` sein für ALLE Passes)
- `coords_sent[0]` vs Speaker-Identity in `face_map`
- `transform.scale` und `transform.crop` Konsistenz
- `frame_number` Wert

### Stufe 2 — Face-Map Audit
Aus `dialog_shots` / Anchor-Cache: Für die Canary-Szene das gespeicherte `face_map`-Objekt extrahieren und manuell prüfen:
- Hat `slotIndex: 0` die korrekte `characterId`?
- Stimmt `bbox` für Slot 0 visuell mit Speaker 0 im Plate überein (Screenshot-Overlay)?

### Stufe 3 — Output-Diff Speaker 0 vs Speaker N
Frame-Extraktion aus `sync_output_url` Pass 0 vs Pass 1:
- ROI um `coords_sent` herum
- Pixel-Diff zwischen `input_preclip_url` und `sync_output_url` in genau dieser ROI während Audio-Active-Frames
- Wenn Diff bei Pass 0 ≈ 0 aber bei Pass 1 hoch → Sync.so hat Pass 0 ignoriert (Hypothese H1/H3/H4)
- Wenn Diff bei Pass 0 hoch, aber an FALSCHER Position → Coords zeigen auf falsches Gesicht (Hypothese H1/H2)

### Stufe 4 — Klassifikation
| Befund | Klassifikation | Nächster Schritt |
|---|---|---|
| Pass 0 coords zeigen auf Speaker 1's Bbox | **A — Face-Map Slot-0 Bug** | v129.2.1 Hotfix in `_shared/twoshot-face-map.ts` `pickSpeakerCoordinates` |
| Pass 0 `asd_mode != preclip_coords_doc_strict` | **B — Request-Builder Pass-0-Fallthrough** | v129.2.1 Hotfix in `compose-dialog-segments` Pass-0-Branch |
| Pass 0 Sync.so output identisch zu Input bei valider Bbox | **C — Sync.so frame_number Interpretation** | Support-Bundle + Plan-Pivot |
| Pass 0 ok, aber Stitch überschreibt | **D — Audio-Mux Speaker-0-Override** | v129.2.1 Hotfix in `render-sync-segments-audio-mux` |

## Out of Scope (v129.2.0)
- Kein Code-Change. Forensik liefert Beweise, dann erst Hotfix-Plan.
- State Machine, Retry, Watchdog, Plan-D, UI bleiben unverändert.
- `lipsync-2-pro` Swap, Stage 4 A/B, Segments API bleiben deferred.
- v128 Soak läuft weiter als Hintergrund-Telemetrie.

## Deliverables
1. `docs/lipsync/v129-2-speaker0-forensics.md` — neu, mit Query-Resultaten, Frame-Diffs, Klassifikation
2. `.lovable/plan.md` — Active-Sektion auf v129.2.0 Forensics aktualisiert
3. Memory-Update erst NACH Klassifikation, nicht spekulativ

## Erfolgskriterium
Eine eindeutige Klassifikation (A/B/C/D) mit Datenbeleg — **kein Hotfix ohne bewiesenen Root-Cause**.
Wenn A/B/D: minimaler v129.2.1 in genau einem File, danach Canary-Repeat mit 1 User / 1 Szene / 3+ Speaker.
Wenn C: Plan-Stop, Support-Bundle für Sync.so.

## Warum kein direkter Fix
v129.1 hat gezeigt, dass auch ein "offensichtlicher" Payload-Bug erst nach belastbarer Forensik korrekt isoliert werden kann. Speaker-0-Asymmetrie hat mindestens 5 plausible Ursachen in mindestens 3 verschiedenen Modulen (Face-Map, Request-Builder, Audio-Mux). Ein blinder Fix in der falschen Schicht zerstört die v129.1-Erfolge der anderen Sprecher.

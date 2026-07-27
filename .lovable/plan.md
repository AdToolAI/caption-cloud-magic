## Diagnose

Der Fehler `bbox_geometry_insane:area_pct=0.00` in Szene S01 bedeutet: die für Sync.so berechnete Face-Bbox hat **Fläche 0** — d.h. `dispatchBox` war `null` oder degeneriert, bevor der v152-Sanity-Gate lief.

Konkreter Pfad in `compose-dialog-segments/index.ts` (Zeilen 5580–5687):

1. Für **N ≥ 2 Sprecher** wird die Bbox **ausschließlich** aus `speakerPlateBboxes[pass.speaker_idx]` gelesen (plate-native).
2. Der `facemap`-Fallback und der synthetische Coords-Fallback sind hart auf `speakers.length < 2` beschränkt (v153.1 Absicht: keine identischen Boxen pro Sprecher).
3. In dieser Szene war `speakerPlateBboxes[idx]` also `null` oder eine 0-Fläche-Box → `box` bleibt `null` → `dispatchBox = null` → `boxArea = 0` → `area_pct = 0.00` → v152 Hard-Fail + Refund.

Ursache stromaufwärts: Rekognition/Plate-Face-Detection hat für mindestens einen Speaker-Slot keine gültige Bbox geliefert (Slot leer nach v278.1-Bijection, oder Face wurde nicht detektiert, oder persistierte Bboxes waren stale/leer). Das passt zur Symptomatik: Cast&World-Namen (54d905, 5c81f9, 4d5438) sind **generische Platzhalter-IDs** — die Rekognition/Router-Bijection läuft ins Leere.

**Nicht bestätigt** ohne Live-Logs: ob `speakerPlateBboxes` komplett `[null, null, null]` war (Detection-Ausfall) oder ob nur ein einzelner Slot leer war (Router-Mismatch bei asymmetrischer Aktion). Erster Schritt des Plans ist daher: Logs abrufen und Ursache eindeutig zuordnen.

## Plan v280 — Diagnose + gezielter Fix

### Schritt 1 — Verifizieren (read-only)
- `supabase--edge_function_logs` für `compose-dialog-segments`, Suche nach der Szenen-ID aus dem Screenshot.
- Extrahieren:
  - `v158_plate_hydration source=… boxes=X/N mouths=Y/N` (persisted vs. live vs. missing)
  - `v160_sync3_face_box` Log pro Pass (fehlt es ganz für den fehlgeschlagenen Pass?)
  - `v152_BBOX_HARD_FAIL … non_null=… area_pct=0.00` mit `bbox_source`

Damit ist klar, ob:
- (A) **alle Slots** leer sind → Rekognition-/Face-Detection-Ausfall auf dem Plate (globales Problem)
- (B) **ein Slot** leer ist → Bijection-Router hat den Speaker nicht auf ein Face gemappt

### Schritt 2 — Fix je nach Ursache

**Fall A (Detection global fehlgeschlagen):**
- In `compose-dialog-segments` beim Plate-Hydration-Punkt (Z. 2193/2203): wenn nach live-detect `speakerPlateBboxes.every(b => !b)` → Szene früh mit klarer Fehlermeldung „Keine Gesichter im Plate erkannt — Szene neu rendern (Sprecher frontal, unverdeckt)" hart failen **statt** erst später im Dispatch-Loop pro Pass zu failen. Refund einmal, nicht N-mal.

**Fall B (nur einzelner Slot leer bei N≥2):**
- Kontrolliertes Aufweichen der N≥2-Hardgrenze in Z. 5638 / 5678: wenn **mindestens ein anderer** Slot eine valide Bbox hat, für den leeren Slot einen **Rescue-Pfad** erlauben:
  - Nachbelegung via `faceMap.faces` (falls anchor_face_layout einen Slot hat, der nicht in `speakerPlateBboxes` gelandet ist).
  - Wenn auch das leer ist: **diesen Pass** als `_v152HardFail` mit Reason `plate_slot_missing:idx=X` markieren (klar benannt, nicht `area_pct=0.00`), Rest der Passes läuft normal weiter.
- Damit fällt bei N=3/4 nicht mehr die ganze Szene, wenn nur 1 Sprecher-Slot leer ist.

**Beide Fälle:**
- Fehlermeldung im UI von `bbox_geometry_insane:area_pct=0.00` auf sprechend umbenennen (`plate_face_missing:slot=X` bzw. `plate_no_faces_detected`), damit „Re-Render empfohlen" konkret wird.

### Schritt 3 — Verifizieren
- Szene `Neu rendern` triggern, Edge-Logs prüfen: neuer Reason-String, korrekter Refund (einmalig), UI zeigt neue Message.

## Technische Details

Betroffene Datei:
- `supabase/functions/compose-dialog-segments/index.ts`
  - Z. 2200–2210: Early-Fail bei `plateHydrationSource === "missing"` und `boxes = 0/N`.
  - Z. 5580–5687: Rescue-Pfad für Einzel-Slot-Miss bei N≥2 (nur facemap-Nachbelegung, kein synthetischer coords-Fallback — der bleibt gesperrt wegen v153.1).
  - Z. 5845–5871: `v152FailReason` um `plate_slot_missing`/`plate_no_faces_detected` erweitern.

Keine Client-Änderungen nötig außer optional dem Toast-Text in `SceneClipProgress`.

## Was NICHT geändert wird
- v278.1 Bijection-Router bleibt (der ist orthogonal).
- v279 Inline-Fallback bleibt (behebt Upload-Probleme, nicht Detection-Probleme).
- Anker-Pipeline / NB2 / Gemini3-Pro-Wahl unverändert.

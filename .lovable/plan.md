## Befund

Das aktuelle Fehlschlagen ist **nicht mehr nur der Screenshot-Face-Gate-Fehler**, sondern weiterhin der alte Root Cause im echten Provider-Payload:

- Letzter Dispatch `scene=83145f34...`, `pass=1`, `variant=coords-pro`
- Sync.so bekam weiterhin:
  ```json
  "active_speaker_detection": {
    "auto_detect": false,
    "coordinates": [360,363],
    "frame_number": 2
  }
  ```
- Ergebnis: `generation_unknown_error`

Wichtig: In der Source-Datei ist `asd-strategy.ts` bereits richtig vorbereitet, aber **die deployte Edge Function läuft offenbar noch mit alter/bundled Logik** (`v130_preclip_coord_strict`, `reason: coords_pro_retry`). Deshalb hat der letzte Versuch die Produktionsfunktion nicht effektiv umgestellt.

## Plan

1. **Fix direkt im Dispatch-Pfad erzwingen**
   - In `compose-dialog-segments/index.ts` nach `buildAsdStrategy(...)` eine harte Safety-Normalisierung einbauen:
     - Wenn `usePassPreclip === true`
     - und `retryVariant === "coords-pro"`
     - und keine echte Mehrgesicht-Ambiguität vorliegt
     - dann wird `syncOptions.active_speaker_detection` zwingend auf `{ auto_detect: true }` gesetzt.
   - Damit kann keine alte `coords-pro → coordinates` Entscheidung mehr bis zum Sync.so Payload durchrutschen.

2. **Face-Gate an Auto-Detect anpassen**
   - Der Live Face-Gate darf bei `{ auto_detect:true }` keinen erfundenen/inferierten Koordinatenpunkt mehr prüfen.
   - Für Auto-Detect-Preclips wird nur geprüft: Preclip ist da, keine bestätigte Mehrgesicht-Ambiguität; kein Hard-Fail wegen `recognition_zero_faces` aus einem unzuverlässigen Probe-Frame.
   - Das verhindert den Screenshot-Fall „Gesicht am ASD-Frame FAIL“ als Blocker, wenn der tatsächliche Provider-Payload Auto-Detect nutzt.

3. **Forensik-Logging eindeutig machen**
   - `syncso_dispatch_log.meta` soll klar zeigen:
     - `asd_rule_fired: rule_0_preclip_coords_pro_forced_auto`
     - `asd_mode_chosen: single_face_auto`
     - outbound payload ohne `coordinates` und ohne `frame_number`
   - So können wir nach dem nächsten „Sauber neu starten“ beweisen, ob Sync.so wirklich den neuen Payload bekommen hat.

4. **Tests ergänzen**
   - Test für den aktuellen Produktionsfall:
     - Multi-Speaker
     - Preclip
     - `retryVariant: "coords-pro"`
     - `preclipFaceCount: 1`
     - `ambiguity: clean`
     - Erwartung: `{ auto_detect: true }`, keine Koordinaten.
   - Test/Assertion für den Face-Gate-Bypass bei Auto-Detect-Preclip, soweit sauber isolierbar.

5. **Deploy & Verifikation**
   - `compose-dialog-segments` deployen.
   - Danach Logs/DB prüfen: Der nächste Dispatch muss `asd_auto_detect:true`, `asd_has_coordinates:false` zeigen.
   - Wenn Sync.so danach noch fehlschlägt, ist es ein echter Provider-/Asset-Fall; aber dann haben wir den bisherigen Koordinaten-Root-Cause sicher ausgeschlossen.

## Nicht ändern

- Kein Umbau der doppelten Bild-/Plate-Erzeugung.
- Keine Änderung an Credits/Refunds.
- Keine Änderung am Avatar-/Preclip-Rendering selbst.
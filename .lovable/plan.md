# Änderung 3: Full-Shot verwerfen, v400-Preclip-Core wieder autoritativ machen

## Befund des kontrollierten Laufs

Szene `a0b2a6f1…`, Generation 3, Run `1653112f…`, 4 Turns / 2 Sprecher:

- Alle vier Pässe liefen über den reparierten Full-Shot-Pfad: `full_plate`,
  `preclip_used=false`, gemessene 30 fps, plate-langes Audio (11,9 s),
  `bounding_boxes_url`, `sync_mode=loop`.
- Sync.so nahm alle vier Calls an und meldete sie technisch `succeeded`.
- Der Webhook klassifizierte dennoch alle vier Pässe als `noop` bzw.
  `MOTION_UNVERIFIED`; die Messung konnte wegen
  `mouth_roi_unresolved:geometry_measure_src_missing` keine Bewegung belegen.
- Der Mux verwendete anschließend alle vier Full-Plate-Ausgaben mit
  Face-Mask-Overlays; der finale Render wurde technisch `done`, zeigt aber
  visuell keinen Lip-Sync.

Damit ist das vorab festgelegte Abbruchkriterium aus Änderung 2 erfüllt:
Full-Shot wird nicht weiter variiert, sondern verworfen.

## Umsetzung

1. **Full-Shot als Dispatch-Pfad abschalten**
   - Frische Lip-Sync-Pässe dürfen `_v153BboxPrimary` nicht mehr aktivieren.
   - `FEATURE_V543_FULLPLATE` kann den Pfad nicht versehentlich wieder öffnen.
   - Die MP4-Zeitbasis-Messung darf als Hilfslogik bestehen bleiben, besitzt
     aber keine Dispatch-Autorität mehr.

2. **Isolierten Preclip-Pfad für N=1–4 wieder autoritativ machen**
   - Pro Sprecher/Turn wird vor Sync.so ein isolierter Preclip erzeugt.
   - Provider-Video, Tight-Audio und `bounding_boxes_url` verwenden dieselbe
     Clip-Zeitbasis und die exakt persistierte Preclip-FPS/Framezahl.
   - Der Mux reprojiziert ausschließlich über `preclip_crop`; kein
     Full-Plate-Face-Mask-Fallback für neue Läufe.

3. **Sicherheitsverträge beibehalten**
   - V524/V530 Identity-/Assignment-Lock, kanonische Turn-IDs, Run-/Generation-
     Fencing, Ledger-Idempotenz und Refund-Logik bleiben unverändert.
   - Keine neuen Schwellen, kein Provider-/Modellwechsel, keine Migration,
     keine Frontend- oder Preisänderung.
   - Wenn ein sicherer Preclip oder dessen exakte Zeitbasis fehlt, wird vor dem
     kostenpflichtigen Provider-Call abgebrochen und idempotent erstattet.

4. **Regressionen aktualisieren**
   - N=1, 2, 3 und 4: frischer Dispatch ist immer `preclip_used=true`,
     `input_space=clip`, Tight-Audio und exakte Preclip-Framezahl.
   - Kein frischer Dispatch darf `dispatch_video_kind=full_plate` oder den
     V543-Mux-Ausnahmepfad erreichen.
   - Identitäts-Lock, Sprecherzuordnung und ein Provider-Call je Pass bleiben
     abgedeckt.

## Verifikation und Rollout

- Fokustests für Dispatch-Vertrag, Preclip-Zeitbasis, Bounding-Box-Transport,
  Identität, Ledger und Mux-Vertrag ausführen.
- Ausschließlich `compose-dialog-segments` deployen; der bestehende Mux-Code
  bleibt kompatibel, erhält für neue Läufe aber nur Preclip-Pässe.
- Danach genau einen kontrollierten 2-Sprecher-Lauf starten und read-only
  prüfen: jeder Pass nutzt einen Preclip, Sync.so akzeptiert ihn, die
  Mundbewegung ist messbar (`moved`/`motion_verified`) und im finalen MP4 in
  den richtigen Turn-Fenstern sichtbar.

## STOP-Kriterium

Bleibt auch der autoritative Preclip-Lauf ohne nachweisbaren sichtbaren
Lip-Sync, erfolgt kein weiterer Provider-Call: Lip-Sync wird per bestehendem
Feature-Flag stillgelegt und die verbleibende Ursache separat read-only
isoliert.
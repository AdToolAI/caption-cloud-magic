# Plan v336 — Preclip-Vertrauensvertrag reparieren

## Bestätigte Ursache
Der aktuelle Lauf `69d56a49-8f59-42ab-ab06-8868f0b42db1` scheitert laut Funktions-Log am 31.07.2026 um 20:04:16 UTC mit `v331_multispeaker_probe_unavailable`.

Der Preclip wird erzeugt, aber der nachgelagerte Gate-Code erwartet einen zusätzlichen JPEG-Nachweis, den die Pipeline nicht liefern kann:

- `face-frame-extract.ts` erlaubt seit v251 absichtlich keine serverseitige MP4-Frame-Extraktion mehr.
- Der deterministische Browser-Cache enthält für den frisch serverseitig gerenderten Preclip kein Probe-Frame.
- `compose-dialog-segments` setzt beim erfolgreichen Preclip kein `preclip_face_count`; deshalb wird `preclip_trusted=false`.
- v331 behandelt anschließend jedes `probe_unavailable` in einer Mehrsprecher-Szene als harten Fehler – selbst wenn tatsächlich ein isolierter Single-Face-Preclip dispatcht werden soll.

Das ist ein interner Vertragswiderspruch. Der frühere 0,0-%-Crop-Fehler ist in diesem Lauf nicht mehr die Abbruchursache.

## Umsetzung

1. **Single-Face-Preclip-Vertrauen explizit ableiten**
   - In `compose-dialog-segments` einen zentralen Trust-Entscheider ergänzen.
   - Ein Preclip gilt nur dann als konstruktiv isoliert, wenn:
     - der Preclip-Render erfolgreich ist,
     - Face-Share den geltenden Floor erfüllt,
     - die Geometrie nicht verdächtig ist,
     - die Ambiguitätsprüfung sauber ist,
     - kein Geschwister-Gesicht im Crop liegt.
   - Das Ergebnis samt Begründung auf dem Pass persistieren und loggen; kein erfundener Detektorwert `face_count=1`.

2. **v331 Gate korrekt zwischen Full-Plate und isoliertem Preclip unterscheiden lassen**
   - `syncso-face-gate.ts` so ändern, dass `probe_unavailable` bei einer Mehrsprecher-**Full-Plate** weiterhin fail-closed bleibt.
   - Bei einem konstruktiv verifizierten Single-Face-Preclip darf das fehlende zusätzliche JPEG den Dispatch nicht blockieren.
   - Falls ein echtes Probe-Frame vorhanden ist und darauf null oder mehrere Gesichter erkannt werden, bleibt der harte Morph-Schutz unverändert aktiv.

3. **Widersprüchliche Diagnose bereinigen**
   - Die Meldung `dispatch will proceed unchecked` nicht mehr in einen anschließend harten `no_face`-Fehler einbetten.
   - Eindeutige Codes für `trusted_preclip_without_probe` und `untrusted_multispeaker_without_probe` ausgeben, damit UI und Logs die tatsächliche Ursache zeigen.

4. **Regressionstests ergänzen**
   - Vertrauenswürdiger Single-Face-Preclip + kein JPEG → Dispatch erlaubt.
   - Verdächtiger/mehrdeutiger Preclip + kein JPEG → blockiert und erstattet.
   - Full-Plate mit mehreren Sprechern + kein JPEG → blockiert.
   - Probe erkennt null oder mehrere Gesichter → weiterhin blockiert.
   - Single-Speaker-Verhalten bleibt unverändert.

5. **Deploy und Laufprüfung**
   - `compose-dialog-segments` mit den Shared-Modulen deployen.
   - Den nächsten Neu-Render anhand der Logs prüfen: Preclip-Trust-Grund, Face-Share, Sibling-Status und Face-Gate-Entscheidung müssen zusammenpassen; Sync.so darf erst danach starten.
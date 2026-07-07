## Diagnose

Ja, die Morphs können trotz harter Masken weiter bestehen, weil das eigentliche Problem inzwischen nicht mehr nur der Feather-Rand ist.

Bei v169 gab es laut Projekt-Historie wieder nur aktive Sprecher-Passes: keine Silent-Speaker-Passes und keine permanenten Face-Freeze-/Portrait-Kacheln über der ganzen Szene. Dadurch wurde während eines Sprecherfensters im Wesentlichen nur die echte Sync-Lipsync-Ausgabe dieses Sprechers über die Master-Plate gelegt.

Aktuell sind gegenüber v169 zusätzliche Stabilizer aktiv:

1. `silentFaceFreezes[]` v195 rendert pro Sprecher eine eingefrorene Face-Kachel über die komplette Szene.
2. `mouthMattes` v193 rendert während jedes Sprecherfensters gefrorene Mund-Patches für die anderen Sprecher.
3. Die aktiven Sync.so-Ausgaben werden weiterhin als Crop/Mask über dieselbe Live-Plate gelegt.

Das erzeugt in den Screenshots sichtbare Überlagerungen: besonders bei der rechten Sprecherin sieht man eine rechteckige/halbtransparente Face-Zone. Das ist typisch für Layer-Konkurrenz: Freeze/Matte/Live-Plate/Sync-Crop liegen nicht pixelidentisch übereinander. Harte Masken entfernen nur den weichen Crossfade, aber nicht die Tatsache, dass zwei Face-Zustände gleichzeitig sichtbar werden können.

## Warum v169 keine Morphs hatte

v169 war sauberer, weil es die zusätzlichen Silent-Stabilizer nicht im Renderpfad hatte. Es akzeptierte dafür das alte Problem: vor/nach dem Skript konnten die AI-Plate-Münder weiter idle bewegen. Die späteren Versionen haben dieses Idle-Mouth-Problem bekämpft, aber dabei wieder zusätzliche Face-Layer eingeführt — und genau diese Layer erzeugen jetzt die Morph-/Ghost-Artefakte.

## Umsetzungsplan

1. **v169-Render-Invariant wiederherstellen**
   - Während ein Sprecher aktiv spricht, darf für dessen Gesicht nur ein Face-Layer sichtbar sein: die Sync.so-Ausgabe.
   - Keine globalen `silentFaceFreezes` dürfen während aktiver Sprecherfenster sichtbar bleiben.
   - Keine Listener-`mouthMattes` innerhalb aktiver Sprecher-Sequenzen, solange sie sichtbar Layer-Artefakte verursachen.

2. **v195 auf echte Silent-Windows begrenzen**
   - `silentFaceFreezes` um `windows: [{ fromSec, toSec }]` erweitern.
   - Diese Windows werden aus den Sprechersegmenten berechnet: nur vor dem ersten Turn, zwischen Turns und nach dem letzten Turn.
   - In Remotion werden Freeze-Kacheln nur in diesen Silence-Sequenzen gerendert, nicht über die komplette Szene.

3. **v193 MouthMattes standardmäßig aus dem Mux entfernen**
   - `listener_mouth_matte_v193` für Fanout standardmäßig deaktivieren bzw. nicht mehr in aktive Shots einbetten.
   - Begründung: Der Screenshot zeigt, dass diese Patches/Face-Zonen als zweite Gesichtsschicht wahrnehmbar werden können.

4. **Masken beibehalten, aber nicht als Hauptfix betrachten**
   - Die harten v196-Masken bleiben, weil sie den alten Feather-Morph verhindern.
   - Der Hauptfix ist Layer-Timing: Freeze nur in Silent-Windows, aktiver Sprecher nur Sync-Layer.

5. **Logs und Doku aktualisieren**
   - Log-Tag auf `v197_silent_windows` ändern: Slots, Window-Anzahl, aktiv/deaktiviert.
   - Architektur-Memory ergänzen: v169 hatte keine Morphs wegen Single-Face-Layer-Invariant; v197 stellt diese Invariant wieder her.

## Erwartetes Ergebnis

- Während Sprache: kein Face-Morph, weil nur der Sync.so-Lipsync-Layer über der Plate liegt.
- Vor/nach Skript und in Pausen: Mund bleibt still, weil v195 nur dort als Freeze greift.
- Hintergrund/Körper bleiben beweglich, weil nur Face-Bereiche in Silent-Windows eingefroren werden.
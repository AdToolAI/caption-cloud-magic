# Fix: Matthew (linker Sprecher) hat geschlossenen Mund — Preclip-Neighbor-Overlap

## Root Cause (verifiziert in Logs Szene `71abb2e2`)

Face-Map (Plate 1376×768):
- Matthew slot 0 center `[227, 144]`
- Samuel  slot 1 center `[544, 146]`
- Kailee  slot 2 center `[861, 167]`
- Sarah   slot 3 center `[1149, 177]`

Pass-Dispatch:
- Pass 1 Samuel — **kein Preclip**, voller Plate + Punkt-ASD `[544,146]` → trifft Samuel → ✅ Mund bewegt
- Pass 2 Matthew — **Preclip** 512×512 um `[227,144]` → Crop x ∈ [-29, 483] → **Samuels Bbox (x=460–629) liegt im Crop**
- Pass 3 Kailee — Preclip 512×512 um `[861,167]` → Crop x ∈ [605, 1117] → Samuel (629) und Sarah (1061) am Rand, aber Kailee mittiger → ✅
- Pass 4 Sarah  — Preclip 512×512 um `[1149,177]` → Crop x ∈ [893, 1376/Edge] → Kailee am linken Rand, Sarah dominant mittig → ✅

Sync.so Auto-Detect im Preclip wählt das mittigere Gesicht. In Matthews Crop ist Matthew bei x=256 (Crop-relativ) und Samuel bei x=573 (Crop-relativ, näher zur Mitte 256) — Samuel gewinnt. Matthews Audio läuft auf Samuels Mund im Crop; beim Composite zurück in die Plate fehlt an Matthews Position jegliche Animation → **Matthews Mund bleibt zu**.

Samuel (Pass 1) selber funktioniert, weil er den vollen-Plate-Pfad ohne Preclip nimmt mit Punkt-ASD direkt auf seiner Position.

## Fix

### A. Neighbor-Aware Preclip Recentering für Rand-Sprecher (Haupt-Fix)
`compose-dialog-segments`: Bei der Preclip-Generierung pro Pass die **Nachbar-Distanz** prüfen. Wenn der nächste Nachbar < `cropHalfWidth + faceHalfWidth` entfernt ist:
- **Crop-Center vom Nachbarn weg verschieben**, sodass der Nachbar gerade aus dem Crop fällt. Konkret: `newCenterX = neighborX - (cropHalfWidth + faceHalfWidth + safetyPad)` (für Nachbarn rechts) bzw. spiegelverkehrt.
- Falls dadurch der eigentliche Speaker ans Crop-Rand wandert (>40 % vom Zentrum weg): Crop schrumpfen auf z. B. 384×384 oder 256×256 — so lange noch beide Bbox-Rand-Tests `speaker_in && neighbor_out` halten.
- Logging: `preclip_recenter old=[x,y] new=[x,y] neighborDist=Δ reason=neighbor_overlap`.

### B. Preclip-internes Target statt Auto-Detect (Härtung)
Statt Sync.so im Preclip auto-detecten zu lassen, **Bbox des Speakers im Crop-Koordinatensystem** explizit mitgeben (`bounding_boxes` als statisches Single-Box-Array, eine Box gefüllt für ganze Clip-Dauer). Das eliminiert das Auto-Detect-Risiko komplett, auch wenn doch noch ein Nachbar im Crop steckt.

### C. v98 Plate-Identity-MP4 nicht fixen (deprioritisiert)
Gemini-Direct-MP4 liefert konstant 0 faces — der v97-`bbox-url-pro`-Pfad bleibt deaktiviert. Mit Fix A+B brauchen wir Plate-Identity hier nicht zwingend; die Anchor-Coords sitzen auf der Plate ausreichend genau (Drift <15 px gemessen), problem war ausschließlich die Crop-Overlap-Logik. Separat als Follow-Up: ffmpeg-Lambda-Stillframe statt MP4-URL.

## Reihenfolge / Risiko
- **A** ist minimal, lokal in der Preclip-Crop-Berechnung, keine Auswirkung auf Inflight/Cap/Ladder.
- **B** ist defensive Härtung, fügt nur ein Feld im Sync.so-Payload hinzu (Single-Speaker-Bbox in Crop-Pixeln).
- A allein behebt Matthew. B verhindert Wiederauftreten bei dichteren Konstellationen (5 Sprecher, engere Anchor-Frames).

## Files
- `supabase/functions/compose-dialog-segments/index.ts` — Preclip-Center-Berechnung mit Neighbor-Check; optional Single-Speaker-Bbox im Preclip-Payload.
- Ggf. `supabase/functions/_shared/twoshot-face-map.ts` — Helper `computeSafePreclipCenter(speakers, slotIndex, cropSize)` zentralisiert.

## Verifizierung
- Nächster 4-Sprecher-Run: Log zeigt `preclip_recenter` für Matthew (und ggf. Kailee/Sarah falls Konstellation eng); Sichtprüfung — **alle 4 Münder bewegen sich**.
- Regressions-Check: Pass-1-Samuel-Pfad (full-plate kein Preclip) bleibt unverändert.

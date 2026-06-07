## Problem

Bei 3–4 Sprecher-Szenen rendert die v69 Single-Face-Preclip-Pipeline pro Sprecher einen Crop, der ~73 % der Master-Breite einnimmt (`safeH * 0.55` Floor in `face-crop.ts`). Auf einer 768×1028 Vier-Personen-Plate enthält dieser Crop 2–3 Gesichter statt einem. Sync.sos Active-Speaker-Detection wählt im Crop dann ein anderes Gesicht als das gemeinte, und beim finalen Mux deckt der große kreisförmige Overlay die übrigen Charaktere visuell ab. Wirkung: ein einziger Charakter (meist der mittlere/größte) scheint das ganze Skript zu sprechen.

Bei 1–2 Sprechern fällt das nicht auf, weil die Gesichter weit genug auseinander stehen – deshalb funktioniert es "manchmal".

## Fix (klein, gezielt, keine API-Änderung)

**1) `supabase/functions/_shared/face-crop.ts` — Cropgröße bei vielen Sprechern begrenzen**

`computeFaceCrop` bekommt einen optionalen `siblingCoords: Array<[x,y]>` Parameter (Koordinaten der anderen Sprecher auf derselben Plate). Daraus wird der minimale Abstand zum nächsten Nachbar-Gesicht berechnet. Die finale Crop-Kante wird auf

```text
maxAllowed = max(160, 0.9 * minNeighborDistance)
size = min(rawSize, safeW, safeH, maxAllowed)
```

geclamped. Dadurch:
- 1 Sprecher: keine Änderung (kein Nachbar → kein Cap)
- 2 Sprecher mit 380 px Abstand: cap = 342 px (statt 564) → genau ein Gesicht
- 4 Sprecher mit 130 px Abstand: cap = 160 px (Mindestgröße) → wirklich nur Kopf + Schultern

Der bestehende bbox-Pfad (`diag * 2.0`) bleibt als bevorzugte Quelle bestehen und wird nur zusätzlich durch `maxAllowed` gekappt. Der `safeH * 0.55` / `safeH * 0.6` Floor wird auf `safeH * 0.35` für N≥3 reduziert.

**2) `supabase/functions/_shared/pass-face-preclip.ts` (oder den Aufrufer in `compose-dialog-segments`) — `siblingCoords` weiterreichen**

Beim Aufruf von `computeFaceCrop` pro Pass werden die `coords` der anderen Passes als `siblingCoords` mitgegeben. Keine neue DB-Spalte nötig – die Koordinaten stehen bereits in `dialog_shots.passes[].coords`.

**3) `mem/architecture/lipsync/v76-neighbor-aware-preclip.md` — Memory anlegen**

Kurze Notiz, dass der `safeH * 0.55` Floor das Multi-Speaker-Lipsync Symptom "ein Charakter spricht alles" verursacht hat und ab v76 ein Nachbar-Abstand-Cap greift. Hinweis, dass v72/v74 static-anchor weiterhin verboten bleibt (v75 Policy) und der Fix orthogonal dazu ist.

## Out of scope

- Sync.so Modell/Modes (`sync-3` / `lipsync-2-pro`), Pricing, Refund-Logik – unverändert
- DialogStitchVideo Overlay-Renderer (`CroppedOverlay` kreisförmige Maske) – unverändert, der kleinere Crop verschwindet automatisch hinter dem feathered Mask Radius
- v70 Legacy-Removal, v69 Unified-Preclip Routing – unverändert
- Frontend / UI / SceneEngineRouter – keine Änderungen

## Verifikation nach Implementation

- Neue 4-Sprecher-Szene rendern → in `dialog_shots.passes[].preclip_crop.size` sollten Werte deutlich < 400 (eher 150–260) erscheinen
- Edge-Log `[compose-dialog-segments] … preclip_crop size=…` prüfen
- Final-Mux: jeder der 4 Charaktere bewegt nur den eigenen Mund nur im eigenen Zeitfenster; keiner deckt die anderen optisch zu
- Bestehende 1- und 2-Sprecher-Szenen verhalten sich unverändert (Sibling-Cap inaktiv bzw. nicht limitierend)

## Was, wenn das Symptom danach noch auftritt?

Dann liegt das Restproblem nicht im Crop-Sizing, sondern in einer drift-bedingten Bewegung der Master-Plate (i2v) – das wäre dann ein separates Thema (Plate-Regeneration / Static-Anchor-Verbot v75), nicht der jetzt vorgeschlagene Fix.

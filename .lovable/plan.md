## Was jetzt tatsächlich fehlschlägt

Der aktuelle Lauf um **19:45 UTC** enthält bereits die v334-Telemetrie. v334 arbeitet korrekt: Bei nur zwei Track-Samples wird der Motion-Cover mit `insufficient_samples` übersprungen.

Der neue Log beweist jedoch zwei nachgelagerte Fehler:

```text
siblings=0
motion_skip=insufficient_samples
crop=54,0,394
face_share=0.000
plate_box_w_pct=0.0428
```

1. **Legacy-Face-Share bleibt immer 0:** Für Samuel existiert eine gültige Plate-BBox, aber kein Mouth-Landmark. Dadurch läuft `computeFaceCrop(...)`; anschließend wird `faceShareInCrop` nie aus der BBox berechnet und bleibt beim Initialwert `0`.
2. **Sibling-Ermittlung liest die falsche Quelle:** Obwohl vier Plate-Gesichter aufgelöst wurden, sucht der Hauptpfad Nachbarn in `speakers[i].coords`. Dort fehlen sie, deshalb entsteht `siblings=0`. Ohne Nachbar-Cap wird der Crop unnötig auf 394 px erweitert.
3. **Der 24-%-Floor ist geometrisch nicht erreichbar:** Eine ungefähr 55 px breite Face-BBox kann in einem 394-px-Crop rechnerisch keine 24 % Fläche belegen. Der Floor darf daher nicht nur prüfen, sondern muss bereits die Legacy-Crop-Größe begrenzen.

## Fix v335 — Legacy-Crop vollständig konsistent machen

### 1. Face-Share in jedem Crop-Pfad berechnen
In `pass-face-preclip.ts` wird direkt nach dem finalen Legacy-Crop der Share aus der gültigen Plate-BBox berechnet. `0` ist danach nur noch möglich, wenn wirklich keine verwertbare BBox existiert; dieser Zustand erhält einen eigenen Fehler statt einer irreführenden Prozentmeldung.

### 2. Share-erhaltenden Legacy-Crop bauen
Auch ohne Mouth-Landmark wird die BBox als Größenquelle verwendet. Die Crop-Größe wird so begrenzt, dass sie den übergebenen Face-Share-Floor nicht unterschreitet, dabei aber das vollständige Gesicht enthält und innerhalb der Plate bleibt. Kein künstlicher 394-px-Floor mehr für eine 55-px-Face-Box.

### 3. Sibling-Koordinaten aus der Plate-Geometrie ableiten
In allen drei Preclip-Aufrufern von `compose-dialog-segments` werden Nachbarzentren bevorzugt aus `speakerPlateBboxes` berechnet; `speakers[].coords` bleibt nur Fallback. Damit erhält eine bestätigte Vier-Sprecher-Szene tatsächlich drei Siblings und der Nachbar-Cap funktioniert wieder.

### 4. Alle Preclip-Pfade angleichen
`faceShareFloor` und dieselbe Sibling-Logik werden nicht nur im seriellen Hauptpfad, sondern auch im Batch-Preclip- und Pre-Fanout-Pfad verwendet. So hängt das Resultat nicht davon ab, welcher Orchestrator-Zweig zuerst läuft.

### 5. Regressionstests und Telemetrie
Gezielte Tests decken ab:
- gültige BBox ohne Mouth-Landmark ergibt einen realen Share statt `0`;
- vier Plate-BBoxen ergeben drei Siblings;
- Legacy-Crop bleibt bei Mehrsprechern über dem Floor;
- Motion-Cover mit zwei Samples bleibt übersprungen, ohne den korrekten Legacy-Share zu zerstören.

Danach wird `compose-dialog-segments` deployed und der relevante Logpfad geprüft. Erwartung für die Szene: `siblings=3`, `share_src=plate`, `face_share >= 0.24`, kein `preclip_face_share_too_low`, anschließend Sync-3-Dispatch statt Refund.

## Betroffene Dateien
- `supabase/functions/_shared/pass-face-preclip.ts`
- `supabase/functions/compose-dialog-segments/index.ts`
- passende Tests im bestehenden Shared-/Function-Testbereich
## Analyse

Der neue Fehler ist nicht mehr der alte `auto_detect`-NOOP, sondern ein neuer Sonderfall im `coords-pro` Retry:

- Der Screenshot zeigt: `Gesicht am ASD-Frame: FAIL`, `verdict=no_face`.
- Der geprüfte Frame zeigt nur Körper/Arme, kein Gesicht.
- In den Logs zum aktuellen Scene-Run `6a8b4584-...` steht:
  - Preclip hat nur `33` Frames (`duration_sec=1.089`, `fps=30`).
  - Retry wurde aber mit `frame_number=47` an Sync.so geschickt.
  - Das ist außerhalb des Preclips. Der Face-Probe / Sync.so schaut dadurch auf einen ungültigen bzw. falschen Framebereich.
  - Zusätzlich liegt die transformierte Koordinate bei `[363,360]` auf einem Crop, dessen sichtbarer Probe-Frame im Screenshot deutlich den Oberkörper statt Gesicht zeigt.

## Ursache

Der v129.26-Fix hat `coords-pro` korrekt aktiviert, aber dafür den falschen Frame-Raum übernommen:

- `referenceFrameNumber` stammt aus der originalen Plate-/Turn-Timeline.
- Beim Preclip beginnt das Video aber wieder bei Frame `0` und ist viel kürzer.
- Beim Retry muss `frame_number` deshalb relativ zum Preclip sein und auf einen sicher sichtbaren Face-Frame geklemmt werden, nicht der absolute/alte Frame.

Damit kam es zu:

```text
preclip frames: 0..32
gesendet: frame_number=47
Folge: Face-Gate sieht keinen Kopf / Sync.so bricht mit generation_unknown_error ab
```

## Implementierungsplan

1. **Preclip-ASD-Frame normalisieren**
   - In `compose-dialog-segments/index.ts` für den `coords-pro` Preclip-Retry einen eigenen `preclipAsdFrame` berechnen.
   - Basis: `preclip_duration_sec * 30` oder geprüfte `preclip_dims/probe`-Frames.
   - Frame immer clampen: `0 <= frame <= preclipFrameCount - 1`.
   - Für kurze Preclips bevorzugt ein stabiler früher/mittlerer Frame, z. B. `min(mid, frameCount - 2)`, statt altem Plate-Frame.

2. **Face-Gate vor `coords-pro` Retry hart machen**
   - Vor dem Sync.so Dispatch bei `coords-pro_preclip` prüfen: enthält der gewählte Preclip-Frame wirklich ein Gesicht an/nahe der transformierten Koordinate?
   - Wenn `no_face`, nicht an Sync.so schicken.
   - Stattdessen entweder:
     - auf `auto_detect:true` zurückfallen, wenn der Preclip als clean/unambiguous markiert ist, oder
     - Preclip neu rendern / sauber mit Refund abbrechen, wenn der Crop wirklich falsch ist.

3. **Koordinate bei Preclip-Retry nicht blind verwenden**
   - Wenn die transformierte Koordinate zwar in-bounds ist, aber Face-Gate `not_at_coord` oder `no_face` meldet, darf sie nicht als ASD-Koordinate an Sync.so gehen.
   - Falls ein Snap möglich ist, die gesnappte Face-Koordinate verwenden.
   - Falls nicht, `coords-pro` für diesen Pass blocken und kontrolliert fallbacken.

4. **Logging/Forensik verbessern**
   - `syncso_dispatch_log.meta.coord_transform` um `preclip_frame_count`, `raw_reference_frame`, `clamped_preclip_frame` und `frame_source` erweitern.
   - Dadurch sieht man sofort, ob ein zukünftiger Fehler an Frame-Clamping, Crop oder Provider liegt.

5. **Aktuellen fehlgeschlagenen Run recovern**
   - Nach Deployment den fehlgeschlagenen Pass 2 (`Matthew`) auf pending setzen, `retry_variant=coords-pro` beibehalten, aber gecachte falsche Dispatch-/Job-Felder leeren.
   - Neu starten und prüfen, dass der Dispatch nicht mehr `frame_number=47`, sondern einen gültigen Preclip-Frame innerhalb `0..32` sendet.

## Erwartetes Ergebnis

- Kein `Gesicht am ASD-Frame: FAIL` mehr durch out-of-range Frames.
- Sync.so bekommt beim `coords-pro` Retry nur noch gültige Preclip-Frames.
- Wenn der Crop wirklich kein Gesicht enthält, wird vor Provider-Kosten kontrolliert geblockt/repariert statt nach langem Lauf abzubrechen.
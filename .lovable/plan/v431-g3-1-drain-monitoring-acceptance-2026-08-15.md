# v431 G3.1 — Drain Monitoring & Acceptance

G3.1 ist deployt. Bis zum ersten vollständigen Post-T0-Produktionslauf bleibt der Status:

```text
G3.1 DEPLOYED / DRAINING
G3.2 LOCKED
T0 = 2026-08-15T09:05:17Z
```

## Bereits deployte Functions

- `compose-video-clips`
- `compose-clip-webhook`
- `compose-dialog-segments`
- `sync-so-webhook`
- `render-sync-segments-audio-mux`
- `remotion-webhook`
- `lipsync-watchdog`

`lipsync-watchdog` hat den Post-Deploy-Boot-Nachweis erbracht; die übrigen sechs Functions müssen ihren ersten Post-Deploy-Aufruf abwarten, um Boot/Import als fehlerfrei zu betrachten.

## Drain-Abschlusskriterien

1. Mindestens ein Post-T0-Ereignis pro Callback-Kanal:
   - Replicate / Base-Video
   - Sync.so-Segment
   - Audio-Mux
   - Remotion
2. Für alle Post-T0-Dispatches gilt:
   - `missing_binding = 0`
   - `job_not_found = 0`
   - `wrong_job = 0`
3. `binding_pending` wird separat gezählt und ausgewiesen.
4. `stale_run` / `stale_generation` bleiben diagnostisch; jeder Fall muss auf einen legitimen Run-Wechsel zurückführbar sein.
5. Das vereinbarte Drain-Fenster muss zeitlich vollständig erfüllt sein, nicht nur ein einzelner erfolgreicher Lauf.

## Berichtsformat

Der Abschlussbericht enthält pro Kanal:

```text
Kanal               | Post-T0 Events | missing_binding | job_not_found | wrong_job | binding_pending | stale_run | stale_generation
Replicate/Base-Video| ...             | ...             | ...           | ...       | ...             | ...       | ...
Sync.so-Segment     | ...             | ...             | ...           | ...       | ...             | ...       | ...
Audio-Mux           | ...             | ...             | ...           | ...       | ...             | ...       | ...
Remotion            | ...             | ...             | ...           | ...       | ...             | ...       | ...
```

Sobald das Fenster grün endet: Bericht → STOP → G3.1 kann als DONE / FROZEN abgenommen werden, G3.2 separat freigegeben.

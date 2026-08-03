# Golden Run — Lip-Sync v400

Referenzlauf, gegen den jeder künftige Regressionsverdacht geprüft wird.
Dies ist der erste Lauf seit dem 27.07.2026, bei dem alle vier Sprecher
korrekt getroffen haben.

## Kopfdaten

| Feld | Wert |
|---|---|
| Datum | 2026-08-03, 21:12–21:17 UTC |
| Scene ID | `c934a823-47de-49b7-a62e-a116b49ca3b2` |
| Owner | `8948d3d9-2c5e-4405-9e9c-1624448e7189` |
| `plate_generation` | 1 |
| `pipeline_state` | `complete` |
| `clip_status` | `ready` |
| Plate-Provider | `ai-happyhorse` |
| Dauer | 8.0 s |
| Sprecher | 4 |
| Engine | `sync-segments` |

## Provider-Payload (Pass 1, Referenzform)

```json
{
  "stage": "v204-preclip-bbox-clipspace",
  "payload_model": "sync-3",
  "sync_mode": "cut_off",
  "input_space": "clip",
  "asd_mode": "bounding_boxes_url",
  "asd_auto_detect": false,
  "asd_has_coordinates": false,
  "preclip_used": true,
  "speakers": 4,
  "retry_variant": "bbox-url-pro",
  "options_keys": ["sync_mode", "active_speaker_detection"],
  "v124_stripped_asd": [],
  "v124_stripped_opts": [],
  "audio_normalization": { "mode": "skipped", "used_for": "syncso_input_only" }
}
```

Die entscheidenden Merkmale dieses Payloads:

- `preclip_used: true` — Sync.so bekam einen Ein-Gesicht-Crop, nicht die Plate.
- `asd_auto_detect: false` — die Sprecherzuordnung kam von uns, nicht vom Provider.
- `input_space: "clip"` — Bounding-Boxes im Clip-Raum, nicht im Plate-Raum.
- `sync_mode: "cut_off"` — keine Loop-Verlängerung durch den Provider.
- `v124_stripped_*` leer — es wurde nichts aus dem Payload entfernt.

## Pass-Struktur

Jeder Pass entspricht genau einem Sprecher-Turn:

```text
pass 0  Samuel Dusatko   0.000 – 1.811 s   coords [838, 195]   status done
        job_id   6e053238-990f-420c-ab02-cc39e08738b5
        input    lipsync-plates/shared/<scene>/p1-preclip-<hash>.mp4  (289 756 B)
        audio    voiceover-audio/<user>/twoshot-vo/<scene>-pass-1-tight-<ts>.wav
        output   ai-videos/composer/<user>/<scene>-lipsync-pass-1.mp4
```

Alle vier Pässe folgen demselben Schema mit eigener `job_id`, eigenem Preclip
und eigener VO-Datei. Rehosting des Preclips (`rehosted: true`) dauerte 2 423 ms.

## Vergleichspunkte bei Regressionsverdacht

Wenn Lip-Sync erneut nicht trifft, in dieser Reihenfolge prüfen:

1. `preclip_used` — steht es auf `false`, wurde die Plate statt des Crops gesendet.
2. `asd_auto_detect` — steht es auf `true`, hat der Provider selbst zugeordnet.
3. `input_space` — steht es nicht auf `clip`, passen die Boxen nicht zum Video.
4. Anzahl `passes` gegen Anzahl `dialog_turns` — fehlt ein Pass, ist ein Sprecher
   ohne Job geblieben.
5. `plate_generation` und `active_run_id` gegen die Job-IDs — weichen sie ab,
   stammt das Ergebnis aus einem älteren Lauf.
6. `v124_stripped_opts` — ist es nicht leer, hat ein Sanitizer den Payload
   beschnitten.

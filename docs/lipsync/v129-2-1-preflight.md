# v129.2.1 — Preflight Forensik

## Frage

Warum loggt Produktion `asd_mode = "auto_detect"` / `stage = "preclip-sync3-auto-detect-v115"`, obwohl die v129.1 Doc-Strict-Logik (Stage `preclip-sync3-v1291`) im Source vorhanden ist (`supabase/functions/compose-dialog-segments/index.ts`, Block ab `if (usePassPreclip)`)?

## Evidenz

`syncso_dispatch_log` (letzte 72h, Scenes `25512d7f-…` und `225ea521-…`):

| Feld | Wert (alle Multi-Speaker-Passes) |
| --- | --- |
| `meta.v102_probe.stage` | `"preclip-sync3-auto-detect-v115"` |
| `meta.v102_probe.asd_mode` | `"auto_detect"` |
| `meta.v116_diag.asd_mode` | `"preclip_auto_detect"` |
| `meta.v102_probe.v1291` | nicht vorhanden |
| `meta.v102_probe.preclip_ambiguity` | nicht vorhanden |
| `meta.v1291_payload_contract` | nicht vorhanden |

Im aktuellen Source kommt der String `"preclip-sync3-auto-detect-v115"` **nicht mehr vor** (`rg "preclip-sync3" supabase/` liefert nur `"preclip-sync3-v1291"` Z. 3399 und `"preclip-sync3-autodetect-v105"` Z. 3722).

## Schluss

Die Produktion läuft mit **älterem Edge-Function-Bundle** (vor v129.1). Der Doc-Strict-Branch ist im Source, aber wurde nie deployed — deshalb griff er in keiner geloggten Row.

→ **v129.2.1 wird zusammen mit der neuen Ambiguity-Diagnose deployed**. Erst nach Deploy darf Forensik die `_v102_probe.preclip_ambiguity` und `_v102_probe.v1291`-Felder erwarten.

## Was passiert mit den existierenden Hypothesen

- Die A2-These (220 px-Floor schließt Nachbarn in Samuels Crop ein) bleibt geometrisch korrekt — siehe `docs/lipsync/v129-2-speaker0-forensics.md`.
- Sie wird in v129.2.1 aber **nicht** durch Crop-Shrink adressiert, sondern durch:
  1. Doc-Strict-Coordinates im aktiven Pfad (kommt automatisch mit Deploy).
  2. Ambiguity-Guard (`auto_detect_with_ambiguous_crop` als zusätzlicher Preflight-Block).
- Crop-Geometrie bleibt bewusst unverändert → erst v129.2.2.

## Post-Deploy-Verifikation (SQL)

```sql
SELECT
  created_at,
  scene_id,
  meta->>'pass_idx' AS pass,
  meta->'v102_probe'->>'stage' AS stage,
  meta->'v102_probe'->>'asd_mode' AS asd_mode,
  meta->'v102_probe'->'v1291'->>'enabled' AS v1291_enabled,
  meta->'v102_probe'->'v1291'->>'in_bounds' AS v1291_in_bounds,
  meta->'v102_probe'->'preclip_ambiguity'->>'risk' AS ambiguity_risk,
  meta->'v102_probe'->'preclip_ambiguity'->>'min_neighbor_dist' AS neighbor_dist
FROM syncso_dispatch_log
WHERE created_at > now() - interval '6 hours'
  AND meta->'v102_probe'->>'stage' = 'preclip-sync3-v1291'
ORDER BY created_at DESC
LIMIT 50;
```

Erwartung post-deploy für Multi-Speaker-Scenes:

- `stage = "preclip-sync3-v1291"`
- `asd_mode = "preclip_coords_doc_strict"`
- `v1291_in_bounds = "true"`
- `ambiguity_risk` entweder `"clean"` oder `"neighbor_inside_crop"` (Diagnose, kein Block, solange Coords gesendet werden).

# v431 G2.4 — Nachtrag S5: Cleanup-Smoke (Abnahme-Lücke)

## Befund

- **Cleanup-Atomarität: erfüllt.** `supabase/functions/hybrid-extend-scene/index.ts` führt genau ein
  geguardetes DELETE aus, ohne vorheriges SELECT. Guards im Delete selbst:
  `id = newSceneId`, `continuity_source_scene_id = sourceSceneId`,
  `pipeline_state IN ('idle','plate_queued')`, `clip_status = 'pending'`,
  `clip_url IS NULL`, `base_video_url IS NULL`, `processed_video_url IS NULL`.
  Kein Treffer → kein Delete, `hybrid_zombie_unresolved` im Log und in der Response.
  Kein Race-Window zwischen Check und Delete.

- **Smoke-Abdeckung: unvollständig.** Die dokumentierten 7 Fälle prüfen ausschließlich das
  Primitive `composer_fail_hybrid_extend_scene`:
  applied ×2 (`hybrid:no-anchor`, `hybrid:frame-extract-failed`), `unexpected_state` aus
  `plate_rendering`, `stale_run`, `stale_generation`, `write_id_not_allowed`,
  `missing_run_provenance`.
  Die drei Cleanup-Klassen des freigegebenen Gates fehlen.

## Ziel S5 — genau drei ergänzende Smoke-Fälle

Transaktional, mit Rollback, gegen dieselbe DELETE-Prädikatenmenge wie die Edge-Function.

| # | Fall | Ausgangszeile | Erwartung |
|---|---|---|---|
| C1 | Cleanup vor Run-Erwerb | `pipeline_state='idle'`, `clip_status='pending'`, `active_run_id IS NULL`, alle Output-Felder NULL | genau 1 Zeile gelöscht |
| C2 | Cleanup nach partiellem Run-Erwerb | wie C1, aber `active_run_id` gesetzt und `plate_generation` erhöht, `pipeline_state='plate_queued'` | genau 1 Zeile gelöscht (`active_run_id` ist kein Ausschlusskriterium) |
| C3 | Zombie-Gegenprobe | wie C2, aber `clip_url` gesetzt (bzw. `clip_status='ready'`) | 0 Zeilen gelöscht, Zeile unverändert vorhanden → `hybrid_zombie_unresolved` |

Zusätzlich in C3 bestätigen, dass weder Output-Felder noch Legacy-Spiegel
(`clip_status`, `clip_error`) verändert wurden.

## Umsetzung

1. Smoke als transaktionaler DO-Block über die Migrations-Route ausführen, Abschluss per
   `RAISE EXCEPTION` (identische Mechanik wie G2.3/G2.4) — keine Restdaten.
2. Das DELETE im Smoke wortgleich zur Edge-Function formulieren, damit der Test die reale
   Prädikatenmenge prüft und nicht eine Nachbildung.
3. `docs/v431-g2-4-report.md` Abschnitt 4 erweitern: aus „7 Fälle" wird
   „7 Primitive-Fälle + 3 Cleanup-Fälle", inklusive expliziter Zuordnung zu den
   Gate-Verhaltensklassen.

## Nicht im Scope

- Keine Code-Änderung an `hybrid-extend-scene` (Cleanup ist bereits vertragskonform).
- Kein neues DB-Primitive, keine Signaturänderung.
- Kein G3.

Nach grünem S5-Bericht: G2.4 und G2 insgesamt DONE / FROZEN. STOP.

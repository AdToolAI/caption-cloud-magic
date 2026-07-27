---
name: v268 dialog-stitch webhook must set clip_status='ready'
description: remotion-webhook dialog-stitch success branch schrieb clip_url + twoshot_stage='done' + lip_sync_status='done', vergaß aber clip_status='ready'. Ergebnis: Szene bleibt UI-seitig ewig auf „Szene wird gebaut…" obwohl MP4 fertig ist. Fix: clip_status='ready' zusammen mit dem finalen Update setzen. Backfill-Migration korrigiert hängende Szenen.
type: architecture
---

# Why

Bei Multi-Speaker Cinematic-Sync ist der finale Schritt der Audio-Mux via
Remotion-Lambda. Der Erfolgs-Webhook (`supabase/functions/remotion-webhook/index.ts`,
dialog-stitch Branch) schrieb `clip_url`, `twoshot_stage='done'`,
`lip_sync_status='done'`, `clip_error=null` — aber **nicht** `clip_status`.
Damit blieb `clip_status='generating'` stehen und die Composer-UI zeigte
dauerhaft „Szene wird gebaut…" obwohl das gemuxte MP4 längst geliefert war.

Alle anderen Finalisierungs-Pfade setzen `clip_status: 'ready'` mit
(`sync-so-webhook` Single-Speaker Direct, `compose-clip-webhook`,
`motion-studio-superuser`, `generate-composer-image-scene`). Nur der
dialog-stitch-Pfad hatte diese Lücke.

# Rule

Jeder Pfad, der `twoshot_stage='done'` + `lip_sync_status='done'` +
`clip_url=<final>` schreibt, MUSS im selben Update auch `clip_status='ready'`
setzen. Der Cancel-Guard (`lip_sync_status='canceled'` oder
`dialog_shots.status='canceled'`) läuft weiterhin davor und darf den fertigen
Zustand nicht überschreiben.

# Backfill

```sql
UPDATE composer_scenes
SET clip_status = 'ready', updated_at = now()
WHERE clip_status = 'generating'
  AND twoshot_stage = 'done'
  AND lip_sync_status = 'done'
  AND clip_url IS NOT NULL;
```

Reine Status-Korrektur, kein Refund, kein Provider-Call.

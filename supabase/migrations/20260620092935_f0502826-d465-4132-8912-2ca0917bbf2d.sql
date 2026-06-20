-- v139 — Pipeline cleanup: enforce DB defaults for the dialog lip-sync path.
-- Code defaults (compose-dialog-segments) are already ON, but explicit DB rows
-- make the policy auditable from SQL and survive a code rollback.

INSERT INTO public.system_config (key, value, description)
VALUES
  ('composer.batch_preclip_render',      'true'::jsonb,  'v139: Batch preclip prefetch ON (renders all N preclips in parallel on pass 0). Killswitch when set to false.'),
  ('composer.parallel_sync_so_passes',   'true'::jsonb,  'v139: Plan-D parallel Sync.so fan-out ON. Killswitch when set to false (forces serial chain).'),
  ('composer.plan_d_fanout_force_enable','true'::jsonb,  'v139: Force-enable Plan-D fan-out independent of the FEATURE_PLAN_D_FANOUT env var.'),
  ('composer.sync_so_concurrency_cap',   '2'::jsonb,     'v139: Max parallel Sync.so dispatches per scene. Range 1..4.')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();
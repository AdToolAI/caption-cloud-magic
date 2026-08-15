# RS3 — Post-Deploy-Nachweis nachziehen, dann DONE/FROZEN

Antwort auf die zwei Rückfragen vorab, mit Belegen aus der laufenden Produktion:

## 1. Deploy-Grenze (Scope + T_RS3_deploy)

**DB-Migrationen (produktiv, aus `supabase_migrations.schema_migrations`):**

```text
20260815212850  RS3 Reset-/Acquire-Primitive
20260815213247  RS3 Fence + Apply-Wrapper
20260815213737  RS3 Grants/Revokes
20260815213809  RS3 Nachzug (letzte RS3-Migration)
```

`T_RS3_db = 2026-08-15T21:38:09Z` — das ist die belastbare, protokollierte Deploy-Grenze.

**Edge-Functions (im RS3-Schritt deployt, Abschnitt 5 des Reports):**
`reset-lipsync-scene`, `render-sync-segments-audio-mux`, `remotion-webhook`, `sync-so-webhook`,
`modelark-poll`, `recover-stuck-composer-clip`, `lipsync-watchdog` — plus der mitgelieferte
Shared-Code `_shared/v431-ledger.ts` und `_shared/v431-rs3-fence.ts`.
`compose-dialog-segments` war **nicht** Teil des RS3-Deploys (unverändert seit G3.1).

Einschränkung, die im Report als Lücke geführt werden muss: für die Edge-Functions liegt
kein sekundengenauer Deploy-Zeitstempel vor (keine Invocation-Logs seit dem Deploy,
`reset-lipsync-scene` hat null Logeinträge). Für das spätere Telemetriefenster wird deshalb
`T_RS3_deploy := 2026-08-15T21:38:09Z` als konservative Untergrenze fixiert und als solche
im Report gekennzeichnet — der Edge-Deploy lag danach.

## 2. Writer-/Acquire-Audit nach Deploy: **nein, noch nicht vollständig grün**

Der Report führt den Audit als Pre-Deploy-Nachweis. Die Live-Prüfung gegen `pg_proc.proacl`
zeigt zwei offene Punkte:

- **Kein DB-seitiger Bypass-Schutz.** `composer_acquire_pipeline_attempt` ist weiterhin für
  `service_role` ausführbar und enthält keinen Stage-Guard (`prosrc` erwähnt weder `rs3` noch
  `sync_segment`). Dass `sync_segment` / `audio_mux` nur über
  `composer_acquire_lipsync_attempt_serialized` laufen, ist derzeit ausschließlich
  Code-Konvention an der einzigen Call-Site in `_shared/v431-ledger.ts` — nicht erzwungen.
- **Grant-Abweichung bei `composer_apply_sync_segment_result`:** ACL enthält neben
  `service_role` auch `anon` und `authenticated` (Altbestand aus der G3.2.2-Migration).
  Die drei neuen RS3-Entry-Points sind dagegen korrekt: `service_role` only.
  Interne Helper (`composer_rs3_acquire_core`, `_is_pre_reset_attempt`,
  `_reset_cancellable_statuses`) haben keinen Grantee. `sandbox_exec_<ref>` bleibt die
  bekannte, akzeptierte Plattform-ACL (D1).

## Vorschlag: RS3-A — Audit-Schließung (klein, rein absichernd)

1. Migration: Stage-Guard in `composer_acquire_pipeline_attempt` — bei
   `_stage in ('sync_segment','audio_mux')` `RAISE EXCEPTION` mit Verweis auf den
   serialisierten Wrapper. Damit ist der Bypass DB-seitig unmöglich, nicht nur konventionell.
2. Migration: `REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result
   FROM PUBLIC, anon, authenticated;` (service_role bleibt).
3. Verifikation: erneuter `proacl`-Dump aller RS3-/Apply-Funktionen; ein Smoke, der den
   direkten Aufruf mit `sync_segment` als Fehler nachweist und den Wrapper-Pfad weiterhin
   grün zeigt; Frozen-Suiten (`src/lib/composer`, `src/lib/video-composer`) + `tsgo`.
4. `docs/v431-rs3-report.md`: neuer Abschnitt „Post-Deploy-Audit" mit Deploy-Grenze,
   ACL-Dump und Guard-Nachweis. Kein Redeploy von Edge-Functions nötig (reine DB-Änderung).

Danach: **RS3 DONE / FROZEN**.

## Danach (separates Gate, nicht Teil dieses Schritts)

G3.2.2 Production Resmoke auf einer **frischen Testszene ohne Ledger-Historie**.
`b34d1eae…` bleibt unangetastet und wird nicht als Abnahmeszene verwendet.

## Alternative

Falls du die Audit-Punkte als akzeptiertes Restrisiko einstufst: kein Code-Change, nur der
dokumentierende Post-Deploy-Abschnitt im Report inkl. der beiden Befunde, dann direkt
RS3 DONE / FROZEN und weiter zum Resmoke.

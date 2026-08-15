# RS3-A (korrigiert) — ACL-Fix + Redeploy des Sync-Dispatchers

Kein Stage-Guard in `composer_acquire_pipeline_attempt`. Das frozen G3.1b-Primitive bleibt
unverändert; der direkte `service_role`-Grant bleibt für die übrigen Stages Teil der internen
Trust Boundary. Ein DB-seitiges Verbot direkter Acquires ist ein eigener Hardening-Schritt
mit Facade-Migration aller Stage-Aufrufer — nicht RS3-A.

Befund bestätigt: `supabase/functions/compose-dialog-segments/index.ts` importiert
`../_shared/v431-ledger.ts` (Zeile 120) und akquiriert `stage: "sync_segment"` — d. h. der
produktive Sync-Dispatcher hängt am geänderten Shared-Modul, wurde aber im RS3-Schritt nicht
mitdeployt und kann noch den G3.1-Bundle-Stand ohne serialized Wrapper fahren.

## Schritt 1 — ACL-Fix (Migration, Pflicht)

```sql
REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(
  uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
```

`service_role` bleibt. Abweichung vom bereits akzeptierten G3.2.2-Security-Contract wird damit
geschlossen. Keine Body-Änderung an der Funktion.

## Schritt 2 — gezielter Redeploy

`compose-dialog-segments` ohne funktionale Codeänderung neu deployen, damit das aktuelle
`_shared/v431-ledger.ts` (mit `composer_acquire_lipsync_attempt_serialized`) im produktiven
ESZip-Bundle liegt. Deploy-Zeitstempel (UTC) festhalten.

```text
T_RS3_effective = Zeitpunkt des compose-dialog-segments Redeploys
```

`2026-08-15T21:38:09Z` bleibt dokumentiert als konservative untere Grenze der bisherigen
RS3-Telemetrie, ist aber ausdrücklich **nicht** der Zeitpunkt nachweislich vollständiger
RS3-Dispatch-Kette. Post-Deploy-Audit und der spätere G3.2.2-Resmoke rechnen ab
`T_RS3_effective`.

## Schritt 3 — Post-Deploy Acquire-/Security-Smoke

1. Static sanity: `compose-dialog-segments` erreicht `sync_segment` ausschließlich über
   `acquireLedgerJob` → serialized Wrapper; Repo-weite Suche zeigt keinen direkten
   Lip-Sync-Stage-Acquire außerhalb dieses Pfads.
2. Runtime sanity: Boot-/Importnachweis der neu deployten Function (keine Import-Fehler).
3. Wrapper-Smoke (transaktional, self-rollback): `composer_acquire_lipsync_attempt_serialized`
   liefert `acquired` bzw. nach Reset `rearmed`.
4. `composer_acquire_pipeline_attempt` bleibt unverändert — Frozen-Semantik wird nur belegt,
   nicht angefasst.
5. ACL-Dump via `has_function_privilege`:
   - `composer_apply_sync_segment_result`: PUBLIC/anon/authenticated `false`, service_role `true`
   - `composer_reset_lipsync_with_attempt_cancellation`,
     `composer_acquire_lipsync_attempt_serialized`,
     `composer_acquire_reset_rearmed_attempt`: service_role-only
   - interne Helper (`composer_rs3_acquire_core`, `composer_rs3_is_pre_reset_attempt`,
     `composer_rs3_reset_cancellable_statuses`): kein normaler Grantee
   - `sandbox_exec_<ref>` bleibt als akzeptierte Plattform-ACL (D1) benannt
6. Frozen-Suiten (`src/lib/composer`, `src/lib/video-composer`) + `tsgo --noEmit`.

## Schritt 4 — Bericht, dann STOP

`docs/v431-rs3-report.md` erhält den Abschnitt „Post-Deploy-Audit":
Deploy-Set inkl. `compose-dialog-segments`, beide Zeitpunkte (untere Grenze und
`T_RS3_effective`), ACL-Tabelle, Wrapper-Smoke-Ergebnis, ausdrücklicher Vermerk, dass
`composer_acquire_pipeline_attempt` unverändert frozen bleibt.

Bei grünem Ergebnis: **RS3 DONE / FROZEN**. Danach separat der frische
G3.2.2 Production Resmoke auf einer Testszene ohne Ledger-Historie;
`b34d1eae…` bleibt unangetastet.

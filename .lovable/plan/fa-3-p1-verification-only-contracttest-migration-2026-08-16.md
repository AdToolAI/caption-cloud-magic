# FA-3/P1 — Verification-only Contracttest-Migration

Ziel: die bereits installierte, `service_role`-only Funktion `composer_finalize_lipsync_scene` gegen die Contractfälle aus `tests/v431-g3-2-2-f1-contract-tests.sql` prüfen — ohne ACL-Aufweichung, ohne persistente Daten- oder Schemaänderung.

## Vertrag der Migration (eng)

Erlaubt:
- Anlegen von Test-Fixtures (Scene, Ledger-/Transition-Rows) innerhalb einer PL/pgSQL-Subtransaktion
- Aufruf des bereits installierten RPC
- Assertions per `RAISE EXCEPTION` bei Verletzung

Verboten:
- `CREATE/ALTER/DROP FUNCTION`
- `GRANT` / `REVOKE`
- jede Änderung am Finalizer-Body
- Rollenwechsel oder temporäres EXECUTE für `sandbox_exec`
- jeglicher Cleanup-Hack (`DELETE` als Ersatz für Rollback)

Einzige dauerhafte Spur: der Migrationseintrag selbst.

## Rollback-Konstruktion

Drei getrennte innere Subtransaktionen — je Contractfall eine, damit jeder Fall unabhängig zurückgerollt wird:

```text
DO $$
BEGIN
  BEGIN                       -- Case 1: Happy Path
     Fixtures (inkl. base_video_url-Sentinel) → RPC → Assertions
     RAISE EXCEPTION USING ERRCODE = 'FA3P1';
  EXCEPTION WHEN SQLSTATE 'FA3P1' THEN NULL; END;

  BEGIN                       -- Case 2: Duplicate/Idempotenz
     Fixtures → RPC → zweiter RPC-Call → Assertions
     RAISE EXCEPTION USING ERRCODE = 'FA3P1';
  EXCEPTION WHEN SQLSTATE 'FA3P1' THEN NULL; END;

  BEGIN                       -- Case 3: RS3 Pre-Reset-Fence
     Fixtures mit rs3_reset-Marker → RPC → Assertions
     RAISE EXCEPTION USING ERRCODE = 'FA3P1';
  EXCEPTION WHEN SQLSTATE 'FA3P1' THEN NULL; END;
END $$;
```

Kein `WHEN OTHERS`, kein Catch von `P0001` oder anderen Assertion-Fehlern. Jede echte Assertion-, SQL- oder RPC-Exception propagiert → Migration schlägt rot fehl. Der Sentinel rollt den jeweiligen Block inklusive aller Scene-/Ledger-/Transition-Mutationen zurück, bevor er gefangen wird. Testlauf erfolgt als Migration-Owner (`postgres`); die ACL wurde bereits separat via `has_function_privilege` nachgewiesen und wird hier nicht erneut geprüft.

## Contractfälle

Aus `tests/v431-g3-2-2-f1-contract-tests.sql` übernommen (ohne die dortige `GRANT`-Zeile):

1. **Happy Path** — Fixture setzt einen bekannten `base_video_url`-Sentinelwert. Nach dem RPC: `clip_url = processed_video_url = _final_url`, `base_video_url` byte-identisch zum Sentinel. `write_id='stitch:done'` wird dort geprüft, wo der Contract ihn tatsächlich persistiert (Transition-/Audit-Eintrag); der Ledger-Job wird nur auf seinen realen Terminalzustand geprüft (Status `succeeded`, `completed_at` gesetzt, Job-Identität) — keine neu erfundene Ledger-Invariante.
2. **Duplicate/Idempotenz** — Happy Path plus zweiter identischer RPC-Call: gleiche Endwerte, keine zweite Terminalisierung, kein zusätzlicher Transition-Eintrag.
3. **RS3 Pre-Reset-Fence** — veralteter Callback nach Reset wird abgelehnt: keine Output-Materialisierung, `processed_video_url` und `clip_url` bleiben unverändert.


## Post-Migration Read-only Verifikation

- Test-Scenes = 0, Test-Ledger-Rows = 0, Test-Transition-Rows = 0
- Anzahl `public`-Funktionen unverändert (344)
- ACL unverändert (`has_function_privilege` für `service_role`/`anon`/`authenticated`/`authenticator`/PUBLIC)
- Finalizer-Body byte-identisch zum Post-Deploy-Stand (Hash-Vergleich)
- Migrationseintrag vorhanden

## Report

`docs/v433-motion-studio-final-acceptance.md` ergänzen: Migrationsname/-zeitpunkt, Ergebnis je Contractfall, alle Read-only-Checks, ausdrücklich gekennzeichnet als „verification-only migration; no schema/data mutation persisted“.

Bei grünem Durchlauf: **FA-3/P1 DB DEPLOY VERIFIED** — kein weiterer Deploy-Schritt; anschließend FA-3 RETEST SETUP mit frischer Szene (separate Freigabe).

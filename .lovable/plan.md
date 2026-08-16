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

```text
DO $$
BEGIN
  BEGIN                       -- inner subtransaction
     Fixtures anlegen
     RPC aufrufen (Erfolgsfall + Duplicate/Idempotenz + RS3-Fence-Fall)
     Assertions (u.a. processed_video_url = clip_url = _final_url,
                 base_video_url unverändert, Ledger terminal)
     RAISE EXCEPTION USING ERRCODE = 'FA3P1';   -- Sentinel
  EXCEPTION
    WHEN SQLSTATE 'FA3P1' THEN NULL;            -- NUR Sentinel wird gefangen
  END;
END $$;
```

Jede echte Assertion-, SQL- oder RPC-Exception hat einen anderen SQLSTATE und propagiert → Migration schlägt fehl. Der Sentinel rollt den kompletten inneren Block inklusive aller Scene-/Ledger-Mutationen zurück, bevor er gefangen wird. Testlauf erfolgt als Migration-Owner (`postgres`); die ACL wurde bereits separat via `has_function_privilege` nachgewiesen und wird hier nicht erneut geprüft.

## Contractfälle

Aus `tests/v431-g3-2-2-f1-contract-tests.sql` übernommen (ohne die dortige `GRANT`-Zeile):
1. Erfolgsfall Stitch-Finalisierung → `clip_url` und `processed_video_url` = `_final_url`, `base_video_url` nicht beschrieben, Ledger terminal mit `write_id='stitch:done'`
2. Duplicate-Call → idempotent, kein zweiter Ledger-Terminalisierungseffekt
3. RS3-Epoch-Fence → veralteter Callback wird abgelehnt, keine Output-Materialisierung

## Post-Migration Read-only Verifikation

- Test-Scenes = 0, Test-Ledger-Rows = 0, Test-Transition-Rows = 0
- Anzahl `public`-Funktionen unverändert (344)
- ACL unverändert (`has_function_privilege` für `service_role`/`anon`/`authenticated`/`authenticator`/PUBLIC)
- Finalizer-Body byte-identisch zum Post-Deploy-Stand (Hash-Vergleich)
- Migrationseintrag vorhanden

## Report

`docs/v433-motion-studio-final-acceptance.md` ergänzen: Migrationsname/-zeitpunkt, Ergebnis je Contractfall, alle Read-only-Checks, ausdrücklich gekennzeichnet als „verification-only migration; no schema/data mutation persisted“.

Bei grünem Durchlauf: **FA-3/P1 DB DEPLOY VERIFIED** — kein weiterer Deploy-Schritt; anschließend FA-3 RETEST SETUP mit frischer Szene (separate Freigabe).

# FA-4/P1-A — Deploy Gate (Befund + Deploy-Plan)

## 1. Produktivschema ist NICHT unverändert — DB-Teil ist bereits live

Read-only geprüft auf der Live-DB:

```text
pg_indexes → ai_video_transactions_refund_charge_uniq        VORHANDEN
pg_proc    → public.composer_refund_charge(uuid,uuid,text)   VORHANDEN
```

Die DB-/RPC-Contracttests liefen nicht in einer zurückgerollten Transaktion,
sondern über die produktiven Migrationen `20260817153202`, `20260817153542`,
`20260817153632`. Index und RPC sind dauerhaft in der Produktion.

**T_FA4_P1A_db = 2026-08-17, Migrationsblock 15:32–15:36 UTC**
(Index + RPC: 15:32:02 UTC; Race-/Contracttest-Migrationen 15:35–15:36 UTC,
deren Fixtures wieder entfernt wurden).

Es gibt also **kein „unverändertes Produktivschema"** mehr. Der DB-Teil wird im
Deploy nicht erneut angelegt, sondern nur noch verifiziert und in einem Punkt
korrigiert.

## 2. Offener Befund aus der Sanity: RPC-Rechte zu weit

Ist-Stand der ACL auf `composer_refund_charge`:

```text
postgres=X, anon=X, authenticated=X, service_role=X
```

Die Migration enthielt zwar `REVOKE ALL ... FROM PUBLIC` +
`GRANT EXECUTE ... TO service_role`, im Live-Stand haben `anon` und
`authenticated` dennoch EXECUTE. Die geforderte Sanity-Bedingung
„service_role EXECUTE, öffentliche Rollen nicht" ist damit **nicht erfüllt**.

Das ist der einzige DB-Änderungsbedarf dieses Gates.

## 3. Deploy-Schritte (enger Scope)

1. **Rechte-Migration (deklarativ, entzieht Rechte — nicht additiv im engeren
   Sinn; Funktionsrumpf und Daten bleiben unberührt):**
   ```sql
   REVOKE EXECUTE ON FUNCTION public.composer_refund_charge(uuid,uuid,text)
     FROM PUBLIC, anon, authenticated;
   GRANT  EXECUTE ON FUNCTION public.composer_refund_charge(uuid,uuid,text)
     TO service_role;
   ```
2. **DB-Sanity (read-only, nicht mutierend)**
   - Index genau einmal vorhanden (`pg_indexes`, Count = 1)
   - RPC vorhanden mit Signatur `(uuid,uuid,text)`
   - Rechte explizit über `has_function_privilege(...,'EXECUTE')`:
     `service_role = true`, `anon = false`, `authenticated = false`,
     zusätzlich Nachweis, dass über PUBLIC/Default kein indirekter
     EXECUTE-Pfad besteht (ACL-String nur als Zusatzbeleg)
   - `no_charge`-Smoke: zufällige nicht existente `charge_id`, gültige
     beliebige `run_id`, nicht leerer `refund_reason` ⇒ `outcome=no_charge`,
     `amount_euros=0`; danach Beleg: keine neue Zeile in
     `ai_video_transactions`, keine Wallet-Bewegung
3. **Edge-Function `recover-stuck-composer-clip` deployen**
   (inkl. `refund-provenance.ts`; `refund-provenance.test.ts` ist Testartefakt)
4. **Boot-/Validation-Smoke** der Function mit unvollständigem Body ⇒ saubere
   Validierungsantwort statt Boot-Fehler
5. **T_FA4_P1A_effective = max(T_ACL_fix, T_edge_deploy)** — wird protokolliert

Nicht deployed/geändert: `qa-watchdog`, Reaper, Ledger, RS3,
`refund_ai_video_credits`, Pricing, Provider/Plate, Lip-Sync.
Keine erneuten finanziellen Contracttests, kein FA-4-Render.

## 4. Dokumentation

`docs/v433-motion-studio-final-acceptance.md` erhält den Abschnitt
„FA-4/P1-A — Deploy Verification" mit:

- `T_FA4_P1A_db`: DB-Logik bereits 15:32–15:36 UTC produktiv
- Zwischen `T_FA4_P1A_db` und der ACL-Korrektur bestand eine zu breite
  RPC-EXECUTE-Berechtigung (`anon`, `authenticated`)
- keine Evidence-/Wallet-Bereinigung vorgenommen
- keine erneuten finanziellen Contracttests
- kein FA-4-Render
- `T_FA4_P1A_effective` + alle Sanity-Ergebnisse

Bei grün: **FA-4/P1-A DEPLOY VERIFIED → STOP.** Danach ausschließlich P1-B
(CPU exhaustion vor Plate-Dispatch).

## Technische Details

- Die zwei TypeScript-Warnungen in `recover-stuck-composer-clip/index.ts`
  (Zeilen 282/363) sind unverändert gegenüber HEAD und kein Blocker.
- Die Rechte-Migration ändert weder Funktionsrumpf noch Index noch
  bestehende Transaktionsdaten.


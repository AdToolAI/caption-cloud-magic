# v431 G3.2.2 — Antworten D1 + G5, und Korrektur des Cutover-Gates

Beide Rückfragen sind read-only beantwortet. Ergebnis: **D1-a ist belegt** und **G5 (sowie G1/G3) sind kein erreichbares Gate in der aktuellen Formulierung** — sie messen historischen Slot-/Ledger-Müll, nicht In-flight.

## 1. D1 — Sandbox-Rolle: nachweislich plattformintern

Messung (`pg_roles`, `pg_auth_members`):

| Rolle | login | Mitglied in | Mitglieder |
| --- | --- | --- | --- |
| `sandbox_exec_lbunafpxuskwmsrraqxl` | ja | — | nur `postgres` |
| `anon` / `authenticated` / `service_role` | nein | — | — |
| `authenticator` (PostgREST-Login) | ja | — | — |

- `authenticator` ist **nicht** Mitglied der Sandbox-Rolle; PostgREST kann per `SET ROLE` nur nach `anon`/`authenticated`/`service_role` wechseln. Edge Functions nutzen ausschließlich den Data-API-Pfad bzw. `service_role`.
- Einziges Mitglied der Sandbox-Rolle ist `postgres` (Plattform-Superrolle). Kein Client- und kein Function-Pfad kann sie annehmen.
- Die Rolle ist der Login der Lovable-Exec-Sandbox (`current_user = sandbox_exec`), also plattforminterne Toolchain, nicht Teil der Client-/Edge-Angriffsfläche. Dieselbe ACL besteht bereits bei den eingefrorenen G3.1-Primitiven.

**Entscheidung: D1-a.** Kein Pattern-REVOKE, kein Hardcoding einer umgebungsspezifischen Rolle in Produktionsmigrationen.

Der Security-Vertrag §4 wird redaktionell so präzisiert (kein Code-, kein SQL-Change):

- `PUBLIC = false`
- `anon = false`
- `authenticated = false`
- öffentlicher Apply-RPC `composer_apply_sync_segment_result`: `service_role = true`
- interne Helper `composer_touch_lipsync_progress`, `composer_log_sync_segment_audit`: kein direkter `service_role`-EXECUTE
- `sandbox_exec_lbunafpxuskwmsrraqxl` = platform-internal role, kein Client-/Edge-Pfad, **akzeptierte Plattform-ACL** (mit obigem Nachweis im Bericht)

## 2. G5 — was die 44 Passes wirklich sind

Join gegen Scene-State und Ledger (44 Rows / 34 Szenen):

| Scene `pipeline_state` | Pass-Status | `pipeline_job_id` | Ledger-Job | Rows |
| --- | --- | --- | --- | --- |
| failed | rendering | fehlt | keiner | 16 |
| failed | retrying | fehlt | keiner | 14 |
| failed | canceled_by_scene_failure | fehlt | keiner | 8 |
| canceled | rendering | fehlt | keiner | 3 |
| complete | rendering | fehlt | keiner | 3 |

- **Alle** zugehörigen Szenen stehen terminal (`failed` / `canceled` / `complete`).
- **Keine** Row trägt eine `pipeline_job_id`; es existiert kein korrespondierender Ledger-Job.
- Jüngste Szenen-Aktualisierung: `2026-08-14 01:13Z` — nichts davon ist jünger als der G3.1-Cutover.

→ Klassifikation: **orphaned stale metadata** aus vor-Ledger-Runs. Diese Rows werden **nie** natürlich drainen; „warte bis G5 = 0" ist ein unerreichbares Gate.

### Gleicher Befund bei G1/G3

Die 8 offenen Ledger-Attempts (4× `sync_segment`, 4× `audio_mux`, alle `dispatched`) gehören **alle derselben Szene** `b34d1eae…` an — und die steht bereits auf `pipeline_state = complete` (17:26Z). G3.1 lief als Observe-Mode: die Attempts wurden gebunden, aber nie terminalisiert. Auch das drainiert nicht von selbst.

## 3. Vorschlag: Gate auf echten In-flight-Scope korrigieren

Statt Bereinigung oder Abwarten wird das Cutover-Gate auf „live" geschärft — die Rows selbst bleiben unangetastet:

- **G1/G3 neu:** offene `sync_segment` / `audio_mux`-Attempts **nur** zählen, wenn die zugehörige Szene nicht terminal ist (`pipeline_state not in ('complete','failed','canceled')`).
- **G5 neu:** offene Pass-Slots **nur** zählen, wenn die Szene nicht terminal ist **oder** der Slot eine `pipeline_job_id` mit nicht-terminalem Ledger-Job trägt.
- **G2/G4** bleiben unverändert bei exakt 0 Rows.
- Zusätzlich unverändert: `binding_pending = 0` am Ende des Resmoke-Fensters.

Mit dieser Fassung ist das Gate nach heutigem Stand **0/0/0/0/0** (die stale Rows fallen definitorisch heraus, nicht durch Datenänderung).

## 4. Umsetzung in diesem Schritt

Nur Dokumentation, kein Deploy, keine Migration, keine Codeänderung:

1. `docs/v431-g3-2-2-report.md` §4 um den D1-a-Nachweis (Rollen-/Membership-Tabelle) ergänzen und §4 auf grün stellen.
2. `docs/v431-g3-2-2-report.md` §2 um die G5-Klassifikationstabelle, den G1/G3-Observe-Mode-Befund und die korrigierten Gate-Queries ergänzen; die Baseline-Messung als „Gate alter Fassung unerreichbar" markieren.
3. Status setzen: **G3.2.2 DEPLOY PLAN READY — AWAITING GO** mit den beiden geschlossenen Punkten.

Danach STOP; Cleanup der stale Rows nur auf separate Freigabe.

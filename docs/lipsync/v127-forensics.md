# Stage 0 — v127 Forensik-Report

**Datum:** 2026-06-16  
**Scope:** read-only Audit, keine Code-Änderungen  
**Datenfenster:** letzte 24 h von `syncso_dispatch_log` + Code-Walk `sync-so-webhook`, `compose-dialog-segments`, `lipsync-watchdog`

---

## 1. Top-Level-Metriken (24 h)

| Metrik | Wert |
|---|---|
| Total dispatches | 87 |
| `DISPATCHED` (Sync.so 201 OK) | 36 |
| Davon `model=sync-3` | 36 |
| Davon `model=lipsync-2-pro` | 0 |
| `FAILED` mit `model IS NULL` | 6 |
| `provider_unknown_error` | 6 |

**Schluss:** In den letzten 24 h war faktisch **nur `sync-3` aktiv**. Die v61-Eskalation auf `lipsync-2-pro` hat in Produktion **null** Mal gegriffen — entweder ist die Bedingung (3+ Speaker + N MAX_V5_RETRIES erschöpft) nie erreicht worden, oder die Eskalation springt vorher in einen anderen Pfad. Das relativiert Stage-7-Punkt „Kein Pro/Standard-Mix": der Mix existiert im Code, aber nicht in der Produktion.

---

## 2. Worst-Case-Scenes (Retry-Loop-Smoking-Gun)

| scene_id | attempts | statuses | errors |
|---|---|---|---|
| `cba18767-…` | **21** | `DISPATCHED`, `DISPATCH_ATTEMPT_STARTED`, `COMPLETED_NOOP_RETRY`, `FAILED` | `sync_completed_noop`, `provider_unknown_error` |
| `34757e6a-…` | 17 | `DISPATCHED`, `FAILED` | `provider_unknown_error` |
| `785168d1-…` | 14 | `DISPATCHED`, `FAILED` | `provider_unknown_error` |
| `cec98372-…` | 9 | `DISPATCHED`, `COMPLETED_NOOP_RETRY` | `sync_completed_noop` |
| `9a1787ae-…` | 8 | `PREFLIGHT_BLOCKED` | `v107_preclip_required` |

**Lesart:**
- Scene `cba18767` ist exakt der vom User beschriebene 12-min-Hänger: NOOP triggert Re-Dispatch, Re-Dispatch läuft in `provider_unknown_error`, der wieder NOOP-artig retried wird. Bestätigt die Hypothese aus ChatGPT-Pro-Analyse zu 100 %.
- `provider_unknown_error`-Schleifen (17, 14 Attempts) sind unabhängig vom NOOP-Pfad — d. h. **es gibt mindestens zwei separate Retry-Loops**, nicht nur den NOOP-Loop. Stage 1.2 (NOOP-Retry=0) eliminiert nur einen davon.
- `v107_preclip_required` (PREFLIGHT_BLOCKED) als 8-fach-Retry zeigt, dass auch Preflight-Failures nicht terminal sind — sie werden re-dispatched, statt als `PASS_FAILED` final zu klassifizieren.

**Konsequenz für Stage 1:** Punkt 1.2 wird auf **alle terminalen Outcomes** erweitert, nicht nur NOOP. Konkret: `provider_unknown_error` (nach v121-stop-loss), `sync_completed_noop`, `v107_preclip_required` → alle terminal, kein Re-Dispatch.

---

## 3. Webhook-Default-Variant-Bug (bestätigt)

```sql
SELECT DISTINCT meta->>'variant' FROM syncso_dispatch_log
WHERE created_at > now() - interval '24 hours';
-- → [NULL]  (für alle 87 Rows)
```

`retry_variant` wird im Webhook geführt (Code-Walk: 12 Stellen in `sync-so-webhook/index.ts`, u. a. Zeilen 500, 819, 855, 987, 1014, 1065), aber **nirgends in `syncso_dispatch_log.meta` persistiert**. Stattdessen lebt der State in `composer_scenes` (jsonb-Spalte für Dialog-Passes). Webhook-Re-Dispatch liest `passBeforeDone?.retry_variant ?? "coords-pro"` — der Hardcoded-Default ist genau der von ChatGPT diagnostizierte "stiller Default".

**Implikation für Stage 1.3:** Ursprünglicher Plan hat `syncso_dispatch_log per (shot_id, attempt_idx)` als Single-Source-of-Truth angenommen. Real ist die Quelle der Wahrheit **`composer_scenes.dialog_passes[passIdx].retry_variant`**. Stage 1.3 muss:
1. Webhook MUSS variant aus `composer_scenes` lesen, **nicht** aus Defaults.
2. Zusätzlich `meta.variant` + `meta.model` bei jedem Dispatch in `syncso_dispatch_log` schreiben, damit Forensik künftig nicht mehr blind ist.

---

## 4. Lock-Mechanismus

`dialog_dispatch_locks` Schema: `scene_id (PK NOT NULL) + holder + acquired_at + expires_at`.

- **Aktueller Tabellen-Inhalt: 0 Rows.**
- Lock ist Scene-Level, nicht Pass-Level. Zwei parallele Passes derselben Scene können sich also gegenseitig den Lock klauen — das ist genau die Race-Condition aus dem Plan.
- Dass die Tabelle leer ist, kann zwei Ursachen haben: (a) Locks werden korrekt im finally-Block freigegeben, (b) Locks werden nie aufgenommen, weil der Code-Pfad sie umgeht. Welches der beiden zutrifft, lässt sich nur durch Code-Walk in `compose-dialog-segments` (4094 Zeilen) klären — das ist Stage-1.4-Aufgabe, nicht Stage-0.

**Konsequenz für Stage 1.4:** Plan ist korrekt — Lock auf `(scene_id, pass_idx)` erweitern, Race-Test (2 simultane Webhooks) ist Pflicht-Akzeptanzkriterium.

---

## 5. v127 NOOP-Recovery (Code-Pfad)

`sync-so-webhook/index.ts:486–537`:

```ts
// v127 — Re-encoded-but-passthrough sniff. Sync.so sync-3 can return
// COMPLETED with passthrough output when input was too static (no mouth
// motion for sync-3's auto_detect tracker to lock on). The byte-equal
// check upstream catches this. If we detect NOOP and we
// haven't already tried lipsync-2-pro, escalate to `coords-pro-lp2pro`
// (uses lipsync-2-pro) — handles near-static plates better in practice
```

Der Re-Dispatch (Zeile 537) macht einen Self-POST mit `retry: true, retry_variant: nextRetryVariant`. **Das ist der Loop, der bei `cba18767` 21 Mal feuerte.** Es gibt keine harte Retry-Cap in diesem Pfad — `MAX_V5_RETRIES` ist eine andere Konstante (`MAX_SHOT_RETRIES = 4`), die im NOOP-Pfad nicht referenziert wird.

**Schluss:** Stage 1.2 (NOOP-Retry-Budget = 0) ist die richtige minimale Intervention. NOOP wird zukünftig terminal markiert (`PASS_DONE_SUSPECT`), Re-Dispatch entfällt vollständig.

---

## 6. Visuelle Plate-Inspektion

**Status:** verschoben auf Stage 2 (Audit-Layer). Begründung: ohne `preflight.json` und `faces.json` pro Pass im Debug-Bucket ist eine manuelle Inspektion nicht reproduzierbar — wir würden 5 Plates anschauen, raten, und hätten in 2 Tagen wieder vergessen, welche es waren. Stage 2 macht das deterministisch.

---

## 7. Korrekturen am Alpha-Plan (vor Stage 1 anwenden)

1. **Stage 1.2 erweitern:** Terminal-Outcomes sind nicht nur NOOP, sondern auch `provider_unknown_error` (nach 1 Stop-Loss-Attempt, v121-Konvention beibehalten) und `v107_preclip_required`. Pass-Status wird in allen drei Fällen final (`PASS_DONE_SUSPECT` bzw. `PASS_FAILED`).
2. **Stage 1.3 umschreiben:** Variant/Model-Lookup-Quelle ist `composer_scenes.dialog_passes[passIdx]`, nicht `syncso_dispatch_log`. Zusätzlich schreibt Stage 1.3 `meta.variant` + `meta.model` bei jedem `INSERT` in `syncso_dispatch_log`, damit künftige Audits direkt möglich sind.
3. **Stage 1.4 unverändert:** Lock auf `(scene_id, pass_idx)`, unique constraint, 8-min TTL, Cleanup-Cron.
4. **Stage 4 (Targeting A/B):** Zielmenge auf **Scenes wie `cba18767`** beschränken (NOOP-prone, near-static plates). 3-Speaker- und Brillen-Edges sind sekundär — die akute Bluterhöhung ist NOOP, nicht Center-Speaker-Miss.

---

## 8. Exit-Kriterium Stage 0 — erreicht

Wir wissen jetzt:
- **Warum** die Pipeline hängt: zwei separate Retry-Loops (NOOP + provider_unknown_error), beide ohne Cap.
- **Warum** Variant-Forensik bisher nicht möglich war: Webhook persistiert variant/model nicht in `syncso_dispatch_log.meta`.
- **Warum** der Webhook-Default-Bug real ist: 87/87 Rows haben `variant=NULL`.
- **Warum** Locks evtl. nicht greifen: Tabelle leer + Scene-Level statt Pass-Level.

→ Freigabe für **Stage 1 Hotfix v128** mit den drei oben aufgeführten Plan-Korrekturen.

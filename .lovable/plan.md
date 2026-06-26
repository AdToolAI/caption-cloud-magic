## Problem

Im QA-Cockpit zeigen 5 Functions Fehler — alle sind Smoke-Test-Artefakte, keine echten Produktionsbugs:

| Function | Status | Ursache |
|---|---|---|
| `facebook-list-pages` | 500 Internal | `qaMockJson(corsHeaders, …)` referenziert `corsHeaders` — die Variable heißt aber `CORS` → ReferenceError |
| `facebook-select-page` | 500 Internal | Gleicher ReferenceError (`corsHeaders` statt `CORS`) |
| `auth-email-hook` | 401 Invalid signature | `isQaMockRequest`-Guard steht in einer Helper-Funktion (Zeile 94), aber NICHT im echten `Deno.serve`-Handler (Zeile 298) → Smoke-Call läuft direkt in `verifyWebhookRequest` und scheitert |
| `qa-weekly-deep-sweep` | 401 Invalid token | Kein `isQaMockRequest`-Guard im Handler — Admin-Token-Check schlägt im Mock-Modus zu |
| `smoke-matrix-run` | 401 unauthorized | Kein `isQaMockRequest`-Guard — Self-Call beim Sweep läuft in eigenen Admin-Check |

## Lösung

**Reine Mock-Guard-Korrekturen, keine Geschäftslogik-Änderungen.**

1. **`facebook-list-pages` & `facebook-select-page`**: `qaMockJson(corsHeaders, …)` → `qaMockJson(CORS, …)` (Variablenname korrigieren).

2. **`auth-email-hook`**: Im Handler (`Deno.serve` bei Zeile 298) direkt nach dem OPTIONS-Preflight ein `if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "auth-email-hook" });` einfügen — vor der Signature-Verifikation. Die existierende Zeile 94 (im Helper) unangetastet lassen.

3. **`qa-weekly-deep-sweep`**: Im Handler (Zeile 727) nach OPTIONS-Preflight Mock-Guard einfügen — vor dem Admin-Token-Check (Zeile 744). Import von `isQaMockRequest, qaMockJson` aus `../_shared/qaMock.ts` ergänzen.

4. **`smoke-matrix-run`**: Im Handler (Zeile 162) nach OPTIONS-Preflight Mock-Guard einfügen — vor dem Admin-Check (Zeile 175). Wichtig: damit kann sich der Sweep nicht mehr selbst aufrufen — der Registry-Eintrag für `smoke-matrix-run` selbst sollte als Self-Reference ausgeschlossen werden (in `smokeRegistry.ts` entfernen oder als `skip` markieren), sonst läuft der Sweep rekursiv.

## Verifikation

Nach Deploy:
- Kategorie **Social — Meta** erneut sweepen → `facebook-list-pages` + `facebook-select-page` grün.
- Kategorie **Notifications & Email** sweepen → `auth-email-hook` grün.
- Kategorie **QA & Testing** sweepen → `qa-weekly-deep-sweep` + `smoke-matrix-run` grün (bzw. `smoke-matrix-run` aus Registry entfernt → 16/16 statt 17).

## Out-of-Scope

- Keine Änderungen am Auth-Flow, an Meta-Discovery oder am Deep-Sweep-Orchestrator.
- Keine Änderungen an `_shared/qaMock.ts`.
- Keine UI-Änderungen im Cockpit.

## Files

- `supabase/functions/facebook-list-pages/index.ts` — 1-Zeilen-Fix (`corsHeaders` → `CORS`).
- `supabase/functions/facebook-select-page/index.ts` — 1-Zeilen-Fix.
- `supabase/functions/auth-email-hook/index.ts` — Mock-Guard im Deno.serve-Handler.
- `supabase/functions/qa-weekly-deep-sweep/index.ts` — Import + Mock-Guard im Handler.
- `supabase/functions/smoke-matrix-run/index.ts` — Import + Mock-Guard im Handler.
- `supabase/functions/_shared/smokeRegistry.ts` — `smoke-matrix-run` aus Registry entfernen (Self-Reference).



# Plan: `check-render-status` — 404 statt 500 bei „Render nicht gefunden"

## Diagnose

Die Edge-Funktion `check-render-status` wirft bei jedem Fehler `throw new Error(...)` und antwortet pauschal mit **HTTP 500**. Das passiert bei:

- Dummy-renderId nicht gefunden → 500
- User nicht authentifiziert → 500
- Render existiert nicht oder gehört anderem User → 500

Der Superuser-Test sendet absichtlich eine Dummy-renderId (`ai-superuser-dummy-render-id`) und erwartet via `expectReachable: true`, dass die Funktion „lebt" (HTTP < 500). Da sie aber 500 zurückgibt, schlägt der Test fehl — **obwohl die Funktion korrekt arbeitet**.

Das ist semantisch auch falsch: „Render nicht gefunden" ist ein Client-Fehler (404), kein Server-Fehler (500). HTTP 500 sollte echten Bugs vorbehalten sein.

## Lösung

`supabase/functions/check-render-status/index.ts` so anpassen, dass die HTTP-Status-Codes der tatsächlichen Fehlerart entsprechen:

| Situation | Status vorher | Status nachher |
|---|---|---|
| Kein Auth-Header | 500 | **401** |
| User nicht authentifiziert | 500 | **401** |
| `renderId` fehlt im Body | 500 | **400** |
| Render-Job nicht gefunden | 500 | **404** |
| Echter DB-/Server-Fehler | 500 | **500** (bleibt) |

Konkret: Statt `throw new Error(...)` wird typisierte Response mit passendem Status zurückgegeben. Der bestehende Try/Catch fängt nur noch unerwartete Exceptions ab.

## Geänderte Dateien

- `supabase/functions/check-render-status/index.ts` — Refactor der Fehlerbehandlung auf semantisch korrekte HTTP-Codes (401/400/404/500)

## Verifikation

Nach Deploy „Komplett-Test" auslösen. Erwartung:

- **Render Status Polling Reachability** → grün (404 zählt jetzt als „endpoint lebt", da < 500)
- 34/34 Szenarien stabil
- Echte Client-Aufrufe (gültige renderId) funktionieren unverändert weiter

## Erwartetes Ergebnis

- Korrekte HTTP-Semantik (4xx für Client-Fehler, 5xx für Server-Fehler)
- Test wird grün ohne dass der Test selbst geändert werden muss
- Sentry/Monitoring-Tools zeigen künftig nur noch echte Server-Bugs als 5xx — nicht mehr „User hat falsche renderId"


## Diagnose

Aus der DB + Logs sehe ich zwei Probleme, die beide ein "non-2xx" beim „Generieren" einer 3-Sprecher-Szene erklären können — und mindestens eines davon blockiert die Dialog-Pipeline gerade dauerhaft.

### 1) `poll-dialog-shots` bootet aktuell nicht
Edge-Runtime-Logs zeigen wiederholt:
```
worker boot error: Uncaught SyntaxError: Unexpected reserved word
  at .../poll-dialog-shots/index.ts:645:31
```
Konsequenz: sobald `compose-dialog-segments` (oder `compose-dialog-scene`) den ersten Sync.so-Pass dispatchen will und im Hintergrund `poll-dialog-shots` triggert, bricht die Pipeline. Der pg_cron `poll-dialog-shots-every-minute` failt aus dem gleichen Grund — keine Multi-Pass-Kette kommt voran.

Die Source-Datei passt zwar Denos `deno check`, der edge-runtime-Compiler ist aber strenger und lehnt das ab. Das muss vor jedem weiteren Dialog-Render gefixt sein.

### 2) `compose-video-clips` failt VOR dem EARLY-Pre-Mark
Scene `d7943179` (Szene 1, `cinematic-sync`, HappyHorse, 3 Sprecher) steht in der DB auf `clip_status='pending'`, obwohl wir gestern den EARLY-Pre-Mark direkt nach dem Wallet-Check eingebaut haben. Der frühe Crash passiert also irgendwo in `parse_body → verify_project → cost_calc → wallet → project-status-update`.

Logs für `compose-video-clips` liegen für den fraglichen Zeitpunkt nicht vor (analytics filtert leer). Der Toast zeigt nur den generischen `Edge Function returned a non-2xx status code`, weil `extractFunctionsError` den Response-Body nicht parsen konnte → das deutet auf einen Crash, der KEIN JSON zurückgibt (uncaught throw vor dem `try/catch`-JSON-Response oder Function-Boot-Crash).

## Plan

| # | Schritt | Wo | Was |
|---|---------|----|-----|
| 1 | **`poll-dialog-shots` syntaktisch sauber neu schreiben** | `supabase/functions/poll-dialog-shots/index.ts` | Die Stelle um L645 (dispatch-fallback, `headers: { "x-api-key": apiKey, ... }`) wird leicht umstrukturiert: Header-Objekt vorher in eine Variable extrahieren, gleiche Pattern für den Erst-Dispatch (~L598). Damit ist klar, dass kein reserviertes Wort als Property-Key landet. Anschließend `deno fmt`-Pass im Kopf, kein logischer Change. |
| 2 | **Boot-Smoke-Test ins Deploy einbauen** | `poll-dialog-shots/index.ts` Top | `serve` so umstrukturieren, dass alle Imports/Constants oben sauber stehen — wir reduzieren das Risiko, dass edge-runtime an einer optional-chain-mit-as-Konstrukt stolpert. |
| 3 | **`compose-video-clips` Frühphase wirklich crash-safe machen** | `supabase/functions/compose-video-clips/index.ts` L161-330 | Den gesamten Frühblock (Auth + Body + Project + Wallet + Pre-Mark) in einen einzigen `try` packen, dessen `catch` ALWAYS `200` mit `{ ok: false, error, stage, scenes:[{id, status:'failed', error}] }` zurückgibt. Damit sieht der Client den echten Grund (kein nackter 500/„non-2xx"), und der Scene-Status flippt sofort auf `failed` mit Fehlertext statt ewig auf `pending` zu kleben. |
| 4 | **Client-Toast verbessert die Diagnose** | `src/hooks/useSceneGenerate.ts` `catch` + `extractFunctionsError` Aufruf | Wenn die Edge-Function das o.g. `{ok:false}` zurückgibt, das `data.error/stage/message` direkt an den Toast hängen (statt „non-2xx"). Bisher fängt der Hook nur den `error`-Zweig ab — ich erweitere ihn um den `data.ok === false`-Pfad. |
| 5 | **Sanity-Check der 3-Sprecher-Pipeline ENDE-zu-ENDE** | nichts neues bauen | Nach den Fixes manuell die Szene erneut auslösen, in den Edge-Logs den exakten Stage (`init`, `parse_body`, `verify_project`, `cost_calc`, `wallet_check`, `pre_mark`, `dispatch`) ablesen — falls dann immer noch ein Fehler kommt, ist er sichtbar und gezielt fixbar. |

## Was NICHT angefasst wird

- 2-Sprecher-Pipeline (läuft laut User stabil)
- Sync.so Multi-Pass v5 Logik (`compose-dialog-segments` chain)
- HappyHorse-Migration zu Hailuo bei Multi-Speaker (bereits intakt)
- Realtime/Subscribe-Hooks, Watchdog-Cron, Progress-Bar (gestern gefixt)
- Cinematic-Sync Anchor-Audit, Identity-Card, Outfit-Lookup

## Erwartetes Ergebnis

- `poll-dialog-shots` bootet wieder → Dialog-Kette schreitet voran.
- Bei jedem zukünftigen Pre-Phase-Crash sieht der User eine **konkrete** Fehlermeldung statt „non-2xx", und die Szene landet sofort als `failed` (statt ewig `pending`).
- Wir können in einem Folge-Loop gezielt den eigentlichen Crash-Punkt fixen, falls er weiterhin auftritt.

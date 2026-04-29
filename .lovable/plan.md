## Problem

Beide Smoke-Missionen (`smoke-01-dashboard-tour`, `smoke-02-picture-studio-mock`) failen sofort mit:

```
Browserless 400: module is not defined
```

Ursache: Wir senden den Code als **raw JavaScript** mit `Content-Type: application/javascript` und nutzen `module.exports = ...` (CommonJS). Der aktuelle Browserless `/function`-Endpoint (v2, `production-sfo.browserless.io`) erwartet jedoch:

1. **`Content-Type: application/json`**
2. Body: `{ "code": "<JS-string>", "context": { ... } }`
3. Der Code selbst muss **ES-Module-Syntax** verwenden: `export default async ({ page, context }) => { ... }`

Die Fehlermeldung `module is not defined` ist exakt das, was zurückkommt wenn der Runner ESM erwartet und wir `module.exports` schreiben.

## Änderungen

### 1. `supabase/functions/_shared/browserlessClient.ts`

**`runBrowserlessFunction(code, context?)`** neu schreiben:
- Body als JSON senden: `{ code, context }`
- Header: `Content-Type: application/json`
- Antwort wie bisher parsen, `rawResponse`/`httpStatus` für Debugging behalten
- Optionalen zweiten Parameter `context` ergänzen (wird vom Code als zweites Arg empfangen)

**`buildSmokeNavigationScript(opts)`** umstellen:
- `module.exports = async ({ page }) => { ... }` → `export default async ({ page, context }) => { ... }`
- Statt `opts` per JSON-Inline-Stringify in den Code zu backen, übergeben wir die Optionen via `context`-Parameter (sauberer, keine Quote-Escapes nötig)
- Funktion gibt das Tupel `{ data, type }` weiterhin so zurück wie Browserless es erwartet

### 2. `supabase/functions/qa-agent-execute-mission/index.ts`

- `runBrowserlessFunction(script)` Aufruf erweitern: `runBrowserlessFunction(script, { baseUrl, email, password, paths, finalPath })`
- `buildSmokeNavigationScript()` braucht keine Opts mehr im Code-Body, nur noch eine reine Code-Konstante → Signatur entsprechend anpassen (Funktion ohne Args, da Context separat übergeben wird)

### 3. Verifikation

Nach dem Fix manuell `smoke-02-picture-studio-mock` im Cockpit auslösen. Erwartung:
- HTTP 200 von Browserless
- `pathResults: [{path: "/picture-studio", ok: true}]`
- Screenshot wird in `qa-screenshots` Bucket abgelegt
- Run-Status: `succeeded` (sofern keine Console-Errors)

Falls Browserless trotz JSON-Format wieder mit `module is not defined` antwortet, fallen wir auf den Alternativ-Endpoint **`/function`** mit reinem ESM-Body und Content-Type `application/javascript` zurück — testen wir aber erst nach dem JSON-Versuch.

## Betroffene Dateien

- `supabase/functions/_shared/browserlessClient.ts` — Body-Format JSON + ESM-Code
- `supabase/functions/qa-agent-execute-mission/index.ts` — Aufruf mit Context-Objekt

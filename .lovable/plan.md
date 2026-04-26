## Problem

MS-12 zeigt eine **Warning** mit der Meldung *"Function 'analyze-scene-subject' not deployed (optional)"*, obwohl die Funktion **deployed ist** und korrekt mit HTTP 404 antwortet (282 ms — siehe Screenshot).

## Root Cause

In `supabase/functions/motion-studio-superuser/index.ts` (Zeile 556-558) wird **jede** 404-Response als "Function not deployed" interpretiert:

```ts
if (response.status === 404 && scenario.optional) {
  status = "warning";
  errorMessage = `Function '${scenario.fn}' not deployed (optional)`;
}
```

Das ist falsch, denn:
- Eine **nicht deployte** Edge Function antwortet mit 404 vom Supabase-Gateway (mit spezifischem Body wie `{"code":"NOT_FOUND","message":"Requested function was not found"}`).
- Eine **deployte** Function darf legitim 404 für "Resource not found" zurückgeben (genau das, was wir in MS-3 für `analyze-scene-subject` als Fallback-Härtung testen wollen!).

## Fix

In `motion-studio-superuser/index.ts` die 404-Logik präzisieren:

1. **Function-not-deployed-404** nur erkennen, wenn der Response-Body das Supabase-Gateway-Pattern enthält (z. B. `BOOT_ERROR`, `NOT_FOUND` mit Function-Hinweis, oder leerer/HTML-Body).
2. **Andere 404-Antworten** (mit JSON-Body & `error`-Feld) als gültige `pass` werten — das ist das erwartete Verhalten für Hardening-Tests.

Konkret Zeile 556-581 ersetzen durch:

```ts
const isGatewayNotFound =
  response.status === 404 &&
  (typeof responseData !== "object" ||
    responseData === null ||
    !("error" in (responseData as Record<string, unknown>)));

if (isGatewayNotFound && scenario.optional) {
  status = "warning";
  errorMessage = `Function '${scenario.fn}' not deployed (optional)`;
} else if (scenario.expectReachable) {
  if (response.status < 500) {
    status = "pass";
    schemaHash = await hashSchema(responseData);
  } else {
    status = scenario.optional ? "warning" : "fail";
    errorMessage = `Endpoint unreachable — HTTP ${response.status}: ${text.substring(0, 200)}`;
  }
} else if (!response.ok) {
  status = scenario.optional ? "warning" : "fail";
  errorMessage = `HTTP ${response.status}: ${text.substring(0, 300)}`;
} else {
  schemaHash = await hashSchema(responseData);
  if (scenario.expectedKeys && responseData && typeof responseData === "object") {
    const missing = scenario.expectedKeys.filter(
      (k) => !(k in (responseData as Record<string, unknown>)),
    );
    if (missing.length > 0) {
      status = "warning";
      errorMessage = `Missing expected keys: ${missing.join(", ")}`;
    }
  }
}
```

## Umsetzungsschritte

1. `motion-studio-superuser/index.ts` (Zeile 556-581) wie oben patchen.
2. Funktion deployen.
3. Fast Run erneut starten — MS-12 sollte jetzt **grün (pass, HTTP 404)** sein, ohne Warning.

## Erwartetes Ergebnis

- **Bestanden: 14** (statt 13)
- **Warnungen: 0** (statt 1)
- **Fehlgeschlagen: 0**

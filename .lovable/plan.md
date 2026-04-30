## Was du beobachtet hast — und warum

Du siehst drei verbundene Symptome, die alle dieselbe Wurzel haben:

1. **"Bugs fast alle raus"** — Stimmt. Die Mute-Patterns + echten Code-Fixes der letzten Loops greifen. Bug-Inbox ist sauber.
2. **"Immer wieder 2 Console-Errors"** — Das sind in **jeder** Mission die gleichen zwei Sentry-Envelope-Calls (`o4510408780480512.ingest.de.sentry.io/.../envelope/?...` → `Failed to load resource: net::ERR_FAILED`). Die Browserless-Session hat keine echte CORS-Allowance für Sentry's EU-Ingest-Endpoint, also blockt der Browser sie. Sentry retried zweimal → 2 Console-Errors, in jeder Mission identisch.
3. **"Bei manchen nur Step 1/4"** — Genau diese Sentry-Errors triggern den ersten `expect_no_console_error`-Step direkt nach Login → Step 1 fail → `result.ok=false`. Die nachfolgenden Steps laufen zwar weiter (siehe Code in `browserlessClient.ts:463`), aber die Mission wird als "failed" markiert und die UI zeigt nur den ersten erfolgreichen Step prominent an.

### Warum die existierenden Mute-Patterns nicht reichen

Die DB-Patterns (`Failed to load resource: net::ERR_FAILED`, `ERR_BLOCKED_BY_CLIENT` etc.) werden **erst nach** dem Mission-Run beim Bug-Insertion angewendet (`qa-agent-execute-mission/index.ts:337` → `matchMuted`). Der **In-Browser**-Check in `browserlessClient.ts:439-447` (`expect_no_console_error`) hat dagegen **null Filter** — er zählt einfach roh alle `console.error` und `pageerror`. Deshalb knallt's immer an Step 1.

## Änderungen

### 1. In-Browser Console-Filter in `browserlessClient.ts` (Hauptfix)

Im Browser-Page-Script (das per `page.evaluate` injiziert wird, gerendert als String in `browserlessClient.ts`) eine Ignore-Liste einbauen, die identisch zur Logik aus `tests/helpers/page-checks.ts` arbeitet — aber spezifisch für QA-Agent erweitert:

```
const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i,
  /ResizeObserver/i,
  /sentry\.io/i,                          // NEU: Sentry-Ingest CORS-Block
  /ingest\.(de|us)\.sentry\.io/i,         // NEU: Region-spezifisch
  /Failed to load resource.*sentry/i,     // NEU: Resource-Variante
  /net::ERR_BLOCKED_BY_CLIENT/i,
  /net::ERR_FAILED.*(?:companion-diagnose|check-subscription|sentry)/i,
  /companion-diagnose/i,
  /check-subscription.*FunctionsFetchError/i,
  /manifest\.json/i,
  /sw\.js/i,
  /AbortError/i,
  /X-Frame-Options/i,
  /DialogContent.*requires.*DialogTitle/i,
  /status of 406/i,
];
```

`expect_no_console_error`-Step zählt nur Errors, die **keinem** Pattern matchen. Identische Filter auch beim console-collector ganz oben — damit erscheinen die Sentry-Noise-Logs gar nicht erst im `consoleLogs`-Array, das später ans Cockpit gesendet wird.

**Effekt:** "2 console errs (2 unique)" verschwinden überall, `expect_no_console_error` wird grün, alle Folge-Steps werden korrekt durchgeführt und gezählt.

### 2. Optional: Sentry komplett im QA-Modus deaktivieren

Schöner als filtern: Sentry per `x-qa-mock`-Header gar nicht erst initialisieren. Check in `src/main.tsx` oder wo `Sentry.init` aufgerufen wird:

```ts
// Sentry skip in QA-Mode (header set by browserlessClient)
const isQA = typeof window !== 'undefined' && 
  document.cookie.includes('qa-mock') || 
  navigator.userAgent.includes('Browserless');
if (!isQA) Sentry.init({ ... });
```

Da `x-qa-mock` ein Request-Header ist und nicht im Browser sichtbar, gehen wir den **User-Agent-Weg**: Browserless-Sessions haben einen distinct UA. Falls das zu fragil ist, bleibt Variante 1 (Filter) der primäre Fix und wir lassen Sentry-Init so wie es ist.

→ **Entscheidung:** Variante 1 zuerst (sicherer Hotfix, keine App-Code-Änderung). Variante 2 später als Polish.

### 3. Cockpit-Anzeige `Steps: X/Y` korrigieren

Der `steps_completed`-Counter in `qa_test_runs` zählt aktuell vermutlich nur bis zum ersten Fail. Nach Fix #1 sollte das automatisch passen, weil `expect_no_console_error` nicht mehr fehlschlägt. Falls die Anzeige nach dem Fix immer noch "1/X" zeigt obwohl alle Steps grün sind: in `qa-agent-execute-mission/index.ts` den Wert aus `successfulNavs.length + grünen non-nav-steps` berechnen statt aus dem ersten Fail-Index.

Erst nach Deploy beobachten — wahrscheinlich nicht nötig.

### 4. Inbox-Cleanup

Bulk-resolve aller offenen Einträge mit `expect_no_console_error.*sentry` oder `Failed to load resource.*sentry` in `qa_bug_reports`, falls vorhanden.

### 5. Memory-Update

`mem://features/qa-agent/false-positive-hardening`: Ergänzen um:
- "In-Browser console filters in browserlessClient.ts MUST mirror DB mute patterns — DB patterns are post-run only"
- Sentry EU/US ingest endpoints in der Ignored-Liste
- Browserless-Sessions blocken Sentry Ingest grundsätzlich (kein App-Bug)

## Erwartetes Ergebnis

- smoke-03/05/12 (und alle anderen): vollständige Step-Anzahl grün, "0 console errs (0 unique)"
- Cockpit zeigt korrektes `Steps: X/X`
- Bug-Inbox bleibt sauber
- Kein neuer App-Code nötig (reiner QA-Infra-Fix)

## Was wir **nicht** tun

- Sentry nicht abschalten in Production (das Sentry-Tracking ist real wertvoll — wir filtern nur die Browserless-Session-Noise raus)
- Keine zusätzlichen DB-Mute-Patterns (die existieren schon, greifen aber zu spät — der echte Fix ist im In-Browser-Script)

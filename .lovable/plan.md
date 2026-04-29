## Was ist passiert

Der jüngste Run **`smoke-04-directors-cut-load`** lief 26.5 s, aber:
- `metadata.result.pathResults = []`
- `url = ""`, `title = ""`
- **0 Bug-Reports** in `qa_bug_reports`
- Trotzdem `status = "failed"`

Das ist ein Widerspruch in `qa-agent-execute-mission/index.ts`:
```ts
const status = bugsFound === 0 && result.ok ? "succeeded" : "failed";
```
Damit "failed" rauskommt, muss `result.ok === false` sein — aber dann hätte der Bug-Insert in Zeile 112-134 laufen müssen. Tut er aber nicht. Möglich ist:
1. Browserless hat ein Skript-Resultat geliefert in einer Form, die unser Parser nicht versteht (`payload?.ok !== false` ist `true` weil `payload` `undefined` → `result.ok = true`), gleichzeitig `pathResults` aber leer ist → kein Bug, aber pathResults=0 wird nicht als Failure gewertet, **außer** der Bug-Insert für "failed Navigations" hängt sich an `result.ok` … falsch geprüft.
2. Browserless-Funktion crashte mitten im Skript nach Login (`pathResults` noch leer), `result.ok` wurde auf `false` gesetzt, ABER der Bug-Insert warf eine Exception (z. B. wegen `description: undefined` + Schema-Konflikt) → Catch-Block markiert run als `failed`, aber Bug ist nicht eingetragen.
3. Edge-Function-Logs zeigen nur "booted" — `console.log`s aus dem Hauptpfad fehlen, weil entweder die Logs verschluckt werden oder die Function tatsächlich nichts loggt. Wir loggen aktuell **nichts** außer im fatalen Catch.

## Fix-Plan

### 1. `qa-agent-execute-mission/index.ts` — viel mehr Telemetrie und harter Bug-Insert für jeden „leeren" Run

- Zu Beginn `console.log("[execute-mission] start", { run_id, mission_name })`.
- Nach `runBrowserlessFunction`: `console.log("[execute-mission] result-summary", { ok, error, httpStatus, durationMs, pathResults: pathResults.length, urlReturned: result.url, titleReturned: result.title, hasFinalScreenshot: !!result.screenshot, hasLoginScreenshot: !!loginShotData, consoleLogCount: consoleErrors.length, networkErrorCount: netErrors.length })`.
- Bug-Insert defensiv machen: `description` immer mit Fallback `result.error ?? "unknown — see metadata"`, alle Inserts in `try/catch` mit `console.error` damit ein Insert-Fehler nicht den ganzen Run zerlegt.
- **Neue Bug-Bedingung**: Wenn `result.ok === true`, aber `pathResults.length === 0` UND `navPaths.length > 0` → einen Bug `"Navigation never executed (login likely failed silently)"` mit der vollen `result.data` als `network_trace.raw_result` einlogegn. Das verhindert künftig den Geist-Failed-Status.
- Status-Berechnung umstellen: `status = (bugsFound === 0 && result.ok && pathResults.length > 0) ? "succeeded" : "failed"` — sonst lügt das UI.
- Im catch-Block ebenfalls einen Bug-Report inserten (heute geht der Fehler verloren), damit das Cockpit immer eine Erklärung anzeigt.

### 2. `_shared/browserlessClient.ts` — robusterer Antwort-Parser + Timeout

- AbortController mit 90 s Timeout (Browserless eigenes Timeout ist konservativ, wir wollen sauber abbrechen statt hängen).
- Parser-Fix: aktuell `payload?.ok !== false` — wenn die Funktion einen non-Object payload liefert, ist `payload?.ok` `undefined` und `result.ok` wird `true`. Stattdessen: `ok = payload && typeof payload === 'object' && payload.ok !== false`. Falls payload kein Object ist → `ok=false, error="Browserless returned unexpected payload shape"`.
- Roh-Antwort (erste 1500 Zeichen) immer in `rawResponse` mitliefern, auch bei `res.ok` — aktuell nur bei HTTP-Fail. So sehen wir endlich was Browserless wirklich zurückgibt.

### 3. `_shared/browserlessClient.ts` — Skript: mehr Schritt-Telemetrie, abschließende Sammlung garantiert

- Vor jedem Major-Step (`goto auth`, `wait selectors`, `submit`, `wait redirect`, `for path`) ein `pathResults.push({ phase: 'login-step', label: '...' })` als Heartbeat — so sehen wir im Cockpit genau wo das Skript stehengeblieben ist.
- `try/finally` um den ganzen Block, sodass `result.consoleLogs / networkErrors / loginScreenshot` in jedem Fall an den Edge-Function-Caller zurückkommen, auch wenn ein Step wirft.
- Den finalen `return { data: result, type: 'application/json' }` nach `finally` legen.

### 4. `QACockpit.tsx` — sichtbare Heartbeats

- Run-Karte: Wenn `metadata.result.pathResults` Einträge mit `phase === 'login-step'` enthält, diese als kleine Schritt-Liste rendern („Auth geöffnet → Felder gefunden → Submit geklickt → Redirect …") — so erkennen wir auf einen Blick, wo's gestolpert ist, ohne in die DB zu schauen.
- Neue Sektion „Roh-Antwort (Browserless)" im Bug-Modal, wenn `network_trace.raw_response` vorhanden — sonst raten wir weiter im Dunkeln.

## Nicht Teil dieser Runde

- Tatsächliche Inhalts-Tests pro Page (kommt in QA-2).
- Provider-Mocking — die Smoke-Missionen klicken keine teuren Buttons.

## Verifikation

Nach Deploy: „Nächste Mission starten" auf smoke-02 → entweder
- **succeeded** mit `pathResults: [{path:"/picture-studio", ok:true}]` und sichtbaren Heartbeats, oder
- ein Bug mit klarer Aussage **welcher Schritt** stehenblieb + Roh-Antwort von Browserless im Modal.

## Betroffene Dateien

- `supabase/functions/qa-agent-execute-mission/index.ts`
- `supabase/functions/_shared/browserlessClient.ts`
- `src/pages/admin/QACockpit.tsx`

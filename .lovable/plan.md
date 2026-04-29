## Status

Der vorige Browserless-Fix hat funktioniert: Der jüngste Run (`smoke-03-ai-video-toolkit`) hat **HTTP 200** geliefert und das Skript wurde tatsächlich auf der `/auth`-Seite ausgeführt. Das neue Problem ist auf Applikations-Ebene:

```
No element found for selector: input[type="password"]
```

Das Login-Formular nutzt `<Input id="password" type="password" …>`, aber `waitForSelector('input[type="email"]')` resolved offenbar bevor das Passwort-Feld vollständig hydratisiert / gerendert ist (React + framer-motion Card + Tabs-Switch zwischen Login/Signup). Folge: Das Skript stirbt sofort beim ersten `page.type` und wir besuchen 0 Pfade.

## Was sich ändert

### 1. `supabase/functions/_shared/browserlessClient.ts` — `buildSmokeNavigationScript`

- **Beide Felder explizit abwarten**, nicht nur Email:
  - `await page.waitForSelector('input#email, input[type="email"]', { visible: true, timeout: 20000 })`
  - `await page.waitForSelector('input#password, input[type="password"]', { visible: true, timeout: 20000 })`
- **Robustere Submit-Erkennung**: Statt `button[type="submit"]` zusätzlich `button:has-text("Login"), button:has-text("Anmelden")` Fallback per `page.evaluate` (querySelector + click).
- **Login-Erfolg verifizieren**: Nach Submit warten bis URL nicht mehr `/auth` ist (`page.waitForFunction(() => !location.pathname.startsWith('/auth'), { timeout: 25000 })`). Falls Timeout → klaren Fehler `Login did not redirect (still on /auth)` werfen statt blind die Pfad-Schleife zu starten.
- **Pre-Login Screenshot**: Falls Login fehlschlägt, einen Screenshot der Auth-Seite zurückgeben (hilft bei "warum sehe ich kein Password-Feld") — schreiben wir in `result.loginScreenshot`.
- **Console-Log Pre-Init**: Listener vor dem ersten `page.goto` registrieren (ist schon der Fall — bestätigen).
- **Selector-Doku im Skript** als Kommentar, damit künftige Tweaks (z. B. Magic-Link-Mode) klar bleiben.

### 2. `supabase/functions/qa-agent-execute-mission/index.ts`

- Wenn `result.loginScreenshot` existiert und der Run failed, diesen Screenshot in `qa-screenshots` Bucket uploaden und als zusätzliches `screenshot_url` an den Bug-Report hängen (im `network_trace`-Objekt unter `login_screenshot_url`).
- `pathResults`-Verarbeitung defensiv: Wenn leer, weiter wie bisher als Fail markieren, aber `error_message` klarer ("Login failed before any path could be visited").

### 3. `src/pages/admin/QACockpit.tsx` — Bug-Detail-Modal

- Kleiner UI-Tweak: Wenn `network_trace.login_screenshot_url` vorhanden, eigene Sektion **"Auth-Seite zum Zeitpunkt des Fehlers"** mit Bild — sonst sehen wir nie was Browserless wirklich auf `/auth` vorgefunden hat.

## Nicht Teil dieser Runde

- 2FA-Flow simulieren (Test-User hat keins).
- Magic-Link / Google OAuth Login (Smoke-Tests nutzen Email+Passwort).
- Mehr Missionen — erst Smoke-01..03 stabil, dann Rollout.

## Verifikation

Nach Deploy: "Nächste Mission starten" → erwartet wird entweder
- **succeeded** mit `pathResults: [{path:"/picture-studio", ok:true}]`, **oder**
- ein Bug mit Screenshot der Auth-Seite + klarer Message woran genau es liegt.

## Betroffene Dateien

- `supabase/functions/_shared/browserlessClient.ts`
- `supabase/functions/qa-agent-execute-mission/index.ts`
- `src/pages/admin/QACockpit.tsx`
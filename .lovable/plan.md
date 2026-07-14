# Fix: „n.context.body.text is not a function" beim Track-Erstellen

## Ursache
In `src/hooks/useMusicGeneration.ts` (Zeile 51) wird bei einem Edge-Function-Fehler versucht, `error.context.body.text()` aufzurufen. Bei aktuellen `supabase.functions.invoke`-Versionen ist `context.body` aber kein `Response`-Stream mehr, sondern bereits ein geparstes Objekt/String — der Aufruf `.text()` wirft daher `is not a function`. Der eigentliche Backend-Fehler (z. B. `INSUFFICIENT_CREDITS`, `MISSING_LYRICS`, Provider-Fehler) wird dadurch komplett verschluckt und durch den Crash-Toast ersetzt.

## Fix
Robuste Payload-Extraktion in `useMusicGeneration.ts`, die alle drei Formen abdeckt:
1. `context.body` ist bereits ein Objekt → direkt verwenden
2. `context.body` ist ein String → `JSON.parse` mit Fallback
3. `context.body` ist ein `Response`/Blob mit `.text()` → wie bisher (in try/catch)
4. sonst → `context` selbst oder `error.message` als Fallback

Kein Verhaltens-Change am Erfolgspfad, keine UI-Änderung — nur der Error-Reader wird gehärtet, damit die bestehenden Toasts (Credits, Rate-Limit, Missing Lyrics, generisch) wieder korrekt greifen.

## Betroffene Datei
- `src/hooks/useMusicGeneration.ts` — Ersatz des `context.body.text()`-Blocks durch eine kleine `parseInvokeError`-Helper-Funktion im selben File.

Nach dem Fix zeigt der Toast wieder den echten Backend-Grund an, sodass wir sehen, ob es ein Credits-, Lyrics- oder Provider-Problem ist.
# Seedance 2.0: 422-Fehler bei langen Prompts beheben

## Was tatsächlich passiert

Die Edge-Function `generate-seedance-video` bricht mit HTTP 500 ab. Ursache laut Live-Logs (18:56 und 18:58 Uhr):

```text
Replicate 422 Unprocessable Entity
input.prompt: String length must be less than or equal to 4000
```

Der Prompt wird ungeprüft an Replicate durchgereicht. Seit Seedance 2.0 gilt dort ein hartes Limit von 4000 Zeichen — unsere ausführlichen, cinematischen Prompts überschreiten das.

Positiv: Die Credits (6,48 €) wurden in beiden Fällen automatisch zurückerstattet — der Refund-Pfad funktioniert.

## Was gebaut wird

1. **Prompt-Limit serverseitig durchsetzen** (`generate-seedance-video`)
   - Prompt vor dem Aufruf auf max. 4000 Zeichen begrenzen, sauber an Satzgrenze gekürzt statt hart abgeschnitten.
   - Kürzung im Log vermerken (Originallänge → gekürzte Länge).
   - Leerer Prompt ohne Startbild → sofort 400 statt Abbuchung.

2. **Fehler nicht mehr als 500 ausliefern**
   - Replicate-Validierungsfehler (422) werden als 400 mit klarer, lesbarer Meldung zurückgegeben, damit im Studio nicht „Edge Function returned a non-2xx status code" steht, sondern der echte Grund.

3. **Frontend-Hinweis**
   - Im AI-Video-Studio den Fehlertext des Backends anzeigen; bei Kürzung ein dezenter Hinweis „Prompt wurde auf 4000 Zeichen gekürzt".

## Technische Details

- Datei: `supabase/functions/generate-seedance-video/index.ts` — neue Konstante `MAX_PROMPT_CHARS = 4000`, Hilfsfunktion `clampPrompt()` vor dem Insert in `ai_video_generations` (damit der gespeicherte Prompt dem entspricht, was gerendert wurde).
- Der bestehende Refund-Pfad bleibt unverändert.
- Gleiche Prüfung als Vorsichtsmaßnahme in den anderen Replicate-Video-Funktionen mit identischem Limit (Kling/Hailuo/Wan) nur, falls deren Logs denselben Fehler zeigen — sonst kein Eingriff.

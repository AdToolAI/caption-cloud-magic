# Text-Studio: Fehler beheben und Modelle aktualisieren

## 1. Der Fehler "estInputTokens is not defined"

Bestätigte Ursache: In der Chat-Funktion des Text-Studios wird beim Start der Antwort ein Wert für die geschätzten Eingabe-Tokens verwendet, den es nicht mehr gibt — er wurde entfernt, als das Text-Studio auf "kostenlos" umgestellt wurde. Dadurch bricht jede Anfrage ab, sobald der Anbieter zu antworten beginnt, und der Nutzer sieht nur die technische Meldung.

Fix: Die Schätzung wird direkt aus den tatsächlich gesendeten Nachrichten (inkl. Systemtext) berechnet, bevor der Stream startet. Danach überschreiben die echten Token-Zahlen des Anbieters diesen Wert wie bisher. Abrechnung ändert sich nicht — Text-Studio bleibt kostenlos, die Zahlen sind reine Telemetrie.

Zusätzlich: Falls in der Funktion doch noch etwas schiefgeht, bekommt der Nutzer künftig eine verständliche Meldung in EN/DE/ES statt eines Programmierbegriffs.

## 2. Sind die Modelle aktuell?

Stand des Katalogs gegenüber der aktuellen Auswahl:

| Anbieter | Stufe | Heute im Studio | Aktuell? | Vorschlag |
| --- | --- | --- | --- | --- |
| OpenAI | Schnell | GPT-5.6 Luna | ja | bleibt |
| OpenAI | Ausgewogen | GPT-5.6 Terra | ja | bleibt |
| OpenAI | Maximum | GPT-5.6 Sol | ja | bleibt, plus neue Stufe darüber |
| OpenAI | — | — | fehlt | **GPT-6 Astra** ergänzen (stärkstes verfügbares Modell) |
| Google | Schnell | Gemini 3.1 Flash Lite | ja | bleibt |
| Google | Ausgewogen | Gemini 3.6 Flash | veraltet | auf **Gemini 3.8 Flash** heben |
| Google | Maximum | Gemini 3.1 Pro | ja | bleibt |
| Anthropic | Maximum | Claude 4.1 Opus | eigener Schlüssel | bleibt unverändert |

Umsetzung:
- Gemini 3.6 Flash → Gemini 3.8 Flash (gleiche Stufe, alte Auswahl wird automatisch auf das neue Modell gelegt, keine gespeicherten Chats gehen verloren).
- GPT-6 Astra als neue OpenAI-Höchststufe aufnehmen; GPT-5.6 Sol bleibt als günstigere Premium-Alternative wählbar.
- Preise pro 1k Tokens für die neuen Einträge mit derselben Marge wie bisher hinterlegen, sichtbar in der Kostenvorschau.

## Technische Details

- `supabase/functions/text-studio-chat/index.ts`: `estInputTokens` durch eine lokale Schätzung aus `sysMsg + cleanMessages` ersetzen (Funktion `estimateTokens` existiert bereits); Catch-Zweig gibt eine lokalisierte Meldung plus technisches Detail im Log aus.
- Registry-Erweiterung parallel in `src/lib/text-studio/models.ts`, `supabase/functions/text-studio-chat/index.ts` und `supabase/functions/text-studio-compare/index.ts` (`PRICING`, `PROVIDER_MAP`), plus `LEGACY_ALIASES`/`LEGACY_MODEL_ALIASES` für `google-gemini-3-6-flash`.
- GPT-6 Astra verlangt zwingend ein Reasoning-Niveau (kein `none`); im Chat-Request wird für dieses Modell mindestens `low` gesendet, der Regler blendet "Aus" dort aus.
- Frontend-Fehlerpfad in `src/pages/AITextStudio.tsx` zeigt die Server-Meldung wie bisher, nur eben eine verständliche.
- Nicht angefasst: Wallet, Refunds, Routing, Persistenz, Branch-Logik, Lip-Sync.

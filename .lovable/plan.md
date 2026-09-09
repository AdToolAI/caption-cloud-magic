# Text-Studio: Fehler beheben, Modelle aktualisieren, Abo-Gate

## 1. Der Fehler "estInputTokens is not defined"

Bestätigte Ursache: In der Chat-Funktion des Text-Studios wird beim Start der Antwort ein Wert für die geschätzten Eingabe-Tokens verwendet, den es nicht mehr gibt — er wurde entfernt, als das Text-Studio auf "kostenlos" umgestellt wurde. Dadurch bricht jede Anfrage ab, sobald der Anbieter zu antworten beginnt, und der Nutzer sieht nur die technische Meldung.

Fix: Die Schätzung wird direkt aus den tatsächlich gesendeten Nachrichten (inkl. Systemtext) berechnet, bevor der Stream startet. Die echten Token-Zahlen des Anbieters überschreiben sie danach wie bisher. Falls doch etwas schiefgeht, sieht der Nutzer künftig eine verständliche Meldung in EN/DE/ES statt eines Programmierbegriffs.

## 2. Modelle aktualisieren

| Anbieter | Stufe | Heute | Aktuell? | Vorschlag |
| --- | --- | --- | --- | --- |
| OpenAI | Schnell | GPT-5.6 Luna | ja | bleibt |
| OpenAI | Ausgewogen | GPT-5.6 Terra | ja | bleibt |
| OpenAI | Maximum | GPT-5.6 Sol | ja | bleibt |
| OpenAI | Höchststufe | — | fehlt | **GPT-6 Astra** ergänzen |
| Google | Schnell | Gemini 3.1 Flash Lite | ja | bleibt |
| Google | Ausgewogen | Gemini 3.6 Flash | veraltet | auf **Gemini 3.8 Flash** heben |
| Google | Maximum | Gemini 3.1 Pro | ja | bleibt |
| Anthropic | Maximum | Claude 4.1 Opus | eigener Schlüssel | bleibt unverändert |

Alte Auswahlen werden automatisch auf das jeweilige Nachfolgemodell gelegt; gespeicherte Chats bleiben erhalten.

## 3. Preise raus, Abo-Gate rein

- Alle Preisangaben im Text-Studio verschwinden aus der Oberfläche: keine "€ pro 1k Tokens" bei den Modellkarten, keine Kostenvorschau-Badge, keine Kosten im Verlauf. Für Abonnenten ist das Text-Studio inklusive.
- Das gesamte Text-Studio (Chat und Modell-Vergleich) wird abo-pflichtig — genau wie Topaz, über dieselbe eine Entscheidungsquelle, kein zweites Premium-System.
- Der Kunde sieht weiterhin alles: Modelle, Stufen, Beschreibungen, Einstellungen. Erst beim Absenden einer Nachricht (bzw. Start eines Vergleichs) erscheint für Nicht-Abonnenten dieselbe Upgrade-Meldung wie bei Topaz. Eingegebener Text und gewählte Einstellungen bleiben dabei erhalten.
- Serverseitig wird ohne aktives Abo gar keine Anbieter-Anfrage gestellt: Antwort mit strukturiertem Fehler `TEXT_STUDIO_PREMIUM_REQUIRED`, keine Konversation angelegt, keine Kosten.
- Bestehende Ausnahmen bleiben: Creator-Konten, Test-Modus-Pläne, Out-of-Band-Pläne und die Test-Nutzer-Liste gelten weiter als berechtigt.

## Technische Details

- `supabase/functions/text-studio-chat/index.ts`: `estInputTokens` durch eine lokale Schätzung aus `sysMsg + cleanMessages` ersetzen (`estimateTokens` existiert bereits); Catch-Zweig liefert eine lokalisierte Meldung, Details nur ins Log.
- Abo-Prüfung über `supabase/functions/_shared/subscription-entitlement.ts` (identisch zu Topaz), in `text-studio-chat` und `text-studio-compare` **vor** Konversationsanlage und Provider-Aufruf; 403 mit `{ code: "TEXT_STUDIO_PREMIUM_REQUIRED" }`.
- Client-Gate nur als UX: `useAuth().subscribed` / `useTrialAccess().isPaid` (nicht `hasFullAccess`), gleiches Upgrade-Dialog-Muster wie im `EnhanceVideoPanel`.
- Registry-Update parallel in `src/lib/text-studio/models.ts`, `text-studio-chat` und `text-studio-compare` (`PRICING`, `PROVIDER_MAP`), plus Alias `google-gemini-3-6-flash` → `google-gemini-3-8-flash`.
- GPT-6 Astra verlangt zwingend ein Reasoning-Niveau (kein `none`); für dieses Modell wird mindestens `low` gesendet und "Aus" im Regler ausgeblendet.
- Preisfelder bleiben intern für die Telemetrie erhalten, werden aber in `src/pages/AITextStudio.tsx` und den Modellkarten nicht mehr angezeigt (`estimateCost`/`formatEUR`-Anzeigen entfernen).
- Tests: Gate erlaubt Abonnent/Creator/Test-Nutzer, blockt Free-Nutzer auch bei direktem API-Aufruf; Registry-Parität Client/Server.
- Nicht angefasst: Wallet, Refunds, Video-Routing, Persistenz der Chats, Branch-Logik, Lip-Sync.

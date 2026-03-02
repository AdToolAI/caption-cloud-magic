
Zustand nach Analyse (klar bestätigt):
- Der Fehler ist echt weiterhin reproduzierbar beim neuesten Run (`td2sb6zjhl` / Lambda-`renderId` `w1x1dfzovl`).
- In euren eigenen Diagnosen ist **nur** `framesPerLambda` gesetzt, **kein** `concurrency` / `concurrencyPerLambda`.
- Trotzdem wirft Lambda: `Both 'framesPerLambda' and 'concurrency' were set`.

Warum das trotz „sauberem“ Payload passiert:
- In Remotion `@remotion/serverless-client@4.0.424` (nachweisbar in `validate-frames-per-function.js`) ist die Prüfung:
  - `if (concurrency !== null && framesPerFunction !== null) throw ...`
- Wenn `concurrency` **fehlt**, wird es intern `undefined` und `undefined !== null` ist `true`.
- Mit gesetztem `framesPerLambda` ist damit die Bedingung erfüllt, obwohl wir `concurrency` nie explizit senden.
- Unsere aktuelle Strategie „`concurrency` löschen“ erzeugt genau diesen Zustand.

Umsetzung (gezielter Fix):
1) `supabase/functions/_shared/remotion-payload.ts` robust auf „null-safe scheduling“ umstellen
- Nicht mehr `concurrency` löschen.
- Stattdessen immer explizit serialisieren:
  - `concurrency: null` (wenn `framesPerLambda` genutzt wird)
  - `framesPerLambda` wie bisher explizit setzen (berechnet oder übergeben)
  - `concurrencyPerLambda` weiterhin entfernen/neutralisieren, damit keine zweite Scheduling-Schiene aktiv wird.
- Ziel: Remotion bekommt `concurrency === null` statt `undefined`, damit die Konfliktprüfung nicht fälschlich triggert.

2) Typen und Diagnostik anpassen (gleiche Datei + Invoker)
- `NormalizedStartPayload` um `concurrency?: number | null` ergänzen.
- `payloadDiagnostics` um Scheduling-Werte erweitern (`framesPerLambda`, `concurrency`, `concurrencyPerLambda`), damit im nächsten Fehlerfall sofort sichtbar ist, ob `null` korrekt angekommen ist.

3) `supabase/functions/invoke-remotion-render/index.ts` Guard präzisieren
- Guard so lassen, dass nur echte Doppelbelegung blockiert (`!= null`-Logik beibehalten), aber zusätzliche Forensik speichern:
  - `payload_key_flags` + `scheduling_strategy` + explizite `scheduling_values` (`{framesPerLambda, concurrency, concurrencyPerLambda}`) in `content_config`.
- Dadurch sieht man in DB eindeutig „concurrency: null“ vs. „undefined/fehlend“.

4) Keine Caller-Änderungen nötig
- `auto-generate-universal-video` / `render-directors-cut` / andere Flows bleiben unverändert, da der zentrale Normalizer alle Pfade korrigiert.

Validierung nach Fix:
1. Frischen Run starten (kein Retry alter ID).
2. In `universal_video_progress.result_data.lambdaPayload` prüfen:
- `framesPerLambda` vorhanden
- `concurrency` **explizit `null`**
- `concurrencyPerLambda` nicht gesetzt
3. In `video_renders.content_config` prüfen:
- `payload_key_flags.hasFramesPerLambda = true`
- `payload_key_flags.hasConcurrency = false`
- `scheduling_values.concurrency = null`
4. Erwartetes Ergebnis:
- Kein `Both 'framesPerLambda' and 'concurrency' were set`
- Statusfluss endet in `completed`.

Technischer Hinweis (wichtig):
- Das ist kein Bundle-Deploy-Problem.
- Es ist ein Null-vs-Undefined-Kompatibilitätsproblem im Lambda-Scheduling-Validator.
- Der Fix adressiert genau diese Stelle mit explizitem `null` statt Feldentfernung.

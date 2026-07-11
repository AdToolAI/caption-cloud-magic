## Problem

Im Production-Plan-Sheet werden aktuell **alle Briefing-Zeilen als Dialog-Turns** angezeigt — inklusive Regie-Anweisungen wie:
- „AUTO-DIRECTOR (synthesize full screenplay…)"
- „Cinematic, realistisch"
- „15 Sekunden"
- „1 durchgehende Szene", „1 Hauptfigur"
- „Düster, intensiv, realistisch, hochwertig"
- „0 bis 15 Sekunden", „oder Game-Look", „und Trümmergeräusche"

Diese sind für den Kunden **verwirrend** und wirken unprofessionell. Der Kunde soll nur sehen:
1. Das eigentliche gesprochene Skript (Dialog-Turns mit Speaker + Text)
2. Optional: Kurze Szenen-Beschreibung (Action/Setting) — aber nicht als „Sprecher-Zeile"

## Ursache

Zwei zusammenwirkende Punkte:
1. **Server (`briefing-deep-parse`)**: Fällt bei kurzen One-Take-Briefings in einen Modus, der jede Briefing-Zeile als eigenen Dialog-Turn emittiert und dem ersten (oder Default-)Sprecher zuordnet.
2. **Client (`ProductionPlanSheet.tsx`)**: Rendert stumpf jeden `dialogTurns[]`-Eintrag ohne Filter für Regie-Metadaten (Style-Adjektive, Timing-Angaben, Look-Notizen, AUTO-DIRECTOR-Marker).

## Fix — UI-only Sanitizer (nicht-invasiv)

Reine Präsentations-Fixes im Client. Keine Server-Änderung, keine DB-Migration, keine Pipeline-Logik.

### 1. `src/lib/motion-studio/planDisplayFilter.ts` (neu)

Helper `isDirectiveTurn(text)` — erkennt Regie-Rauschen und filtert es aus der Anzeige:
- Marker: `AUTO-DIRECTOR`, `synthesize full screenplay`, `Take A aufnehmen`
- Timing-only: `^\d+\s*Sekunden$`, `^0\s*bis\s*\d+\s*Sekunden$`
- Struktur-only: `^\d+\s*(Hauptfigur|durchgehende\s*Szene|Sprecher|Shot)`
- Reine Style-Adjektiv-Ketten ohne Verb (z.B. „Düster, intensiv, realistisch, hochwertig", „Cinematic, realistisch") → Heuristik: nur Adjektive/Kommas, ≤ 6 Tokens, kein Verb, kein Punkt
- Fragmente die mit „oder ", „und " beginnen und < 4 Wörter haben

Zweiter Helper `getVisibleTurns(scene)` — gibt gefilterte Liste zurück, behält aber `_hiddenCount` für Telemetrie.

### 2. `src/components/video-composer/ProductionPlanSheet.tsx`

- Turn-Liste durch `getVisibleTurns(scene)` ersetzen.
- Falls nach Filter **keine Turns** übrig bleiben, kurzen Hinweis rendern: „Regie-Notizen ausgeblendet — Skript wird aus dem Briefing generiert."
- Existierende „Sprecher-Zuordnung fehlt"-Guards greifen weiterhin auf `dialogTurns` (die echten, unfilterten) zu — Apply-Logik unverändert.

### 3. Szenen-Beschreibung separat

Falls die Szene ein `sceneAction` / `description`-Feld hat, dies **einmal oben** in der Karte als kursiver Regie-Hinweis anzeigen (nicht als Sprecher-Zeile).

## Verifikation

- Screenshot-Case (aktueller Upload): Nur noch echte gesprochene Zeilen sichtbar (Samuel, Matthew, Sarah, Kailee mit ihren tatsächlichen Skript-Sätzen). Alle „1 Hauptfigur / Düster, intensiv / 15 Sekunden"-Zeilen verschwinden.
- Multi-Speaker-15s-Briefing: 4 echte Turns sichtbar, keine Style-Zeilen.
- Sprecher-Bind-Warnung erscheint weiterhin korrekt, wenn echte Turns keine `speakerCharacterId` haben.

## Out of Scope

- Server-Parser bleibt unverändert (v221/v222 Pipeline berührt).
- Keine Änderung an Apply-Logik, Ensemble-Guards, Lipsync-Pipeline.
- Falls du willst, kann ich in Phase 2 den Parser (`briefing-deep-parse`) so hardhen, dass diese Regie-Zeilen gar nicht erst als Turns emittiert werden — aber das ist riskanter und der UI-Filter reicht für den Kunden-Eindruck.

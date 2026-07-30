## Ziel

Im Regietisch (KI Autopilot) darf es keine Zustände „Dialog ohne zugeordneten Sprecher“ / „Dialog ohne Stimme“ mehr geben. Wenn der Kunde nichts auswählt, entscheidet die KI. Zusätzlich bekommt jeder Warteprozess einen sichtbaren Ladebalken.

## 1. Auto-Casting (Sprecher wird nie leer)

Serverseitig in `autopilot-treatment`:
- Nach dem ID-Lock: Szenen mit Dialog/Turns ohne gültigen Sprecher bekommen automatisch einen zugewiesen — bevorzugt aus den in der Szene vorkommenden Charakteren, sonst aus dem gesamten Cast des Nutzers (Round-Robin, damit nicht immer derselbe spricht).
- Hat der Nutzer gar keine Charaktere hinterlegt: Cast & World des Nutzers wird geladen und die KI-Auswahl trifft daraus die Besetzung (passend zu Beat/Stimmung). Existiert überhaupt kein Charakter, wird der Dialog als reines Voiceover (Erzählerstimme, kein Lip-Sync) markiert statt als Fehler.
- Turns, deren Sprecher nicht in `characterIds` steht, werden künftig in die Szene aufgenommen statt verworfen.

## 2. Auto-Stimme (Stimme wird nie leer)

Neue Datei `src/lib/autopilot/autoVoice.ts`:
- Löst für jeden Charakter die Stimme in dieser Reihenfolge auf: `brand_characters.default_voice_id` → automatische Auswahl aus der Voice-Bibliothek passend zu Projektsprache, Geschlecht und Alter des Charakters → globale Fallback-Stimme der Sprache.
- Innerhalb einer Szene wird sichergestellt, dass zwei Sprecher nie dieselbe Stimme bekommen.
- Die automatisch gewählte Stimme wird im Storyboard sichtbar als „automatisch gewählt“ markiert und bleibt manuell überschreibbar.

## 3. Preflight entschärfen

In `src/lib/autopilot/preflight.ts`:
- `dialogue_no_speaker`, `turn_no_speaker`, `dialogue_no_voice`, `turn_no_voice` werden von `block` zu `warn` — sie können nach der Auto-Zuweisung nur noch auftreten, wenn wirklich nichts auflösbar war, und dürfen die Freigabe nicht mehr blockieren.
- `speaker_not_in_scene` wird automatisch geheilt (Sprecher wird der Szene hinzugefügt) statt zu blockieren.
- Der rote Fehlerkasten im Storyboard zeigt Warnungen künftig dezent gelb mit Klartext („Stimme automatisch gewählt“) statt als Blocker.

## 4. Anzeigefehler „undefined · undefined · undefined“

`describeScene()` in `promptGrammar.ts` gibt `undefined` aus, sobald das LLM einen Wert außerhalb der bekannten Listen liefert (z. B. `shotSize: "extreme wide"`). Fix: Normalisierung mit Fallback auf Standardwerte, sodass immer eine lesbare Kamera-Zeile erscheint.

## 5. Ladebalken für jeden Warteprozess

Neue kleine Komponente `src/components/autopilot/StageProgressBar.tsx` (unbestimmter Gold-Sweep + optionaler Prozentwert, Design-Tokens, kein hartkodiertes Weiß/Gold):
- **Treatment entwickeln**: Balken mit Phasentext („Konzept … Szenen … Dialoge“) statt nur Spinner-Button.
- **Produktion startet**: Balken während des Orchestrator-Calls.
- **Pro Szene** in `ProductionStage`: schmaler Fortschrittsbalken je Karte, gespeist aus dem Szenenstatus (Bild 33 % → Bewegung 66 % → Lip-Sync 85 % → fertig 100 %), inklusive Pulsanimation bei laufenden Schritten.
- **Endschnitt/Finalisierung**: eigener Balken mit Zeitschätzung, damit die Phase nicht „hängend“ wirkt.
- **Kostendialog/Wallet-Abfrage**: Skeleton-Balken statt leerem Bereich.

## Technische Details

- Betroffene Dateien: `supabase/functions/autopilot-treatment/index.ts`, `src/lib/autopilot/preflight.ts`, `src/lib/autopilot/promptGrammar.ts`, neu `src/lib/autopilot/autoVoice.ts`, `src/components/autopilot/DirectorsTable.tsx`, `src/components/autopilot/ProductionStage.tsx`, neu `StageProgressBar.tsx`.
- Voice-Auswahl nutzt die bestehende `list-voices` Edge Function inkl. strikter Sprachfilterung und `voice-languages.ts`.
- Keine Änderung an Abrechnung, Orchestrator-Logik oder Render-Pfad.

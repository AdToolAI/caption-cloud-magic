# Status: Briefing → Storyboard Pipeline

## Was jetzt lückenlos ist

**Eingabe → Parsing**
- Cast-Mentions inkl. `(library:UUID)` werden korrekt extrahiert (Regex-Fix v213)
- LITERAL-Mode erkennt `NAME:`-Skripte und schickt `## Verbatim Script` an den Server
- `ScriptSpeakerMapper` erlaubt manuelles Mapping mit `[manual]`-Override
- `## Speaker Map`-Block landet im LLM-Prompt

**Server-Seite (`briefing-deep-parse`)**
- Temperature 0.1 (deterministisch)
- LITERAL_LOCK-Prompt bei Skript-Erkennung
- `enforceStrictCast` verwirft halluzinierte Sprecher
- `enforceBriefingFidelity` repariert 1:1-Dialoge via Fuzzy-Match
- `ensureProductionPlanEnsembleServer` immutable + Ensemble-Garantie
- `voice_pool` für Cross-Scene-Konsistenz
- `parser_meta` mit Telemetrie (strict_cast, ensemble, fidelity)

**Plan → UI**
- `planCastDedup` (characterId + normalisierte Namen)
- `PLAN_UUID_RE`-Guard verhindert Slug-Leaks
- `outfitLookId` bleibt bei Merge/Ensemble-Injection erhalten
- `moodSuffix` wird aus gesprochenem Text gestrippt
- Positional Labels statt „Unbenannter Look"
- Badge „Skript 1:1 übernommen" mit Match-Stats

## Bekannte Rest-Risiken (nicht kritisch)

1. **Gemini-Flakes ohne Retry** — bei 5xx/Timeout fällt der Server auf Local-Fallback, aber ohne zweiten Versuch. Kunde sieht dann evtl. schwächeren Plan.
2. **Keine Plan-Versionierung** — wenn der Kunde nochmal parst, wird der alte Plan überschrieben. Kein Rollback.
3. **Kein sichtbares Debug-Panel** — `parser_meta` wird geloggt, aber nicht angezeigt. Bei zukünftigen Fehlerberichten musst du in die Logs.
4. **Keine automatischen E2E-Tests** — jeder Fix wurde manuell verifiziert. Regressionen könnten stillschweigend zurückkommen.

## Vorschlag — 3 optionale Härtungen

### G-1: Gemini Retry mit Backoff (30 Min)
`briefing-deep-parse`: bei 429/5xx/Timeout einen zweiten Versuch mit 1.5s Delay, bevor Local-Fallback greift. Reduziert „mal geht's, mal nicht"-Fälle spürbar.

### T-1: Debug-Chip im Summary-Footer (20 Min)
`BriefingPlanSummary.tsx`: kleiner ausklappbarer Chip mit `parser_meta` (Modell, strict_cast-Drops, fidelity-Matches, ensemble-Injections). Nur bei `?debug=1` sichtbar. Macht künftige Fehleranalyse selbstständig möglich.

### P-1: Plan-Snapshot vor Re-Parse (45 Min)
Vor jedem neuen Parse den aktuellen Plan als `previousPlan` sichern + „Rückgängig"-Button. Kein Verlust bei versehentlichem Re-Analyze.

## Empfehlung

Die Pipeline ist **funktional lückenlos** für den Beta-Launch. Die vier Risiken oben sind Komfort/Resilienz, keine Bugs.

**Frag mich:**
- „G-1" → nur Retry (der wichtigste — reduziert flaky runs)
- „G-1 + T-1" → Retry + Debug (empfohlen für Beta)
- „alle drei" → volles Härtungspaket
- „reicht so" → wir sind fertig, weiter mit anderem Thema

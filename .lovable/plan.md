# Tiefenanalyse: Briefing → Production Plan

## Verifikation: läuft die J1-Detektion überhaupt richtig?

Der Detector wurde standalone gegen dein Briefing gefahren (nur die Shot-1A…3B-Blöcke mit „Zeit: ca. 0–2,5 Sekunden"-Zeilen):

```
mode = SHOT_MARKERS
shots = 6
total = 15
1 Sprecher 1  dur=2.5
2 Sprecher 2  dur=2.5
3 Sprecher 3  dur=2.5
4 Sprecher 4  dur=2.5
5 (Showcase)  dur=2.5
6 (Endcard)   dur=2.5
```

**Der Code ist korrekt.** Deine Screenshots zeigen aber „3 Shots · 30s". Der Chip liest `scriptTiming.mode + shots` direkt aus der Edge-Function-Antwort → das heißt: **die aktuell laufende Edge-Function ist noch die pre-J1-Version.** Ohne Redeploy kann die beste Logik nichts ändern.

## Restliche echte Bugs (unabhängig vom Deploy)

Nach dem Deploy laufen 6 Szenen à 2,5 s durch, aber diese Downstream-Lecks bleiben:

| # | Symptom im Screenshot | Ort | Ursache |
|---|---|---|---|
| B1 | "Samuel, Matthew, Sarah and Kailee share the scene together" oben im Anker-Prompt jeder Solo-Szene | `enforceSoloCast.ts` `ENSEMBLE_FIELDS` | `anchorPromptEN` + `anchor_prompt_en` fehlen in der Scrub-Liste, nur `visual/action/prompt/aiPrompt` werden gereinigt |
| B2 | Voice-Chip zeigt „George AI" / „Roger AI" statt Charakter-Voice | `useApplyProductionPlan.ts:659-660` | Hard-coded fallback `voiceName: … ?? 'George'` und `voiceId: … ?? 'JBFqnCBsd6RMkjVDRZzb'` — wenn Character keine `default_voice_id` hat, wird „George" per Konstante eingesetzt |
| B3 | Location „— nicht zugeordnet —" obwohl im Briefing „Moderne Stadtstraße" / „Modernes Büro" / „Café" / „Creator-Studio" stehen | `index.ts` Pass B Resolver | Bei Miss gegen Library wird `location.description` **nicht** aus dem Shot-Block gefüllt — bleibt `null`, UI zeigt „nicht zugeordnet" |
| B4 | Shot 3A (Showcase) fehlt komplett bzw. bekommt Ensemble-Trim geklaut | Detector | `extractBySubShotMarkers` erkennt Shot 3A/3B, aber ohne `Text:`-Zeile → `dialogTurns=[]`. Kein Marker `sceneKind` gesetzt → Downstream weiß nicht „no Lip-Sync, alle 4 Cast" bzw. „no Cast, Endcard-Overlay" |
| B5 | Endcard (Shot 3B) landet als normale Lip-Sync-Szene mit random Speaker | dito | Kein `sceneKind:'endcard'` → Apply-Hook baut trotzdem Lip-Sync-Cast |
| B6 | Chip „Skript-Timing verwendet · 3 Shots" während Sheet 3 Szenen zeigt | schon fixiert (`plan.scenes.length`) | wird nach Deploy passen |

**Kein Bug**: „AdTool AI Speaker" beim Anwenden — das ist der D-Fallback wenn *keine* Character-Voice existiert. Nach B2-Fix wird `voice=null` gesetzt und der User wählt im Studio.

## Plan

### Phase 0 — Deploy (blockiert alles andere)
- `briefing-deep-parse` Edge-Function neu deployen. Kein Codeänderung nötig — J1 ist im Repo, läuft aber nicht live.
- Verifikation über die Debug-Response: `script_timing.mode === 'SHOT_MARKERS'` und `shots === 6`.

### Phase 1 — Anchor-Prompt-Scrub (B1)
`supabase/functions/briefing-deep-parse/enforceSoloCast.ts`:
- `ENSEMBLE_FIELDS` um `anchorPromptEN`, `anchor_prompt_en`, `anchorPrompt`, `promptEN`, `prompt_en`, `sceneAnchor`, `voiceover.text` (nested) ergänzen.
- Nested-Reinigung: bei `voiceover.text` und `voiceover.description` mit dem gleichen Scrubber durchlaufen.
- Ensemble-Regex um zwei Varianten erweitern: `each\s+with\s+(?:their|his|her)\s+own\s+action` und Namens-Enumerationen mit Bindestrich-Nachnamen (`Samuel Dusatko, Matthew Dusatko…`).

### Phase 2 — Voice-Fallback entgiften (B2)
`src/hooks/useApplyProductionPlan.ts` ~Zeile 655–665:
- `voiceName: v.voiceName ?? next.voiceover?.voiceName ?? 'George'` → nur setzen wenn Library-Character eine `default_voice_id`/`voiceName` hat; sonst **beides null** lassen.
- `voiceId: v.voiceId ?? next.voiceover?.voiceId ?? 'JBFqnCBsd6RMkjVDRZzb'` → gleiches Muster, keine Konstante mehr.
- Chip „Auto-Voice beim Anwenden" bleibt nur wenn `voiceId===null` und Character existiert.
- Kein Behaviour-Change für Szenen, die eine echte Library-Voice haben.

### Phase 3 — Location-Freetext (B3)
`supabase/functions/briefing-deep-parse/index.ts` Pass B, direkt nach dem Library-Resolver:
- Pro Szene den zugehörigen Sub-Shot-Block aus `scriptTiming.shots[i]` heranziehen (Text bereits in `scriptTiming.shots[i]._blockText` zu ergänzen im Detector).
- Erste Zeile die mit `/^(location|setting|ort|schauplatz)\s*:?/i` matcht → als `location.description` schreiben, wenn kein `locationId` gebunden ist.
- Fallback: „Bild:"-Zeile (Briefing nutzt oft dieses Muster) mit den ersten 200 Zeichen bis zum Punkt.
- Freetext bleibt Englisch für Prompt-Konsistenz (bereits Regel im Memory).

### Phase 4 — Showcase & Endcard-Marker (B4/B5)
`detectScriptTimingMode.ts` — im `extractBySubShotMarkers`:
- Wenn `mk.head` „Showcase", „Split-Screen", „Multi-Speaker" enthält → `sceneKind: 'ensemble_showcase'`, `cast=[]` (Downstream füllt alle 4), `lipSync: false`.
- Wenn `mk.head` „Endcard", „Branding", „Outro", „CTA" enthält **und** keine Text-Zeile gefunden wurde → `sceneKind: 'endcard'`, `cast: null` (Marker für Pass B), `lipSync: false`, `overlayText` aus dem Block extrahieren (`Text:` / `Endcard Text:`).
- Zusätzliches Feld in `DetectedShot` + `ScriptTimingInfo`. In `index.ts` beim Seeden auf die Scene übernehmen (`sc.sceneKind`, `sc.engine='broll'`, `sc.lipSync=false`).
- Apply-Hook (`useApplyProductionPlan.ts`) respektiert `sceneKind==='endcard'` → keine Voice-Zuweisung, keine dialogTurns.

### Phase 5 — Verifikation (kein Code, aber Teil des Plans)
Nach Deploy: dasselbe Briefing durchlaufen, prüfen:
1. Chip: „6 Shots · 15s"
2. S01–S04 jeweils 2,5 s, ein Speaker, kein „share the scene"-Satz im Anker-Prompt
3. S05: alle 4 Charaktere im Cast, `sceneKind=ensemble_showcase`, kein Lip-Sync
4. S06: kein Cast, kein Lip-Sync, `overlayText` gesetzt
5. Voices: entweder Library-Voice pro Charakter oder leer (**nie** „George/Roger")
6. Locations: Freetext („Modern city street …" etc.) statt „nicht zugeordnet"

## Betroffene Dateien
- `supabase/functions/briefing-deep-parse/detectScriptTimingMode.ts` (Phase 4 — Showcase/Endcard)
- `supabase/functions/briefing-deep-parse/enforceSoloCast.ts` (Phase 1 — Anchor-Scrub)
- `supabase/functions/briefing-deep-parse/index.ts` (Phase 3 — Location-Freetext, Phase 4 Seeding)
- `src/hooks/useApplyProductionPlan.ts` (Phase 2 — Voice-Fallback, Phase 4 sceneKind)
- Deploy `briefing-deep-parse` (Phase 0)

## Kein Fix nötig (bewusst außen vor)
- Detector-Logik selbst — bereits korrekt, nur nicht deployed
- Reducer / Scene-Count-Guard in `index.ts` — greift korrekt sobald Detector 6 Shots liefert
- BriefingPlanSummary-Chip — liest bereits `plan.scenes.length`
- ScriptSpeakerMapper — bereits gehärtet

Sag „go" und ich baue Phase 0–4 in einem Rutsch.

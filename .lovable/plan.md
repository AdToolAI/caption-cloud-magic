
# v243 — False-Fallback im Briefing-Analyzer beheben

## Diagnose (aus Edge-Logs + Client-Code)

Server-Seite (Edge Fn `briefing-deep-parse`) war für dieses Briefing **nicht offline**:

- 3 erfolgreiche Requests innerhalb 15 s
- Pass A (Gemini 2.5 Flash) ok, Pass B ok
- Plan-Summary: 3 Szenen × 5 s, `cinematic-sync`, cast 1 (VO)
- v1, v2, v3 persistiert in `composer_production_plans`

Client-Seite (`useStoryboardTransition.ts`) fiel trotzdem in `buildLocalFallbackPlan`, das setzt `_meta.source = 'local-fallback'`. Der `ProductionPlanSheet` zeigt darauf den gelben „Lokaler Fallback-Plan"-Badge + „AI-Analyse war offline".

Wahrscheinliche Ursache: `parsePlan` → `ProductionPlan.safeParse` verwirft die Server-Antwort wegen eines Feldes, das der Server anders schreibt als das Zod-Schema erwartet (z. B. `_meta.source` mit anderem String, striktere `voice`/`captions`-Enums, unbekannte Top-Level-Felder aus neueren Server-Passes). Fällt der erste Fetch in Validation-Fail → Catch → Grace-Window 45 s → Late-Arrival kommt zwar zurück (v3), aber ebenfalls im gleichen Validator → Grace-Timer öffnet Fallback zuerst.

## Ziele

1. Kein „Lokaler Fallback-Plan"-Badge, wenn der Server einen validen Plan geliefert hat.
2. Root-Cause identifizieren statt weiter unterdrücken (Diagnose-Log auf `warn`, nicht nur `error.flatten()`).
3. Zod-Schema toleranter machen ohne die Lip-Sync-Invarianten aufzuweichen.

## Umsetzung

### 1. Diagnose härten — `useStoryboardTransition.ts`
- In `parsePlan` bei Fehlern die **rohen `data`-Keys** und die ersten 5 `parsed.error.issues` mit `path`+`code`+`message` loggen (bisher nur `flatten()`).
- Response-Body zusätzlich als Preview (erste 500 Zeichen) loggen, damit sichtbar ist, was Server tatsächlich schickt.
- Beim Erfolg `_meta.source = 'ai'` explizit setzen, falls Server es weglässt.

### 2. Schema entschärfen — `src/lib/video-composer/briefing/productionPlan.ts`
- `ProductionPlan` bekommt `.passthrough()` auf Top-Level und auf `PlanMeta`, damit neue Server-Felder (`script_timing`, `duration_auto_extend`, etc.) den Parser nicht killen.
- `PlanVoice.provider` von `z.literal('elevenlabs')` auf `z.string().optional()` lockern (Provider-Feld ist rein informativ, kein Enum-Grund für harten Fail).
- `PlanUnresolved.severity` mit `.catch('warn')` versehen, damit unbekannte Severity-Werte nicht die ganze Validierung sprengen.

### 3. Fallback-Semantik korrigieren
- `_meta.source` bekommt einen dritten Wert: `'ai-partial'`, gesetzt wenn `dropped > 0` (heißt: AI-Plan mit Teilverlust — kein „offline"-Badge).
- Fallback-Badge im `ProductionPlanSheet.tsx` nur bei `source === 'local-fallback'` (bleibt so). Kein Text-Change nötig.

### 4. Late-Arrival-Übernahme sicherstellen
- Wenn `lateArrival` einen validen Plan liefert **nach** bereits geöffnetem Fallback-Sheet: aktueller Code zeigt Toast „Vollständiger Plan nachgeladen — bitte erneut anwenden". Damit User es nicht übersieht, `latePlan` mit `_meta.source='ai'` überschreiben und ein Debug-Log ausgeben.

### 5. Kein Backend-Change
Server-Antwort ist korrekt — nur der Client-Guard ist zu streng. Keine Änderung an `briefing-deep-parse/index.ts`, keine Migration, keine Kredit-/Lipsync-Pfade.

## Betroffene Dateien

- `src/hooks/useStoryboardTransition.ts` (Diagnose-Log, `source:'ai'`-Setter, `ai-partial`)
- `src/lib/video-composer/briefing/productionPlan.ts` (Schema-Lockerung + passthrough)
- (optional) `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — nichts nötig

## Verifikation

1. Briefing des Users erneut analysieren → gelber „Fallback"-Badge muss verschwinden, Plan zeigt AI-Werte.
2. In der Konsole: `[useStoryboardTransition] deep-parse OK { source: 'ai', dropped: 0 }`.
3. Bei einem künstlich fehlerhaften Server-Response (test): Log listet exakte Zod-Path-Probleme — kein Silent-Fail mehr.

## Nicht in Scope

- Ensemble-/Solo-Repair-Änderungen
- Sync.so / Lip-Sync-Pipeline
- Prompt-Text-Änderungen

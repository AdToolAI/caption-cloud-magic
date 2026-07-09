## Stand nach Phase 1, 2, 6

Live und grün:
- Server ist alleinige Autorität für Timing/Scene-Count (`briefing_contract` in `plan._meta.debug`).
- Client (`useStoryboardTransition`) zieht den Contract vor eigener Regex.
- Shared Helper: `assetKeyUtils.ts`, `planContinuity.ts` (6 Duplikate ersetzt).
- 12/12 Tests grün, Typecheck grün.

## Was noch offen ist (Phase 3, 4, 5, 7, 8, 9)

### Phase 3 — Client-Detektoren als Fallback markieren
`detectScriptTimingMode.ts` und `detectCanonicalBriefingTiming.ts` laufen bei jedem Sheet-Render mit. Wenn der Server-Contract da ist, sollen sie skippen. Verhindert dass alte Regex-Bugs jemals wieder gewinnen.

### Phase 4 — `ProductionPlanSheet` entkernen
Aktuell wickelt das Sheet den Plan in `safePlan` via `useMemo`, was bei jedem Edit erneut `finalizePlanCanonical` triggert und Cursor-Springer/Sync-Bugs erzeugt hat. Finalize nur noch:
1. einmal beim Empfang vom Server,
2. einmal im Apply-Guard.
Sheet arbeitet direkt auf dem Plan.

### Phase 5 — Apply-Pfad vereinheitlichen
`useApplyProductionPlan` und `useStoryboardTransition` haben je eigene Guards. Ein zentraler `applyPlanToStoryboard(plan, project)` mit dem Finalize-Guard drin, beide Call-Sites nutzen ihn.

### Phase 7 — `BriefingTab` auf einheitliche Edge-Function
Aktuell zwei Aufrufpfade (Deep-Parse + Legacy-Fallback). Nur noch `briefing-deep-parse`, Fallback lokal nur wenn Edge-Function 5xx.

### Phase 8 — Zod-Schema härten
`ProductionPlan` erlaubt `unknown` an zu vielen Stellen (`_meta` komplett offen, `cast[].shotType` als String statt Enum). Enger typisieren, damit fehlerhafte Server-Payloads am Schema abprallen.

### Phase 9 — Regression-Tests & Version-Chip
- Golden-File-Tests für 3 kanonische Briefings (15s/1-scene, 15s/3-scene, 30s free-text).
- `CLIENT_PIPELINE_VERSION` bump auf 214, Debug-Chip zeigt Server- + Client-Version.

## Empfehlung Reihenfolge

Höchster Impact / niedrigstes Risiko zuerst:

1. **Phase 3** (5 min, rein defensiv) — killt latente Regex-Divergenz endgültig.
2. **Phase 9** (Tests + Version) — sichert das bisher Erreichte ab, bevor wir Sheet umbauen.
3. **Phase 4** (Sheet entkernen) — größter UX-Gewinn, aber invasivster Change.
4. **Phase 5** (Apply-Pfad).
5. **Phase 7** (BriefingTab).
6. **Phase 8** (Zod härten) — zum Schluss, wenn Payload-Shape stabil ist.

## Technische Notizen

- Phase 4 ist der einzige Schritt mit Regressionsrisiko (Sheet-State-Handling). Davor Golden-Tests aus Phase 9 anlegen.
- Phase 8 kann breaking sein für alte gespeicherte `composer_production_plans` — Migration via `.passthrough()` oder Version-Feld im Schema.
- Kein DB-Change nötig für 3, 4, 5, 7, 9. Phase 8 evtl. Migration je nach Strictness.

## Frage

Soll ich in der Reihenfolge 3 → 9 → 4 → 5 → 7 → 8 durchziehen, oder willst du eine andere Priorität? Wenn du "weitermachen" sagst, starte ich mit Phase 3 + 9 (klein, sicher, sofort).

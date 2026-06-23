# Bugfix: Plan-Validierung schlägt nach Pass B fehl (88 %)

## Root Cause

In `supabase/functions/briefing-deep-parse/index.ts` löscht der Helper `stripUndef` jeden Key, dessen Wert `undefined`, `null` oder `''` ist:

```ts
if (o[k] === undefined || o[k] === null || o[k] === '') delete o[k];
```

Die `ResolvedCast`- und `ResolvedLocation`-Objekte setzen aber bewusst `characterId: null` bzw. `locationId: null`, wenn Pass B nichts in der Library findet. Im Zod-Schema sind beide Felder **required nullable** (`z.string().nullable()`), nicht optional. Sobald `stripUndef` die `null`-Keys entfernt, fehlen die Pflichtfelder → Client wirft genau die Fehler aus dem Screenshot:

- `scenes.0.cast.0.characterId: Invalid input`
- `scenes.0.location.locationId: Invalid input`

Per-Scene-Recovery rettet hier nichts, weil **jede** Szene betroffen ist, sobald Pass B mindestens ein Cast/Location nicht auflöst — und genau das passiert bei jedem Test-Briefing ohne perfekt passende Library-Einträge.

## Fix (1 Datei, minimal)

`supabase/functions/briefing-deep-parse/index.ts`

1. `stripUndef` so anpassen, dass **nur `undefined`** entfernt wird (nicht `null`, nicht `''`). `null` ist im Plan-Schema ein gültiger Wert (nullable Felder), `''` ist für `voiceover.text` o.Ä. legitim.

```ts
function stripUndef<T extends Record<string, any>>(o: T): T {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
  }
  return o;
}
```

2. Sicherheits-Defaults beim Cast-Mapping, damit `characterId`/`locationId` garantiert `string | null` sind (nie `undefined`):

```ts
characterId: typeof rCast?.characterId === 'string' ? rCast.characterId : null,
locationId:  typeof r2?.locationId    === 'string' ? r2.locationId    : null,
```

3. Logging vor dem Response erweitern: pro Szene `cast.length`, `hasLocation`, `unresolvedCount` loggen, damit künftige 88 %-Hänger sofort sichtbar sind.

## Nicht angefasst

- Zod-Schema (`productionPlan.ts`) — bleibt strikt.
- Client-Recovery (`useStoryboardTransition`) — bleibt als zweite Verteidigungslinie.
- Lipsync-/Composer-Pipeline.

## Verifikation

Nach Deploy von `briefing-deep-parse` denselben Briefing-Flow auslösen → Production War Room sollte Pass B auf 100 % bringen und das Plan-Sheet öffnen.

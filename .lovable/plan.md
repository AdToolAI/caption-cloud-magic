# Fix: Briefing-Analyse produziert Duplikate & lässt Charaktere weg

## Ursachen (im Audit gefunden)

**Bug 1 — Regex verschluckt die Library-UUID.**  
`extractSelectedCastFromBriefing` in `supabase/functions/briefing-deep-parse/index.ts` (~Zeile 964) benutzt:
```
/@([a-z0-9][a-z0-9-_]{1,47})[^\n]*(?:\(library:([0-9a-f-]{36})\))?/gi
```
Das gierige `[^\n]*` frisst die gesamte Zeile inklusive `(library:UUID)`, bevor die optionale Group überhaupt versucht zu matchen. Ergebnis: `m[2]` ist **immer** `undefined`, obwohl `useStoryboardTransition.buildBriefingText` die UUID sauber mitschickt. Der "Required-Cast" für die Ensemble-Repair fällt damit auf Fuzzy-Namensmatch zurück — und wenn die Namen sich ähneln (4× "Xxx Dusatko"), matcht gar nichts mehr sauber. Kailee fehlt, ensemble-repair injiziert nichts.

**Bug 2 — Pass B halluzinierte Sprecher rutschen durch die Dedupe.**  
Gemini erfindet manchmal Dialogsprecher ("George", "Roger"), die nicht im Briefing stehen. Sie landen als Cast-Slots mit `characterId=null` und **eindeutigem** `mentionKey`. Die aktuelle `dedupeSceneCast` betrachtet unterschiedliche mentionKeys als unterschiedliche Slots → beide bleiben. Später resolved die UI diese unbekannten Mentions per Substring-Fallback auf den ersten "Dusatko" im Library → derselbe Charakter erscheint zweimal.

## Fix

Zwei chirurgische Änderungen in `supabase/functions/briefing-deep-parse/index.ts`, plus Deploy.

### 1. Regex Line-by-Line (`extractSelectedCastFromBriefing`, ~Z. 960–987)

Cast-Section zeilenweise durchlaufen und `@mention` **und** `(library:UUID)` separat matchen:
```ts
const UUID_RE = /\(library:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i;
const MENTION_RE = /@([a-z0-9][a-z0-9-_]{1,47})/i;
for (const rawLine of castSection.split('\n')) {
  const line = rawLine.trim();
  if (!line.startsWith('-')) continue;
  const mm = line.match(MENTION_RE); if (!mm) continue;
  const mentionKey = `@${mm[1]}`;
  const libId = line.match(UUID_RE)?.[1] ?? null;
  // …hit-Auflösung wie bisher, nur mit korrekt gefülltem libId
}
```
Damit trägt der Required-Cast wieder deterministische UUIDs — Kailee & Co. sind auffindbar, ensemble-repair injiziert fehlende Slots.

### 2. Strict-Cast-Pass (neu, direkt nach `ensureProductionPlanEnsembleServer`)

Neue Funktion `enforceStrictCast(plan, required)`, nur aktiv wenn `required.length >= 1` und **alle** Required-Slots eine `characterId` haben. Pro Szene:

- Slot mit `characterId` ∈ required → behalten
- Slot mit `characterId` ∉ required → **droppen** (halluzinierter Fremd-Sprecher)
- Slot ohne `characterId`, aber `mentionKey`/`characterName` normalisiert = required-Mention → **back-fillen** mit UUID+Voice
- Slot ohne match → droppen
- Danach `dedupeSceneCast` erneut aufrufen

Aufruf in `Deno.serve` direkt nach dem bestehenden `ensembleStats = ensureProductionPlanEnsembleServer(...)`-Block (~Z. 1710). Statistiken (`dropped`, `backfilled`) in `parser_meta` mit aufnehmen (analog `ensemble_repair`).

### 3. Deploy

`supabase functions deploy briefing-deep-parse` — reine Edge-Function-Änderung, kein Client-Code, kein Migration.

## Was NICHT angefasst wird

- `planCastDedup.ts` (Client) — bleibt Sicherheitsnetz, die Ursache liegt server-seitig.
- Pass A / Pass B Prompts — der Strict-Pass macht sie robust gegen Halluzinationen.
- `ensurePlanEnsemble.ts` (Client) — bleibt als Legacy-Plan-Fallback.
- `useApplyProductionPlan.ts` — UUID-Guard bleibt aktiv.

## Verifikation

Nach Deploy: Briefing mit 4 Charakteren (gleicher Nachname) erneut analysieren.
Erwartetes Ergebnis:
- Kein Cast-Slot mit erfundenem Namen mehr
- Alle 4 Charaktere kommen mindestens in einer Ensemble-Szene vor
- Kein Charakter erscheint doppelt in derselben Szene
- Telemetrie zeigt `strict_cast: { dropped: N, backfilled: M }`

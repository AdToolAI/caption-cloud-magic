# Zwei Fixes im Production Plan Sheet

## Problem 1 — „Unbenannter Look" im Outfit-Dropdown

**Ursache:** `useUnifiedMentionLibrary.ts:112` setzt hart `'Unbenannter Look'` als Fallback, wenn `avatar_outfit_looks.name` leer/`null` ist. Dieser String wandert dann durch drei Wege ins Sheet:
- `outfitById` (Line 344) → `outfitLabelById` (Line 385) — hier wird nur `'Standard-Look'` gefiltert, nicht `'Unbenannter Look'`.
- `outfitsByCharacter` (Line 323) → `merged[].name` (Line 1192) — gleicher Fallback.
- Der DB-Fallback (Line 388–390) überschreibt nur, wenn die DB einen Namen hat — bei tatsächlich leerem Namen bleibt „Unbenannter Look" stehen.

**Warum es beim Klick verschwindet:** nach Öffnen des Dropdowns rendert `SelectValue` den ausgewählten Look neu aus `merged`, wo inzwischen `outfitLabelById` (mit DB-Namen) gewonnen hat. Reine Timing-/Filter-Lücke.

**Fix (zwei kleine Änderungen):**

1. `src/hooks/useUnifiedMentionLibrary.ts` — `lookLabel` als leeren String belassen, wenn kein Name vorhanden ist, und das Mention-Label nur mit Avatar-Name bauen (statt „Avatar — Unbenannter Look"). `meta.outfitName` bleibt `''` statt Fake-String.
2. `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — im `outfitById`- und `outfitsByCharacter`-Aggregator sowohl `'Standard-Look'` als auch `'Unbenannter Look'` als „kein echter Name" behandeln, und im SelectItem-Rendering (Line 1229) einen positionsbasierten Fallback `Look N` verwenden statt „Standard-Look".

Effekt: Der Look wird sofort mit dem echten DB-Namen angezeigt, ohne Klick-Trigger.

## Problem 2 — Tonalität wird ins Skript gesprochen

**Ursache:** `src/hooks/useApplyProductionPlan.ts:384–385` baut den Dialog-Text so:
```
${name} — ${mood.toUpperCase()}: ${text}
```
Dieser String landet in `composer_scenes.dialog_script`, wird dann von TTS/Lipsync gesprochen — „SKEPTISCH, ENERGISCH" wird also wörtlich vorgelesen und bläht die Skriptdauer auf.

**Fix:** `moodSuffix` aus der Konkatenation entfernen — nur noch `${name}: ${text}`. `mood` und `delivery` bleiben als separate Felder auf `dialogTurns` erhalten (Metadata für Voice-Performance-Direction), aber nicht mehr im gesprochenen Text.

## Nicht angefasst
- Lipsync-Pipeline, Render-Payload, `dialog_shots`, `compose-video-clips`.
- `dialogTurns.mood`/`delivery` bleiben in der DB — nur die String-Konkatenation für den TTS-Input wird bereinigt.
- Bereits gerenderte / lipsync-geschützte Szenen: unberührt (Apply-Filter greift wie gehabt).

## Betroffene Dateien
- `src/hooks/useUnifiedMentionLibrary.ts` (1 Stelle)
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` (2 Stellen: `outfitById`/`outfitsByCharacter`-Filter, SelectItem-Fallback)
- `src/hooks/useApplyProductionPlan.ts` (1 Zeile: moodSuffix entfernen)

Kein Edge-Function-Redeploy nötig — reiner Client-Fix.

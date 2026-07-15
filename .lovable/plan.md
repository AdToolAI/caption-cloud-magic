## Bug

Kosten-Confirm zeigt **doppelte Sprecher/Passes**: 4 Charaktere im Skript → „8 Sprecher · 10s × 16 Cr/s × 8 Passes" = 1.280 Cr statt 640 Cr Lip-Sync.

## Root cause

`SceneDialogStudio.tsx` L1655 schreibt `dialogVoices` mit **mehreren Alias-Keys pro Sprecher** (`getSpeakerAliases(character.id)` → UUID + Name-Slug + Vorname …). Für Sync.so-Speaker-Matching gewollt.

Aber alle Pass-Zähler nehmen `Object.keys(dialogVoices).length` als Sprecher-Anzahl → doppelt/dreifach:
- `src/lib/composer/estimateSceneRenderCost.ts` L103–109 (Cost-Confirm)
- `src/components/video-composer/SceneCard.tsx` L2115 (Re-Roll)
- `src/hooks/usePipelineProgress.ts` L335, L751 (Progress-Bar)
- `src/hooks/useGenerateAllClips.ts` L44, `src/components/video-composer/SceneInlinePlayer.tsx` L72

Backend rechnet aus `dialog_shots.passes[]` — nicht betroffen. Bug ist Confirm-Betrag + Progress-Anzeige.

## Fix — strictly ID-based

Neuer Helper `src/lib/composer/countSceneSpeakers.ts`: zählt **eindeutige Character-IDs** aus `dialogVoices`-Werten (jeder `DialogVoiceCfg` trägt die `characterId` bzw. wir dedupen über die im Wert gespeicherte ID). Fallback nur wenn `characterId` fehlt: dedup über `voiceId`. Kein Name-Parsing, kein String-Matching.

```ts
export function countSceneSpeakers(scene): number {
  const dv = scene.dialogVoices;
  if (!dv) return 1;
  const ids = new Set<string>();
  for (const v of Object.values(dv)) {
    const id = (v as any)?.characterId ?? (v as any)?.voiceId;
    if (id) ids.add(String(id));
  }
  return Math.max(1, ids.size);
}
```

Vorher prüfen (Kontext-Read): Enthält `DialogVoiceCfg` bereits `characterId`? Wenn nein → `SceneDialogStudio.tsx` L1651–1657 patchen, damit der geschriebene `cfg` `characterId: s.character.id` enthält (Alias-Keys bleiben, nur das Value trägt jetzt die eindeutige ID). Persistierung (`dialog_voices` JSONB) verträgt zusätzliche Felder.

Aufrufer umstellen auf `countSceneSpeakers`:
1. `estimateSceneRenderCost.ts` — `passesForScene`.
2. `SceneCard.tsx` L2115 — Re-Roll-Confirm.
3. `usePipelineProgress.ts` L335, L751.
4. `useGenerateAllClips.ts` L44, `SceneInlinePlayer.tsx` L72.

## Verifikation

- 4-Sprecher-Szene: Cost-Dialog zeigt „4 Sprecher · 10s × 16 Cr/s × 4 Passes = 640 Cr", Total 1.065 Cr statt 1.705 Cr.
- Progress: `Pass x/4`.
- 1-Sprecher-Szene: unverändert 1 Pass.
- Bereits laufende Renders (ohne `characterId` im alten `dialogVoices`) fallen sauber auf `voiceId`-Dedup zurück.

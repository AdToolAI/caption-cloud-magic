## Diagnose

- Button „Skript schreiben · 1 Zeile" ist sichtbar und togglt `dialogStudioOpen` korrekt — `dialogMode` ist an, `dialogScript` existiert.
- `SceneDialogStudio` rendert aber `null`, weil intern `sceneCast.length < 1` ist.
- Ursache: `sceneCast` wird gebaut, indem `cast[].characterId` in der Project-`characters`-Liste gesucht wird. Der Briefing-Plan setzt `characterShots[].characterId` jedoch auf die `brand_characters.id` (Avatar-Library). Die Project-Cast-Liste enthält den Avatar erst, wenn er explizit über die Briefing-Cast-Sektion hinzugefügt wurde — das ist beim Auto-Apply nicht garantiert.
- Zweites Symptom: Modell-Dropdown ist leer, obwohl Lip-Sync aktiv ist. Beim Plan-Apply landen Szenen als `ai-hailuo`, nicht als HappyHorse. Der Provider wird erst gesetzt, wenn der User den Toggle manuell aus- und wieder einschaltet.

## Plan

1. **`SceneDialogStudio` mit Library-Fallback**
   - Wenn `characters.find(c => c.id === cs.characterId)` leer ist, in `useAccessibleCharacters()` / `useUnifiedMentionLibrary()` nach derselben `brand_characters.id` suchen und einen synthetischen `ComposerCharacter` ableiten (`name`, `referenceImageUrl`, `brandCharacterId`).
   - `sceneCast` wird damit nie leer, solange der Cast eine gültige Library-ID hat.
   - `defaultVoiceByCharId` greift dann wieder, die `default_voice_id` wird automatisch geladen.

2. **Harten Null-Return entfernen**
   - `if (sceneCast.length < 1) return null;` durch einen Recovery-Header ersetzen: Hinweistext + Skript-Textarea bleibt nutzbar, Generate-Buttons werden disabled mit Tooltip „Cast-Charakter im Briefing zuweisen".
   - So öffnet das Studio auch dann sichtbar, falls der Library-Fallback einmal nichts findet.

3. **HappyHorse-Default beim Plan-Apply**
   - In `useApplyProductionPlan.ts` (`planSceneToComposerScene`): wenn `dialogMode === true`, `clipSource = 'ai-happyhorse'` und `clipQuality = 'standard'` (statt aktuell hardcodiertem `'ai-hailuo'`).
   - Pipeline-sicher: `cinematic-sync` migriert HappyHorse automatisch zu Hailuo für die Plate (siehe `validateSceneForCinematicSync` Hinweis `happyhorse_will_auto_migrate`), die UI zeigt aber konsistent HappyHorse als gewähltes Modell.

4. **Auto-HappyHorse beim Toggle bestätigen**
   - In `SceneCard.tsx` greift die existierende Auto-Migration via `DIALOG_FALLBACK_CLIP_SOURCE = 'ai-happyhorse'` bereits richtig. Hier nichts ändern.

## Betroffene Dateien

- `src/components/video-composer/SceneDialogStudio.tsx` — `sceneCast`-Fallback über `useAccessibleCharacters`, harten Null-Return durch Recovery-UI ersetzen.
- `src/hooks/useApplyProductionPlan.ts` — Default-`clipSource` für Lip-Sync-Szenen auf `ai-happyhorse`.

## Nicht verändert

- Lip-Sync-Pipeline (`compose-dialog-segments`, `sync-so-webhook`, `poll-dialog-shots`, `dialog_shots`, `dialogVoices`-Schema) bleibt komplett unangetastet.
- Keine Backend- oder Edge-Function-Änderungen, keine Migrationen.
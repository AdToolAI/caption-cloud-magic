## Bug: Entfernte Charaktere kommen automatisch in den Cast zurück

### Ursache
In `src/components/video-composer/SceneCard.tsx` (Zeilen 462–474) läuft ein `useEffect`, der `syncCastFromPrompt(...)` aufruft. Dieser Helper scannt den Szenen-Prompt nach Charakter-Namen und fügt jeden gefundenen Charakter automatisch wieder zum `characterShots`-Array hinzu — auch dann, wenn der User ihn gerade explizit über das `X` aus dem Cast-Chip entfernt hat.

Solange der Name des Charakters noch irgendwo im Prompt steht (was nach dem Entfernen typischerweise der Fall ist, weil der Storyboard-Text unverändert bleibt), wird er beim nächsten Re-Render bzw. spätestens beim nächsten Prompt-Update wieder eingesetzt — exakt das beobachtete „10 Sekunden später taucht er wieder auf".

### Lösung (minimal-invasiv, nur Frontend)

1. **Neues Feld `dismissedCharacterIds: string[]` auf `ComposerScene`** (Typ-Ergänzung in `src/types/video-composer.ts`, optional, default `[]`). Persistiert über `composer_scenes.metadata` o.ä. — falls schon ein generisches `metadata`-JSON existiert, wird es dort abgelegt, sonst rein als In-Memory-State.

2. **In `SceneCard.tsx` (onCastChange-Handler, ~Z. 1462)** beim Vergleich `prev vs. next` die entfernten IDs ermitteln und in `dismissedCharacterIds` mergen:
   ```ts
   const removed = (scene.characterShots ?? [])
     .map(s => s.characterId)
     .filter(id => !next.some(n => n.characterId === id));
   const dismissed = Array.from(new Set([
     ...(scene.dismissedCharacterIds ?? []),
     ...removed,
   ]));
   ```
   Beim manuellen Wieder-Hinzufügen (Cast-Picker) wird die ID aus `dismissedCharacterIds` entfernt.

3. **`syncCastFromPrompt` erweitern** um ein viertes Argument `dismissedIds?: string[]`. Charaktere, deren ID in `dismissedIds` ist, werden niemals automatisch eingefügt. Bleibt idempotent und gibt weiterhin die gleiche Referenz zurück, wenn nichts geändert wurde.

4. **Aufrufstelle in `SceneCard.tsx` Z. 467** durchreichen:
   ```ts
   const next = syncCastFromPrompt(
     scene.aiPrompt || "",
     current,
     characters,
     scene.dismissedCharacterIds,
   );
   ```

5. **Reset-Punkt:** Wenn das Storyboard die Szene komplett neu generiert (neuer Prompt + neuer Cast vom LLM), wird `dismissedCharacterIds` zurückgesetzt. Konkret: im Apply-Handler bei `onApply({ aiPrompt, dialogScript, characterShots })` (Z. 2226) wird `dismissedCharacterIds: []` mitgesetzt, sofern `characterShots` vom LLM kommt.

### Was NICHT geändert wird
- Keine Änderungen an `compose-dialog-scene`, `compose-video-clips`, Lip-Sync-Pipeline oder Datenbank-Schema (nur ein optionales Feld, kein Migrations-Zwang — wenn Persistenz gewünscht, separate Mini-Migration als 2. Schritt).
- Keine Änderungen am Cast-Marker-Backfill (Z. 480+), der bleibt idempotent.
- Keine Änderungen am Realtime / Persistence-Layer (`useComposerPersistence`).

### Ergebnis
Entfernt der User einen Charakter aus dem Cast einer Szene, bleibt er weg — auch wenn sein Name weiterhin im Prompt-Text vorkommt. Erst ein manuelles Wieder-Hinzufügen über den Cast-Picker oder ein vollständiger Storyboard-Refresh holt ihn zurück.
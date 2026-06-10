# Cast-Actions nach Storyboard-Generierung garantiert füllen

## Problem

In `SceneCard.tsx` zeigt das Feld „AKTION — WAS TUT {NAME}?" nach der Storyboard-Generierung manchmal nur den Platzhalter (z. B. „z. B. tippt konzentriert am Laptop…"). Das passiert, weil `slot.actionUser` leer ist.

Quelle: `supabase/functions/compose-video-storyboard/index.ts`.

Es gibt drei Stellen, an denen pro-Slot-Actions gesetzt werden:

1. `normalizeShots()` (~Z. 551–571) — für jeden vom LLM gelieferten Slot:
   ```
   actionEn = cleanActionText(slot.actionEn || promptCharacterActionFallback(prompt, character?.name), 12)
   actionUser = cleanActionText(slot.actionUser || actionEn, 12)
   ```
   `promptCharacterActionFallback` gibt **`""`** zurück, wenn der Charaktername **nicht im aiPrompt** vorkommt oder keine passende Klausel gefunden wird → beide Felder bleiben leer.

2. FLOOR-Auto-Repair (~Z. 663–669) — fügt Charaktere zu Szenen hinzu, in denen sie fehlen. Da der Name dort per Definition **nicht** im Prompt steht, liefert der Fallback fast immer `""`.

3. Multi-Cast Lip-Sync-Rewrite (~Z. 781–797) — hat bereits einen `fallbackNeutral` (`"looks at the others and speaks naturally on camera"`). Dieser Pfad ist sauber.

Solo-Szenen und FLOOR-Insertions haben **keinen** neutralen Fallback → leeres Feld.

## Fix

Einen lokalisierten neutralen Fallback (EN/DE/ES, abhängig vom bereits in der Edge-Function bekannten `lang`/`langLabel`) einführen und an den zwei nicht abgesicherten Stellen anwenden.

### Änderungen in `supabase/functions/compose-video-storyboard/index.ts`

1. **Helper hinzufügen** (oben bei den anderen `*Fallback`-Funktionen):
   ```ts
   function neutralCharacterAction(lang: 'en'|'de'|'es'): { en: string; user: string } {
     const en = "performs the scene action naturally, visible to camera";
     const user =
       lang === 'de' ? "führt die Szenen-Aktion natürlich aus, sichtbar zur Kamera" :
       lang === 'es' ? "realiza la acción de la escena con naturalidad, visible a cámara" :
       en;
     return { en, user };
   }
   ```

2. **`normalizeShots()` härten** (Z. 564–566):
   ```ts
   const neutral = neutralCharacterAction(lang);
   const actionEn   = cleanActionText(slot.actionEn   || promptCharacterActionFallback(prompt, character?.name) || neutral.en, 12);
   const actionUser = cleanActionText(slot.actionUser || (slot.actionEn ? actionEn : neutral.user), 12);
   ```
   → `actionUser` bleibt nie leer; im UI-Sprachfeld steht der lokalisierte neutrale Satz, `actionEn` der englische.

3. **FLOOR-Pass härten** (Z. 663–669):
   ```ts
   const neutral = neutralCharacterAction(lang);
   const actionEnRaw = promptCharacterActionFallback(sc.aiPrompt, ch.name);
   const actionEn   = actionEnRaw || neutral.en;
   const actionUser = actionEnRaw ? actionEn : neutral.user;
   shots.push({ characterId: ch.id, shotType, actionEn, actionUser });
   ```

4. **Multi-Cast-Block angleichen** (Z. 786–791): den bestehenden `fallbackNeutral` auf denselben Helper umstellen, damit der `actionUser` ebenfalls lokalisiert ist (heute wird der englische Satz auch in DE/ES gesetzt).

Damit ist invariant: **jeder sichtbare `characterShots[]`-Slot hat nach Storyboard-Generierung garantiert nicht-leeres `actionEn` und `actionUser`** — egal ob Solo, Multi-Cast oder Auto-Insert.

## Was NICHT geändert wird

- Kein Frontend-Change in `SceneCard.tsx` / `CharacterCastPicker.tsx`.
- Kein Schema-/DB-Change.
- Keine anderen Edge-Functions berührt.
- Bestehende vom LLM gelieferte Actions werden weiterhin bevorzugt; der Fallback greift nur, wenn LLM **und** prompt-basierter Fallback nichts liefern.

## Verifikation

- Neues Storyboard erzeugen (Solo-Cast + Mehr-Cast + Szene, in der ein Charakter via FLOOR eingefügt wird).
- In allen Szenenkarten muss „AKTION — WAS TUT …?" einen tatsächlichen Text (nicht den Placeholder) zeigen.
- Auto-EN-Badge zeigt die englische Übersetzung, `[CastActions]`-Block landet im finalen Prompt (über `applyActionsToPrompt`).

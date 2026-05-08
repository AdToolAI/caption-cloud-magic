## Was wir beheben

### Problem 1 — Sarah verschwindet als Sprecher
**Ursache** in `src/lib/talking-head/parseDialogScript.ts`:
```ts
x.name.toLowerCase() === speakerName.toLowerCase() ||
x.name.toLowerCase().split(/\s+/)[0] === speakerName.toLowerCase()
```
Cast-Name = „Sarah" (kurz), Skript schreibt „**Sarah Dusatko**:" (lang). Die zweite Bedingung prüft nur „Cast-Vorname == Skript-komplett" — nicht den umgekehrten Fall „Skript-Vorname == Cast-komplett". Folge: Sarahs Zeile wird als Continuation an Matthews Block angehängt → 1 Sprecher, Matthew „spricht" beide Texte.

**Fix** — symmetrisches Vornamen-Matching:
```ts
const castFirst = x.name.toLowerCase().split(/\s+/)[0];
const scriptFirst = speakerName.toLowerCase().split(/\s+/)[0];
return (
  x.name.toLowerCase() === speakerName.toLowerCase() ||
  castFirst === scriptFirst                    // „Sarah" ↔ „Sarah Dusatko"
);
```

Nebenfix: `referenceImageUrl`-Pflicht im Parser entfernen — Speaker-Erkennung darf nicht vom Bild abhängen (Bild ist erst beim HeyGen-Render relevant).

### Problem 2 — Skript wirkt sich nicht sichtbar auf Prompt/Szenen aus
Aktuell speichert „Skript via AI" nur `dialogScript`. Der KI-Prompt der Szene und die Sub-Szenen werden nicht angefasst → User denkt „nichts passiert".

**Fix** — drei sichtbare Effekte:
1. **Inline-Block-Vorschau** unter dem Textarea (Avatar + Name + erste 60 Zeichen pro Zeile). So sieht der User sofort, wie das Skript geparsed wurde.
2. **Auto-Sync in Szenen-Prompt** (Checkbox „In Prompt übernehmen", default an):
   Idempotenter, lokalisierter `[Dialog: Matthew → "…", Sarah → "…"]`-Marker wird an `aiPrompt` (oder `promptSlots.subject` im Structured-Mode) angehängt. Re-Run mit gleichen Blöcken = no-op; leeres Skript entfernt Marker. Dadurch verändert sich die Szenen-Komposition messbar (sprechende Pose) und der User sieht es im Prompt-Feld.
3. **Toast „Skript bereit – jetzt Dialog generieren"** als CTA, damit der zweite Schritt nicht übersehen wird.

In `handleGenerate`: Sprecher ohne Portrait sauber überspringen (statt schon im Parser auszufiltern) mit Toast „Kein Portrait für {Name} — Lip-Sync übersprungen".

## Technische Details

### Dateien
- `src/lib/talking-head/parseDialogScript.ts`
  - Speaker-Match: bidirektionales Vornamen-Matching.
  - `referenceImageUrl`-Guard entfernen.
- `src/components/video-composer/SceneDialogStudio.tsx`
  - `sceneCast`-Filter: `referenceImageUrl`-Bedingung entfernen.
  - `handleGenerate`: Skip + Toast für Speaker ohne Portrait.
  - Inline `<DialogPreviewList />` (Avatar/Name/Snippet) direkt unter dem Textarea.
  - Checkbox „Dialog in Szenen-Prompt übernehmen" + bei Skript-Update / „Skript via AI" → `applyDialogToPrompt(...)` aufrufen + Toast „Skript bereit".
- `src/lib/motion-studio/applyDialogToPrompt.ts` (neu, parallel zu `applyCastToPrompt`)
  - Idempotenter, lokalisierter `[Dialog: …]`-Marker (de/en/es).

### Out of scope
- Keine DB-Migration, keine Edge-Function-Änderung, keine Pipeline-Änderung.
- Cast-Picker und HeyGen-Sub-Szenen-Spawn bleiben unverändert.

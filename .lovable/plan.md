## Problem

In Szene 2 zeigt die **Cast Consistency Map** oben sowohl Matthew als auch Sarah (S2 grün), während die **Cast-Zeile in der SceneCard** nur „Matthew Dusatko · Silhouette" anzeigt. Der KI-Prompt erwähnt Sarah aber explizit ("Sarah Dusatko, wipes sweat from her brow…").

**Ursache:**
- `CastConsistencyMap.getAnchor()` ist tolerant: matcht per `characterShot.characterId` **oder** per Namens-Treffer im Prompt-Text → erkennt Sarah.
- `scene.characterShots` enthält dagegen nur, was die Storyboard-LLM bzw. der `CharacterCastPicker` explizit gesetzt hat → Sarah fehlt dort, weil der Storyboard-Generator (`compose-video-storyboard`) `character_shots` gar nicht erzeugt.
- Folge: Cast-Badge-Zeile, Anker-Compose (Multi-Portrait → Nano Banana 2), Vidu-Multi-Reference und Skript-Studio bekommen Sarah nicht mit, obwohl sie in der Szene vorkommt.

Das ist ein echter Bug, weil der Anchor-Compose laut `[Multi-Character Scene Composition]`-Memory `portraitUrls[]` aus `characterShots` zieht — Sarah würde also nie ins komponierte Anker-Frame gerendert.

## Lösung — clientseitige Auto-Sync (keine LLM-/DB-Änderungen)

### Neuer Helper `src/lib/motion-studio/syncCastFromPrompt.ts`

Pure Funktion:

```ts
syncCastFromPrompt(
  prompt: string,
  currentShots: CharacterShot[],
  characters: ComposerCharacter[],
): CharacterShot[]
```

Logik:
- Tokenisiert `prompt` (lowercase) und sucht für jeden bekannten Charakter aus `characters` einen Treffer per **vollem Namen** oder **Vorname** (≥3 Zeichen) — gleiche Heuristik wie `CastConsistencyMap` und `sceneFeaturesCharacter`, damit alle drei Stellen konsistent bleiben.
- Behält bestehende Slots **unverändert** (inkl. `shotType`, Reihenfolge).
- Hängt fehlende Charaktere mit Default `shotType: 'full'` an (kein `'absent'`, kein Überschreiben einer manuellen Auswahl).
- Idempotent: ohne neue Treffer wird die Original-Referenz zurückgegeben → kein Re-Render-Loop.
- Begrenzung: max. 4 Slots (deckt sich mit Multi-Portrait-Limit für Nano Banana 2 / Vidu Q2).

### Integration in `SceneCard.tsx`

Direkt vor dem bestehenden Cast-Marker-Backfill-Effect (~Zeile 240) ein neuer `useEffect`:

```ts
useEffect(() => {
  const current = scene.characterShots ?? (scene.characterShot ? [scene.characterShot] : []);
  const next = syncCastFromPrompt(scene.aiPrompt || '', current, characters ?? []);
  if (next === current) return;
  onUpdate({
    characterShots: next,
    characterShot: next[0] ?? scene.characterShot,
  });
}, [scene.aiPrompt, characters, scene.characterShots?.length]);
```

Reihenfolge wichtig: Auto-Sync läuft **vor** dem Cast-Marker-Backfill, damit der `[Cast: …]`-Marker direkt die neu erkannten Charaktere mit aufnimmt.

### Visueller Hinweis (optional, dezent)

Wenn `syncCastFromPrompt` Slots hinzugefügt hat (Vergleich `next.length > current.length`), einmalig ein kleines `Badge` in der Cast-Zeile zeigen:
- DE: „Auto-erkannt: Sarah" / EN: „Auto-detected: Sarah" / ES: „Auto-detectado: Sarah"
- Ohne Toast, ohne Persistenz-Flag — nur Tooltip am `Charakter hinzufügen`-Button.

## Out of Scope

- Keine Änderung an `compose-video-storyboard` (Storyboard-LLM bleibt wie er ist).
- Keine DB-Migration, kein `character_shots`-Schemawechsel.
- Kein Auto-Remove von Charakteren, deren Name *nicht mehr* im Prompt steht (zu aggressiv — könnte manuell gepickte Cast-Mitglieder löschen).
- Render-Pipeline, Anchor-Compose, Skript-Studio bleiben unverändert — sie profitieren automatisch, weil `scene.characterShots` jetzt korrekt ist.

## Dateien

- **neu**: `src/lib/motion-studio/syncCastFromPrompt.ts`
- **edit**: `src/components/video-composer/SceneCard.tsx` — neuer Sync-Effect + optionaler „Auto-erkannt"-Badge.

## Verifikation

1. Storyboard mit „Sarah und Matthew arbeiten am Feld" generieren → Szene 2 Cast-Zeile zeigt **Matthew + Sarah**, nicht mehr nur Matthew.
2. `[Cast: Matthew Dusatko (full), Sarah Dusatko (full)] …` taucht im Prompt-Marker auf.
3. „Anker komponieren" → Nano Banana 2 bekommt **beide** `portraitUrls` und rendert Sarah + Matthew ins Frame.
4. Cast Consistency Map zeigt weiterhin S2 grün für beide — jetzt aber konsistent zur Cast-Zeile.
5. Manuelles Entfernen von Sarah über `CharacterCastPicker` bleibt persistent (Sync fügt sie nicht sofort wieder hinzu, solange der Prompt nicht erneut geändert wird → Dependency `scene.aiPrompt`; Edge-Case dokumentiert).

## Befund (verifiziert an echten Daten)

Die heute um 12:08 angelegte Szene (`composer_scenes.8bd233f7…`) hat wirklich zwei Cast-Slots für dieselbe Person:

```text
character_shots = [
  { characterId: "483f9cdc-…-9d5e7d955016", characterName: "Samuel Dusatko", shotType: "full" },
  { characterId: "samuel-dusatko",                                            shotType: "full" }
]
```

In `brand_characters` existiert Samuel Dusatko **genau einmal** (`483f9cdc…`) — es ist also kein doppelter Avatar in der Bibliothek, sondern ein **Slug-Slot neben dem UUID-Slot**.

Warum das durchrutscht:
- `useApplyProductionPlan.ts` dedupt Cast-Slots über `String(shot.characterId).toLowerCase()` — `"samuel-dusatko"` ≠ UUID, also bleiben beide erhalten.
- `CharacterCastPicker.tsx` löst beide Slots über die tolerante `findCharacter`-Heuristik (Name-im-ID-Substring) auf denselben Charakter auf → zwei identische Chips „Samuel Dusatko" und zwei identische Aktionsfelder (genau der Screenshot).
- Der Self-Heal in `CharacterCastPicker` schreibt den Slug auf die UUID um, dedupt aber **nicht** danach → aus „Slug + UUID" werden „UUID + UUID". Er läuft zusätzlich nur einmal pro Mount (`healedRef`).
- Auch `syncCastFromPrompt` / `ensureEnsembleScene` vergleichen nur `characterId`-Strings, sind also gegen Slug-Doppel blind.

**Zum Clone-Verdacht:** ja, das ist plausibel derselbe Ursprung. Zwei Slots = zwei Portrait-Slots für den Anker-Kompositor (Nano Banana / Seedream) und zwei Face-Slots im Sync.so-Face-Map-Router. Derselbe Mensch wird zweimal ins Frame komponiert → Doppelgänger im Bild und ein "Geister-Sprecher", der beim Lip-Sync einen Pass frisst.

## Plan

### 1. Kanonische Identitäts-Auflösung (neues Modul)
`src/lib/video-composer/canonicalCastId.ts`:
- `resolveCanonicalCharacterId(slotId, pool)` — UUID-Exact-Match zuerst, dann Slug-/Namens-Match (`samuel-dusatko` → `483f9cdc…`), sonst `null`.
- `dedupeCharacterShots(shots, pool)` — kollabiert Slots auf die kanonische ID; behält den spezifischeren `shotType`, mergt `outfitLookId`, `actionEn/actionUser`, `referenceImageUrl` und `characterName` (nicht-leerer Wert gewinnt). Reihenfolge des ersten Vorkommens bleibt erhalten.
- Reines Modul, idempotent (gleiche Array-Referenz zurück, wenn nichts zu tun ist) — wichtig gegen `useEffect`-Loops.

### 2. UI-Härtung (`CharacterCastPicker.tsx`)
- Self-Heal ersetzt durch `dedupeCharacterShots` gegen `resolutionPool` → Slug-Slots werden auf die UUID normalisiert **und** anschließend zusammengeführt.
- `healedRef`-Einmal-Sperre entfällt; stattdessen Guard „nur schreiben, wenn Ergebnis sich unterscheidet".
- Zusätzlich Anzeige-Dedup direkt beim Rendern, damit auch ungespeicherte Zustände nie zwei identische Chips zeigen.

### 3. Schreibpfade absichern
- `useApplyProductionPlan.ts`: Dedup-Key auf kanonische ID umstellen (statt Roh-String).
- `syncCastFromPrompt.ts` (`syncCastFromPrompt` + `ensureEnsembleScene`): Präsenzprüfung über kanonische IDs, damit ein bereits als Slug vorhandener Charakter nicht erneut angehängt wird.
- `useComposerPersistence.ts`: Beim Persistieren von `character_shots` einmal `dedupeCharacterShots` durchlaufen lassen — damit bestehende Projekte beim nächsten Speichern selbstheilen.

### 4. Server-Guard (Anker + Lip-Sync)
- In `supabase/functions/_shared/` eine kleine Deno-Variante der Dedup-Funktion; angewendet in `compose-video-clips` (vor Portrait-/Anker-Komposition) und `compose-dialog-segments` (vor Pass-Berechnung), sodass ein doppelter Slot niemals zu doppelten Portraits oder einem Extra-Sync.so-Pass führt. Nicht-auflösbare Nicht-UUID-Slots werden dort verworfen statt als eigener Charakter behandelt.

### 5. Einmal-Bereinigung bestehender Daten
Migration, die in `composer_scenes.character_shots` Slots mit gleicher aufgelöster Identität zusammenführt (UUID gewinnt, Slug-Duplikate fallen weg). Betroffen ist aktuell nachweislich mindestens eine Szene; die Migration läuft generisch über alle Zeilen des Nutzers.

### Verifikation
- SQL-Recheck: keine Szene mehr mit zwei Slots, deren Namen/Identität identisch sind.
- UI: die betroffene Szene zeigt nur noch **einen** Samuel-Chip und **ein** Aktionsfeld.
- Lip-Sync-Log: Sprecheranzahl entspricht der Chip-Anzahl (kein Geister-Pass).

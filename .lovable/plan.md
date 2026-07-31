## Kurzantwort

Ja, das hängt zusammen — es ist dasselbe Grundproblem: **eine Person kann in unserem System unter mehreren IDs auftreten**, und die Outfit-Variante ist eine davon.

## Befund (an echten Daten verifiziert)

Die betroffene Szene (`composer_scenes.8bd233f7…`, zuletzt 12:23 Uhr geschrieben) hat drei Cast-Slots:

```text
[
  { characterId: "483f9cdc-…-9c5e7d955016", characterName: "Samuel Dusatko" },
  { characterId: "outfit:673c117b-a97d-4e64-b414-a080c0b1f77f" },
  { characterId: "samuel-dusatko" }
]
```

- `avatar_outfit_looks.673c117b…` gehört zu `avatar_id 54d90504…` = **Matthew Dusatko**, Look „Casual". Der manuell hinzugefügte Charakter landet also als **Outfit-Referenz** statt als Charakter-UUID im Cast.
- In `brand_characters` gibt es Samuel Dusatko **genau einmal** — der dritte Slot ist ein reiner Slug.

Zwei bestätigte Ursachen:

1. **`resolveCanonicalCharacterId` (canonicalCastId.ts) kennt die Legacy-Präfixe `outfit:` / `catalog:` / `lib:` nicht.** Ein Look-Slot und der Basis-Slot derselben Person werden nie zusammengeführt. `CastRef.ts` kann das bereits (`stripLegacyCastIdPrefix`, `legacyCastIdToRef`), wird im Dedupe-Pfad aber nicht benutzt.
2. **Der Auflösungs-Pool beim Speichern ist zu klein.** `useComposerPersistence.ts` (Zeile 178) baut den Pool nur aus `project.briefing.characters`. Steht ein Charakter nicht im Briefing, kann `"samuel-dusatko"` nicht aufgelöst werden — der Slug-Slot überlebt den Dedupe und wird erneut in die DB geschrieben.

**Warum Outfits in der Briefing-Analyse mal erkannt werden und mal nicht:** dieselbe uneinheitliche ID-Form. Wird ein Charakter als `outfit:<lookId>` referenziert, trägt der Slot die Outfit-Info **in der ID**; wird er als Basis-UUID referenziert, muss sie in `outfitLookId` stehen. Beim heutigen (nicht präfix-fähigen) Zusammenführen geht je nach Reihenfolge mal der eine, mal der andere Slot verloren — damit verschwindet auch mal der Look. Das ist derselbe Defekt, nicht ein zweiter.

## Die saubere Lösung: eine einzige kanonische Cast-Form

Grundregel, die wir durchgängig erzwingen: **Ein Cast-Slot ist immer `{ characterId: <brand_characters UUID>, outfitLookId?: <lookId> }`.** Kein Slug, kein Präfix, nirgends.

### 1. Resolver versteht Legacy-Refs (`canonicalCastId.ts`)
- Vor der Auflösung `stripLegacyCastIdPrefix` anwenden; bei `outfit:` / `catalog:` über eine Look-Map (`lookId → avatarId`) auf die Avatar-UUID auflösen.
- Signatur abwärtskompatibel erweitern: `resolveCanonicalCharacterId(slotId, pool, opts?: { outfitLookMap })`, analog `dedupeCharacterShots`.
- Beim Kollabieren eines Präfix-Slots geht der Look **nie** verloren: `outfitLookId` wird auf den gestrippten Look gesetzt und beim Merge bevorzugt behalten.

### 2. Look-Map zentral bereitstellen
- Neuer Hook `useOutfitLookMap()` (React Query, hoher `staleTime`), lädt `avatar_outfit_looks (id, avatar_id, name)` einmalig.
- Konsumenten: `CharacterCastPicker`, `useComposerPersistence`, `useApplyProductionPlan`, Briefing-Analyse-Mapping.

### 3. Vollständiger Auflösungs-Pool auf allen Schreibpfaden
- `useComposerPersistence.ts`: Pool = Briefing-Charaktere **+ Brand-Character-Bibliothek**.
- `useApplyProductionPlan.ts` und die `syncCastFromPrompt`-Aufrufe in `SceneCard.tsx` bekommen denselben kombinierten Pool (der Picker hat ihn über `resolutionPool` schon).

### 4. Ursache abstellen statt nur reparieren (Eingangs-Normalisierung)
- Im Cast-Picker beim Hinzufügen aus Library/@-Mention sofort normalisieren: statt `outfit:<lookId>` wird `{ characterId: <avatarUUID>, outfitLookId: <lookId> }` geschrieben. Damit entstehen gar keine neuen Präfix-Slots mehr.
- `briefingAvailable` / `libraryAvailable` filtern über die **kanonische** ID, damit eine bereits besetzte Person nicht erneut als „verfügbar" angeboten wird (heute nur Roh-ID-Vergleich).
- Gleiche Normalisierung im Briefing-Deep-Parse-Mapping → Outfits werden dann **immer** erkannt, nicht mal so, mal so.

### 5. Server-Guard nachziehen
- `supabase/functions/_shared/canonical-cast.ts` bekommt dieselbe Präfix-Behandlung; `compose-video-clips` und `compose-dialog-segments` laden die Look-Map (ein SELECT auf `avatar_outfit_looks`) und deduplizieren damit, bevor Portraits und Lip-Sync-Pässe berechnet werden.

### 6. Einmalige Datenbereinigung
- Migration über `composer_scenes.character_shots`: `outfit:<lookId>` → Avatar-UUID + `outfitLookId`, Slug-Slots per Namensabgleich mit `brand_characters` auf die UUID, danach identitätsgleiche Slots zusammenführen (spezifischerer `shotType` gewinnt).

## Verifikation
- SQL: keine `character_shots`-Zeile mehr mit `outfit:` / `catalog:` / `lib:`-Präfix und keine zwei Slots derselben aufgelösten Identität.
- UI: Szene `8bd233f7…` zeigt genau **einen** Samuel- und **einen** Matthew-Chip; manuelles Hinzufügen hängt nichts Weiteres an.
- Briefing-Analyse: der Look bleibt nach dem Zusammenführen erhalten (Chip zeigt „Matthew Dusatko — Casual").
- Render-Log: Portrait-Slots und Lip-Sync-Pässe = Chip-Anzahl.

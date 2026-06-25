## Option C — `CastRef` Value Object

Eine typsichere Trennung von Charakter und Outfit, die den Resolver-Bug-Class compiler-enforced ausschließt. Kein DB-Schema-Change.

## Das neue Value Object

```ts
// src/lib/video-composer/CastRef.ts (neu)
export type CastRef = {
  characterId: string;              // immer base avatar UUID (brand_characters.id)
  outfitLookId?: string | null;     // optional, avatar_outfit_looks.id
  displayName: string;              // "Samuel — Casual" (UI-Anzeige)
  voiceId?: string | null;          // bleibt am Cast
};

export const isCastRef = (v: unknown): v is CastRef => …;
export const castRefKey = (r: CastRef) => `${r.characterId}::${r.outfitLookId ?? '_'}`;
```

Alle Cast-bezogenen Felder im System verwenden ab jetzt **`CastRef`** statt `string`. Wer einen String-ID einsetzen will, bekommt einen TypeScript-Fehler.

## Was geändert wird

### 1. Plan-Schema (`src/lib/video-composer/briefing/productionPlan.ts`)
- `CastEntrySchema` wird zu einem Zod-Objekt das `CastRef` beschreibt (`characterId: uuid`, `outfitLookId: uuid.nullable().optional()`, `displayName`, `voiceId`).
- Das bisherige Freitext-Feld `outfit` (Director-Kreativhinweis wie „Casual, regenfeucht") bleibt **zusätzlich** als `outfitDescription` erhalten — andere Achse als `outfitLookId`.
- Versionsbump `plan_version: 2`.

### 2. Mention-Layer (`src/hooks/useUnifiedMentionLibrary.ts`)
- Outfit-Looks bekommen `meta: { kind: 'outfit', avatarId, outfitLookId }` statt zusammengesetzter `id: outfit:xxx`.
- Neue Helper-Funktion `mentionToCastRef(mention) → CastRef` ist die **einzige** offizielle Brücke zwischen Mention und Cast.
- Display-Name bleibt „Samuel — Casual" (UX unverändert).

### 3. Migration (`src/lib/video-composer/CastRef.ts → migrateLegacyCastId`)
- Reine Read-Time-Migration: alter String `"outfit:abc"` → `CastRef` via Lookup in `avatar_outfit_looks`.
- Wird in `useProductionPlan` beim Laden alter Pläne aufgerufen und einmalig persistiert.
- `resolveCharacterId.ts` wird zur reinen **Migration-Hilfe** degradiert (Legacy-only) und aus dem Hot-Path entfernt.

### 4. Apply-Layer (`src/hooks/useApplyProductionPlan.ts`)
- `dialogTurns` und `cast`-Resolution gibt nur noch `CastRef` an Szenen weiter.
- Default-Engine-Auswahl (`ai-happyhorse` für Dialog) unverändert.

### 5. UI
- `src/components/video-composer/CharacterCastPicker.tsx`: zwei Dropdowns pro Zeile — **Charakter** (alle brand_characters) + **Outfit** (gefiltert auf `avatar_id == characterId`, Default „Standard-Look"). Bei Charakter-Wechsel wird `outfitLookId` automatisch genullt, damit nie ein inkonsistenter Ref entsteht.
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: Cast-Zelle nutzt denselben Picker, `unresolved`-Check fragt nur `characterId` ab (Outfit ist immer optional).
- `src/components/video-composer/SceneDialogStudio.tsx`: liest `CastRef` direkt, kein Prefix-Parsing mehr.

### 6. Anchor-Pipeline (`src/lib/motion-studio/prepareSceneAnchor.ts`)
- Bekommt `CastRef[]`, kein String-Array mehr.
- Wardrobe-Lock-Namen werden direkt über `outfitLookId` aus `avatar_outfit_looks` geladen — keine String-Heuristik nötig.

### 7. Edge Functions
- **`supabase/functions/briefing-deep-parse/index.ts`**: emittiert Cast als `CastRef`-Objekte (Pass A/B output schema angepasst). Fuzzy-Matching zwischen Briefing-Mentions und Library liefert `characterId` + optional `outfitLookId`.
- **`supabase/functions/compose-dialog-segments/index.ts`**: liest `characterId` direkt aus Scene-Cast, lädt Outfit-Look bei Bedarf separat. Identity-Bridging im Preflight (v153) bekommt damit garantiert eine echte avatar-UUID. Sync.so v169 Audio/Lipsync-Logik bleibt 1:1 unverändert.
- **`supabase/functions/compose-video-clips/index.ts`**: dito; behält die existierende Legacy-Defensive (`resolveCharacterId`) nur noch als Fallback für unmigriertes Material.

### 8. Aufräumen
- `src/lib/video-composer/resolveCharacterId.ts`: bleibt als `legacyCastIdToRef()` mit `@deprecated` JSDoc und Aufruf-Counter in Sentry. Nach 2 Wochen ohne Calls löschen.

## Was **nicht** angefasst wird

- DB-Schema (`avatar_outfit_looks`, `brand_characters`, `composer_scenes` bleiben unverändert — `CastRef` wird in vorhandenen JSON-Spalten gespeichert).
- Sync.so v169 Pipeline (Audio-Prep, Lipsync-Dispatch, Webhook, Watchdog).
- Avatar-Library, Saved Outfits, Wardrobe Theme Packs, Marketplace.
- Voice-Assignment-Logik.

## Akzeptanz

1. `grep -r "outfit:" src/ supabase/functions/` findet im neuen Code nichts mehr außer der Legacy-Migration.
2. TypeScript verhindert, dass irgendwo ein String in ein `characterId`-Feld geschrieben wird.
3. `CharacterCastPicker` zeigt zwei getrennte Dropdowns; Outfit-Wechsel ändert nie den Charakter und umgekehrt.
4. Lipsync-Preflight (`v153_preflight_block`) bekommt immer eine valide brand_characters-UUID.
5. Alte Pläne mit `"outfit:xxx"`-Strings laden korrekt und werden beim ersten Save migriert.
6. `unresolved`-Counter im Plan-Sheet zählt fehlende Outfits nicht mehr als Problem.

## Risiken & Mitigations

- **Snapshot-Drift in DB**: existierende `composer_scenes.cast` JSON-Blobs enthalten Alt-Format → Migration läuft on-read in `useComposerScene` Hook, schreibt nur beim nächsten Edit zurück.
- **Edge-Function Doppel-Format**: während der Übergangszeit akzeptieren Edge Functions **beide** Formate (string + CastRef), schreiben aber nur CastRef. Klare Telemetry zeigt, wann Legacy-Path leer ist.
- **Director-AI Prompt**: muss verstehen dass `outfitDescription` (Freitext) und `outfitLookId` (Library-Lock) zwei verschiedene Achsen sind — wird im System-Prompt explizit dokumentiert.

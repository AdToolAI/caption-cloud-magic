## Was wirklich passiert ist

Die Sync.so Multi-Speaker-Pipeline (v169) ist **nicht** angefasst worden. Verifiziert:

- `compose-dialog-segments` steht weiterhin auf `COMPOSE_DIALOG_SEGMENTS_VERSION = "v169"`, mit `FEATURE_PER_PASS_LOCK`, `FEATURE_PLAN_D_FANOUT`, Concurrency-Cap 4, MAX_SHOT_RETRIES 4, Pre-Fanout, Stale-Reconcile — exakt wie im Guide.
- `_shared/` enthält weiterhin `asd-strategy.ts`, `pass-face-preclip.ts`, `plate-face-detect.ts`, `plate-face-identity.ts`, `dialog-lock.ts`, `lipsync-fail.ts`, `webhook-auth.ts`.
- Die letzten Edits saßen ausschließlich in `compose-video-clips` (Cinematic-Sync-Anchor-Resolver) — also vor der Dialog-Pipeline, nicht in ihr.

Der eigentliche Fehler im Screenshot ist **kein Pipeline-Bug**, sondern ein Resolver-Bug:

1. Studio Director schreibt `character_shots[]` mit IDs wie `outfit:18fdfdf2…`.
2. `CastConsistencyMap` liest nur `scene.characterShot` (singular, legacy) und vergleicht stumpf gegen `brand_character.id` → matcht nie → orange Warnung "Samuel Dusatko kommt in keiner Szene vor".
3. Cinematic-Sync findet aus demselben Grund kein Portrait → `lip_sync_aborted`.

## Plan — nur Resolver/Normalisierung, keine Pipeline-Änderung

### 1) `src/lib/video-composer/resolveCharacterId.ts` (neu, ~25 Zeilen)
Pure Helper: nimmt einen rohen `characterId` (`uuid` | `outfit:<lookId>` | `catalog:<lookId>` | `lib:<id>`) plus die Avatar-Library und gibt die Basis-`brand_character.id` zurück. Konsumiert `avatar_outfit_looks` aus dem bereits geladenen `useAccessibleCharacters`-Cache (kein neuer DB-Call).

### 2) `src/components/video-composer/CastConsistencyMap.tsx`
- `getAnchor()` zusätzlich gegen `scene.character_shots?.[]` matchen (nicht nur `characterShot`).
- IDs vor dem Vergleich durch `resolveCharacterId()` schicken — damit `outfit:…` / `catalog:…` als Treffer zählen.
- Restliche UI/Logik unverändert.

### 3) `src/hooks/useApplyProductionPlan.ts`
Beim Anwenden des Plans pro Szene:
- Jede `characterShots[].characterId` durch `resolveCharacterId()` normalisieren (Basis-UUID statt `outfit:` Präfix).
- Zusätzlich zur `character_shots[]`-Liste auch das Legacy-Feld `characterShot` (singular, erster Eintrag) setzen, damit alte UI-Pfade weiter funktionieren.
- Verhalten für `clipSource: 'ai-happyhorse'` bei Dialog bleibt wie zuvor.

### 4) Warnbanner in `CastConsistencyMap.tsx`
Wenn nach dem Resolver immer noch `absent` für einen Cast-Member herauskommt: neuer Button **"Anker automatisch reparieren"** der pro betroffener Szene `characterShot = { characterId: <base>, shotType: 'medium' }` setzt und `character_shots[]` ergänzt. Reine State-Mutation über den bestehenden `useSceneManager`-Updater, kein Backend.

### 5) Was **nicht** angefasst wird
- `supabase/functions/compose-dialog-segments/**` — v169 bleibt bitweise wie deployed.
- `supabase/functions/sync-so-webhook/**`, `lipsync-watchdog/**`, `finalize-dialog-scene/**`.
- `_shared/asd-strategy.ts`, `pass-face-preclip.ts`, `dialog-lock.ts`, `lipsync-fail.ts`.
- `compose-video-clips` Edge Function — die em-dash + outfit-Fixes von letzter Runde bleiben, dort fehlte nur der Resolver, die Pipeline selbst war/ist korrekt.

### Verifikation nach Build
1. Screenshot-Szene neu öffnen → Cast Consistency Map zeigt für Samuel Dusatko in mind. 1 Szene 🟢/🔗 statt leerem Kreis.
2. "Neu rendern" auf S01 → Cinematic-Sync findet Portrait, Pass 1 dispatcht. (Pipeline-Verhalten ab da identisch zu v169.)
3. Edge-Function-Log `compose-dialog-segments`: weiterhin `BOOT version=v169`, kein neuer Deploy.

Soll ich so umsetzen?
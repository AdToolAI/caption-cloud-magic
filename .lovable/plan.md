## Ziel
Lip-Sync/Cinematic-Sync läuft **ausschließlich** wenn der User explizit opt-in gemacht hat. Ein einziger Helfer entscheidet — Client, Server, Auto-Trigger und Router konsumieren nur diesen einen Wert.

## Kernprinzip: Single Source of Truth

Neue Datei `src/lib/video-composer/lipSyncIntent.ts`:

```ts
// Die EINZIGE Stelle im gesamten Codebase, die entscheidet ob eine Szene
// Sync.so-Lip-Sync bekommt. Alles andere ist Ableitung.
export function isLipSyncIntentional(scene: {
  lipSyncWithVoiceover?: boolean | null;
  engineOverride?: string | null;
  dialogMode?: boolean | null;
}): boolean {
  if (scene.lipSyncWithVoiceover === true) return true;
  if (scene.dialogMode === true) return true;
  const eo = String(scene.engineOverride ?? '');
  return eo === 'cinematic-sync' || eo === 'sync-segments' || eo === 'native-dialogue';
}

// snake_case-Pendant für Edge Functions / DB rows
export function isLipSyncIntentionalRow(row: {
  lip_sync_with_voiceover?: boolean | null;
  engine_override?: string | null;
  dialog_mode?: boolean | null;
}): boolean { /* dieselbe Logik auf DB-Feldern */ }
```

Merke: `engineOverride='cinematic-sync'` allein ist Opt-in (User hat Engine manuell gewählt). Aber nirgendwo im Client darf `engineOverride` implizit auf `cinematic-sync` gesetzt werden, ohne dass der User es aktiv angeklickt hat.

## Änderungen (alle konsumieren `isLipSyncIntentional`)

### 1. `src/hooks/useSceneGenerate.ts`
- `shouldForceCinematicSync()` **löschen**, ersetzen durch `isLipSyncIntentional(scene)`.
- Der Heuristik-Zweig „hasDialog && hasCast && provider∈{happyhorse,hailuo}" entfällt komplett.
- Pre-Mark (`engine_override='cinematic-sync'`, `lip_sync_status='pending'`, `twoshot_stage='audio'`) läuft **nur** wenn `isLipSyncIntentional(scene)===true`.

### 2. `src/lib/video-composer/sceneEngineRouter.ts` — Semantik-Split
- Datei wird **rein informativ** (UI-Hinweis unter dem Prompt-Feld, keine Routing-Entscheidung mehr).
- Auto-Zweig `hasDialog && hasCast → sync-segments` **entfernen**. Ohne User-Opt-in empfehlen wir `broll` und zeigen einen Hinweis „Lip-Sync-Toggle aktivieren für echte Mundbewegung".
- Wenn `isLipSyncIntentional(scene)===true` → Empfehlung `sync-segments` (Multi-Sprecher) bzw. `sync-polish` (Solo).
- Kommentar-Header dokumentiert klar: **„Diese Funktion darf niemals Persistenz oder Kosten auslösen — sie ist eine Textempfehlung."**

### 3. `src/components/video-composer/ClipsTab.tsx`
- `lipSyncTargets`-Check ersetzt durch `isLipSyncIntentionalRow(dbScene) && !lip_sync_applied_at && lip_sync_status ∉ {running,no_voiceover}`.
- Line 940–950 „Cinematic-Sync Re-Run"-Persist bleibt (das ist ja explizites User-Reklick).

### 4. `src/hooks/useTwoShotAutoTrigger.ts`
- Trigger-Selektor bekommt zusätzlich `isLipSyncIntentionalRow(row)`-Filter. Alt-Zeilen mit `engine_override='cinematic-sync'` aber `lip_sync_with_voiceover=false` und leerem `dialog_shots` werden ignoriert.

### 5. `src/hooks/useApplyProductionPlan.ts`
- Persistierter Wert für `lip_sync_with_voiceover` bleibt genau das was der Plan liefert (nichts implizit hochsetzen).

### 6. Server — `supabase/functions/compose-video-clips/index.ts`
- Am Anfang: identischer Guard mit `isLipSyncIntentionalRow(payloadScene)`. Wenn `engineOverride='cinematic-sync'` **und** kein Opt-in-Flag → auf `broll` downgraden und `console.warn('[compose-video-clips] cinematic-sync without opt-in → broll')`. Kein `lip_sync_status='pending'`-Write, keine Sync.so-Kosten.
- Der Helfer wird als Kopie in `supabase/functions/_shared/lipSyncIntent.ts` gespiegelt (Edge Functions können keine `src/`-Imports).

### 7. Datenbank-Backfill (Migration)
Legacy-Zeilen aus der HeyGen→cinematic-sync Migration bereinigen — nur solche die nachweislich nie echten Lip-Sync gelaufen sind:

```sql
UPDATE public.composer_scenes
SET
  engine_override = 'auto',
  lip_sync_with_voiceover = false,
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  dialog_shots = NULL,
  updated_at = now()
WHERE engine_override IN ('cinematic-sync','sync-segments')
  AND lip_sync_with_voiceover IS DISTINCT FROM true
  AND dialog_mode IS DISTINCT FROM true
  AND lip_sync_applied_at IS NULL
  AND (dialog_shots IS NULL OR dialog_shots = '{}'::jsonb);
```

Bereits erfolgreich gesyncte Szenen (`lip_sync_applied_at IS NOT NULL`) und aktive Runs bleiben unberührt.

### 8. Tests (leichtgewichtig)
Neue Datei `src/lib/video-composer/__tests__/lipSyncIntent.test.ts` mit 6 Fällen:
- `{}` → false
- `{lipSyncWithVoiceover:true}` → true
- `{engineOverride:'cinematic-sync'}` → true
- `{engineOverride:'auto', dialogMode:true}` → true
- `{engineOverride:'broll', lipSyncWithVoiceover:true}` → true (Toggle gewinnt)
- Cast+Dialog+Hailuo ohne Flags → false (Regressionstest gegen genau diesen Bug)

## Warum das sauberer ist
- **Ein Ort** entscheidet über eine Zustandsfrage — nie wieder Drift zwischen 4 Modulen.
- **Router = Empfehlung**, Persistenz = Absicht. Klare Trennung.
- **Server hat harten Guard** — selbst wenn ein zukünftiger Client-Bug wieder implizit `cinematic-sync` setzt, kostet es nichts.
- **Backfill ist konservativ** — nur eindeutige Legacy-Zeilen, nichts mit `lip_sync_applied_at` oder aktiven Runs.
- **Test** friert die Regel gegen Regressionen ein.

## Nicht betroffen
- `/talking-head` Standalone-Route.
- Bereits fertig lip-synchronisierte Szenen.
- Manuell aktivierte Lip-Sync-Szenen (Toggle AN oder Engine explizit auf Cinematic-Sync).
- Sync.so v169/v183-Pipeline.

## Verifikation
1. Neue Szene, Cast + Aktion + Hailuo, Toggle AUS → B-Roll-Render, `lip_sync_status=NULL`, keine Sync.so-Kosten.
2. Selbe Szene, Toggle AN → v169-Pipeline wie bisher.
3. `select count(*) from composer_scenes where engine_override='cinematic-sync' and lip_sync_with_voiceover is not true and lip_sync_applied_at is null` → 0.
4. Test-Suite grün.

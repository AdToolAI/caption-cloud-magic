# Fix: "Szene wird gebaut…" bleibt nach Reload hängen, obwohl nichts rendert

## Problem

- DB-Status für alle 5 Composer-Szenen: `clip_status='pending'`, `replicate_prediction_id=null`, `lip_sync_status=null`, `twoshot_stage=null`, kein `clip_url`.
- UI zeigt trotzdem auf S01 das gelbe "Baut"-Badge + Vollflächen-Overlay "Szene wird gebaut… VO & Lip-Sync inklusive".
- Reload hilft nicht, weil der lokale Draft aus `localStorage` (mit `clipStatus='generating'` vom letzten optimistischen Patch) den initialen Render belegt, bevor die DB-Hydration anläuft. In manchen Fällen wird der Status danach nicht hart auf den DB-Wert geclamped (Merge-Pfade behalten lokale Werte).

## Plan (nur UI / State-Reconcile, keine Backend-Änderungen)

### 1. `VideoComposerDashboard.tsx` — Draft beim Mount entgiften

Wenn `loadDraft()` Szenen liefert, deren `clipStatus === 'generating'` ist, **aber kein `replicatePredictionId` gesetzt ist und keine `lipSyncStatus`/`twoshotStage` aktiv**, ist das ein toter optimistischer Patch aus einer früheren Session.
→ Vor dem ersten Render auf `'pending'` zurücksetzen. Das verhindert das Aufblitzen des "Baut"-Overlays für ~1s bis die DB-Sync greift.

### 2. DB-Hydration: hartes Clamping statt Merge für volatile Felder

In der DB-Sync-Schleife (lines 305–381) für die folgenden Felder **immer** den DB-Wert nehmen (kein `?? local`-Fallback), weil sie den Render-Lebenszyklus betreffen:

- `clipStatus`
- `clipUrl`
- `replicatePredictionId`
- `lipSyncStatus`
- `lipSyncAppliedAt`
- `lipSyncSourceClipUrl`
- `twoshotStage`
- `clipError`
- `previewStatus` / `previewClipUrl`

Aktuell sind die meisten schon DB-first, aber zur Sicherheit explizit machen + Kommentar, dass diese Felder **nie** aus localStorage übernommen werden dürfen.

### 3. `SceneInlinePlayer.tsx` — Self-Heal-Guard im `isWorking`-Computed

Aktuell:
```ts
const isWorking = isGenerating || status === 'generating' || lipsyncRunning;
```

Erweitern um einen "Sanity-Check": wenn `status === 'generating'` aber weder `replicatePredictionId` noch `lipSyncStatus` noch `twoshotStage` aktiv sind UND der lokale `isGenerating`-Prop false ist, ist das ein verwaister UI-State → `isWorking = false`. Zeigt dann "Wartet"-Badge + Generieren-CTA.

```ts
const hasActiveBackendJob =
  !!scene.replicatePredictionId ||
  lipSyncStatus === 'running' ||
  (twoshotStage && twoshotStage !== 'failed' && twoshotStage !== 'done' && twoshotStage !== 'complete');

const isWorking =
  isGenerating ||
  (status === 'generating' && hasActiveBackendJob) ||
  lipsyncRunning;
```

### 4. Optional: Toast bei Auto-Heal

Wenn die Draft-Entgiftung in Schritt 1 zuschlägt, einmaliger dezenter Toast: *"Szenen-Status mit Server abgeglichen"*. Reuse vom bestehenden `videoComposer.syncedFromDb`-Key.

## Was NICHT angefasst wird

- Edge Functions, DB, Realtime-Channel.
- Generierungs-Flow selbst (compose-video-clips, compose-dialog-scene).
- HappyHorse-Guard, Stage 5 Webhook — bleiben unverändert.

## Erwartetes Ergebnis

Nach diesem Fix:
1. Reload zeigt sofort 5x "Wartet"-Tile mit "Generieren"-Button (kein falsches "Baut").
2. Klick auf "Generieren" startet sauber Hailuo-Master → Sync.so v2 → Webhook → Done.
3. Verwaiste optimistische Patches heilen sich beim nächsten Mount selbst.

## Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx` (Draft-Entgiftung + DB-Sync-Clamping)
- `src/components/video-composer/SceneInlinePlayer.tsx` (Self-Heal `isWorking`)

# Lipsync Cleanup — nur die v69 Unified Pipeline behalten

## Geschütztes Ziel (NICHT anfassen)

Die aktive v69-Pipeline bleibt 1:1 erhalten:

```text
useTwoShotAutoTrigger
  → compose-twoshot-audio        (Master-VO + per-Speaker-Tracks)
  → compose-dialog-segments      (v69 Single-Face-Preclip für N=1..4)
  → sync-so-webhook              (per-pass)
  → render-sync-segments-audio-mux (Crop-Overlay + ffmpeg mux)

Support:
  - compose-dialog-scene         (dünner Forwarder → segments, beibehalten)
  - lipsync-watchdog             (Server-owned stale detection)
  - reset-lipsync-scene          (User-Retry)
  - cancel-dialog-lipsync        (User-Cancel)
  - _shared/cast-validation.ts, syncso-preflight.ts, lipsync-fail.ts,
    dialog-lock.ts, face-crop.ts, pass-face-preclip.ts
```

Diese Dateien werden **nicht** verändert (außer wo unten explizit benannt).

## Was weg kann (Datenmüll)

### A. Komplett ungenutzte Admin-/Dev-Funktionen (null Caller)

1. `supabase/functions/sync-so-probe/` — Admin-Doku-Verifier, keine Caller.
2. `supabase/functions/syncso-auto-tuner/` — Stage-F.7-Heuristik, keine Caller.
3. Zugehörige `[functions.*]`-Blöcke in `supabase/config.toml`.

### B. Legacy Per-Turn-Pipeline (durch v24/v69 abgelöst, aber noch erreichbar)

Per-Turn-Pfad (`shots[]` + per-Turn-Preclips) liefert laut Memory `unified-multi-pass-v6.md` (v24) und `v48-cleanup.md` strukturell `provider_unknown_error`. Er ist seit v24 nicht mehr der Default — aber `sync-so-webhook` und `useTwoShotAutoTrigger` haben noch v4-Branches, die historische Zeilen reaktivieren können → **genau das Risiko, das du eliminieren willst**.

Zu entfernen:
4. `supabase/functions/poll-dialog-shots/`
5. `supabase/functions/render-dialog-turn/`
6. `supabase/functions/render-dialog-stitch/`
7. Remotion-Templates (nur vom Per-Turn-Renderer benutzt):
   - `src/remotion/templates/DialogTurnClipVideo.tsx`
   - `src/remotion/templates/DialogTurnFaceCropVideo.tsx`
   - Registrierungen in `src/remotion/Root.tsx` (Compositions `DialogTurnClipVideo`, `DialogTurnFaceCropVideo`)
8. Caller-Pfade entfernen:
   - `src/hooks/useTwoShotAutoTrigger.ts`: Block `dialogShotRows` + `poll-dialog-shots`-Invoke (Zeilen ~164–179) löschen.
   - `supabase/functions/sync-so-webhook/index.ts`: v4-Branch (`state.version !== 4 || !Array.isArray(state.shots)` Zweig ab Zeile ~1449) + Fire-and-Forget `poll-dialog-shots`-Trigger (~1577) entfernen. Webhooks für historische v4-Jobs antworten dann nur noch mit `legacy_v4_ignored` 200.
   - `supabase/functions/compose-clip-webhook/index.ts`: ggf. übrig gebliebene `compose-dialog-scene`/Per-Turn-Trigger prüfen und auf segments-only reduzieren (nur falls v4-spezifischer Code vorhanden).
9. `supabase/config.toml`: `[functions.poll-dialog-shots]`, `[functions.render-dialog-turn]`, `[functions.render-dialog-stitch]` entfernen. Etwaige `pg_cron`-Jobs auf diese Funktionen via Migration unscheduled.

### C. UI-Confusion-Trigger

10. `cinematic-sync-legacy`-Option im Engine-Select entfernen — seit v24 routet sie sowieso zu `compose-dialog-segments` (nur über Umweg `compose-dialog-scene`), und der Label suggeriert fälschlich eine zweite Pipeline.
    - `src/components/video-composer/SceneCard.tsx`: Option aus `<Select>` entfernen.
    - `src/lib/video-composer/sceneEngineRouter.ts`: `cinematic-sync-legacy`-Empfehlung normalisieren auf `sync-segments`.
    - `src/types/video-composer.ts`: `engineOverride`-Union säubern.
    - `src/hooks/useTwoShotAutoTrigger.ts`: alle `engine_override === 'cinematic-sync-legacy'`-Checks entfernen — danach ist `compose-dialog-scene` nur noch defensive Backwards-Compat für Altscheiben, wird aber nicht mehr aktiv vom Client gerufen.

### D. Veraltete Sync.so-Webhook-Branches

`sync-so-webhook` enthält noch Terminal-Handling für die offiziellen `sync-official-segments-v41..v56`-Engines (siehe Memories v41–v58), die alle als `An unknown error occurred.` failten und durch v69 obsolet sind:
11. Diese Versions-Checks im Webhook auf „klassifizieren als `stale_legacy_official_segments`, refund via `failLipSync`, kein Re-Dispatch" reduzieren — analog zum bestehenden v55 stale-payload-guard. Keine Compose-Logik dafür mehr im Codepath.

## Was bewusst NICHT angefasst wird

- `lip-sync-video` Edge Function: wird von `remotion-webhook` für post-hoc Sync-Labs auf Nicht-Dialog-Clips genutzt, eigenes Feature.
- `compose-twoshot-audio`: Pflicht-Audio-Prep für v69.
- `compose-dialog-scene`: bleibt als 95-Zeilen-Forwarder (Backwards-Compat für historische Webhooks/Re-Arms).
- Sämtliche `_shared/`-Utilities, die `compose-dialog-segments` braucht.
- DB-Migrationen / `composer_scenes`-Schema: keine Datenlöschung. Historische Zeilen mit `dialog_shots.version ∈ {2,4,41..56}` bleiben in der DB, sind aber nicht mehr reaktivierbar — User-Reset über `reset-lipsync-scene` schreibt sie auf v69-Form um.
- Memory-Dateien unter `mem/architecture/lipsync/v23..v68*.md`: dokumentieren historischen Kontext, beeinflussen Runtime nicht. Optional separat aufräumen — **nicht in diesem Cleanup**, um v69-Invariants-Kette nicht zu zerreißen.

## Verifikation nach Cleanup

1. `grep -r "poll-dialog-shots\|render-dialog-turn\|render-dialog-stitch\|cinematic-sync-legacy\|sync-so-probe\|syncso-auto-tuner\|DialogTurnClipVideo\|DialogTurnFaceCropVideo"` darf nur noch in Memory-Dateien Treffer haben.
2. `supabase/config.toml`: keine Einträge mehr für die gelöschten Funktionen.
3. Deploy nur der geänderten Funktionen: `sync-so-webhook`, `compose-dialog-scene` (unverändert, aber neu validieren), plus Löschung der vier Functions via `supabase--delete_edge_functions`.
4. Eine 4-Sprecher-Testszene neu starten und im Log `v69_preclip_unified` sehen — keine Erwähnung von `poll-dialog-shots`, `render-dialog-turn`, `v4`, `cinematic-sync-legacy`.
5. Neue Memory `mem/architecture/lipsync/v70-legacy-removal.md` anlegen, die explizit aufzählt, was gelöscht wurde, damit zukünftige Cleanups nicht aus Versehen den Forwarder oder die `_shared/`-Utilities killen.

## Risiken / Tradeoffs

- **Historische v4-Scheiben** (~20 Zeilen in DB) sind nach dem Cleanup nur über User-Klick „Lip-Sync neu rendern" wiederbelebbar. Akzeptabel — Watchdog hat sie ohnehin längst refundiert.
- **`compose-dialog-scene` Forwarder bleibt**, falls ein historisches `sync-so-webhook`-Re-Arm noch unterwegs ist. Kein laufender Caller, aber niedrige Lösch-Priorität.
- **Keine Migrationsänderung an `composer_scenes`**: wir entwerten nur Codepfade, nicht Daten. Reversibel via Git, falls ein verstecktes Feature doch noch eine der Funktionen braucht.

## Bug: v107 ↔ v105 Konflikt — `multi_speaker_auto_detect_blocked`

### Root Cause (DB-gestützt aus Code, nicht spekuliert)

In `compose-dialog-segments/index.ts`:

1. **v107 (Zeile ~`wantPassPreclip`):** erzwingt für `speakers.length >= 2` zwingend den **Single-Face-Preclip-Pfad** (`usePassPreclip = true`).
2. **Preclip-Branch (Zeile 2727–2737, v103):** setzt für jeden Preclip-Pass bewusst
   ```
   syncOptions.active_speaker_detection = { auto_detect: true }
   ```
   Das ist korrekt und doc-strict: der 512×512 Single-Face-Crop hat per Definition genau **ein** Gesicht, also ist `auto_detect` unzweideutig (und sync-3 lehnt jeden anderen ASD-Shape auf einer Preclip ab → das war ja gerade der v103-Fix).
3. **v105 Hard-Guard (Zeile 3086–3097):** blockiert unkonditional jede Dispatch mit `speakers.length >= 2 && auto_detect === true` — **unabhängig davon**, ob das Video eine Full-Plate oder eine Single-Face-Preclip ist.

→ Mit v107 läuft jeder N≥2 Pass durch den Preclip-Pfad. Der Preclip-Pfad setzt korrekterweise `auto_detect: true`. Die v105-Guard wurde aber zur Zeit geschrieben, als Multi-Speaker noch auf der **Full-Plate** gelandet ist — dort war `auto_detect:true` gefährlich (mehrere Gesichter ⇒ Sync.so routet falsch ⇒ "Animorph"). Auf der Single-Face-Preclip ist `auto_detect:true` dagegen die einzige doc-konforme Option.

Der Guard feuert deshalb fälschlich auf einen Pfad, den er nie hätte blockieren sollen — und legt die gesamte Pipeline lahm (genau das, was im Screenshot zu sehen ist: `multi_speaker_auto_detect_blocked`, alle 4 Speaker bleiben in "WARTET").

### v108 Fix

**Nur eine semantische Korrektur** an der v105-Guard. Keine Änderung an v107, v106, v103.

In `supabase/functions/compose-dialog-segments/index.ts` ~Zeile 3086–3097:

```ts
// v108 — Single-Face-Preclip hat per Definition exakt EIN Gesicht; auto_detect
// ist dort die einzige doc-konforme Option (v103). Die v105-Guard zielt nur
// auf den Full-Plate-Pfad mit mehreren Gesichtern — dort verursacht
// auto_detect das "Animorph"-Routing. Auf preclip wird sie ausgeschaltet.
if (
  !usePassPreclip &&
  speakers.length >= 2 &&
  asdForProbe?.auto_detect === true
) {
  return await failBeforeProviderDispatch(
    "multi_speaker_auto_detect_blocked",
    "asd_auto_detect_on_multi_speaker_fullplate",
    "Refusing to dispatch sync-3 with auto_detect=true on a multi-speaker FULL-PLATE; preclip path required.",
    500,
    { v105_probe: v105Probe },
  );
}
```

Das `!usePassPreclip` schließt v107 + v103 wieder konsistent zusammen:
- N≥2 Full-Plate + auto_detect → **block** (alte v105-Intention bleibt erhalten)
- N≥2 Preclip + auto_detect → **erlaubt** (v103/v104 Pfad, einziger doc-konformer Shape)
- N≥2 Full-Plate + deterministic ASD (coords / bbox-url) → erlaubt
- Edge-Speaker `skipPreclipForEdgeSpeaker` + `bounding_boxes_url` → erlaubt (war auch schon vor v108 ok, ASD ist nicht auto_detect)

### Cleanup für das aktuelle Failure

Migration, die für die im Screenshot blockierte Szene:
1. die `wallets`-Buchung idempotent **refunded** (Lookup über die letzte `clip_error` = `multi_speaker_auto_detect_blocked` Row in `dialog_scenes`/`dialog_shots` des Users),
2. die Szene resettet (`lip_sync_status = null`, `twoshot_stage = null`, `clip_error = null`, `dialog_shots = null`, `plate_face_map = null`, `plate_identity = null`),
3. mögliche `syncso_inflight_jobs` + `dialog_dispatch_locks` für die Szene räumt.

Die Szenen-ID lese ich direkt vor der Migration aus `supabase--read_query` (letzte Row in `dialog_scenes` des aktuellen Users mit `clip_error LIKE 'multi_speaker_auto_detect_blocked%'`), damit kein falscher Refund passiert.

### Verification

Nach dem Fix einmal die Szene erneut dispatchen und prüfen:
- `syncso_dispatch_log.meta.dispatch_video_kind === "preclip"` für **alle 4** Passes
- `meta.asd_mode === "auto_detect"` (nicht mehr `coordinates`)
- `meta.options_keys` enthält **kein** `temperature`/`occlusion_detection_enabled` (v106 bleibt aktiv)
- Keine `provider_unknown_error` mehr, kein `multi_speaker_auto_detect_blocked`

### Memory

`mem/architecture/lipsync/v108-preclip-autodetect-allowed.md` — dokumentiert die Ausnahme: v105-Guard gilt nur für Full-Plate, Preclip + auto_detect ist die kanonische sync-3-Form für Multi-Speaker.
Index-Eintrag in `mem/index.md` aktualisieren.

### Geänderte Dateien

- `supabase/functions/compose-dialog-segments/index.ts` (Guard-Condition, ~5 Zeilen)
- `supabase/migrations/<timestamp>_v108_refund_and_reset_blocked_scene.sql`
- `mem/architecture/lipsync/v108-preclip-autodetect-allowed.md` (neu)
- `mem/index.md` (eine Zeile)

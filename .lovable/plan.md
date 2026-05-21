## Status

Drei konkrete Fixes ausgerollt, die zusammen den „Thumbnail zeigt Two-Shot, Play zeigt anderen Clip"-Bug erschlagen:

1. **Preview spielt keine stale Clips mehr.** `ComposerSequencePreview` betrachtet eine Szene nur noch als spielbar, wenn `clipStatus === 'ready'` UND `clipUrl` gesetzt ist. Ein zurückgesetzter Scene-State (clip_status='pending', clip_url=NULL) kann nicht mehr durch alten Local-State umgangen werden — das alte Hailuo-Video aus Vorrender-Versuchen kann nicht mehr abgespielt werden.

2. **Anchor respektiert Szene + Outfit.** Im Cinematic-Sync-Pfad in `compose-video-clips`:
   - Outfit-Look-IDs werden serverseitig aus `avatar_outfit_looks` (`cover_url`/`front_url`) aufgelöst und als Portraits an `compose-scene-anchor` übergeben — Casual/Brand-Outfits landen jetzt im Anchor statt der bare Avatar-Portraits.
   - Anchor-Prompt kombiniert immer das Two-Shot-Framing (`neutralTwoShotPrompt`) MIT der bereinigten Szenenbeschreibung. Vorher wurde bei ≥2 Sprechern stur ein neutraler grauer Plate ohne jeglichen Szenenkontext gerendert — das war exakt der „grauer Hintergrund statt Szene"-Effekt im Screenshot.
   - `ANCHOR_AUDIT_VERSION` von 4 → 5 erhöht, damit alle zuvor gepinnten grauen Neutral-Anchors automatisch verworfen und neu komponiert werden.

3. **Testszene zurückgesetzt.** Szene `70a34582…` ist auf `clip_url=NULL`, `clip_status=pending`, `lip_sync_status=pending`, `twoshot_stage=master_clip`, `reference_image_url=NULL` zurückgesetzt; `scene_anchor_cache` für diese Szene gelöscht; alte `syncJobs`/`faceMap`/`anchor_face_audit` aus `audio_plan.twoshot` entfernt.

## Bereits vorhandene Gates, die jetzt sauber greifen

- Anchor-Compose hat einen Face/Human-Audit + Identity-Audit + 1× Strict-Retry (`compose-video-clips` Z. 1011–1064). Bei `faces < expected` nach 2 Versuchen → `anchor_missing_speakers`-Fehler, kein Hailuo-Call.
- Master-Clip-Audit in `compose-twoshot-lipsync` erkennt schon `source_clip_missing_speakers` und macht idempotenten Refund.
- Auto-Lipsync-Trigger in `compose-clip-webhook` startet Two-Shot-Lipsync nur, wenn `clip_url` gesetzt ist.

## Nicht angefasst

- Pre-Roll/Tail (0.12s/0.08s) und adaptive Temperature (0.85 / 1.0 bei <2s) bleiben — das war Lip-Sync-Feintuning und ist unabhängig vom Anchor/State-Problem.
- Solo-Plate-per-Speaker (Variante B) und Face-Crop-Lipsync (Variante C) sind nicht implementiert; erst neu bewerten, nachdem ein Re-Render mit den neuen Anchor-Regeln vorliegt.

## Nächster Schritt für dich

1. In Szene 1 (Hook) auf „🎥 Clip + Lip-Sync neu rendern" klicken.
2. Erwartung:
   - Anchor zeigt beide Charaktere in den gewählten Casual-Outfits IN der Büro-/Laptop-Szene (nicht grauer Hintergrund).
   - Hailuo-Masterclip zeigt durchgängig beide Personen.
   - Lip-Sync läuft auf dieser zwei-personen Quelle und sollte das Bauchredner-Verhalten auf Samuels zweitem Turn nicht mehr zeigen, sobald der Masterclip real beide Sprecher hat.

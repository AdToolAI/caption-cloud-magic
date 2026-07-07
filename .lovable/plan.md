## Was wir haben (Bestandsaufnahme)

- `brand_characters.id` (UUID) existiert.
- `CastRef` + `asBaseCharacterId` + `resolveCharacterId` + `mentionToCastRef` normalisieren Prefixe (`outfit:`, `catalog:`, `lib:`) auf die Base-UUID.
- `composer_scenes.characterShots[]` speichert bereits `{ characterId, shotType, portraitUrl }`.

**Das eigentliche Problem**: Zwei Pfade in den Edge-Functions parsen zusätzlich noch Namen aus dem Freitext-Skript und matchen fuzzy — genau da entsteht die Verwechslung.

## Ziel

1. **Cast & World = Single Source of Truth via ID.** Alles, was in `compose-video-clips` und `compose-dialog-segments` ankommt, referenziert eine `brand_characters.id`. Freitext-Speaker-Labels sind reine Anzeige und werden aus IDs gerendert, nicht umgekehrt geparst.
2. **Unbegrenzte Aktionen mit stabilem Lipsync**: Ein "Face-Lock"-Layer trackt pro Character-ID die Gesichts-Region über die gesamte Szene (auch beim Autofahren, Kämpfen), sodass Sync.so immer auf einen ID-verankerten Face-Crop dispatcht — egal was der Körper macht.

## Teil A — Speaker-Resolution rein ID-basiert (Backend-only)

### A1. `composer_scenes.dialog_turns` als kanonische Turn-Liste (jsonb, additiv)

Neue Spalte `dialog_turns jsonb DEFAULT '[]'::jsonb`. Format:

```ts
DialogTurn = {
  turnId: string;         // uuid
  characterId: string;    // brand_characters.id — Pflicht
  text: string;           // ohne "NAME:"-Prefix
  mood?: string;
  order: number;
};
```

Backfill-Migration füllt `dialog_turns` einmalig aus dem bestehenden `dialogScript` + `characterShots[]` mittels des vorhandenen Fuzzy-Matchers. Ab dann ist `dialog_turns` die Wahrheit.

### A2. `compose-video-clips/index.ts` — Namens-Resolver deaktivieren

- Neuer Gate `FEATURE_ID_ONLY_CAST_RESOLUTION` (default `true`).
- Wenn `scene.dialog_turns.length > 0`: **STAGE 4/5 Namens-Fuzzy komplett übersprungen**. `effectiveShots` = Deduped `dialog_turns.map(t => resolveByCharacterId(t.characterId))`.
- `resolveByCharacterId()` läuft strikt: `brand_characters` SELECT by `id`. Kein Portrait → Guard-Error `character_without_portrait: <id>` (mit ID, nicht Name, für eindeutiges Debugging).
- Legacy-Pfad (dialog_turns leer) bleibt für alte Szenen, wird aber pro Run in `syncso_dispatch_log.meta.speakers_source = 'legacy_name_match'` markiert — messbare Migration.

### A3. `compose-dialog-segments/index.ts` — Pass-Zuordnung via ID

- `speakerIdxForTurn(turn, orderedCastIds)` gibt Slot-Index aus der ID-Position in der de-duplizierten Cast-Liste zurück — **nie mehr aus geparstem Namen**.
- v166 anchor-identity-bridge, v167 preclip-pre-fanout, v168 per-pass-lock nutzen weiterhin die gleiche Slot-Nummer — jetzt aber deterministisch aus ID abgeleitet.
- Log-Marker `speaker_idx_source='dialog_turn.characterId'`.

### A4. Anti-Regression Guards

- Runtime-Assert in beiden Edge-Functions: Jeder Speaker/Turn, der in die Sync.so-Dispatch-Queue geht, muss ein valides `brand_characters.id` (UUID-regex + DB-Hit) haben. Sonst harter Reject mit `id_only_enforcement_violation` — kein Silent-Fallback auf Namen.
- Unit-Test in `supabase/functions/_shared/*.test.ts`: künstliches Skript mit `SPRECHER 1:` + populierte `dialog_turns` → Ergebnis nutzt IDs, nicht "Sprecher 1".

## Teil B — Face-Lock für unbegrenzte Aktionen

Aktueller Ablauf: Preclip = statischer Crop um die Bounding-Box aus **einem** Anchor-Frame. Wenn der Charakter im Auto sitzt und sich bewegt oder kämpft, wandert das Gesicht aus dem Crop → Sync.so verliert den Face-Lock.

### B1. Face-Track pro Character-ID (neue Tabelle)

```
scene_face_tracks (
  scene_id uuid, character_id uuid, pass_idx int,
  track_kind text,           -- 'anchor' | 'motion'
  frames jsonb,              -- [{ t_ms, bbox:[x,y,w,h], confidence }]
  face_embedding vector(512),-- Gemini Vision face-descriptor der ID
  created_at timestamptz,
  primary key (scene_id, character_id, pass_idx)
)
```

RLS: owner via `scene_id → composer_scenes.user_id`. GRANT `authenticated` + `service_role`.

### B2. Neue Edge-Function `track-scene-faces`

- Input: `sceneId`, `characterIds[]`, `plateUrl`.
- Läuft nach Plate-Generation, vor v167 Preclip-Fanout.
- Extrahiert Face-Embedding pro `character_id` aus dessen `brand_characters.reference_image_url` (bereits vorhanden — der Portrait-Anchor).
- Trackt Face-Detektionen im Plate über die gesamte Dauer (Sampling 5–10 fps reicht für Preclip-Cropping), matcht gegen das Embedding der ID.
- Schreibt `frames[]` in `scene_face_tracks`. Kein zweiter Charakter kann "übernehmen", weil pro ID separater Track.
- Kosten-Guard: Wenn `plateUrl` schon in `frame_face_cache` liegt, reuse.

### B3. `pass-face-preclip` wird trajectory-aware

Aktuell: statischer Crop-Rect für die ganze Preclip-Dauer.

Neu: Preclip-Renderer (ffmpeg oder Remotion-Template `DialogTurnFaceCropVideo.tsx`) liest den `scene_face_tracks.frames[]` für `(scene, characterId, pass)` und cropt **per Frame** entlang der Track-Trajektorie, mit sanftem Kalman-Smoothing (Jitter-Filter). Ausgabe bleibt ein Single-Face-Preclip, aber das Gesicht bleibt im Frame egal wie stark sich der Body bewegt.

Wenn Track-Confidence zwischen Frames dropt (< 0.5): Fallback auf letzte verlässliche BBox + Padding-Boost, keine harten Sprünge.

### B4. ASD-Payload bleibt v199 (frame_number + coordinates)

Die Koordinaten werden jetzt aus dem **stabilisierten** Preclip-Center genommen (immer Bildmitte, weil der Track dorthin gecroppt hat) → ASD hat es leicht, Sync.so kann nicht mehr auf den falschen Speaker springen weil im Preclip nur ein Face existiert und dieses Face nachweislich die richtige `character_id` ist (Embedding-Verified).

### B5. Stitch-Layer

`DialogStitchVideo.tsx` v198 Masken kaschieren bereits leichte Morphs. Neu: Wenn `scene_face_tracks` vorhanden, wird die Maske **auf den Face-Track zentriert**, nicht auf einen statischen Punkt. Dadurch bleibt die Maske über einem bewegten Kopf, statt am Startpunkt zu kleben.

## Was NICHT geändert wird

- **Kein Frontend-Change**. Der bestehende Editor schreibt bereits `characterShots[]` mit IDs; `dialog_turns` wird per Backfill/Trigger aus vorhandenen Daten abgeleitet, User merkt nichts.
- Preisformel `ceil(durSec) × 9 × N_passes` unverändert.
- v199 Preclip-Coords-Primary bleibt aktiv.
- v198 Stitch-Masken bleiben, nur ihr Center-Point wird track-aware.
- `sync-so-webhook`, Retry-Ladder, Idempotenz-Kontrakt unangetastet.

## Rollback

- `FEATURE_ID_ONLY_CAST_RESOLUTION=false` in `system_config` → Legacy-Namens-Resolver reaktiviert.
- `FEATURE_FACE_TRACK_PRECLIP=false` → statischer Crop wie heute, `scene_face_tracks` wird ignoriert.
- Beides ohne Deploy per DB-Toggle.

## Validierung

1. **ID-Enforcement**: Test-Szene mit 3 Sprechern, im Skript-Text alle Namen absichtlich verwechselt (`SAMUEL:` sagt Sarahs Text). `dialog_turns.characterId` bleibt korrekt → Sync.so lippt korrekt am richtigen Face. `syncso_dispatch_log.meta.speakers_source='dialog_turns'`.
2. **Face-Lock**: Test-Szene mit einem Charakter der während des Dialogs den Kopf stark bewegt (z.B. "schaut sich im Auto um"). Preclip-MP4 aus `dialog-plates/preclips/…` visuell prüfen → Gesicht bleibt zentriert. Sync.so-Output zeigt keinen Morph-Drift.
3. **Unbegrenzte Aktion**: Kampf-Szene, zwei Charaktere, viel Bewegung, mit Dialog. Erwartet: beide Preclips halten je ein Face zentriert, Lipsync sitzt auf beiden korrekt, keine Verwechslung.

## Rollout-Reihenfolge

1. Migration `dialog_turns` + Backfill.
2. `scene_face_tracks` Tabelle + `track-scene-faces` Edge-Function.
3. `compose-video-clips` und `compose-dialog-segments` auf ID-Only umstellen (Feature-Flag on).
4. `pass-face-preclip` trajectory-aware machen (Feature-Flag on).
5. `DialogStitchVideo.tsx` Masken-Center track-aware (nur wenn `scene_face_tracks` vorhanden — sonst wie heute).

Jeder Schritt einzeln deploybar & einzeln rollback-fähig.

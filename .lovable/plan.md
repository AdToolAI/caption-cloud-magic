# Cast & World — Architektur-Audit (read-only, keine Codeänderungen)

Kernbefund vorab: **Die IDs sind formal kanonisch, aber sie sind nirgends erzwungen.** Es existiert kein einziger Fremdschlüssel von `composer_scenes` auf `brand_characters` / `brand_locations` / `brand_props`. Alles hängt an Applikationsdisziplin. An mehreren Stellen fällt der Code auf **Namen** bzw. **Array-Index [0]** zurück, wenn eine UUID fehlt. Der Lip-Sync-Kern selbst ist davon gut isoliert.

## A. Cast & World Data Model

| Entität | Tabelle | PK | Owner | Anchor-Feld | Archiv | Rolle |
|---|---|---|---|---|---|---|
| Characters | `brand_characters` (49 Sp.) | `id uuid` | `user_id`, opt. `brand_kit_id` | `reference_image_url NOT NULL`, `portrait_url` | `archived_at` | SoT |
| Locations | `brand_locations` | `id uuid` | `user_id`, `brand_kit_id` | `reference_image_url NOT NULL` | `archived_at` | SoT |
| Buildings | `brand_buildings` | `id uuid` | `user_id` | `reference_image_url` | `archived_at` | SoT |
| Props | `brand_props` | `id uuid` | `user_id` | `reference_image_url` | `archived_at` | SoT |
| Wardrobe/Outfits/Posen | `avatar_outfit_looks`, `avatar_wardrobe_variants`, `avatar_pose_variants` | `id uuid` | via `avatar_id` → CASCADE | `cover_url` / `image_url` | – | Kind |
| Location-Varianten | `location_prop_variants`, `location_vibe_variants` | `id uuid` | via `location_id` → CASCADE | `image_url` | – | Kind |
| Style/World | `motion_studio_style_presets` | `id uuid` | `user_id` | `preview_thumb_url` | – | SoT, einziger echter FK von `composer_scenes` |
| Paralleles Modell | `motion_studio_characters` / `_locations` (+ Varianten) | `id uuid` | `user_id`, `workspace_id` | `reference_image_url` (nullable) | **kein `archived_at`** | zweite SoT |
| Katalog | `*_catalog_previews` | `id uuid` | keiner | `image_url` | – | reiner UI-Spiegel |

Vehicles: existieren nicht als eigene Entität (UNKNOWN, ob als Prop geführt).
**Zwei parallele Wahrheiten:** `brand_*` (Composer/Lip-Sync) und `motion_studio_*` (eigenes Consent-Modell). Nur `brand_*` ist im Lip-Sync-Pfad verdrahtet.

## B. Scene References

Kein Join-Table-Modell — alles denormalisiert auf `composer_scenes` (130 Spalten):
- kanonisch: `mentioned_character_ids uuid[]`, `mentioned_location_ids uuid[]`, `scene_assets jsonb` (`{id,type,role,displayName}[]`), `applied_style_preset_id` (echter FK, `SET NULL`), `dialog_turns[].characterId`
- legacy: `character_shot` (Singular), `character_shots[].characterId` — enthält in echten Zeilen **Slugs** wie `"matthew-dusatko"` statt UUIDs; `ensureSceneAssetsForScene()` (`_shared/asset-ref.ts:110-189`) verwirft diese still per `isUuid()`-Check
- nur Cache/Darstellung: `reference_image_url`, `lock_reference_url`, `character_image_url`, `first_frame_url`, `last_frame_url`, `end_reference_image_url`, `preview_anchor_url`, `dialog_shots.segments[].speakerName`
- echte Join-Tabellen nur: `scene_face_tracks` (scene↔character, CASCADE) und `brand_character_usage` (Analytics)

## C. Identity Flow

`characterId (UUID)` → `brand_characters` → `portrait_url/reference_image_url` → **Komposition** in `compose-scene-anchor` (Gruppenbild aus allen nicht-`absent` Shots) → Upload `composer-frames` → geschrieben nach `composer_scenes.reference_image_url` (`compose-video-clips:2972,3693`) → Provider.

- **Kopiert, nicht dynamisch resolved.** Ändert der Nutzer später das Portrait, bleibt die Szene auf dem alten Anchor. Kein Trigger, kein Invalidator für `scene_anchor_cache`.
- `speaker_idx` ist deterministischer Geometrie-Key (First-Appearance über `dialog_turns`, `_shared/scene-dialog-turns.ts:161-206`), **nicht** Identität. Nur `resolveIdentityViaRekognition` nutzt ihn als Key im `assignmentLock` (`{speakerIdx: characterId}`) und `sync-so-webhook` als Fallback-Label.
- Multi-Speaker hart auf 4 begrenzt (`_shared/cast-validation.ts:35-38`, FROZEN-INVARIANTS I.6); `character_id` darf nicht unter zwei `speaker_idx` erscheinen.
- Hauptcharakter = `characterShots[0]` (`types/video-composer.ts:255`, `useApplyBriefingManifest.ts:98`). Kein Konsistenzcheck gegen die Sprecherreihenfolge aus `dialog_turns` (offener Befund).
- **Kein Character-Asset-Hash.** Es gibt nur `dialog_content_hash`, `audio_asset_hash`, `voice_configuration_hash`. Anchor ist an `plate_generation` / `anchor_confirmed_at` / `active_run_id` gebunden, aber nicht an eine Asset-Revision.

## D. Prompt Flow

`Scene-Prompt` + `[Cast: Name (Shot)]` (`applyCastToPrompt.ts:70-94`, idempotent, UUID-strikt seit v211) + `<!--scene-assets-->@slug` (`applySceneAssetsToPrompt.ts:56-67`, idempotent) + `Cinematography:`-Suffix (`buildShotPromptSuffix.ts`) → Server: `[CastActions]` (`compose-video-clips:1133-1148`, Existenzcheck vor Insert) + Cast-Union speakers-first (`:1318-1370`) → Provider-Sanitizer (`happyhorse-green-net.ts:107`).

**Befund:** `supabase/functions/_shared/cast-clause.ts` mit `buildCastClause`/`validateCastContract` (v370-Vertrag) **existiert im Repo nicht mehr**. Ob der v370-Schutz gegen Mehrfach-Injektion heute noch aktiv ist, ist damit nicht verifizierbar. Continuity fließt nicht in den Prompt-Text (nur UI-Warnungen).

## E. Visual Slot Arbitration

Regel ist eindeutig und codebelegt: **Character-Anchor gewinnt immer.** `protected` wird nur für `role === 'character'` gesetzt (`resolveVisualInputs.ts:52-59`); bei Seedance 2.5 (`mode: 'exclusive'`) erzwingt `slotsCollide` immer Kollision, der Anchor nimmt den Slot (`anchor_takes_exclusive_slot`), Referenzen werden getrimmt. Dispatch-Guard wirft hart (`seedance_protected_anchor_payload_contract_failed`, `compose-video-clips:4464-4482`). Budget sortiert `protected` vor Score (`referenceBudget.ts:50`).

**Ein Prop oder eine Location kann `reference_image_url` nicht überschreiben** — alle Schreibstellen sind character-getrieben. Locations gewinnen den First-Frame nur in nicht-identitätskritischen `transition-priority`-Szenen.

Strategien: `character_anchor`, `uploaded_reference`, `generated_still` sind im Resolver **nicht unterscheidbar** (alle nur `hasAnchorImage`-Check). `previous_final_frame` degradiert bei Lip-Sync (`lipsync_continuity_disabled`).

## F. Mutation / Staleness

Ist-Zustand: **es passiert nichts.**
- Keine Trigger auf `brand_characters/_locations/_props` außer `updated_at`-Stampern.
- Staleness existiert nur scene→scene (`trg_continuity_staleness`, `propagate_continuity_staleness`, `composer_continuity_queue`, `continuity_source_scene_id`) — nie asset→scene.
- Kein Revisions-/Hash-Vergleich gegen `brand_*.updated_at` im Client.
- Kein automatisches Re-Render, aber auch **keine Warnung** an den Nutzer.

## G. Dangerous Drift

1. `SceneAvatarMode.tsx:105-110` — resolved Character **per Name** neu und fällt auf `accessible[0]` zurück. Zwei gleichnamige Charaktere → falsches Portrait.
2. `ensurePlanEnsemble.ts:40-41,151`, `planCastDedup.ts:35`, `finalizePlanCanonical.ts:249` — Cast-Key kollabiert auf normalisierten Namen, wenn `characterId` fehlt → zwei „Anna" werden zu einer.
3. `character_shots[].characterId` enthält Slugs; `ensureSceneAssetsForScene` verwirft sie still.
4. `useComposerPersistence.ts:183-304` schreibt `mentioned_character_ids`, `mentioned_location_ids`, `scene_assets` **überhaupt nicht** — im Gegensatz zu `VideoComposerDashboard.tsx:1203,1395` und `useApplyProductionPlan.ts:1063-1072`. Zwei Save-Pfade, unterschiedlicher Spaltenumfang.
5. Client/Server-Zwillinge: `resolveSceneOutput` (byte-identisch, Paritätstest) und `visualSource` (semantischer Test) sind abgesichert — `slotArbitration.ts`/`referenceBudget.ts`/`types.ts` vs. `_shared/visual-inputs.ts` sind Copy-Paste **ohne Paritätstest**.
6. `CapCutEditor.tsx:1523` nutzt `scene-${Date.now()}` statt `crypto.randomUUID()`.
7. Löschung: keine FKs → dangling UUIDs, kein Fallback auf Name/URL. Ein Projekt ist nach Löschen eines World-Assets **nicht mehr reproduzierbar renderbar** (bereits gerenderte Clips bleiben, jeder Re-Render bricht am Anchor).
8. Duplizieren: IDs werden 1:1 übernommen (Alias, kein Snapshot). „Projekt duplizieren" (`parent_project_id`) und „Template anwenden" konnten nicht lokalisiert werden — UNKNOWN.
9. `archived_at` wird an keiner geprüften Render-Stelle gefiltert — UNKNOWN für die Picker-Hooks.

## H. Lip-Sync Safety

Kritisch und heute eingehalten:
- Anchor-Pflicht vor Provider-Spend (`v195_cinematic_sync_anchor_missing`).
- `protected` nur für Character-Rolle → Props/Locations können den Anchor nie verdrängen.
- Continuity ist bei Lip-Sync abgeschaltet (`lipsync_continuity_disabled`).
- `characterId` ist Identität, `speaker_idx` nur Geometrie; `cast-validation.ts` erzwingt 1:1.
- Max. 4 Sprecher, FROZEN.

Offene Risiken für Lip-Sync: kein immutabler Character-Snapshot im Run-Contract (nur `plate_generation`), keine Absicherung gegen Portrait-Änderung während eines laufenden Runs, `characterShots[0]` vs. Sprecherreihenfolge nicht abgeglichen.

## I. Recommendations (nur Architektur, keine Umsetzung)

1. **Asset-Revision statt Content-Hash**: `revision int` auf `brand_characters/_locations/_props`; Szenen speichern `cast_dependency_revisions jsonb`. Erkennung ≠ automatisches Re-Render — nur Badge, wie bei Continuity.
2. **Immutabler Run-Snapshot**: Anchor + Character-Revision beim Start eines Runs an `active_run_id` einfrieren.
3. **Ein Identity-Resolver**: Name-Fallbacks aus `SceneAvatarMode`, `ensurePlanEnsemble`, `planCastDedup`, `finalizePlanCanonical` entfernen bzw. auf „fail loud" umstellen.
4. **Persistenz-Vertrag**: alle Scene-Writer schreiben dieselbe Spaltenmenge; Contract-Test dagegen.
5. **Paritätstest** für `visual-inputs.ts` ↔ Client-Zwillinge.
6. **Referentielle Integrität** wenigstens per Validierungsfunktion + Soft-Delete-Guard (kein Hard-Delete, solange Szenen referenzieren).
7. `character_shots`-Slugs einmalig migrieren, danach Legacy-Feld einfrieren.
8. v370-Cast-Clause klären: wiederherstellen oder Memory korrigieren.

## J. v431-Relevanz

**In v431 relevant (State-/Writer-Nähe):**
- Der Anchor-Snapshot-Vertrag berührt `active_run_id` / `plate_generation` direkt → gehört zu G0 als *Lesevertrag* (Run-Guard muss den Anchor mit einschließen), nicht als Umbau.
- Der Persistenz-Split in `useComposerPersistence` ist ein Scene-Writer und gehört ins v431-Writer-Inventar.

**Eigener späterer Track (nicht in v431 mischen):**
- Asset-Revisionen/Staleness, Löschen/Archivieren, Duplizieren, Name-Fallbacks, Prompt-Injektion, Slot-Arbitrierungs-Parität. Das ist Identity/Dependency, nicht State-Machine.

Keine Codeänderungen vorgenommen. Bestehende Lip-Sync-Verträge unangetastet.

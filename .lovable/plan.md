# Phase 5 — Restplan (5.3 → 5.6)

Phase 5.1 (Fast-Preview) und 5.2 (Skeleton) sind live. Diese vier Sub-Phasen schließen Phase 5 ab und bringen den Composer auf 100 % Artlist-Niveau.

Reihenfolge folgt dem ursprünglichen Vorschlag: 5.3 → 5.5 → 5.4 → 5.6 (Reroll bringt sofort Wow, Smart-Trim killt das größte Qualitätsproblem, Auto-Pacing braucht Audio-Analyse, Undo zuletzt weil DB-Schema + Cross-Cutting).

---

## Phase 5.3 — Seed-Lock + 4er-Variant-Grid (Reroll Pro)

**Ziel:** „Generieren" zeigt 4 Varianten parallel als Fast-Preview, User wählt eine → wird zum HQ-Master befördert. Seed gelockt, damit „nochmal aber etwas anders" reproduzierbar bleibt.

**DB-Migration**
- `composer_scenes.seed INTEGER` (master seed, nullable)
- `composer_scenes.seed_variations JSONB` — Array `[{seed, previewUrl, status, createdAt}]` (max 4 Einträge)

**Edge Functions**
- `generate-fast-preview` erweitert: optional `seed` Param → an LTX-Input weiterreichen, Result-URL in `seed_variations[i].previewUrl` schreiben statt `preview_clip_url`.
- Neuer Wrapper `compose-scene-variants`: nimmt `sceneId` + `count (1-4)` + optional `parentSeed`, generiert n zufällige Seeds (oder Variationen um parentSeed ±100), feuert `generate-fast-preview` parallel.
- `compose-video-clips` (HQ) akzeptiert `seed` Param und persistiert ihn als Master.

**UI**
- Neue Komponente `RerollVariantGrid.tsx` (2x2 Grid, jede Zelle = `SceneClipProgress`-ähnlicher Slot mit Seed-Badge + „Übernehmen" Button).
- Eingebettet im `SceneCard` (oder als Sheet hinter „⚡ Reroll"-Button im SceneClipProgress).
- „Übernehmen" → schreibt gewählten Seed in `composer_scenes.seed`, kopiert previewUrl als `preview_clip_url`, triggert HQ-Render mit diesem Seed.
- Lock-Icon neben Prompt zeigt aktiven Seed (klickbar = entsperren).

**Aufwand:** ~6 Files, 1 Migration. Frontend-lastig.

---

## Phase 5.4 — Auto-Pacing & BPM-Sync

**Ziel:** Wenn ein Music-Track im AssemblyConfig hängt, snappt der Storyboard-Editor Szenenlängen automatisch auf 4/8/16-Beat-Grid.

**DB-Migration**
- `audio_tracks.bpm NUMERIC` (sofern Tabelle existiert — sonst auf `composer_projects.assembly_config.music.bpm` JSON-Feld zurückfallen, was schon JSONB ist, kein Schema-Change nötig).

**Edge Function**
- Neue `analyze-music-bpm`: nimmt `audioUrl`, lädt MP3 ins Memory, läuft `essentia.js` (oder lightweight Onset-Detection mit Web Audio Analyser über FFmpeg-Wasm Decode) → liefert `{bpm, downbeats: number[]}`.
- Cache: Hash der URL → Wert in Tabelle `audio_bpm_cache (url_hash, bpm, downbeats, created_at)` (Migration nötig).
- Triggert auch im Music-Studio-Upload-Flow (idempotent).

**UI**
- Neue `AutoPacingCard.tsx` im StoryboardTab oben: zeigt BPM, „Auto-Snap aktivieren" Toggle, Slider „Beats pro Szene (4/8/16)".
- Bei Aktivierung: `scenes.map(s => ({...s, durationSeconds: nextBeatGrid(s.durationSeconds, beatsPerScene, bpm)}))`.
- Visual: gelbe vertikale Beat-Markierungen auf der Timeline (in `RenderPipelinePanel` oder existierender Timeline-View).

**Aufwand:** 1 Edge Fn + 1 UI-Card + 1 Migration + Timeline-Marker-Layer. Onset-Detection ist die Hauptarbeit.

---

## Phase 5.5 — Smart-Trim (Auto-Detect Lead-In-Freeze)

**Ziel:** i2v-Provider (Hailuo, Kling, Wan, Seedance, Luma, Veo, Sora) liefern oft 0.2–0.5s gefrorenes erstes Frame. Automatisch erkennen und `clipLeadInTrimSeconds` setzen.

**Edge Function**
- Neue `detect-lead-in-trim`: nimmt `clipUrl`, lädt via FFmpeg-Wasm in Edge (oder lightweight via FFprobe-Frame-Diff), extrahiert Frame 1 / 5 / 10 / 15 als JPEG, vergleicht via Pixel-Diff (Greyscale Mean Absolute Difference).
- Wenn Frame 1 ↔ 5 < threshold (z.B. 2.0) UND Frame 5 ↔ 10 > threshold → Freeze erkannt, schreibe Trim = Sekunde des ersten „bewegten" Frames.
- Persistiert in `composer_scenes.clip_lead_in_trim_seconds` (Spalte existiert bereits laut Code).

**Trigger**
- Auto: am Ende von `compose-video-clips`, wenn `clipSource ∈ {ai-hailuo, ai-kling, ai-wan, ai-seedance, ai-luma, ai-veo, ai-sora}` und `referenceImageUrl` gesetzt war.
- Manuell: kleines Schere-Icon in `SceneClipProgress` neben dem Video → öffnet Slider mit Live-Preview.

**UI**
- Trim-Slider-Sheet `LeadInTrimSheet.tsx`: zeigt Video, Slider 0–1.0s in 0.1er Schritten, „Vorschau ab Sekunde X" → setzt `el.currentTime`.

**Aufwand:** Edge-Fn ist Hauptarbeit (FFmpeg-Wasm in Deno-Edge ist tricky — alternativ Replicate-basierten Frame-Extractor nutzen). Frontend trivial.

---

## Phase 5.6 — Cmd+Z Undo-Stack mit Credit-Refund

**Ziel:** Letzte 10 Aktionen rückgängig — und wenn die Aktion eine bezahlte Generation war, Credits refunden.

**DB-Migration**
```sql
CREATE TABLE composer_undo_stack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES composer_projects(id) ON DELETE CASCADE,
  scene_id UUID,                          -- NULL für project-level Aktionen
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,              -- 'generate_clip' | 'delete_scene' | 'edit_prompt' | 'reorder' | …
  before_state JSONB NOT NULL,            -- Snapshot der betroffenen Felder
  after_state JSONB NOT NULL,
  credits_charged NUMERIC DEFAULT 0,      -- für Refund
  refundable BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: nur owner sieht/restoret eigene Einträge
-- Trigger: nach INSERT, lösche älteste Einträge wenn count > 10 pro project
```

**Edge Function**
- Neue `composer-undo`: nimmt `undoId`, validiert Owner, schreibt `before_state` zurück in `composer_scenes` (oder `composer_projects` bei project-level), wenn `refundable=true` ruft `refund-credits` mit `credits_charged`, löscht Undo-Eintrag.

**Hooks**
- `useComposerHistory` Hook: wraps alle `onUpdate(scene, partial)`-Calls und persistiert before/after in `composer_undo_stack`.
- `useKeyboardShortcuts` erweitern: Cmd+Z → ruft letzten Eintrag, zeigt Toast „Generierung rückgängig — 0.40 € erstattet".

**UI**
- Optional: kleines „Verlauf" Sheet mit den letzten 10 Aktionen (timestamp, action_type, scene-Referenz) und „Rückgängig"-Buttons.

**Aufwand:** Migration + Edge-Fn + Hook + Keyboard-Wiring. Größte Komplexität: jede mutierende Stelle im Composer muss durch den History-Hook gehen — am pragmatischsten: nur „großen" Actions tracken (generate_clip, delete_scene, reorder), nicht jeden Tippstrich im Prompt.

---

## Reihenfolge & Lieferform

| # | Sub-Phase | Aufwand (relativ) | Sichtbarer Nutzen |
|---|-----------|-------------------|-------------------|
| 1 | **5.3 Reroll-Grid** | M | ★★★★★ — direktester Artlist-Effekt |
| 2 | **5.5 Smart-Trim** | S–M | ★★★★ — entfernt das eine offensichtliche Quality-Issue |
| 3 | **5.4 Auto-Pacing** | M–L | ★★★ — beeindruckt Musik-affine User |
| 4 | **5.6 Undo-Stack** | M | ★★★ — Sicherheitsnetz, kein Wow aber Pflicht |

Jede Sub-Phase wird einzeln ausgeliefert + getestet, nicht als Big-Bang.

## Out of Scope (bewusst nicht in Phase 5)

- Self-hosted ML / WebGL Inference
- Multi-User Live-Editing (jenseits von Cursor-Presence das schon existiert)
- Beat-Drop-Detection im Audio jenseits BPM (z.B. Drop-Marker für Hook-Cut)
- Auto-Selection des „besten Take" aus mehreren Varianten (das wäre Phase 6)

---

**Empfehlung:** Mit **5.3 (Reroll-Grid)** starten — größter sichtbarer Sprung, baut sauber auf der bereits stehenden Fast-Preview-Pipeline auf.
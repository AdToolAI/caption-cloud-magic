# v430 Schritt 6.2 — Teil-Rename `transitionType` → `cutStyle`

Ziel: Im Composer-Domänenmodell heisst der Schnitt-Stil künftig **`cutStyle`**. Die DB-Spalte `transition_type`, alle Render-Payloads, Remotion, Director's Cut und `transitionResolver.ts` bleiben unberührt. An jeder echten Grenze wird explizit gemappt.

## Vorher-Inventar (repo-weit erhoben, klassifiziert)

**A) Domain-Modell / UI (wird umbenannt)**
- `src/types/video-composer.ts:362` — `transitionType: TransitionStyle` im `ComposerScene`.
- `src/components/video-composer/SceneTransitionInlineEditor.tsx` — Prop + Select + Slider-Gate.
- `src/components/video-composer/StoryboardTab.tsx:223, 265, 301, 794–797, 831–832` — Neuanlage, Split, Editor-Bindung.
- `src/components/video-composer/StoryboardScenePlayerList.tsx:43, 149, 163` — Callback-Signatur + Anzeige.
- `src/components/video-composer/ClipsTab.tsx:149–150, 184–185` — Continuity setzt `crossfade`, wenn `none`.
- `src/components/video-composer/ComposerSequencePreview.tsx:60` — Vorschau-Read (Default `crossfade`).
- `src/components/video-composer/TransitionHandle.tsx` — nur Kommentar.
- `src/lib/video-composer/briefing/driftDetector.ts:216` — Read über `as any`.
- `src/lib/adDirector/buildAdScenes.ts:172, 214` — Domain-Objekte (Default `fade`).
- `src/lib/shotDirector/spawnCoverageScenes.ts:70` — Default `none`.
- `src/hooks/useApplyBriefingManifest.ts:128` — Default `none`.
- `src/hooks/useApplyProductionPlan.ts:729` — Plan → Domain (Default `crossfade`).

**B) Hydration DB → `ComposerScene` (Mapping-Grenze)**
- `src/components/video-composer/VideoComposerDashboard.tsx:417, 606` — `row.transition_type ?? local?.transitionType ?? 'crossfade'`.

**C) Persistenz `ComposerScene` → DB (Mapping-Grenze)**
- `src/hooks/useComposerPersistence.ts:200` (Update, kein Default) und `:265` (Insert, Default **`'fade'`**).
- `src/components/video-composer/VideoComposerDashboard.tsx:1177` (Bulk-Save), `:1376` (Clone/Duplicate), `:1485` (Create/Insert, Default `'none'`).
- `src/hooks/useApplyProductionPlan.ts:1047` — Insert, Default `'crossfade'`.
- `src/lib/adDirector/spawnAdCampaignChildren.ts:73` — Child-Insert, Default **`'fade'`**.
- `src/lib/video-composer/sceneSnapshot.ts:36` — Snapshot (snake), Default `null`.

**D) Create/Clone/Duplicate/Snapshot — Defaults, die beim Rename still verloren gehen könnten**
`'none'` (neue Szene `VideoComposerDashboard:1319`, Storyboard-Neuanlage, Briefing-Manifest, Coverage-Szenen) · `'crossfade'` (Hydration-Fallback, Produktionsplan, Continuity in ClipsTab, Sequence-Preview) · `'fade'` (Persistenz-Insert `useComposerPersistence:265`, Ad-Director). Jeder dieser Defaults wird 1:1 mit dem bisherigen Wert übernommen und pro Pfad durch einen Test festgenagelt.

**E) Ausserhalb des Scopes — unverändert**
`src/utils/transitionResolver.ts`, alle `src/remotion/**`, Director's Cut (`src/components/directors-cut/**`, `src/pages/DirectorsCut/**`, `src/types/directors-cut.ts`), alle Edge-Functions (`compose-video-assemble`, `render-*`, `auto-director-compose`, `hybrid-extend-scene`, …), `src/integrations/supabase/types.ts`, Migrationen. `src/types/motion-studio-templates.ts:21` (Template-Format) bleibt `transitionType` und wird nur an der Anwendungsgrenze auf `cutStyle` gemappt.

## Umsetzung

1. **Mapper zentralisieren** — neues `src/lib/video-composer/cutStyle.ts`:
   - `cutStyleFromRow(row, fallback)` → Domain-Wert aus `transition_type`.
   - `cutStyleToRow(cutStyle, fallback)` → `{ transition_type }`-Wert für Persistenz.
   - Pure, kein Supabase-Zugriff; jede Grenze aus B/C/D nutzt genau diese zwei Funktionen mit ihrem bisherigen Default.
2. **Domänenfeld umbenennen** — `ComposerScene.transitionType` → `cutStyle` (kein dauerhafter Alias, keine doppelte Wahrheit). Alle Reads/Writes aus A ziehen nach.
3. **Grenzen explizit mappen** — B, C und der Snapshot rufen die Mapper auf; die Defaults bleiben wortgleich erhalten (inkl. `'fade'` im Insert-Pfad und `'crossfade'` in der Hydration).
4. **Template-Grenze** — beim Anwenden eines Motion-Studio-Templates wird `template.transitionType` einmalig auf `cutStyle` projiziert.
5. **Kein Verhaltenswechsel** — keine UI-Texte, keine neuen Defaults, keine Backend-/Pipeline-Semantik, kein Anfassen der Lip-Sync-Kette.

## Tests

- `src/lib/video-composer/__tests__/cutStyle.test.ts`: Round-Trip pro Grenze (Row → Domain → Row), NULL-/Leerwert-Verhalten, und ein Default-Vertrag, der die drei Werte `none` / `crossfade` / `fade` genau ihren Pfaden zuordnet.
- Contract-Test: `ComposerScene` enthält kein `transitionType` mehr, und ausserhalb der erlaubten Grenzdateien taucht `transition_type` im Composer-Code nicht auf.
- Bestehende Composer-Suite + `tsgo` + UI-Smoke im Motion Studio (Übergang setzen, speichern, neu laden, Szene duplizieren).

## Abschluss

STOP nach 6.2. Bericht mit Vorher/Nachher-Inventar je Klasse (A–E) und expliziter Default-Tabelle für Create/Clone/Duplicate.

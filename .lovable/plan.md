# Motion Studio — strukturelle Finalisierung (v430)

Leitprinzip: Die funktionierende Lip-Sync-Engine wird **nicht** refaktoriert. Run-Identität (`active_run_id` + `plate_generation`), Geometriemessung auf `reference_image_url`, eingefrorener Assignment-Lock und das fail-closed Outcome-Gate bleiben unangetastet. Wir räumen das Motion Studio **um sie herum** auf.

Reihenfolge: Dialog-Canonicalization → Output-Semantik → Capabilities → Visual-Input → Continuity → State/Legacy → UI.

`dialog_too_long_for_plate` wird **nicht** durch einen Duration-Sonderfix gepatcht. Die zugrunde liegende Daten-Divergenz wird in Schritt 0 durch Dialog-Canonicalization behoben. Der bestehende serverseitige Duration-Hard-Guard bleibt unverändert.

Umsetzung strikt sequenziell: ein Schritt pro Auftrag. Nach jedem Schritt müssen die bestehenden 118 Lip-Sync-Tests plus die neuen Vertragstests grün sein, bevor der nächste beginnt. **Jetzt umzusetzen: ausschließlich Schritt 0.**

---

## Schritt 0 — Dialog-Canonicalization (Blocker)

Ursache von `dialog_too_long_for_plate`: UI-Skript hat 4 Turns, DB `dialog_turns` hat 6, der Server vertont `dialog_turns`.

Ein Zeilenzahl-Vergleich reicht nicht — gleiche Anzahl bei geändertem Text bleibt unentdeckt.

- Neuer kanonischer Vertrag `resolveEffectiveDialog(scene)` in `src/lib/composer/dialog/` plus wortgleicher Backend-Spiegel in `_shared/`.
- Divergenz-Erkennung vergleicht **normalisierter Sprecher + normalisierter Text + Reihenfolge**, nicht nur die Länge. Normalisierung: trim, Whitespace-Kollaps, Unicode-NFC, case-insensitiver Sprechername.
- Bei Divergenz wird über `alignDialogTurnsToScript` ausgerichtet — stabile Turn-IDs bleiben erhalten (Lip-Sync-V201-Vertrag: `dialog_turns` ist UUID-Quelle der Wahrheit).
- **Genau drei Aufrufer, alle mit demselben Vertrag:** Dialog-Editor (beim Laden und beim Speichern), UI-Preflight (blockt den Generieren-Button bei geschätzter Überlänge) und `compose-twoshot-audio` (vor der TTS).
- Der Server-Hard-Guard (`spokenSec > sceneDur + 5s` → Fehler) **bleibt unverändert bestehen**. Preflight ist UX, der Server bleibt fail-closed.

### Implementierungsauftrag Schritt 0 — Grenzen

**Neue Dateien**
- `src/lib/composer/dialog/resolveEffectiveDialog.ts` — pure function, kein Supabase-Import. Signatur: `resolveEffectiveDialog(scene) → { turns, source: 'turns' | 'aligned' | 'script', diverged: boolean, reason }`.
- `supabase/functions/_shared/resolve-effective-dialog.ts` — wortgleicher Spiegel.
- `src/lib/composer/dialog/__tests__/resolveEffectiveDialog.test.ts` — Fixtures: identisch, gekürzt, erweitert, gleiche Anzahl mit geändertem Text, Sprecher umbenannt, Reihenfolge getauscht, leeres Skript, Vier-Sprecher-Fall.
- `src/lib/composer/dialog/__tests__/dialogContractParity.test.ts` — Client/Server-Spiegel-Parität.

**Zu ändernde Dateien**
- `SceneDialogStudio.tsx` — Alignment beim Laden und beim Speichern über den neuen Vertrag statt eigener Vergleichslogik.
- `SceneCard.tsx` — Preflight: Generieren-Button blockiert mit klarer Meldung, wenn die geschätzte Sprechdauer das Plate-Limit sprengt.
- `supabase/functions/compose-twoshot-audio/index.ts` — **eine** Abgleichstufe vor der TTS; danach unverändert weiter.

**Do not touch**
- `compose-dialog-segments` (Pass-Aufbau, v95-Split, v194-Stabilizer), Geometrie-/Assignment-Kette, Sync.so-Dispatch, `sync-so-webhook`, `beginSceneRun`, `reset-lipsync-scene`.
- Der Duration-Hard-Guard und die 5s-Auto-Extend-Grenze in `compose-twoshot-audio` bleiben zeilengleich.
- Keine Migration, keine neuen Spalten, keine Änderung an `dialog_turns`-IDs.

**Akzeptanzkriterien**
- Szene `b34d1eae…` (4 Skriptzeilen, 6 gespeicherte Turns) vertont nach dem Fix 4 Turns und läuft durch.
- Fall „gleiche Anzahl, geänderter Text" wird als Divergenz erkannt.
- Turn-IDs bleiben bei unveränderten Zeilen stabil (V201).
- Alle 118 bestehenden Lip-Sync-Tests plus die neuen Vertragstests grün, `tsgo` sauber.


## Schritt 1 — Output-Semantik (kompatibel, kein Big Bang)

- Neue Felder auf `composer_scenes`: `base_video_url`, `processed_video_url`. Backfill: `base_video_url = COALESCE(lip_sync_source_clip_url, clip_url)`, `processed_video_url = clip_url` wenn `lip_sync_status = 'applied'`.
- `clip_url` bleibt als Kompatibilitätsspalte. Bridge-Trigger `composer_scene_state_bridge()`, Media-Library-Sync und Exporter laufen unverändert.
- **Strikte Trennung Lesen/Schreiben:**
  - `resolveSceneOutput(scene)` — **pure function**, keine DB, keine Persistenz, kein Netzwerk. Gibt nur den effektiven Output zurück. Ein Lint-/Vertragstest verbietet Supabase-Importe in diesem Modul.
  - `materializeCompatibilityOutput(...)` — der einzige Schreiber von `clip_url`. Aufrufbar ausschließlich an definierten Finalisierungspunkten: Plate-Webhook, Sync.so-Mux-Abschluss, `beginSceneRun`, Reset-Pfade.
- Alle duplizierten `lip_sync_source_clip_url ?? clip_url`-Ketten (`useTwoShotAutoTrigger.ts:465`, `DebugLipsync.tsx:145`, `compose-dialog-segments`) werden durch den Resolver ersetzt.
- `beginSceneRun()` bekommt die neuen Felder in seinen atomaren Reset-Vertrag: `base_video_url = null`, `processed_video_url = null` zusätzlich zu `clip_url = null`, im selben UPDATE. Kein Eingriff in den Kern (Cancel, Lock-Purge, neue `active_run_id`, `plate_generation + 1`).

## Schritt 2 — Capability-System zentralisieren

Belegt: Es gibt kein separates Plate-Provider-Feld. Die Plate wird aus `scene.clipSource` gerendert, und genau dieses Feld prüft der fail-closed Guard in `compose-video-clips/index.ts:2082-2105`. Eine Kling-/Seedance-Plate in einer Lip-Sync-Szene ist technisch unmöglich.

- Eine Matrix `src/lib/composer/providerMatrix.ts` als alleinige Wahrheit: pro Provider `i2v`, `t2v`, `videoReference`, `inputSlots`, `durationRange`/`durationBuckets`, `nativeAudio`, `lipsyncMaster`.
- **`lipsyncMaster: boolean` genügt** — kein `lipsyncPlateSource`, kein `pipelineMode`.
- Die v400-Passage „HappyHorse / Kling / Seedance (Image-to-Video)" wird in `docs/lipsync-pipeline-v400-errata.md` ausdrücklich als **Legacy (Stand vor v425)** markiert.
- Backend-Spiegel `_shared/provider-matrix.ts` aus derselben Definition; Vertragstest failt bei Drift.
- Hartkodierte Dauer-Buckets (`isHailuoScene`, 6s/10s) werden durch Matrix-Lookups ersetzt.

## Schritt 3 — Visual Input statt „Frame-First"-Modus

Kein Backendpfad kennt den Begriff „Frame-First" — er ist reiner localStorage-UI-Toggle.

- Neues persistiertes Feld `generation_input.visual_source`: `manual | character_anchor | previous_final_frame | uploaded_reference | generated_still`.
- `slotArbitration.ts` validiert die explizite Quelle gegen die Provider-Slots aus Schritt 2, statt sie implizit aus dem Zustand abzuleiten. Ergebnis bleibt derselbe `TransitionMode`.
- Unverändert: Bei Lip-Sync gewinnt der Anker kategorisch, Continuity ist hart gesperrt (drei Schichten, v428).
- Begriffstrennung: UI-`transitionType` (Cut/Crossfade, reines Compositing) wird zu `cutStyle`, damit es nicht mehr mit dem Resolver-`TransitionMode` kollidiert.

## Schritt 4 — Continuity-Abhängigkeitsmodell (Variante C)

- Szene 2 übernimmt den neuen Frame von Szene 1 automatisch, **solange sie selbst noch nie gerendert wurde**.
- Bereits gerenderte Szene 2 behält ihr Ergebnis und wird `continuity_stale` markiert (mit `continuity_source_scene_id` + `continuity_source_clip_url`). Karte zeigt „Anschluss veraltet" + Button „Continuity aktualisieren".
- `beginSceneRun()` setzt zusätzlich `continuity_stale` auf den **direkten** Nachfolgern — keine transitive Kaskade.
- Geparkte Einträge in `composer_continuity_queue` bekommen einen eigenen Status statt `clip_status = 'generating'`.

## Schritt 5 — State Machine als einziger Orchestrierungsvertrag

- `composer_scenes.pipeline_state` + die atomaren DB-Transitions bleiben die Autorität. **Keine neue Frontend-State-Maschine.** Guards gegen illegale Übergänge und Watchdog bleiben.
- Legacy-Spiegel (`clip_status`, `twoshot_stage`, `lip_sync_status`) schrittweise read-only: erst Client-Leser auf `pipeline_state` umstellen, dann die Rückwärtsrichtung des Bridge-Triggers abschalten, Vorwärtsrichtung behalten.

## Schritt 6 — UI-Aufräumen (zuletzt)

Erst nachdem Schritt 0-5 stehen, weil die Reset-Semantik davon abhängt.

- Zwei klare Reset-Aktionen:
  - **„Lip-Sync neu" (Plate behalten)** — `active_run_id` und `plate_generation` bleiben **unverändert**. Das ist das heutige, bewährte Verhalten von `reset-lipsync-scene`.
  - **„Alles neu"** — voller `beginSceneRun()` inkl. der neuen Output-Felder aus Schritt 1.
- SceneCard zeigt Zustand ausschließlich aus `pipeline_state` + `resolveSceneOutput`.

---

## Technische Details

**Callback-Isolierung bei „Lip-Sync neu" (bestehender Vertrag, wird nur dokumentiert):** Die Abgrenzung alter Sync.so-Callbacks läuft nicht über `active_run_id`, sondern über Job-ID-Mitgliedschaft. `reset-lipsync-scene` nullt `dialog_shots`; `sync-so-webhook/index.ts:377-400` verwirft jeden Callback, dessen `job_id` nicht in `dialog_shots.passes[].job_id` steht (`stale_run_result`), bzw. findet gar keine Szene (`no_scene_match`, `:364`). Ein alter Callback kann den neuen Versuch nicht überschreiben. Dieser Mechanismus wird nicht angefasst, sondern als Vertrag in die Doku aufgenommen — inklusive der Regel, dass jeder künftige Lip-Sync-Reset `dialog_shots` atomar nullen **muss**.

**Nicht anfassen:** `compose-dialog-segments` Pass-Aufbau (v95 Per-Turn-Split, v194 Stabilizer), Geometrie-/Assignment-Kette, Sync.so-Dispatch, `try_claim_mux_dispatch`, `safeMarkSceneFailed`, `beginSceneRun`-Kern, Server-Hard-Guard der Dialoglänge.

**Sprecher-Kardinalität (Dokumentationskorrektur):** Der Vertrag lautet „ein Sync.so-Pass pro Dialog-**Turn** plus ein Stabilizer-Pass pro Zuhörer" — nicht „ein Job pro Sprecher". A → B → A ergibt drei Passes. `speaker_idx` ist Identitäts-/Geometrie-Key, nicht Job-Kardinalität.

**Vertragstests je Schritt:** `resolveEffectiveDialog` Client/Server-Parität (inkl. Fall „gleiche Anzahl, anderer Text"), Purity-Test für `resolveSceneOutput`, Provider-Matrix-Spiegel, Lip-Sync-Anker-Kohärenz (bestehende 118 Tests müssen grün bleiben), Continuity-Staleness-Propagation.

**Migrationen:** additiv, jede mit GRANTs; keine Spalte wird gelöscht. Ein `clip_url`-Drop ist explizit **kein** Teil dieses Plans.

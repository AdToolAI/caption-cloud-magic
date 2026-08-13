# v430 Schritt 4 — Continuity-Kette: Antworten auf die vier Fragen + Umsetzungsvertrag

## Frage 1 — Wie wird "Szene wurde noch nie gerendert" erkannt?

Geprüfter Ist-Zustand:

- `composer_scenes.plate_generation` (integer, NOT NULL, Default **1**) wird bei jedem Run-Start hochgezählt und **nie** zurückgesetzt.
- `composer_scenes.plate_ready_generation` wird per Trigger gestempelt, wenn `clip_url` gesetzt wird — aber vom Hard-Reset explizit auf `NULL` gesetzt (`scene-hard-reset.ts`, Zeilen 489/604). Damit **nicht** reset-fest.
- `public.plate_attempts` ist eine **persistente, unveränderliche Historie** pro Provider-Dispatch: `expected_plate_generation`, `status ∈ (rendering, completed, failed, superseded)`, `clip_url`, `completed_at`. Der Reset löscht diese Zeilen nicht, er markiert sie nur als `superseded` (Tombstone). Nur ein Löschen der Szene entfernt sie (ON DELETE CASCADE).

Definition für Variante C (belastbar, reset-fest):

```text
sceneWasEverRendered(scene) :=
     scene.first_rendered_at IS NOT NULL              -- primäre, reset-feste Wahrheit
  OR completedPlateAttemptExists(scene.id)            -- Legacy-/Integritätsfallback
  OR legacyFallbackEffectiveOutputExists(scene)       -- reiner Kompatibilitätszweig
```

Reihenfolge ist bewusst: `first_rendered_at` ist nach Migration und Backfill die Definition. `plate_attempts.status = 'completed'` dient nur als Integritätsfallback für Zeilen, die der Backfill nicht erwischt. `resolveSceneOutput().effectiveUrl` ist **keine** Definition von "ever rendered" — sie überlebt einen Reset nicht und bleibt nur als Kompatibilitätszweig für den kurzen Moment zwischen Render-Erfolg und Trigger sowie für unmigrierte Alt-Zeilen.

Die neue Spalte:

- `composer_scenes.first_rendered_at timestamptz` — wird per Trigger **einmalig** gesetzt (`COALESCE(OLD.first_rendered_at, now())`), sobald erstmals ein Output materialisiert wird. Weder Reset noch `beginSceneRun` dürfen sie leeren; ein Contract-Test erzwingt das.
- Backfill der bestehenden Zeilen: `first_rendered_at := COALESCE(plate_ready_at, updated_at)` für alle Szenen mit vorhandenem Output oder einem `completed`-Attempt; sonst `NULL`.


`clip_url`, `base_video_url` und `pipeline_state` werden für diese Frage **nicht** herangezogen.

## Frage 2 — Welcher Output ist die Continuity-Wahrheit?

Bestätigt: ausschließlich `resolveSceneOutput(sceneA).effectiveUrl`.

Ist-Zustand: `supabase/functions/_shared/continuity-chain.ts` liest heute noch roh `clip_url` (Zeilen 75, 300–318) und übergibt es als `previousClipUrl`. Das wird in Schritt 4 umgestellt:

- Die Kette selektiert künftig `base_video_url, processed_video_url, clip_url, lip_sync_source_clip_url, upload_url, lip_sync_status` und ruft `resolveSceneOutput()` (Backend-Spiegel `_shared/resolve-scene-output.ts`) auf.
- `previousClipUrl` = `effectiveUrl`.
- Die Last-Frame-Extraktion (`ensureTransitionFrame`) bekommt genau diese `effectiveUrl` als Quelle.
- `continuity_source_clip_url` (neu) speichert die `effectiveUrl`, die tatsächlich für den Continuity-Input verwendet wurde — als Nachweis, gegen den Stale-Erkennung vergleicht.
- `lip_sync_source_clip_url` ist nie direkt Continuity-Quelle; sie wird nur indirekt über den Resolver berücksichtigt.
- Unverändert: Die Kette schreibt weiterhin **nie** `reference_image_url`, und Lip-Sync-Szenen bleiben laut v425/Block-1 hart aus der Kette ausgeschlossen.

## Frage 3 — Wann wird eine gerenderte Folgeszene `continuity_stale`?

Wir folgen deinem Einwand und **verwerfen** das Stale-Setzen bei `beginSceneRun()`.

Neue Regel — Stale ist wertbasiert, nicht ereignisbasiert, und **NULL-sicher**:

```sql
-- SQL
UPDATE public.composer_scenes b
   SET continuity_stale = true
 WHERE b.continuity_source_scene_id = a.id
   AND b.continuity_source_clip_url IS NOT NULL
   AND b.continuity_source_clip_url IS DISTINCT FROM <effectiveUrl(a)>;
```

```ts
// TypeScript
isContinuityStale(storedSource, currentEffectiveUrl) :=
  storedSource != null && storedSource !== currentEffectiveUrl;
```

Damit gilt korrekt: alt = `https://…/clip.mp4`, neu = `NULL` → **stale = true**.

**Kein Side-Effect im Materializer.** `materializeCompatibilityOutput()` bleibt exakt das, was Schritt 1 definiert hat: Builder des Output-Patches für Szene A, keine Cross-Scene-Writes.

### Der Blocker: Run-Start-Clear vs. echte Output-Invalidierung

Dein Einwand ist bestätigt. `beginSceneRun()` schreibt heute `materializeCompatibilityOutput("clear")`, setzt also `clip_url = NULL` bereits beim Run-Start (`supabase/functions/_shared/scene-run-begin.ts`, Zeile 134). Ein nackter `AFTER UPDATE OF clip_url`-Trigger würde dort feuern. `beginSceneRun()` wird **nicht** geändert.

Die Trennung erfolgt über die Richtung des Wechsels — nicht über ein neues Intent-Feld, nicht über Flags im Materializer:

| Ereignis | `clip_url` alt → neu | Mechanismus | Dependents |
|---|---|---|---|
| Run-Start (`beginSceneRun`) | `url` → `NULL` | Trigger ignoriert NULL-Ziel | unverändert |
| Run scheitert | keine Änderung | — | unverändert |
| Run finalisiert erfolgreich (Plate-Webhook, Sync-Mux) | `NULL` → `url'` | Trigger feuert | stale, wenn `IS DISTINCT FROM` |
| Expliziter Hard-Reset / Output-Entfernung | `url` → `NULL` | expliziter Aufruf im Reset-Pfad | stale |

Konkret:

1. **DB-Trigger `AFTER UPDATE OF clip_url ON composer_scenes`**, Bedingung `WHEN (NEW.clip_url IS NOT NULL AND NEW.clip_url IS DISTINCT FROM OLD.clip_url)`. Er propagiert also ausschließlich **erfolgreiche Output-Wechsel**. Ein Clear (`NEW.clip_url IS NULL`) — egal ob Run-Start oder Reset — löst ihn nie aus. Damit ist der Run-Start strukturell ausgeschlossen, ohne dass die DB "Absichten" raten muss.
2. **Explizite Propagation im Reset-Pfad**: `scene-hard-reset.ts` und `reset-lipsync-scene` rufen nach erfolgreichem Reset einmalig `propagateContinuityStaleness(sceneId, /* effectiveUrl */ null)` auf (eigener Helper, RPC `public.propagate_continuity_staleness(_scene_id uuid, _effective_url text)`). Nur der Reset kennt die Semantik "Output wurde bewusst entfernt"; der Run-Start ruft ihn nicht.
3. Beide Wege benutzen exakt dieselbe SQL-Funktion und damit dieselbe NULL-sichere Vergleichsregel — es gibt keine zweite Stale-Definition.

`propagateContinuityStaleness()` ist damit kein reiner Test-/Reparaturpfad mehr, sondern der offizielle zweite Auslöser — aber ausschließlich am Reset-Punkt, nicht im Materializer und nicht in `beginSceneRun()`.

**Propagation über die echte Dependency, nicht über die Position:** markiert werden alle Szenen mit `continuity_source_scene_id = A.id` — auch mehrere. Reordering-fest. Keine transitive Kaskade: nur direkte Dependents; deren eigene Dependents werden erst stale, wenn sich deren Quelle tatsächlich ändert.

- Startet A einen Run und **scheitert** dieser, bleibt `clip_url` NULL, es feuert nichts → B bleibt gültig und behält seinen Continuity-Vertrag.
- Läuft A erfolgreich durch und liefert dieselbe URL wie zuvor, greift `IS DISTINCT FROM` → B bleibt gültig.
- Rein defensiv wird derselbe NULL-sichere Vergleich beim Laden im Client ausgewertet (abgeleiteter Zustand), sodass ein verpasster Write nicht zu falsch "frisch" führt.

Kein Run-Start, kein Queue-Ereignis und kein Provider-Wechsel setzt `continuity_stale`.


## Frage 4 — Was macht "Continuity aktualisieren"?

Bestätigt wie von dir festgelegt. Der Button ist eine reine Dependency-Aktualisierung:

1. Er löst `resolveSceneOutput(A)` neu auf, extrahiert bei Bedarf den Last-Frame und schreibt `continuity_source_clip_url` (+ Frame-URL) auf B.
2. Er setzt `continuity_stale = false`.
3. Er startet **keinen** kostenpflichtigen Render und reserviert keine Credits. Der Render bleibt eine bewusste zweite Nutzeraktion.

Die Frame-Extraktion selbst ist kostenlos bzw. läuft über den bestehenden `ensureTransitionFrame`-Pfad; falls dieser einen bezahlten Lambda-Still auslöst, wird das Ergebnis gecacht und pro `effectiveUrl` nur einmal erzeugt.

### `needs_rerender` ist kein UI-State — es wird abgeleitet, nicht gespeichert

Ein persistierter Dirty-Marker für genau diesen Fall existiert heute **nicht**. `plate_generation` / `plate_ready_generation` bilden nur "läuft gerade ein neuer Run" ab und werden beim Hard-Reset geleert; die vorhandenen `*_hash`-Spalten (`dialog_content_hash`, `audio_asset_hash`, `voice_configuration_hash`) sind das etablierte Muster für "Input-Revision", werden im aktuellen Code aber nicht gelesen. Ein neues Flag-System bauen wir trotzdem nicht.

Stattdessen wird der Dirty-Zustand nach demselben wertbasierten Prinzip wie Staleness abgeleitet — und dafür braucht es genau **eine** zusätzliche persistierte Spalte:

- `composer_scenes.continuity_rendered_source_clip_url text` — die Continuity-Quelle, mit der der **aktuell vorhandene Output von B tatsächlich gerendert wurde**. Sie wird ausschließlich an den bestehenden Finalisierungspunkten geschrieben (dort, wo `materializeCompatibilityOutput('base'|'processed')` bereits läuft): Wert = der `continuity_source_clip_url`, der beim Start dieses Runs galt.

```ts
needsContinuityRerender(scene) :=
  sceneWasEverRendered(scene)
  && scene.continuity_source_clip_url != null
  && scene.continuity_rendered_source_clip_url !== scene.continuity_source_clip_url;
```

Damit gilt: gerendert mit Frame X → A ändert sich → B stale → "Continuity aktualisieren" schreibt Quelle Y und `continuity_stale = false` → `rendered = X ≠ Y = konfiguriert` → **renderbedürftig, reload-fest**, weil beide Werte in der DB liegen. Nach dem nächsten erfolgreichen Render von B wird `continuity_rendered_source_clip_url = Y` geschrieben und der Zustand löst sich von selbst auf.

Kein Eingriff in die State Machine, kein neues Flag, kein zweiter Wahrheitsbegriff: Staleness vergleicht A-Output gegen B-Konfiguration, Dirty vergleicht B-Konfiguration gegen B-Renderstand. Beide Vergleiche leben im reinen Helper `continuityState.ts`.

## Umsetzungsumfang Schritt 4 (nach Freigabe)

- Migration: `composer_scenes.first_rendered_at`, `continuity_source_clip_url`, `continuity_rendered_source_clip_url`, `continuity_stale`; Backfill; Trigger für `first_rendered_at`; SQL-Funktion `public.propagate_continuity_staleness(_scene_id, _effective_url)` plus Trigger `AFTER UPDATE OF clip_url ... WHEN (NEW.clip_url IS NOT NULL AND NEW.clip_url IS DISTINCT FROM OLD.clip_url)`.
- `continuity-chain.ts` liest über `resolveSceneOutput()` statt roh `clip_url`.
- `materializeCompatibilityOutput()` bleibt unverändert auf den Output-Patch von Szene A beschränkt — kein Cross-Scene-Write und kein Setzen von `continuity_stale`.
- Reset-Pfade:
  - `scene-hard-reset.ts` — Output wird wirklich entfernt → einmaliger expliziter Aufruf `propagateContinuityStaleness(sceneId, null)`.
  - `reset-lipsync-scene` — processed → base, der effektive Output bleibt **non-null** → **kein** expliziter RPC; der normale DB-Trigger erkennt den Wechsel `processedUrl → baseUrl` bereits.
  - `beginSceneRun()` bleibt unangetastet.
- Neuer **reiner** Helper `src/lib/composer/continuity/continuityState.ts` (+ Backend-Spiegel): `isContinuityStale(storedSource, currentEffectiveUrl)`, `needsContinuityRerender(...)` und `sceneWasEverRendered({ firstRenderedAt, completedPlateAttemptExists, legacyEffectiveUrl })`. Keine DB-Abfrage im Pure-Layer — `completedPlateAttemptExists` wird vom Aufrufer geladen und hineingereicht. Parity-Test Client/Server.
- Finalisierungspunkte schreiben zusätzlich `continuity_rendered_source_clip_url` (Continuity-Quelle des abgeschlossenen Runs) — im selben Patch, ohne Cross-Scene-Write.
- UI: Stale-Badge, Badge "neu rendern nötig" (abgeleitet, nicht gespeichert) und Button "Continuity aktualisieren" auf der Szenenkachel, ohne Render-Trigger.
- Tests: Reset-Festigkeit von `first_rendered_at`; Run-Start-Clear macht B **nicht** stale; fehlgeschlagener Run macht B nicht stale; erfolgreicher Output-Wechsel setzt stale; identische URL setzt nicht stale; Hard-Reset setzt stale; `reset-lipsync-scene` propagiert nur über den Trigger und ruft keinen Null-RPC; Dirty-Zustand überlebt Reload (`rendered ≠ konfiguriert`) und löst sich nach erfolgreichem Render auf; mehrere Dependents über `continuity_source_scene_id`; keine transitive Kaskade; Materializer schreibt keine Fremdszene; Pure-Helper ohne DB-Zugriff; Legacy-Parität; Lip-Sync-Szenen bleiben aus der Kette ausgeschlossen.

Keine Änderungen an Lip-Sync-Semantik, `reference_image_url`, State Machine oder `transitionType`.

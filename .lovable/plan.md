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

**Kein Side-Effect im Materializer.** `materializeCompatibilityOutput()` bleibt exakt das, was Schritt 1 definiert hat: Builder des Output-Patches für Szene A, keine Cross-Scene-Writes. Die Staleness-Propagation ist ein **eigener Mechanismus**:

- Primär ein DB-Trigger `AFTER UPDATE OF clip_url ON composer_scenes` (Compatibility-Alias des effektiven Outputs, nach Schritt 1 garantiert `clip_url = processed ?? base`). Er reagiert atomar in derselben Transaktion, unabhängig davon, welcher Code den Output geschrieben hat.
- Die Trigger-Logik lebt in einer Funktion `public.propagate_continuity_staleness()`; ein expliziter Helper `propagateContinuityStaleness()` existiert nur als Test-/Reparaturpfad, nicht im Materializer-Aufrufweg.

**Propagation über die echte Dependency, nicht über die Position:** markiert werden alle Szenen mit `continuity_source_scene_id = A.id` — auch mehrere. Reordering-fest. Keine transitive Kaskade: nur direkte Dependents; deren eigene Dependents werden erst stale, wenn sich deren Quelle tatsächlich ändert.

- Startet A einen Run und **scheitert** dieser, ändert sich der effektive Output nicht → kein Trigger-Feuer → B bleibt gültig.
- Bei einem Reset von A, der den Output tatsächlich leert, wechselt der effektive Output auf `NULL` → B wird über `IS DISTINCT FROM` korrekt stale.
- Rein defensiv wird derselbe NULL-sichere Vergleich beim Laden im Client ausgewertet (abgeleiteter Zustand), sodass ein verpasster Write nicht zu falsch "frisch" führt.

Kein Run-Start, kein Queue-Ereignis und kein Provider-Wechsel setzt `continuity_stale` — nur die tatsächliche Output-Änderung.


## Frage 4 — Was macht "Continuity aktualisieren"?

Bestätigt wie von dir festgelegt. Der Button ist eine reine Dependency-Aktualisierung:

1. Er löst `resolveSceneOutput(A)` neu auf, extrahiert bei Bedarf den Last-Frame und schreibt `continuity_source_clip_url` (+ Frame-URL) auf B.
2. Er setzt `continuity_stale = false` und markiert B als **renderbedürftig** (`needs_rerender`-Hinweis in der UI, sichtbar an der Kachel).
3. Er startet **keinen** kostenpflichtigen Render und reserviert keine Credits. Der Render bleibt eine bewusste zweite Nutzeraktion.

Die Frame-Extraktion selbst ist kostenlos bzw. läuft über den bestehenden `ensureTransitionFrame`-Pfad; falls dieser einen bezahlten Lambda-Still auslöst, wird das Ergebnis gecacht und pro `effectiveUrl` nur einmal erzeugt.

## Umsetzungsumfang Schritt 4 (nach Freigabe)

- Migration: `composer_scenes.first_rendered_at`, `continuity_source_clip_url`, `continuity_stale` (+ Backfill, Trigger für `first_rendered_at`, Trigger `propagate_continuity_staleness` auf `clip_url`).
- `continuity-chain.ts` liest über `resolveSceneOutput()` statt roh `clip_url`.
- `materializeCompatibilityOutput()` bleibt unverändert auf den Output-Patch von Szene A beschränkt — kein Cross-Scene-Write.
- Neuer reiner Helper `src/lib/composer/continuity/continuityState.ts` (+ Backend-Spiegel) mit `sceneWasEverRendered()` und NULL-sicherem `isContinuityStale()`, Parity-Test Client/Server.
- UI: Stale-Badge und Button "Continuity aktualisieren" auf der Szenenkachel, ohne Render-Trigger.
- Tests: Reset-Festigkeit von `first_rendered_at`, "fehlgeschlagener Run macht B nicht stale", `NULL`-Übergang setzt stale, mehrere Dependents über `continuity_source_scene_id`, keine transitive Kaskade, Materializer schreibt keine Fremdszene, Legacy-Parität, Lip-Sync-Szenen bleiben aus der Kette ausgeschlossen.

Keine Änderungen an Lip-Sync-Semantik, `reference_image_url`, State Machine oder `transitionType`.

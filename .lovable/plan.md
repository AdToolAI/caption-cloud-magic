# v430 Schritt 4 — Continuity-Kette: Antworten auf die vier Fragen + Umsetzungsvertrag

## Frage 1 — Wie wird "Szene wurde noch nie gerendert" erkannt?

Geprüfter Ist-Zustand:

- `composer_scenes.plate_generation` (integer, NOT NULL, Default **1**) wird bei jedem Run-Start hochgezählt und **nie** zurückgesetzt.
- `composer_scenes.plate_ready_generation` wird per Trigger gestempelt, wenn `clip_url` gesetzt wird — aber vom Hard-Reset explizit auf `NULL` gesetzt (`scene-hard-reset.ts`, Zeilen 489/604). Damit **nicht** reset-fest.
- `public.plate_attempts` ist eine **persistente, unveränderliche Historie** pro Provider-Dispatch: `expected_plate_generation`, `status ∈ (rendering, completed, failed, superseded)`, `clip_url`, `completed_at`. Der Reset löscht diese Zeilen nicht, er markiert sie nur als `superseded` (Tombstone). Nur ein Löschen der Szene entfernt sie (ON DELETE CASCADE).

Definition für Variante C (belastbar, reset-fest):

```text
sceneWasEverRendered(scene) :=
     EXISTS (plate_attempts WHERE scene_id = scene.id AND status = 'completed')
  OR resolveSceneOutput(scene).effectiveUrl IS NOT NULL
  OR scene.first_rendered_at IS NOT NULL
```

Ergänzend führen wir eine kleine, ausdrücklich **nie löschbare** Spalte ein, damit die Erkennung nicht von einer Join-Tabelle abhängt und auch Alt-Szenen ohne `plate_attempts`-Zeilen (vor v375) korrekt sind:

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

Neue Regel — Stale ist wertbasiert, nicht ereignisbasiert:

```text
B.continuity_stale := B.continuity_source_clip_url IS NOT NULL
                      AND B.continuity_source_clip_url
                          <> resolveSceneOutput(A).effectiveUrl
```

- Gesetzt wird das ausschließlich im **zentralen Writer** `materializeCompatibilityOutput()`: wenn sich der effektive Output einer Szene A erfolgreich geändert hat, wird der direkte Nachfolger B (nur er, keine Transitiv-Kaskade) auf `continuity_stale = true` markiert.
- Startet A einen Run und **scheitert** dieser, ändert sich `effectiveUrl` nicht → B bleibt gültig. Genau der von dir beschriebene Fall.
- Bei einem Reset von A, der den Output tatsächlich leert, ändert sich `effectiveUrl` auf `NULL` → B wird korrekt stale (der Frame-Ursprung existiert nicht mehr).
- Rein defensiv wird der Vergleich zusätzlich beim Laden im Client ausgewertet (abgeleiteter Zustand), sodass eine verpasste Schreiboperation nicht zu falsch "frisch" führt.

Kein Run-Start, kein Queue-Ereignis und kein Provider-Wechsel setzt `continuity_stale` — nur die tatsächliche Output-Änderung.

## Frage 4 — Was macht "Continuity aktualisieren"?

Bestätigt wie von dir festgelegt. Der Button ist eine reine Dependency-Aktualisierung:

1. Er löst `resolveSceneOutput(A)` neu auf, extrahiert bei Bedarf den Last-Frame und schreibt `continuity_source_clip_url` (+ Frame-URL) auf B.
2. Er setzt `continuity_stale = false` und markiert B als **renderbedürftig** (`needs_rerender`-Hinweis in der UI, sichtbar an der Kachel).
3. Er startet **keinen** kostenpflichtigen Render und reserviert keine Credits. Der Render bleibt eine bewusste zweite Nutzeraktion.

Die Frame-Extraktion selbst ist kostenlos bzw. läuft über den bestehenden `ensureTransitionFrame`-Pfad; falls dieser einen bezahlten Lambda-Still auslöst, wird das Ergebnis gecacht und pro `effectiveUrl` nur einmal erzeugt.

## Umsetzungsumfang Schritt 4 (nach Freigabe)

- Migration: `composer_scenes.first_rendered_at`, `continuity_source_clip_url`, `continuity_stale` (+ Backfill, Trigger für `first_rendered_at`).
- `continuity-chain.ts` liest über `resolveSceneOutput()` statt roh `clip_url`.
- `materializeCompatibilityOutput()` wird einziger Setzer von `continuity_stale`.
- Neuer reiner Helper `src/lib/composer/continuity/continuityState.ts` (+ Backend-Spiegel) mit `sceneWasEverRendered()` und `isContinuityStale()`, Parity-Test Client/Server.
- UI: Stale-Badge und Button "Continuity aktualisieren" auf der Szenenkachel, ohne Render-Trigger.
- Tests: Reset-Festigkeit von `first_rendered_at`, "fehlgeschlagener Run macht B nicht stale", Legacy-Parität, Lip-Sync-Szenen bleiben aus der Kette ausgeschlossen.

Keine Änderungen an Lip-Sync-Semantik, `reference_image_url`, State Machine oder `transitionType`.

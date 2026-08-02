## Warum jetzt und was genau kaputt ist

Der Zustand einer Szene wird heute in **vier** Spalten gleichzeitig beschrieben — `clip_status`, `twoshot_stage`, `lip_sync_status` und dem Freitextfeld `clip_error` — und **41 Dateien** (29 Edge Functions, 21 Frontend-Module) schreiben darauf, jede mit eigener Auslegung. Die Produktionsdaten zeigen das Ergebnis:

- `twoshot_stage` enthält 11 verschiedene Werte, darunter `done`, `complete` **und** `applied` für denselben Zustand, dazu Einmal-Artefakte wie `stale_cleanup_v193` und `lipsync_1`.
- `lip_sync_status` enthält 7 Werte mit derselben Dopplung (`done` / `applied`).
- `clip_status` enthält `ready` **und** `completed`.
- Freitext in `clip_error` steuert Kontrollfluss: `!!clip_error` ⇒ „Szene nicht realisiert" — das ist der aktuelle Bruch vor Sync.so.

Gemessen an den letzten 21 Tagen fällt rund **ein Drittel** aller Fehler in diese Orchestrierungsklasse (`watchdog_never_dispatched` 20, `hard_timeout` 8, `stuck_lipsync` 8, `audio_plan_not_ready_self_heal` 6, `kickstart_failed:missing_audio_plan` 5, `no_turns` 4, jetzt `scene_not_realized`). Die sind strukturell, nicht zufällig: es gibt keine Instanz, die verbietet, dass zwei Felder sich widersprechen.

## Zielbild

**Eine** Spalte als Wahrheit, ein Enum, Übergänge nur über eine atomare DB-Funktion. `clip_error` wird reine Anzeige und steuert nie wieder etwas.

```text
idle ─▶ plate_queued ─▶ plate_rendering ─▶ plate_ready
                                              │
                                              ▼
                                        audio_prep ─▶ audio_ready
                                              │
                                              ▼
                              lipsync_dispatched ─▶ lipsync_running
                                              │
                                              ▼
                                      lipsync_muxing ─▶ complete

  jeder Zustand ─▶ failed | canceled     (terminal, nur Hard-Reset kommt raus)
```

## Phasen

### P0 — Migration: Enum + Brücke (keine Verhaltensänderung)

- Enum `composer_scene_state` mit den 12 Zuständen oben.
- Neue Spalten auf `composer_scenes`: `pipeline_state` (NOT NULL, default `'idle'`), `pipeline_detail` (text, nur Anzeige), `pipeline_state_at` (timestamptz), `pipeline_state_run_id` (uuid).
- **Backfill** aller ~4.200 Zeilen aus der bestehenden Vierfach-Logik (inkl. Normalisierung `done`/`complete`/`applied` → `complete`, `ready`/`completed` → passender Zustand).
- **Bidirektionaler Sync-Trigger**: schreibt ein Altpfad die Legacy-Spalten, leitet der Trigger `pipeline_state` ab; schreibt ein neuer Pfad `pipeline_state`, setzt der Trigger die Legacy-Spalten konsistent. Damit können alte und migrierte Writer koexistieren — Voraussetzung dafür, das ohne Big-Bang zu machen.
- Atomare Transition-Funktion `composer_scene_transition(_scene_id, _from composer_scene_state[], _to composer_scene_state, _detail text, _run_id uuid, _generation int)`, SECURITY DEFINER: setzt den Zustand nur, wenn der Ist-Zustand in `_from` liegt **und** `active_run_id`/`plate_generation` passen. Rückgabe `applied boolean` + aktueller Zustand. Damit sind veraltete Callbacks und Doppelaufrufe strukturell wirkungslos, nicht mehr per Handprüfung.
- Erlaubte Übergänge als Tabelle `composer_scene_transitions` (from, to) — verbotene Übergänge scheitern hart und werden geloggt.
- GRANTs: `authenticated` liest, `service_role` voll; Transition-Funktion nur für `service_role` und den Szenen-Eigentümer ausführbar.

### P1 — Ein Lese-Vertrag für Server und Client

- Neu `supabase/functions/_shared/scene-state.ts` und `src/lib/composer/sceneState.ts` (gleiche Semantik, ein Zustandsmodell): `isRealized`, `isTerminal`, `isInFlight`, `canStartAudioPrep`, `canDispatchLipsync`, `progressPercent`.
- `isRealizedScene.ts` wird auf `pipeline_state` umgestellt und behält nur noch für Altzeilen einen Legacy-Fallback.
- Damit ist der aktuelle Bruch (`scene_not_realized_no_lipsync` durch transientes `clip_error`) mit erledigt: „realized" heißt ab jetzt `pipeline_state ∈ {plate_ready, audio_prep, audio_ready, …}`, unabhängig von jedem Diagnosetext.

### P2 — Hot-Path-Writer auf Transitionen umstellen

In dieser Reihenfolge, jede Function einzeln deployt und geprüft:
1. `composer-start-scene-generation` + `_shared/scene-hard-reset.ts` → `→ plate_queued` (einziger Weg aus `failed`/`canceled` heraus)
2. `compose-video-clips` (19 Status-Writes) → `plate_rendering`
3. `compose-clip-webhook`, `remotion-webhook` → `plate_ready` / `failed`
4. `compose-twoshot-audio` → `audio_prep` (Claim = Transition, ersetzt das Race), `audio_ready`
5. `compose-dialog-segments` → `lipsync_dispatched`
6. `sync-so-webhook` → `lipsync_running` / `lipsync_muxing` / `complete` / `failed`
7. `qa-watchdog`, `lipsync-watchdog`, `recover-stuck-composer-clip` → nur noch Zeitüberschreitungen nach `failed`, keine Wiederbelebung
8. `composer-cancel-scene`, `composer-cancel-project`, `reset-lipsync-scene` → `canceled`

### P3 — Frontend

- `useTwoShotAutoTrigger`, `usePipelineProgress`, `ClipsTab`, `SceneCard`, `AnchorPreviewGate` lesen `pipeline_state` statt der Feldkombinationen; der Ladebalken wird direkt aus dem Zustand abgeleitet (der 96%-Hänger bei fehlgeschlagener Szene ist damit strukturell unmöglich).
- Nicht-terminale Serverantworten schreiben nie mehr `failed` — der Client schreibt überhaupt keine Zustände mehr, er ruft nur noch Transitionen auf.

### P4 — Rückfall verhindern

- Vitest-Guard, der bei direkten Writes auf `clip_status` / `twoshot_stage` / `lip_sync_status` außerhalb der erlaubten Module fehlschlägt.
- `composer-reset-selftest` erweitert: prüft Zustandsrotation, verbotene Übergänge, Run-/Generation-Bindung.

### P5 — Beweis

Realer Lauf an einer echten Szene: Ich lese danach die vollständige Zustandshistorie (`plate_queued → … → complete`), die Provenance-Marker und belege, dass kein Zwischenzustand übersprungen oder rückwärts geschrieben wurde.

## Was das realistisch bringt

- Die Orchestrierungsklasse (~⅓ der Fehler) wird strukturell adressiert: keine widersprüchlichen Felder, keine Freitext-Steuerung, keine Doppelläufe, keine Zombie-Szenen ohne Lauf.
- **Nicht** adressiert: Sync.so-eigene Fehler (`generation_unknown_error`, Provider-Timeouts, ~⅓) und die Gesichts-/Geometrie-Gates (~15 Fälle). Das bleiben eigene Baustellen.

## Risiko und Rückfahrkarte

- Der Sync-Trigger aus P0 hält Legacy- und Neu-Spalten während der gesamten Umstellung konsistent. Bricht eine Phase, funktioniert der Altpfad unverändert weiter — Rollback heißt „Function zurückdeployen", nicht „Migration rückabwickeln".
- Keine Spalte wird in diesem Plan gelöscht. Das Aufräumen der Legacy-Spalten ist ein separater Schritt nach der Live-Woche.
- Umfang: 1 Migration, 2 neue Shared-Module, ~14 Edge Functions, ~6 Frontend-Module, 1 Guard-Test.

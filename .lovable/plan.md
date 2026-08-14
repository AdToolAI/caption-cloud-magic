# Phase 0 — Bericht zu den vier offenen G0-Klärungen (reine Analyse)

Keine Codeänderung, keine Migration, keine Writer-Migration, kein Cast-&-World-Eingriff. Der Lip-Sync-Freeze bleibt unberührt.

Vorab, weil es die G0-Planung direkt betrifft: **beide Überladungen von `composer_scene_transition` sind heute für die Rolle `anon` ausführbar, und die Ownership-Prüfung greift bei `auth.uid() IS NULL` gar nicht.** Details unter 0.2. Das ist kein Nebenbefund, sondern eine offene Tür in den State-Core.

---

## 0.1 — Der fehlende `transitionScene()`-Caller

`rg "transitionScene\("` liefert 11 Treffer: 1 Definition (`_shared/scene-state.ts:333`), **10 direkte Call-Sites** und **1 indirekten Aufruf** innerhalb von `failSceneState()` (`scene-state.ts:409`). Der bisher nicht zugeordnete elfte ist dieser interne Aufruf.

| Write-ID | Ort | Ziel | runId | gen | Klasse |
|---|---|---|---|---|---|
| `composer-start-scene-generation:enter-plate-queued-on-run-start` | `:200` | `plate_queued` | ja | ja | **run_bound** |
| `composer-start-scene-generation:fail-on-dispatch-failure` | `:255` | `failed` | ja | ja | **run_bound** |
| `composer-cancel-project:cancel-scene-on-project-cancel` | `:215` | `canceled` | nein | nein | runless (Grenzfall) |
| `composer-cancel-scene:cancel-scene-on-user-request` | `:147` | `canceled` | nein | nein | runless (Grenzfall) |
| `generate-composer-image-scene:enter-plate-rendering` | `:147` | `plate_rendering` | nein | nein | legitim runless |
| `generate-composer-image-scene:fail-on-gateway-error` | `:168` | `failed` | nein | nein | legitim runless |
| `generate-composer-image-scene:fail-on-no-image` | `:195` | `failed` | nein | nein | legitim runless |
| `generate-composer-image-scene:fail-on-upload-error` | `:222` | `failed` | nein | nein | legitim runless |
| `generate-composer-image-scene:enter-plate-ready` | `:241` | `plate_ready` | nein | nein | legitim runless |
| `hybrid-extend-scene:mark-failed-on-error` | `:375` | `failed` | nein | nein | legitim runless |
| `scene-state:failSceneState-internal-transition` | `scene-state.ts:409` | `failed`/`canceled` | nein | nein | **Vertragslücke** |

Begründung der Klassen:
- **run_bound**: `runId` + `generation` werden durchgereicht, DB-Guard `stale_run`/`stale_generation` greift.
- **legitim runless**: `generate-composer-image-scene` und `hybrid-extend-scene` kennen kein `active_run_id`/`plate_generation` — es gibt dort keinen Run, gegen den geprüft werden könnte.
- **Grenzfall Cancel**: beide Cancel-Funktionen **lesen** `active_run_id` bereits in ihren Row-Select (`composer-cancel-project:103`, `composer-cancel-scene:70`), reichen ihn aber nicht durch. Ob das gewolltes Force-Cancel ist, ist eine Produktentscheidung, keine Codefrage — Vorschlag für G0: `guard_mode: 'runless'` mit Pflichtgrund `user_cancel` / `project_cancel`, nicht stillschweigend ungeprüft.
- **Vertragslücke `failSceneState()`**: die Funktion hat **null aktive Aufrufer** im Repo (nur die Definition und eine Erwähnung im Contract-Test). Sie war laut Kommentar (`scene-state.ts:388-399`) als Ersatz für ca. 40 direkte `pipeline_state: 'failed'`-Writes gedacht — dieser Migrationspfad wurde nie verdrahtet. Separat gezählt: `failSceneState()`-Aufrufe = **0**.

Zusatzbefund für G0/G5: der Contract-Test `scene-state-write-contract.test.ts:16-20` erlaubt direkte `pipeline_state`-Writes nur in `scene-hard-reset.ts` und `scene-state.ts`, im Repo existieren aber >15 weitere Fundstellen (`qa-watchdog`, `generate-talking-head`, `compose-video-clips:1633`, `recover-stuck-composer-clip:107`, `_shared/continuity-chain.ts`, `_shared/autopilotComposerBridge.ts:173`, `auto-director-compose:216`, `motion-studio-superuser`). Der Test-Regex matcht nur String-Literale und erfasst diese Fälle nicht zuverlässig — die "EIN Schreibpfad"-Garantie ist heute nicht durchgesetzt.

## 0.2 — Alte RPC-Signaturen

Es existieren genau zwei Überladungen, beide `SECURITY DEFINER`, `search_path=public`:

| Variante | Argumente | Repo-Aufrufer |
|---|---|---|
| **A (6-arg)** | `_scene_id, _to, _from, _detail, _run_id, _generation` | **keiner** |
| **B (7-arg)** | A + `_substate` | nur `scene-state.ts:300-308` (`rpcTransition`) |

Kein `DROP FUNCTION` in den Migrationen — die 7er kam als zusätzliche Überladung (`20260813221849:165`), die 6er (`20260802143005:225`) blieb live.

**Grants (live, `proacl` / `has_function_privilege`):** `anon`, `authenticated`, `service_role` haben **auf beiden** EXECUTE. Die Migrationen machen zwar `REVOKE ALL … FROM public` + gezielte GRANTs an `authenticated`/`service_role`, aber `anon` kommt über einen `pg_default_acl`-Eintrag für Schema `public`, Objekttyp `f` — der von `REVOKE … FROM public` nicht berührt wird. Das Revoke verfehlt damit sein Ziel.

**Autorisierung in der Funktion:** `IF auth.uid() IS NOT NULL AND NOT can_edit_composer_project(...)` (`20260813221849:188-190`). Bei einem echten anon-Aufruf ist `auth.uid()` NULL → **die Ownership-Prüfung wird übersprungen.** Verbleibende Schranken: nur die Allowlist `composer_scene_transitions` und die optionalen `_run_id`/`_generation`-Guards, die ein externer Aufrufer schlicht weglässt.

**Erreichbarkeit:** beide via `POST /rest/v1/rpc/composer_scene_transition`; PostgREST wählt die Überladung nach der Named-Args-Menge (ohne `_substate` → A, mit → B).

**Observability:** es gibt keine. `composer_scene_transitions` ist die statische Zulässigkeitsmatrix, keine Audit-Tabelle. Die Funktion loggt nur `RAISE LOG 'v384_forbidden_transition'` (Ablehnung wegen State-Machine), nicht `forbidden`, nicht Erfolge. Das Applikationslogging in `scene-state.ts:356-382` sieht nur Aufrufe über Edge Functions. Ein Direktaufruf via PostgREST erzeugt keine für uns sichtbare Spur.

**Fazit:** externe Nutzung ist **nicht ausschließbar**. Kein Drop in G0. Ziel bleibt die vorgeschlagene Architektur — neuer kanonischer guarded Kern, 6er und 7er als instrumentierte, deprecatete Wrapper, die delegieren. Erste konkrete Maßnahme in G0 sollte jedoch der Entzug von `anon`-EXECUTE auf beiden Alt-Signaturen sein, plus eine Instrumentierung, die Caller-Rolle und Signatur in eine Audit-Tabelle schreibt — ohne diese Zahlen ist ein späterer Drop nie belastbar begründbar.

## 0.3 — v391 Gap-Filler atomar

**Fundort:** `_shared/scene-state.ts:270-385`. Der "Gap-Filler" ist ein **Client-Loop**, kein DB-Mechanismus: schlägt der erste RPC mit `transition_not_allowed` fehl und liegt das Ziel in `LINEAR_CHAIN` weiter vorn als `fromIdx+1`, holt eine `for`-Schleife (`:361-369`) jeden Zwischenschritt als **eigenen RPC-Call in eigener Transaktion** nach, mit `detail = v391_chain_step_<state>`.

**(a) Ketten:** dynamisch, nicht fest kodiert — jede Vorwärtslücke in `LINEAR_CHAIN`, z.B. `plate_ready → audio_prep → audio_ready`, `audio_ready → lipsync_dispatched → lipsync_running` (der in `:350` genannte historische Fall), bis hin zu `plate_ready → … → complete`.

**(b) Transaktionsgrenzen:** jeder Schritt ist für sich atomar (`FOR UPDATE` + ein `UPDATE`), aber es gibt **kein Dach über der Kette**. Crasht die Function zwischen Schritt n und n+1, bleibt die Szene committed auf einem validen Zwischenzustand stehen — ununterscheidbar von einem regulären Zwischenzustand. Kein Marker sagt, dass eine Kette abgebrochen ist; Watchdogs sehen nur ein Timeout, Webhooks warten auf ein Zielevent, das nie kommt, und es gibt keinen Wiederaufnahme-Mechanismus außer dem nächsten regulären `transitionScene`-Aufruf.

**(c) Atomarer Pfadvertrag:** die vorgeschlagene Form ist umsetzbar und deckt sich mit dem Bestand:
1. `SELECT … FOR UPDATE` (wie heute),
2. vollständigen Pfad `current → _to` per `WITH RECURSIVE` über `composer_scene_transitions` bestimmen, begrenzt auf die Vorwärtsordnung von `LINEAR_CHAIN` (Rückwärts-, Terminal- und Self-Kanten explizit ausschließen, sonst findet die Rekursion Pfade über `idle`/`failed`),
3. gesamten Pfad validieren, Run-/Generation-Guard **einmal** am Anfang (das Lock friert den Zustand ein),
4. nur den finalen Zielzustand schreiben — kein Zwischen-Commit,
5. je logischem Zwischenschritt eine Historienzeile, in derselben Transaktion.

Kritischer Punkt: **Schritt 5 hat heute kein Ziel.** Es existiert keine Transition-Historie. `composer_scene_transitions` ist die Allowlist, `composer_scene_runs` ist der Run-Kontrakt, `composer_undo_stack` ist User-Undo, `composer_pipeline_runs` ist ein Projekt-Aggregat. Der einzige Beleg eines Übergangs ist der überschriebene `pipeline_state`/`pipeline_detail`/`updated_at`. G0 braucht also eine neue Audit-Tabelle (`from_state, to_state, step_index, guard_mode, run_id, generation, reason, at`) — sie ist ohnehin Voraussetzung für 0.2 (Signatur-Telemetrie) und für den Recovery-Primitive.

**(d) Kanten, die dadurch NICHT freigegeben werden müssen:** `plate_ready→audio_ready`, `plate_ready→lipsync_dispatched|lipsync_running|lipsync_muxing`, `audio_prep→lipsync_dispatched|lipsync_running|lipsync_muxing`, `audio_ready→lipsync_running|lipsync_muxing`. Die Allowlist (73 Zeilen) behält damit ausschließlich echte Einzelschrittkanten.

## 0.4 — `pipeline_state_run_id`

Spalte auf `composer_scenes`, `uuid`, nullable, kein Default (eingeführt `20260802143005:24`, Backfill `:220` aus `active_run_id`).

- **(a) Schreiber:** ausschließlich `composer_scene_transition`, mit `pipeline_state_run_id = COALESCE(_run_id, active_run_id)`. Kein Edge-Function- oder Client-Code schreibt direkt.
- **(b) Leser:** nur Anzeige. `ClipsTab.tsx:400`, `VideoComposerDashboard.tsx:387,590,955,973` mappen sie auf `pipelineStateRunId` (`types/video-composer.ts:347`). **Keine Verzweigung** darauf, weder im Client noch serverseitig — `rg pipeline_state_run_id supabase/functions` = 0 Treffer. Guards, Watchdogs und der `stale_run`-Check der DB-Funktion arbeiten mit `active_run_id`, nicht mit dieser Spalte.
- **(c) Heute ohne Run-Kontext:** genau die implizite Nebenwirkung, die vermieden werden soll. `COALESCE` zieht bei `_run_id IS NULL` still den vorhandenen `active_run_id` nach — auch wenn der aus einem alten, längst beendeten Lauf stammt. Die Spalte behauptet dann einen Run-Bezug, den der Aufrufer nie hergestellt hat. Ein expliziter Reset auf NULL passiert nirgends, auch nicht in `scene-hard-reset.ts`.
- **(d) Empfehlung:** `guard_mode = runless → pipeline_state_run_id = NULL`, explizit gesetzt, nicht per COALESCE. Kein heutiger Leser bricht daran, weil keiner die Spalte auswertet. Damit wird die Spalte zu dem, was sie sein soll: "dieser Zustand wurde von Run X gesetzt" bzw. "von keinem Run". Die Alternative (Wert erhalten) ist technisch ebenso folgenlos, konserviert aber genau die Zweideutigkeit, die 0.4 beseitigen soll. UNKNOWN bleibt nur externes BI/Reporting außerhalb des Repos.

---

## Ergebnis / Vorschlag für den G0-Scope

Bestätigt und unverändert übernommen: guarded `composer_scene_transition`, atomare Run-ID+Generation-Prüfung, RunGuard-Union, run-sicheres `failSceneState()`, atomarer Fehlertext, explizit löschbares Detail/Substate, Recovery-Primitive, Compatibility-Wrapper für 6er und 7er, atomarer Gap-Filler-Ersatz, Contract- und Race-Tests.

Aus Phase 0 kommen drei Ergänzungen dazu, die ich für G0 empfehle:
1. **Transition-Audit-Tabelle** — Voraussetzung für den atomaren Pfad (0.3), für die Wrapper-Telemetrie (0.2) und für die Auditpflicht des Recovery-Primitives.
2. **`anon`-EXECUTE auf beiden Signaturen entziehen** und die `auth.uid() IS NULL`-Lücke schließen (0.2). Reiner Rechteentzug, kein Drop, kein Verhaltensbruch für Edge Functions (die laufen als `service_role`).
3. **`failSceneState()` als toten Pfad markieren** statt ihn als Bestandsvertrag zu führen (0.1) — er wird in G0 run-sicher gemacht und erst in G1–G4 verdrahtet.

Zwei Punkte brauchen eine Produktentscheidung von dir, bevor G0 startet:
- **Cancel-Semantik**: sollen `composer-cancel-project` und `composer-cancel-scene` run_bound werden (nur der aktive Run darf gecancelt werden) oder bleiben sie bewusst runless mit Pflichtgrund? Beide haben `active_run_id` bereits zur Hand.
- **`hybrid-extend-scene`**: bleibt runless klassifiziert, oder soll es in G2/G3 einen echten Run-Kontext bekommen?

STOP. Keine Implementierung bis zur Freigabe dieser vier Antworten.

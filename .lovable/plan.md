# FA-4/P0 Fix Contract — Idempotent Preclip Dispatch Resume

Nur **Analyse + Contract Lock**. Kein Code, keine Migration, kein Deploy, kein Render.
Ergebnis ist ein Vertragstext, der in `docs/v433-motion-studio-final-acceptance.md`
(Abschnitt „FA-4/P0 — Fix Contract") abgelegt wird. Danach STOP.

## Belegter Ist-Zustand (read-only geprüft)

`supabase/functions/_shared/pass-face-preclip.ts`:

- **Identität**: `const renderId = crypto.randomUUID()` wird **pro Aufruf neu** erzeugt und
  als `video_renders.render_id` eingefügt (`source = "dialog-pass-preclip"`,
  `status = "pending"`), **vor** dem Invoke. Die Identität ist also pro Dispatch stabil,
  aber **nicht** über einen erneuten Funktionsaufruf hinweg — es gibt heute keinen
  deterministischen Schlüssel aus (scene_id, pass_idx, crop-Geometrie, run_id).
- **Vorhandener Wiederverwendungs-Pfad (v188 Reuse-Guard)**: vor dem Dispatch wird nach
  einem `completed` Preclip derselben Szene/Pass **mit identischer `face_crop.size`**
  aus den letzten 15 Minuten gesucht und dessen `video_url` wiederverwendet. Er greift
  nur bei `status = 'completed'`, nicht bei laufenden Renders.
- **Heutiger 502-Pfad**: `!invokeResp.ok` → `video_renders` sofort auf
  `status='failed'` + `error_message = "invoke <status>: …"`, Rückgabe
  `errorClass: "dispatch_failed"`. Damit wird der Wiederaufnahme-Zustand zerstört, obwohl
  der Lambda-Start bereits erfolgt sein kann.
- **Andere Klassen**: `insert_render:*` → `dispatch_failed`; Poll sieht `failed` →
  `lambda_failed`; Deadline → `poll_timeout`.

`supabase/functions/invoke-remotion-render/index.ts`:

- Nimmt `pendingRenderId` entgegen und hat einen **Idempotenz-Kurzschluss**: ist
  `content_config.real_remotion_render_id` gesetzt **oder** `status='completed'`, antwortet
  ein erneuter Invoke mit `alreadyStarted: true` ohne zweiten Lambda-Start.
- Setzt **vor** dem AWS-Call `status='rendering'` + `content_config.lambda_invoked_at`,
  ruft dann Lambda im RequestResponse-Modus und persistiert `real_remotion_render_id`
  erst **nach** der Antwort. Genau hier liegt das kritische Fenster.

`supabase/functions/compose-dialog-segments/index.ts`:

- Zweig `v161PreclipEligible → preclipResult !ok → speakers.length >= 2` (≈5367–5409):
  `logSyncDispatch(PREFLIGHT_BLOCKED)` → `failLipSync(v187_…)` → HTTP 422 + Refund,
  **vor** jedem `sync_segment`-Ledger-Acquire.

## Der Vertrag (zu fixieren)

1. **Logische Preclip-Identität** = deterministischer Schlüssel
   `(composer_scene_id, pass_idx, face_crop.size, active_run_id)`, materialisiert als
   `video_renders.content_config.preclip_key`. `render_id` bleibt die technische
   `pendingRenderId`; der Resume findet die Zeile über `preclip_key`, nicht über eine
   neue UUID.
2. **Fehlerklassifikation**: HTTP 5xx / Netzwerk-Abbruch / Timeout des Invoke ⇒
   **`dispatch_uncertain`** (neu), nicht `dispatch_failed`. `dispatch_failed` bleibt
   ausschließlich für beweisbar nicht gestartete Fälle: HTTP 4xx aus
   `invoke-remotion-render` (`400 invalid_input`, `503 aws_credentials_missing`) und
   `insert_render:*`.
3. **Zustands-Erhalt bei `dispatch_uncertain`**: die `video_renders`-Zeile wird **nicht**
   auf `failed` gesetzt, sondern behält `pending`/`rendering` und bekommt
   `content_config.dispatch_uncertain_at`. Nur so bleibt der Resume möglich.
4. **Resume-Regel**: bei `dispatch_uncertain` genau **ein** erneuter Invoke mit
   **derselben** `pendingRenderId`. Der bestehende `alreadyStarted`-Kurzschluss
   verhindert dabei den Doppel-Lambda, sobald `real_remotion_render_id` steht.
5. **Kritisches Fenster (Lambda gestartet, `real_remotion_render_id` noch nicht
   persistiert)**: wird durch eine Sperre in `invoke-remotion-render` geschlossen —
   `lambda_invoked_at` gilt als Start-Beweis. Liegt es < `LAMBDA_START_GRACE` (Vorschlag
   90 s) zurück und ist `real_remotion_render_id` leer, antwortet der Invoke mit
   `alreadyStarted: true, unresolved: true` und startet **kein** zweites Lambda; der
   Aufrufer geht direkt in den Poll. Erst nach Ablauf der Grace ohne Fortschritt darf
   überhaupt neu gestartet werden.
6. **Beweisbar erneut versuchbar** ist ein Invoke nur, wenn: `errorClass` =
   `dispatch_uncertain` **und** `real_remotion_render_id` leer **und**
   `lambda_invoked_at` fehlt oder älter als die Grace ist **und** die Zeile nicht
   `completed` ist. Maximal **1** Resume pro logischer Preclip-Identität.
7. **Nicht retrybar** bleiben: `lambda_failed` (echter Renderfehler), `invalid_input`,
   `insert_render:*`, `poll_timeout`. Der v188-Reuse-Guard bleibt der einzige Pfad, über
   den ein spät fertiggewordener Render nach Poll-Timeout wiederverwendet wird.
8. **v187 bleibt fail-closed**: nach erschöpftem (oder nicht zulässigem) Resume greift
   unverändert `v187_preclip_required_no_fullplate_fallback` → 422 + idempotenter Refund.
   Kein Full-Plate-Fallback, keine Änderung an Gates oder Schwellenwerten.
9. **Nutzermeldung**: Dispatch-/Infrastrukturfehler ≠ Timeout. `dispatch_uncertain` und
   `dispatch_failed` erzeugen „Vorbereitung des Sprecher-Clips konnte nicht gestartet
   werden (Infrastrukturfehler)"; nur `poll_timeout` behält „wurde nicht rechtzeitig
   fertig". Reine Presenter-Ebene, in EN/DE/ES.

## Offene Punkte, die der Lock beantworten muss

- Grace-Wert für `LAMBDA_START_GRACE` (Vorschlag 90 s) — bestätigen oder setzen.
- Ob `preclip_key` zusätzlich als Partial-Unique-Index abgesichert wird oder nur als
  `content_config`-Feld geführt wird (Migration ja/nein).
- Verhältnis zum Freeze: die Änderungen liegen in `pass-face-preclip.ts` und
  `invoke-remotion-render` — `pass-face-preclip.ts` steht auf der Freeze-Liste. Der Fix
  braucht daher ein ausdrückliches, eng umrissenes Unfreeze („dispatch resilience only,
  keine Gates/Schwellen/Geometrie").

## Danach

STOP. Erst nach Abnahme dieses Contracts ein sehr kleiner Fix, dann ausschließlich
Wiederholung von FA-4. FA-1 bis FA-3 bleiben PASS.

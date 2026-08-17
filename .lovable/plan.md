# FA-4/P0 Fix Contract — Idempotent Preclip Dispatch Resume (exactly-once)

Nur **Analyse + Contract Lock**. Kein Code, keine Migration, kein Deploy, kein Render.
Der Vertrag wird als Abschnitt „FA-4/P0 — Fix Contract" in
`docs/v433-motion-studio-final-acceptance.md` abgelegt. Danach STOP.


## Belegter Ist-Zustand (read-only geprüft)

`_shared/pass-face-preclip.ts`
- `renderId = crypto.randomUUID()` → genau eine `video_renders`-Row
  (`source='dialog-pass-preclip'`, `status='pending'`) **vor** dem Invoke.
- `!invokeResp.ok` → Row sofort `status='failed'`, Rückgabe `errorClass:'dispatch_failed'`.
  Genau das zerstört heute den Wiederaufnahme-Zustand.
- Klassen heute: `insert_render:*` / `invoke_<status>` → `dispatch_failed`;
  Poll sieht `failed` → `lambda_failed`; Deadline → `poll_timeout`.
- v188-Reuse-Guard: nutzt einen `completed` Preclip derselben Szene/Pass mit gleicher
  `face_crop.size` aus den letzten 15 min.

`invoke-remotion-render/index.ts`
- Kurzschluss vorhanden: `content_config.real_remotion_render_id` gesetzt **oder**
  `status='completed'` → `alreadyStarted:true`, kein zweiter Lambda-Start.
- Setzt `status='rendering'` + `content_config.lambda_invoked_at` **vor** dem AWS-Call;
  `real_remotion_render_id` erst nach der Antwort. Das ist das kritische Fenster.

`compose-dialog-segments/index.ts`
- Zweig `preclipResult !ok && speakers.length >= 2` (≈5367–5409): `PREFLIGHT_BLOCKED`
  → `failLipSync(v187_…)` → 422 + Refund, **vor** jedem `sync_segment`-Acquire.

## Contract (freigabefähige Fassung)

### A — Eine Preclip-Row, eine `pendingRenderId`
`renderPassFacePreclip` erzeugt genau **eine** `video_renders`-Row und behält deren
`renderId`. Jeder Resume-/Probe-Aufruf nutzt exakt dieselbe `pendingRenderId`. Ein 502
erzeugt **nie** eine zweite Preclip-Row und **nie** eine neue UUID. Keine zusätzliche
Identität, kein zusätzlicher Index, keine Migration in diesem P0.

### B — Atomic Dispatch Claim in `invoke-remotion-render`
Für dieselbe `pendingRenderId` gilt, in dieser Reihenfolge:
1. `status='completed'` oder `real_remotion_render_id` vorhanden → `alreadyStarted:true`,
   kein AWS-Call.
2. `lambda_invoked_at` vorhanden → `alreadyStarted:true, unresolved:true`, **kein**
   AWS-Call. Zeitablauf ändert daran nichts.
3. Nur wenn `lambda_invoked_at` fehlt, darf **genau ein** Caller es setzen — als echter
   **CAS**: ein einziges `UPDATE ... SET lambda_invoked_at = now() WHERE id = :renderId
   AND lambda_invoked_at IS NULL RETURNING ...`. Kein `SELECT` → `UPDATE`. Nur der Caller
   mit zurückgegebener Row darf AWS aufrufen; alle anderen lesen die Row erneut und
   antworten `alreadyStarted:true, unresolved:true`. Kein DB-Row-Lock über den externen
   AWS-Call hinweg.

`lambda_invoked_at` ist damit der endgültige Start-Fence: einmal gesetzt, nie wieder ein
zweiter AWS-Start — unabhängig von verstrichener Zeit oder Prozessneustart.

### C — Verhalten nach 5xx/Netzwerkfehler beim Preclip-Invoke
Die Row wird **nicht** auf `failed` gesetzt. Stattdessen:
- kurze Backoff-/Recheck-Phase, dann dieselbe Row lesen;
- `real_remotion_render_id`/Fortschritt vorhanden → normal weiterpollen;
- `lambda_invoked_at` vorhanden → nur pollen, nie erneut AWS starten;
- `lambda_invoked_at` fehlt weiterhin → **genau ein** erneuter Invoke mit derselben
  `pendingRenderId`; ob wirklich AWS startet, entscheidet allein der Claim aus B.

Das heilt „Gateway-502, Request erreichte die Edge Function nie", ohne bei „Request kam
an, Antwort ging verloren" einen Doppelrender zu riskieren.

### D — Unsicherheit ohne Fortschritt
`lambda_invoked_at` gesetzt, aber innerhalb des bestehenden 300-s-Budgets weder
`real_remotion_render_id` noch Completion → **kein** neuer Lambda-Start.
Ergebnis: `dispatch_uncertain` als Diagnosegrund → v187 bleibt fail-closed → **genau ein**
idempotenter Refund → kein Full-Plate-Fallback.

### E — Retrybarkeit nach Sendebeweis, nicht nach HTTP-Familie
| Situation | Verhalten |
| --- | --- |
| beweisbar lokaler Fehler vor dem Send (`insert_render:*`, `invalid_input`, Credentials-/Config-Fehler, auch wenn als 503 transportiert) | definitive rejection, kein Retry |
| 5xx / Netzwerk / verlorene Antwort, Sendeergebnis unbekannt | `dispatch_uncertain` → Pfad C |
| `lambda_failed` (echter Renderfehler) | kein Retry |
| `poll_timeout` | kein AWS-Neustart; v188-Reuse unverändert |
| abgeschlossener alter Render | v188-Reuse wie bisher |

### F — Nutzermeldung (Presenter-Ebene, DE/EN/ES)
- Dispatch-/Gatewayproblem: „Vorbereitung des Sprecher-Clips konnte wegen eines
  Infrastrukturfehlers nicht gestartet bzw. bestätigt werden."
- echter Poll-Timeout: „wurde nicht rechtzeitig fertig."

### G — Narrow Unfreeze
Freigegeben ausschließlich:
- `_shared/pass-face-preclip.ts` — dispatch resilience only
- `invoke-remotion-render/index.ts` — idempotent dispatch claim/resume only
- `compose-dialog-segments/index.ts` — ausschließlich Fehlermeldung/Presenter

Weiter frozen: Face-/BBox-/Maskengeometrie, v187/v331-Gates, Schwellenwerte,
Sync-Ledger, RS3, G3.2.2/F1, Mux/Stitch.

## Verbindliche Tests für den späteren Fix

1. 502 **vor** dem Claim → Reinvoke derselben ID → genau **ein** AWS-Start → Preclip ok.
2. Antwortverlust **nach** gesetztem `lambda_invoked_at` → Reinvoke → `alreadyStarted /
   unresolved`, kein zweiter AWS-Start → Row später `completed` → Preclip ok.
3. `lambda_invoked_at` gesetzt, danach kein Fortschritt → kein zweiter Start, unabhängig
   von der verstrichenen Zeit → v187 fail-closed + genau ein Refund.
4. Zwei parallele Invokes derselben `pendingRenderId` → genau ein Claim/AWS-Start.
5. `lambda_failed`, `invalid_input`, Credentials-/Config-Fehler → kein Retry.
6. `poll_timeout` → kein AWS-Neustart; v188-Reuse unverändert.
7. Claim atomar gesetzt, Prozess stirbt **vor** dem tatsächlichen AWS-Aufruf → Reinvoke
   startet kein zweites Lambda → nach bestehendem Budget fail-closed. Bewusst akzeptierter
   Preis von Exactly-Once: in diesem winzigen Fenster geht ggf. ein Render verloren, es
   entstehen aber nie zwei.
8. N=4 endgültiger Preclip-Failure → weiterhin 0 `sync_segment`-Ledger-Jobs + genau ein
   Refund (heutiges Verhalten vor dem Ledger bleibt korrekt).

## Danach

STOP. Erst nach Contract-Abnahme ein sehr kleiner Fix, dann ausschließlich Wiederholung
von FA-4. FA-1 bis FA-3 bleiben PASS.

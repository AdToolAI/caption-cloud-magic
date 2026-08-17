# FA-4/P0 — Reiner Doku-Nachtrag (kein Code)

Genehmigt ist ausschließlich: den FA-4/P0-Root-Cause-Befund in
`docs/v433-motion-studio-final-acceptance.md` ergänzen. Danach **STOP**.

## Was passiert

Eine einzige Datei wird angefasst: `docs/v433-motion-studio-final-acceptance.md`.
Angehängt wird ein neuer Abschnitt „FA-4/P0 — Root Cause (Pre-Dispatch Failure)" mit
exakt dem bereits abgenommenen Befund:

- **Failure-Owner**: `compose-dialog-segments`, Zweig
  `v161PreclipEligible → preclipResult !ok → speakers.length >= 2` (Zeilen 5367–5409):
  `logSyncDispatch(PREFLIGHT_BLOCKED)` → `failLipSync(...)` → HTTP 422 + Refund.
- **Kein Stall, kein Watchdog**: Zeitleiste 00:23:06 plate_queued → 00:29:40 base_video
  succeeded/audio_ready → 00:30:11 v278 facemap_recovery 4/4 → 00:30:35 pass-0-Preflight-Claim
  → 00:30:38.171 `video_renders` angelegt → 00:30:38.287 „invoke 502: 502 Bad Gateway"
  → 00:30:38.994 dialog_shots failed + refunded → 00:30:39.642 Szene failed.
  Die Transition `ccw:handoff_failed` (00:30:40) wurde mit `unexpected_from_state`
  abgelehnt (`applied=false`) und ist kein Owner.
- **Kein `sync_segment`-Acquire**: Der Ledger-Acquire (`stage:"sync_segment"`, Zeile ~5980)
  liegt strikt hinter dem Preclip-Block (Zeile 5308); der 422-Return bei 5402 verlässt die
  Funktion davor. Ledger korrekt: genau 1 Job (`base_video`, succeeded).
- **Guard-Matrix sauber**: Preclip gilt seit v69 für alle N; `speakers.length >= 2` ist das
  Fail-closed-Kriterium „mehr als ein Gesicht auf der Plate ⇒ kein Full-Plate-Fallback",
  kein Zweier-Cap. Slots 0..3 bijektiv, 6 kanonische Turns, 4 stabile `speaker_idx`.
- **Klassifikation C** — allgemeiner Preflight-Resilienz-Bug. Nicht A (kein 4-Speaker-Limit),
  nicht B (keine Zweier-Annahme), nicht D.
- **Root Cause**: transienter HTTP 502 des `invoke-remotion-render`-Gateways beim ersten
  Preclip-Dispatch; `pass-face-preclip.ts` behandelt `errorClass:"dispatch_failed"` ohne
  jeden Wiederholversuch wie einen inhaltlichen Preclip-Fehler.
- **Nebenbefund**: Meldungstext „wurde nicht rechtzeitig fertig" bei einem 116-ms-Dispatch-502.
- **Status**: FA-4 P0 — ROOT CAUSE IDENTIFIED / AWAITING FIX CONTRACT. Kein Fix, kein Retry,
  kein Reset; Szene bleibt im Fehlerzustand.

Der Abschnitt wird ausdrücklich ohne Implementierungsempfehlung geschrieben — der frühere
Retry-Vorschlag wird als „offen, blockiert durch Idempotenz-Frage" vermerkt.

## Danach: STOP

Kein Code, keine Migration, kein Deploy, kein Render.

## Vormerkung für den späteren FA-4/P0 Fix Contract (nicht Teil dieses Schritts)

Ein read-only Blick in `supabase/functions/invoke-remotion-render/index.ts` zeigt bereits
eine Teilantwort auf die Doppelrender-Frage — das gehört in den Contract, nicht in diesen
Doku-Schritt:

- Die Funktion nimmt eine **stabile `pendingRenderId`** entgegen; `pass-face-preclip.ts`
  legt die `video_renders`-Zeile **vor** dem Invoke an. Die Preclip-Identität existiert also
  schon vor dem Dispatch.
- Es gibt bereits einen Idempotenz-Kurzschluss: Ist
  `content_config.real_remotion_render_id` gesetzt oder `status='completed'`, antwortet ein
  erneuter Invoke derselben ID mit einem No-op (`alreadyStarted`) statt mit einem zweiten
  Lambda-Start.
- Verbleibende Lücken, die der Contract schließen muss: (a) das Zeitfenster zwischen
  Lambda-Start und Persistieren von `real_remotion_render_id`, (b) dass der heutige
  502-Pfad die `video_renders`-Zeile sofort auf `failed` setzt und damit den
  Wiederaufnahme-Zustand zerstört, (c) die Klassifikation „dispatch uncertain" statt
  „dispatch_failed" bei 5xx/Netzwerk.

Diese Punkte werden auf Anforderung als eigener FA-4/P0 Fix Contract ausgearbeitet — erst
danach Code.

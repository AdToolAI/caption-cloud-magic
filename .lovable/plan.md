## Was passiert

3-Sprecher-Szene `2d24dcae…` läuft technisch durch (`lip_sync_status=done`, `clip_status=ready`, Audio-Mux ok), aber:

- Pass 0 (Sprecher 1) wurde mit `coords-pro` versucht → `provider_unknown_error`, dann mit `auto-pro` erfolgreich.
- Pass 1 (Sprecher 2): genauso. Pass 2 (Sprecher 3): genauso.
- Alle 3 Pässe haben `retry_variant=auto-pro` und `last_error_class=provider_unknown_error`.
- Ergebnis: Sprecher 1 bewegt die Lippen, Sprecher 2 & 3 bleiben starr (wie vom Nutzer gemeldet).
- UI-Banner „Fehler — Bitte Lip-Sync neu rendern" stammt vom `usePipelineProgress`-Stall-Detector, weil der Balken länger als 4 min auf ≥ 90 % stand (Audio-Mux dauerte mit), obwohl die DB eigentlich „done" sagt. Sekundärer Effekt.

## Wahre Ursache

`compose-dialog-segments` und `sync-so-webhook` chainen die Pässe so:

- Pass 0 Input = unser eigener `master_plate.mp4` (Supabase Storage) → `coords-pro` funktioniert.
- Pass 1 Input = **Sync.so eigener Roh-URL** `api.sync.so/v2/generations/<id>/result?token=…` (Redirect mit Token).
- Pass 2 Input = wieder Sync.so-Roh-URL von Pass 1.

Sync.so akzeptiert seine eigene Redirect-URL **mit `coordinates`** nicht zuverlässig (`provider_unknown_error`). Die Fallback-Leiter zwingt dann jeden Pass auf `auto-pro` (= `auto_detect: true`, coords gedroppt). Auf einem schon gelippten Eingangsvideo wählt Sync.sos Auto-Detector dann die aktivste Mundbewegung — das ist Sprecher 0 aus Pass 0 — und lässt Sprecher 2/3 unangetastet.

Nur Pass `last` wird aktuell vor dem Apply re-hostet (Zeilen 315-360 in `sync-so-webhook`). **Intermediate Pässe nicht.** Das ist die Lücke.

## Fix (1 Edge Function, ~25 Zeilen)

`supabase/functions/sync-so-webhook/index.ts` — im Multi-Pass-Advance-Branch (Zeilen 263-312) **vor** dem Persistieren der `passes[currentPass].output_url` und vor dem Fire-and-Forget an `compose-dialog-segments`:

1. Lade die fertige Pass-MP4 per `fetch(outputUrl)` herunter (Sync.so akzeptiert sein eigenes Token).
2. Upload in `ai-videos/composer/<projectId>/<sceneId>-pass-<n>.mp4` (gleiche Logik wie der bestehende Last-Pass-Re-Host).
3. Setze `passes[currentPass].output_url = rehostedSupabaseUrl` **bevor** der nächste Pass dispatched wird.
4. Bei Re-Host-Fehler: weicher Fallback auf die Sync.so-Roh-URL + `console.warn` (kein harter Abbruch — heutiges Verhalten bleibt als Notfallpfad).

Damit bekommt Pass N+1 immer eine saubere Supabase-URL als Input, `coords-pro` schlägt nicht mehr mit `provider_unknown_error` fehl, und jeder Sprecher wird mit seinen eigenen Koordinaten korrekt geliptet.

```text
Pass 0: master_plate.mp4  ──Sync.so coords-pro──►  rehost ──► supabase/…-pass-1.mp4
Pass 1: supabase/…-pass-1.mp4 ──Sync.so coords-pro──►  rehost ──► supabase/…-pass-2.mp4
Pass 2: supabase/…-pass-2.mp4 ──Sync.so coords-pro──►  rehost ──► supabase/…-final.mp4 (existing last-pass path)
```

## Warum 1- und 2-Sprecher-Pipelines unberührt bleiben

- **1 Sprecher**: nur 1 Pass, `isLastPass=true`, Code fließt direkt in den bestehenden Last-Pass-Re-Host-Block. Kein neues Verhalten.
- **2 Sprecher**: Pass 0 bekommt jetzt zusätzlich einen Re-Host (vorher 0 Re-Hosts dazwischen). Pass 1 bekommt sauberes Supabase-Input statt Sync.so-Redirect. Beide Pässe profitieren von `coords-pro`. Last-Pass-Re-Host bleibt unverändert.
- **3+ Sprecher**: Der eigentliche Fix.

## Sekundäres (klein, optional)

Das Banner „Fehler — Bitte Lip-Sync neu rendern" triggert aktuell auch wenn die Szene tatsächlich `done` ist, nur weil der Audio-Mux > 4 min dauerte und der Stall-Detector zuschlug. Wenn der Hauptfix sitzt, ist das Banner unkritisch (Pässe sind schneller fertig). Falls du willst, kann ich in einem **separaten** Schritt den Stall-Detector so anpassen, dass er bei `lipsync done + audio_muxing` nicht mehr als „Fehler" anzeigt. **Nicht** Teil dieses Plans.

## Out of Scope

- `compose-dialog-segments` Variant-Logik (vorheriger Fix bleibt).
- `render-sync-segments-audio-mux` (funktioniert korrekt).
- `poll-dialog-shots`, N-slot face map, coords computation.
- Recovery der bestehenden Szene `2d24dcae…`: User klickt nach Deploy auf „🔁 Lip-Sync neu rendern".

## Geänderte Dateien

- `supabase/functions/sync-so-webhook/index.ts` (~25 Zeilen im Advance-Branch).
- `mem/features/video-composer/sync-segments-dialog-pipeline` — Notiz: intermediate passes müssen re-hostet werden.

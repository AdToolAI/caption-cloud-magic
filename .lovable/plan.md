# V501 — Audio-Mux Dispatch-Lücke (Szene hängt bei 6/6)

## Befund (read-only verifiziert, Szene `be60d106…` / S01)

Der Lip-Sync ist **nicht** fehlgeschlagen. Alle 6 Pässe sind sauber fertig
(`status: done`, jeweils mit `output_url`). Hängen bleibt der **letzte
Schritt**: das Zusammensetzen von Bild und Ton.

Belegt:

| Prüfpunkt | Wert |
|---|---|
| Pässe 0–5 | alle `done`, alle mit Output |
| Szenenstatus | `audio_muxing`, unverändert seit 10:39 |
| `audio_mux` | nur `mux_dispatch_requested_at`, **kein** `render_id`, **kein** `dispatched_at` |
| Ledger-Zeile `audio_mux` | angelegt 10:39:16, Status `dispatch_uncertain` |
| Aufrufe von `render-sync-segments-audio-mux` | **0** in den letzten 40 Minuten |

Der Mux-Auftrag wurde also im Ledger reserviert, aber der eigentliche Aufruf
der Render-Funktion ist nie angekommen. Der Aufruf ist ein „abschicken und
nicht nachsehen"-Aufruf (`fetch(...).catch(() => {})`, ohne `await`) — bricht
die Webhook-Instanz vorher ab, ist der Auftrag lautlos weg.

Zweiter, ebenso wichtiger Punkt: der vorhandene Stall-Watchdog greift **nur**,
wenn `audio_mux.dispatched_at` gesetzt ist. Genau dieser Fall — reserviert,
aber nie abgeschickt — ist die einzige Lücke, die kein Wächter abdeckt. Die
Szene bleibt deshalb unbegrenzt hängen, ohne Fehler, ohne Rückerstattung.

## Was gebaut wird

### 1. Sofort-Entsperrung der aktuell hängenden Szene
Einmalige, gezielte Wiederanstoßung des Mux für `be60d106…` (Ledger-Zeile als
Retry mit Grund `mux_redispatch`, dann Aufruf der Render-Funktion). Kein
neuer Provider-Call, keine erneuten Kosten — die 6 Pässe existieren bereits.
Schlägt auch das fehl, wird die Szene sauber als fehlgeschlagen markiert und
die Credits idempotent zurückgebucht, statt weiter zu hängen.

### 2. Mux-Dispatch wird bestätigt statt gehofft
Der Aufruf aus `sync-so-webhook` wird abgewartet und ausgewertet:
- Antwort 2xx → wie bisher.
- Fehler/Timeout/keine Antwort → Ledger-Zeile bleibt `dispatch_uncertain`
  und die Szene bekommt einen Marker, dass der Mux erneut angestoßen werden
  darf. Kein stiller Verlust mehr.

### 3. Watchdog schließt die Lücke „reserviert, nie abgeschickt"
Neue Regel im `lipsync-watchdog`, parallel zur bestehenden v252-Regel:
- Szene in `audio_muxing`, `mux_dispatch_requested_at` älter als 90 s,
  **kein** `render_id`/`dispatched_at` → genau ein Re-Dispatch über den
  regulären Retry-Vertrag (`mux_redispatch`).
- Bleibt es nach dem zweiten Versuch (Alter > 6 min) weiterhin ohne
  `render_id` → Szene terminal auf `failed` mit `audio_mux_dispatch_lost`,
  Credits-Rückerstattung über den bestehenden idempotenten Pfad.

Damit kann keine Szene mehr unbegrenzt in `audio_muxing` stehen.

### 4. Regressionsschutz
Deno-Tests für die neue Watchdog-Verzweigung: reserviert-ohne-Dispatch löst
genau einen Re-Dispatch aus; dispatched-aber-still fällt weiterhin in die
v252-Regel; fertige Szenen werden nie angefasst.

## Abgrenzung (bewusst nicht Teil dieses Gates)

- Keine Änderung an Lip-Sync-Geometrie, Gates, ASD, Verdict-Metrik oder
  Provider-Payload. Der V500-Freeze bleibt unangetastet — die Ursache liegt
  hinter dem Lip-Sync, im Compositing-Anstoß.
- Kein neuer S01-Canary-Lauf ohne ausdrückliches GO.

## Technische Details

- `supabase/functions/sync-so-webhook/index.ts` — `dispatchAudioMux()`:
  `await` + Statusprüfung, Rückgabe `dispatched` / `dispatch_uncertain`.
- `supabase/functions/lipsync-watchdog/index.ts` — neue Verzweigung vor der
  v252-Regel, Konstanten `MUX_REDISPATCH_MS = 90_000` und
  Wiederverwendung von `STALE_AUDIO_MUX_MS` als Hard-Kill-Grenze.
- Retry-Grund `mux_redispatch` ist in `RETRYABLE_FAILURE_REASONS` bereits
  vorhanden — kein neuer Vertrag nötig.
- Rückerstattung ausschließlich über den bestehenden idempotenten Pfad.

## Was beobachtet wurde

Szene `7772e99f-5c2b-4774-8d03-0332888691e8` (4 Sprecher, 9s locked Hailuo-Plate):

- Beide aktiv getesteten Passes scheitern reproduzierbar mit
  `provider_unknown_error` auf **allen** Varianten (coords-pro →
  coords-pro-box → sync3-coords → coords-pro-lp2pro), 3× retried,
  `retry_count: 11` insgesamt.
- Edge-Log zeigt korrekt: `v39_tight_audio dur=1.60s windows=[[6.986,8.585]]`
  bzw. `dur=2.45s windows=[[0, 2.448]]` für pass 0.
- Aber die Dispatch-Zeile loggt: `sync_mode=loop` mit `totalSec=9`.

## Root Cause

`compose-dialog-segments/index.ts` Z.1934:
```ts
const payloadSyncMode = passes.length >= 2 ? "loop" : "cut_off";
```

v63 hat `loop` eingeführt, um ein "Frozen-Frame" zu verhindern, **wenn der
Master-VO länger als die Plate ist** (Single-Pass v56 official segments).

v64 hat dann den Tight-Slice-Pfad für N=1 nachgezogen und setzt dort
korrekt `cut_off`.

**Übersehen wurde der Mainstream-Pfad: N≥2 Multi-Pass mit Per-Speaker-
Tight-Audio.** Hier sendet jeder Pass ein **kurzes** Tight-WAV (~1.6–2.4s)
an Sync.so gegen die volle 9s-Plate. Mit `sync_mode=loop` versucht
Sync.so, die 1.6s-Audio rund 5.6× über die 9s-Plate zu loopen — das ist
keine sinnvolle Lipsync-Eingabe und Sync.so antwortet konsistent mit
`"An unknown error occurred."` (kein error_code → `provider_unknown_error`).

Warum N=2 "funktioniert hat": Bei 2 Sprechern sind die Turns oft länger
(~3–5s pro Speaker) → das Loop-Verhältnis ist näher an 1× → Sync.so
toleriert es manchmal. Bei N=4 wird jeder Turn kürzer (~1.5–2.5s) → das
Loop-Verhältnis explodiert → reproduzierbarer Fail.

## Fix (v66 — eine Code-Änderung)

In `supabase/functions/compose-dialog-segments/index.ts` Z.1934 die
sync_mode-Bestimmung auf **Anwesenheit von Tight-Audio** umstellen statt
auf Pass-Anzahl:

```ts
// v66: sync_mode hängt davon ab, OB Tight-Audio gesendet wird, nicht
// von der Sprecher-Anzahl.
//   • tightAudioInfo gesetzt  → cut_off (Per-Pass-Tight; Output =
//     Speech-Dauer; audio-mux Lambda overlay füllt den Rest der Plate)
//   • kein Tight (v56 official segments mit Master-VO) → loop (v63 —
//     Plate hält bis Master-VO endet)
const payloadSyncMode = tightAudioInfo ? "cut_off" : "loop";
```

Konsistenzfolgen:
- State-Metadata + Logs ziehen automatisch nach (lesen `payloadSyncMode`).
- `render-sync-segments-audio-mux` braucht keine Änderung — der Overlay-
  Branch greift bereits für jedes done-Pass mit `audio_tight` (v64).
- Der echte v63-Use-Case (force_v56 Master-VO Single-Pass) bleibt auf
  `loop` — dort wird kein Tight-Slice erzeugt, also `tightAudioInfo`
  bleibt `null`.
- Retry-Ladder, Face-Gate, Refund, Watchdog: keine Änderung.

## Verifikation nach Deploy

1. Neue 4-Sprecher-Szene rendern → Edge-Log zeigt jetzt
   `sync_mode=cut_off` pro Pass; Sync.so liefert 200 OK.
2. Webhook dispatched `render-sync-segments-audio-mux` im
   Overlay-Branch (wie bisher für N=2).
3. Finale Szene = 9s pristine Plate mit 4 Lipsync-Overlays an den
   jeweiligen Turn-Windows.
4. Regression-Check: 2-Sprecher-Szene weiterhin grün (gleicher Pfad).
5. Regression-Check: 1-Sprecher cinematic-sync weiterhin grün (war
   schon `cut_off`).

## Doku

Neue Memory-Datei `mem/architecture/lipsync/v66-sync-mode-tight-gated.md`
mit obiger Begründung, plus Index-Update und Rule-I.11-Verschärfung in
`FROZEN-INVARIANTS.md` (sync_mode-Bestimmung ist tight-gated, nicht
count-gated).

## Out of Scope

- Keine Änderung am Tight-Slice-Algorithmus, an der Face-Detection-Ladder,
  am Audio-Mux Lambda oder am Refund-Pfad.
- Keine UI-Änderung.

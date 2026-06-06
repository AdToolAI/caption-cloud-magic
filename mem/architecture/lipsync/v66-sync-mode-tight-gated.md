---
name: v66 Sync.so sync_mode tight-gated (4-speaker fix)
description: sync_mode wird jetzt von der Anwesenheit von Tight-Audio bestimmt, nicht von der Sprecher-Anzahl. Behebt reproduzierbares provider_unknown_error bei 4-Sprecher-Dialogszenen, wo v64 fälschlich `loop` setzte und Sync.so versuchte, 1.6s Tight-Audio ~5× über eine 9s Plate zu loopen.
type: architecture
---

## Symptom (Juni 2026)

4-Sprecher-Dialog-Szene (`7772e99f…`, 9s locked Hailuo-Plate) schlug
reproduzierbar fehl. Jeder Pass durchlief die volle Retry-Ladder
(coords-pro → coords-pro-box → sync3-coords → coords-pro-lp2pro), alle
mit `"An unknown error occurred."` von Sync.so. `retry_count: 11`.

Edge-Log zeigte korrekten Tight-Slice: `v39_tight_audio dur=1.60s
windows=[[6.986, 8.585]]` — aber Dispatch: `sync_mode=loop totalSec=9`.

2-Sprecher Szenen (gleicher Pfad) liefen meistens grün — der Unterschied
war Glück, kein Design.

## Root Cause

v63 hatte `sync_mode=loop` für den Master-VO-Use-Case eingeführt
(Plate kürzer als VO → loop verhindert Frozen-Frame).

v64 zog Tight-Slice für N=1 nach und setzte für N=1 korrekt `cut_off`,
beließ aber N≥2 auf `loop` — **ohne zu erkennen, dass N≥2 inzwischen
ebenfalls Per-Pass-Tight-Audio sendet**, nicht den vollen Master-VO.

Konkret in `compose-dialog-segments/index.ts` Z.1934:
```ts
const payloadSyncMode = passes.length >= 2 ? "loop" : "cut_off";
```

Bei N≥2 wird **pro Pass** ein 1.5–2.5s Tight-Window des einzelnen
Sprechers an Sync.so geschickt — gegen eine 9s Plate. Mit `loop` versucht
Sync.so, die Tight-Audio rund 5× zu wiederholen. Bei N=2 sind Turns oft
3–5s lang → Verhältnis ~1.5–3× → Sync.so toleriert es manchmal. Bei N=4
sind Turns 1.5–2.5s → Verhältnis 3.5–6× → reproduzierbarer
`provider_unknown_error`.

## v66 Fix

Eine Zeile in `compose-dialog-segments/index.ts`:

```ts
const payloadSyncMode = tightAudioInfo ? "cut_off" : "loop";
```

Begründung:
- **Tight-Audio vorhanden** → der Output _soll_ Speech-Dauer haben.
  `render-sync-segments-audio-mux` (Overlay-Branch, v64) legt den
  kurzen Lipsync-Clip auf die volle pristine Plate während des
  Turn-Windows. `cut_off` ist exakt richtig.
- **Kein Tight** → der echte v63-Master-VO-Case (force_v56 official
  segments). Loop bleibt korrekt.

Der Pfad nach `tightAudioInfo === null` (z.B. Tight-Slice-Failure) fällt
ebenfalls auf `loop` — das matched das v63-Verhalten und ist konservativ.

## Verifikation

1. 4-Sprecher Szene: Edge-Log zeigt jetzt
   `sync_mode=cut_off` pro Pass. Sync.so 200 OK in <60s pro Pass.
2. Webhook dispatched `render-sync-segments-audio-mux` mit
   `useOverlay=true` (4 done passes, `audio_tight` gesetzt).
3. Finale Szene: 9s pristine Plate mit 4 Face-Mask-Overlays an den
   jeweiligen Turn-Windows.
4. 2-Sprecher Regression: grün (gleicher Pfad, jetzt korrekt `cut_off`).
5. 1-Sprecher Regression: grün (unverändert `cut_off` über `tightAudioInfo`).
6. force_v56 Master-VO Regression: grün (`tightAudioInfo === null` →
   `loop` wie v63).

## Out of Scope

- Keine Änderung an Tight-Slice-Algorithmus, Face-Detection-Ladder,
  Audio-Mux Lambda oder Refund-Pfad.
- Keine UI-Änderung.

## Regel (FROZEN-INVARIANT)

`sync_mode` wird **tight-gated** bestimmt, nie count-gated:
```
sync_mode = tightAudioInfo ? "cut_off" : "loop"
```

## Diagnose

Forensics zeigt alle Checks **PASS** — der Snap-Hinweis im UI ist nur informativ und betrifft eine andere Probe-Koordinate (Frame 36) als der echte Dispatch (Frame 52). Der Dispatch ging mit `coords=[360,363]` sauber raus (HTTP 201, `DISPATCHED`).

Der eigentliche Bruch passiert **bei Sync.so selbst**, nicht im Face-Gate. Webhook-Payload für jeden FAIL:

```
status: "FAILED"
errorCode: "generation_unknown_error"
error: "Something went wrong while processing this generation. Please try again."
```

Das passiert seit Stunden **bei jedem Dispatch** (mehrere Scenes, identischer Code). Sync.so-Doku (`GET /v2/errors`) sagt: "Retry. Falls reproduzierbar → Eingabe ist defekt".

`ffprobe` auf dem realen Preclip (`dialog-pass-preclip-bfa65e55-…-p0.mp4`):

```
codec_name=h264
pix_fmt=yuvj420p          ← JPEG-Range YUV (Full-Range)
width=720  height=720
nb_frames=73  fps=30  duration=2.43s
streams: 1 (video only, no audio — by design, ok)
```

**Root Cause:** Remotion-Lambda rendert die Preclips mit `imageFormat: "jpeg"` und ohne explizites `pixelFormat`. Ergebnis ist `pix_fmt=yuvj420p` (JPEG/PC-Range statt TV-Range). Sync.so's Decoder/Face-Tracker akzeptiert `yuvj420p` nicht zuverlässig und failed silent mit dem generischen `generation_unknown_error`. Die Forensics-Pre-Checks erkennen das nicht, weil ffmpeg/Chrome beides problemlos lesen — nur Sync.so's Pipeline bricht.

`normalize-master-clip` re-encodet bereits explizit auf `format=yuv420p` für andere Pfade — die Dialog-Preclips waren von dieser Vorgabe ausgenommen.

## Fix (sehr klein, nur Render-Config)

**`supabase/functions/_shared/pass-face-preclip.ts`** — im `lambdaPayload` zwei Felder hinzufügen:

```ts
pixelFormat: "yuv420p",     // ← erzwingt TV-Range, fixt Sync.so
colorSpace: "bt709",        // ← deterministischer Farbraum
```

Optional zusätzlich `imageFormat: "png"` (kostet ~30% Render-Zeit, daher nur als Fallback dokumentieren — `pixelFormat: "yuv420p"` reicht).

Version-Tag im Log: `v129.23.3_preclip_pixfmt`.

## Verify

1. Deploy `compose-dialog-segments` (zieht das `_shared/pass-face-preclip.ts` mit).
2. Neue Test-Szene rendern → erwartetes Ergebnis:
   - `ffprobe` neuer Preclip → `pix_fmt=yuv420p` (kein j).
   - Sync.so-Webhook → `status: "COMPLETED"` statt `generation_unknown_error`.
3. Falls Sync.so trotzdem failed: Generation-ID an Support melden (Sync.so-interner Bug). Dann zweite Stufe planen: Re-encode Preclip durch `normalize-master-clip` vor Dispatch.

## Out of Scope

- Keine Änderung am Face-Gate (v129.23.2 bleibt).
- Keine Änderung am ASD-Coord-Snap (Forensics-Hinweis ist ein Cosmetics-Issue, nicht der Failure-Grund).
- Keine Änderung an `normalize-master-clip`, `remotion-webhook`, oder am Webhook-Polling.

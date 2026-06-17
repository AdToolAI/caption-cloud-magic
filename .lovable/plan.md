## Diagnose

Im Screenshot (v129.14) bleibt **Gesicht am ASD-Frame** auf `WARN` mit `frame_extract_unavailable` stehen. Die im letzten Schritt eingebaute **Pass-2-Logik** (Client-side `<video>`+`<canvas>` → JPEG → `composer-frames` → Re-Preflight) läuft entweder gar nicht durch oder scheitert still im `catch (e)`-Block ohne UI-Feedback.

Wahrscheinlichste Ursache: das Quell-Video kommt von einem Host (`replicate.delivery` oder Lambda-S3), der beim direkten `<video crossOrigin="anonymous">`-Laden **kein** `Access-Control-Allow-Origin` zurückgibt → Canvas wird "tainted" → `toBlob()` wirft `SecurityError` → der Catch loggt nur in die Console, die WARN-Card bleibt unverändert.

Es existiert bereits eine Edge Function `proxy-video-bytes`, die genau für diesen Zweck (CORS-freie Auslieferung von Replicate/Lambda-Videos zur Browser-Decodierung) gebaut wurde — die wird im Forensik-Pfad bisher nicht genutzt.

## Plan (v129.15)

**Ziel:** Pass-2-Frame-Extraktion zuverlässig durchbringen + ehrliches UI-Feedback wenn sie scheitert. Reiner Admin-/Forensik-Pfad, keine Mutation an Produktionspfaden.

### 1. `src/components/admin/SyncsoForensicsSheet.tsx` — `extractFrameClientSide`
- Vor `video.src = videoUrl` die URL durch `proxy-video-bytes` routen:
  - Hosts in `['replicate.delivery','s3.eu-central-1.amazonaws.com','s3.amazonaws.com','remotionlambda-*']` → `${SUPABASE_URL}/functions/v1/proxy-video-bytes?url=${encodeURIComponent(videoUrl)}` mit `apikey`-Query.
  - Supabase-Storage-URLs (`/storage/v1/object/public/`) direkt verwenden, dort stimmen die CORS-Header.
- `crossOrigin = 'anonymous'` bleibt.
- Bei Fehlern (Load-Timeout, Seek-Fail, `toBlob`-Throw, Upload-Fail) konkreten Reason zurückgeben statt `null`.

### 2. `runPreflight` — Pass 2 Fehler sichtbar machen
- Statt `console.warn` im Catch: einen synthetischen `face_at_frame`-Status in `preflightResult` injizieren, der die Ursache nennt (z.B. `client_extract_failed: <reason>`), damit die Card von `frame_extract_unavailable` auf einen aussagekräftigen Reason wechselt.
- Wenn `jpegUrl` erfolgreich, aber Re-Preflight error: gleiche Behandlung.

### 3. UI-Badge & Hinweistext
- Version-Badge `v129.14` → `v129.15` in den drei Stellen.
- WARN-Text in der `face_at_frame`-Zelle aktualisieren: bei `frame_extract_unavailable` automatisch erklären, dass jetzt Client-Extraktion via Proxy läuft (Spinner/State während `preflightLoading`).

### 4. Keine Edge-Function-Deploys nötig
- `proxy-video-bytes` ist bereits deployt.
- `syncso-preflight` braucht keine Änderung — akzeptiert `probe_frame_url` schon seit v129.14.
- `face-frame-extract.ts` bleibt der no-op.

## Verifikation

Forensik-Sheet für Scene `ea542657…` öffnen → erwarte einen der zwei Endzustände:
- **PASS** mit Inline-JPEG-Thumbnail aus dem Client-Extract, oder
- **BLOCKED/WARN** mit klarem Reason (`client_extract_failed: video load failed (CORS?)` o.ä.) — nicht mehr das generische `frame_extract_unavailable`.

## Geänderte Dateien
- `src/components/admin/SyncsoForensicsSheet.tsx` (Proxy-URL + Error-Surfacing + Badge-Bump)

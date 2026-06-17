## Ziel
Frame-Extraktion für die Sync.so Face-Probe komplett ohne Replicate — serverseitig in der Edge Function via ffmpeg.wasm. Damit verschwindet das `404 lucataco/ffmpeg-extract-frame`-Problem dauerhaft, und Face-Gate liefert wieder echte `PASS`/`BLOCKED`-Verdicts.

## Scope (was sich ändert)

**1 Datei umgebaut, 0 neue externe Dependencies / Secrets:**

### `supabase/functions/_shared/face-frame-extract.ts` (Rewrite, ~150 Zeilen)
- Replicate-Call (`lucataco/ffmpeg-extract-frame`) entfernt — inkl. aller `REPLICATE_API_KEY`-Reads, Polling-Loop und `urls.get`-Handling.
- Neuer Flow:
  1. `fetch(videoUrl)` → `ArrayBuffer` (Range-Request `bytes=0-3000000`, ~3 MB reicht für ersten Keyframe bei H.264).
  2. ffmpeg.wasm laden via `https://esm.sh/@ffmpeg/ffmpeg@0.12.10` + `@ffmpeg/core@0.12.6` (single-thread Build, kein SharedArrayBuffer nötig).
  3. `ffmpeg.writeFile('in.mp4', bytes)` → `ffmpeg.exec(['-ss', String(tsSec), '-i', 'in.mp4', '-frames:v', '1', '-q:v', '3', 'out.jpg'])`.
  4. `ffmpeg.readFile('out.jpg')` → Upload in Bucket `composer-frames` (Pfad bleibt SHA1-deterministisch, Cache greift weiter).
  5. Public URL zurückgeben — gleicher Return-Shape wie heute (`{ ok, jpegUrl, extractMs, cached }`), damit Face-Gate, Preflight und Forensik-Sheet unverändert funktionieren.
- Singleton-Pattern für ffmpeg-Instanz pro Function-Worker (Cold-Start ~1.5 s, Warm <300 ms).
- Fallback bei ffmpeg-Init-Fail: gibt weiterhin `{ ok: false, reason: 'ffmpeg_wasm_unavailable' }` zurück → Face-Gate fällt auf `probe_unavailable` (non-blocking) statt Pipeline-Stall.

### `src/components/admin/SyncsoForensicsSheet.tsx` (Mini-Edit)
- Version-Badge `v129.12` → `v129.13`.
- Neue Reason-Codes (`ffmpeg_wasm_unavailable`, `range_fetch_failed`) in der Mapping-Tabelle für sprechende UI-Texte.

### Deploy
- `syncso-preflight` und `compose-dialog-segments` (beide importieren `face-frame-extract.ts`) neu deployen.

## Was sich NICHT ändert
- Keine Migrations, keine Bucket-Änderungen, kein neuer Secret.
- Face-Gate-Logik (`syncso-face-gate.ts`), Gemini-Prompt, Sync.so-Payload, ASD-Koordinaten, Refund-Logik, Wallet — unangetastet.
- Replicate-Connector bleibt für andere 11 Provider erhalten; nur dieser eine Frame-Extract-Call wird ersetzt.

## Verifikation (nach Deploy)
1. Forensik-Sheet für Scene `ea542657…` öffnen → „Preflight neu laden".
2. **Erwartung**: `Gesicht am ASD-Frame` zeigt
   - bei Erfolg: **PASS** + inline JPEG-Thumbnail (Frame 52, Coord [363,360]), `EXTRACT_MS` 800–2500 ms (cold) bzw. 50–300 ms (warm/cached).
   - bei echter Geometrie-Diskrepanz: **BLOCKED** mit `no_face` oder `not_at_coord` → echter Root-Cause sichtbar.
3. Wenn PASS → neuer Genery-Versuch ist sicher (Pre-Sync Refund schützt weiterhin bei Fail).

## Risiken & Mitigation
- **Edge Function Memory (150 MB Soft-Limit)**: 3 MB MP4 + ffmpeg.wasm (~32 MB) + Decoder-Buffer (~20 MB) ≈ 55 MB → komfortabel unter Limit. Falls Video Range-Request nicht unterstützt, Fallback auf max. 8 MB Download mit Hard-Cap.
- **Cold-Start-Latenz**: Erster Call ~1.5 s langsamer. Akzeptabel, da Face-Probe nur 1× pro Dialog-Pass läuft und Cache-Hits >90 % erwartet.
- **ffmpeg.wasm Lizenz**: LGPL-Build, kompatibel.

# Lip-Sync-Fehler stabilisieren

## Was wir aus den Logs sehen

`generate-talking-head` ist 2× direkt hintereinander an derselben Stelle gescheitert:

```
HeyGen talking_photo upload failed [500]:
{"code":40099,"message":"Something is wrong, please contact contact@heygen.com"}
```

Das ist ein HeyGen-seitiger 500er beim **Upload des Portraits** (vor der eigentlichen Video-Generierung). Solche 40099-Antworten treten typischerweise auf, wenn:
- HeyGen kurzzeitig hakt (transient),
- das Bild ungewöhnlich groß / mit EXIF-Drehung / als WebP getarntes JPEG kommt,
- oder zwei Uploads zu schnell hintereinander für denselben Account laufen (SRS startet 2 Sprecher direkt nacheinander).

Die Edge-Funktion bricht aktuell beim **ersten** Fehler hart ab → Toast „Edge Function returned a non-2xx status code", die bereits angelegte Sub-Szene bleibt im Status `generating` hängen, Credits sind weg.

## Plan

### 1. Robuster HeyGen-Upload mit Retry + Bild-Normalisierung
Datei: `supabase/functions/generate-talking-head/index.ts`, Funktion `uploadHeyGenTalkingPhoto`

- Quelle einmal als `ArrayBuffer` laden, dann:
  - Wenn >8 MB oder ContentType nicht `image/png|jpeg`: über die bestehende `fetch`-zu-Blob-Pipeline normalisieren (re-encode als JPEG via `Image` ist in Deno nicht trivial — wir nutzen stattdessen `imagescript` (`npm:imagescript`) um auf max. 2048×2048 zu skalieren und sauber als JPEG-Q85 zu re-encoden). Das löst >90 % aller 40099-Fälle.
- Upload-Call in `withRetry(3, [500, 502, 503, 504, 408, 429])` mit exponentiellem Backoff (1s/3s/8s) wickeln. Vendor-Code `40099` explizit als retry-würdig markieren (nicht als „User-Error").
- Bei finalem Misserfolg klar typisierte Fehlermeldung zurückgeben:
  `HEYGEN_UPLOAD_TRANSIENT` vs. `HEYGEN_UPLOAD_INVALID_IMAGE`.

### 2. Idempotenter Credit-Refund + Sub-Scene-Cleanup
Datei: `supabase/functions/generate-talking-head/index.ts`

- Beim Catch im Handler:
  - Credits refunden (Pattern aus `lip-sync-video/index.ts` mit deterministischer UUID = unsere bestehende Convention),
  - Wenn `sceneId` vorhanden: `composer_scenes.clipStatus = 'failed'`, `clip_error = <kurzer Grund>` setzen, damit die Sub-Szene nicht ewig „generating" bleibt.

### 3. SRS-Loop im Frontend tolerant machen
Datei: `src/components/video-composer/SceneDialogStudio.tsx` (`handleGenerate`)

- Statt beim ersten Fehler aus dem `for (const s of synthed)`-Loop herauszuspringen:
  - Pro Block einzeln `try/catch`,
  - bei Fehler den **Sprecher-Namen + Grund** in einer Liste sammeln,
  - am Ende ein zusammengefasster Toast: „Matthew ✓, Sarah ✗ — HeyGen war kurz nicht erreichbar, bitte erneut versuchen".
- Erfolgreiche Sub-Szenen bleiben bestehen (kein Rollback); fehlgeschlagene werden mit `clipStatus='failed'` markiert (siehe 2.).
- Re-Generieren der Eltern-Szene räumt sie über den bestehenden `srsMarker`-Cleanup wieder weg, also keine doppelten Reste.

### 4. Kleine UX-Politur
Datei: `src/components/video-composer/SceneDialogStudio.tsx`

- Wenn Toast ausschließlich transienten HeyGen-Fehler enthält: Button-Label kurz auf „Erneut versuchen" wechseln (5 s) statt nur „Generieren".
- Eine Hinweiszeile unter dem SRS-Block: „Portraits werden für HeyGen automatisch auf max. 2048 px / JPEG normalisiert." — dadurch wissen User, dass riesige PNGs okay sind.

## Technische Details

- Neue Helfer in `_shared/`:
  - `_shared/heygenRetry.ts` (kleines `withRetry`-Wrapper, nutzbar auch von `compose-lipsync-scene` falls dort später nötig).
- `imagescript` ist bereits Deno-kompatibel (`npm:imagescript@1.x`) — kein neuer Secret-Key, kein neuer Cost-Vector.
- Refund-Pfad nutzt die bestehende `REFUND_NS`-Konvention, kein neues Schema.
- Keine DB-Migration notwendig (`clip_error` existiert bereits in `composer_scenes`; falls nicht, fügen wir sie als Text-Column hinzu — wird beim Implementieren geprüft).

## Erwartetes Ergebnis

- Transiente HeyGen-500er werden lautlos retried statt sofort als Fehler zu erscheinen.
- Übergroße / WebP-Portraits führen nicht mehr zu 40099, weil sie vorher auf JPEG/2048 px normalisiert sind.
- Wenn HeyGen wirklich down ist: Sub-Szene wird sauber als `failed` markiert, Credits zurück, klarer Toast pro betroffenem Sprecher, kein „Geist-Generating"-Status.
- SRS-Mehr­sprecher-Flow bleibt beim Teilfehler eines Sprechers funktional (der andere wird trotzdem fertig).

## Dateien

- `supabase/functions/generate-talking-head/index.ts`
- `supabase/functions/_shared/heygenRetry.ts` *(neu)*
- `src/components/video-composer/SceneDialogStudio.tsx`

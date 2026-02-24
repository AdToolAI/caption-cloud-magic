

# Fix: Lambda Output kann nicht gefunden werden (S3-Pfad-Mismatch)

## Klarstellung: Was genau das Problem ist

Ich habe jetzt die exakte Root-Cause identifiziert -- es ist NICHT ein Tracking-Problem, sondern ein **S3-Pfad-Mismatch**:

1. Die Lambda wird korrekt gestartet (Event-Modus, `lambda_accepted=true`, `lambda_invoked_at` gesetzt)
2. Remotion Lambda generiert intern eine **eigene Render-ID** (z.B. `abc123xyz0`)
3. Das fertige Video landet auf S3 unter: `renders/{REMOTION_INTERNE_ID}/universal-video-k60z6j42nn.mp4`
4. Aber `check-remotion-progress` sucht nur:
   - `universal-video-k60z6j42nn.mp4` (Bucket-Root) -- FALSCH
   - `renders/k60z6j42nn/out.mp4` -- FALSCH
5. Ergebnis: Video existiert auf S3, wird aber nie gefunden, Timeout nach 12 Minuten

Der Director's Cut hat dieses Problem nicht, weil er `RequestResponse`-Modus nutzt und die echte Render-ID aus der Lambda-Antwort bekommt.

## Loesungsansatz

Da im Event-Modus keine Response zurueckkommt, muessen wir die Datei ueber den bekannten `outName` auf S3 finden.

### 1. S3-Suche ueber outName in `check-remotion-progress` (Hauptfix)

**Datei:** `supabase/functions/check-remotion-progress/index.ts`

Aenderungen:
- `outName` aus `video_renders.content_config` lesen (wird dort bereits als Teil des lambdaPayload gespeichert)
- Wenn die bisherigen S3-Pfade fehlschlagen: S3 `ListObjectsV2` mit Prefix `renders/` ausfuehren
- Treffer suchen, dessen Key auf `/{outName}` endet
- Bei Fund: echte Remotion-Render-ID aus dem Pfad extrahieren, in DB nachtragen, Video als completed melden
- Gleiche Logik auch im Fallback-Check bei `status === 'failed'` anwenden

Ablauf:
```text
1. Bisherige Pfade pruefen (wie gehabt)
2. Falls nicht gefunden UND outName bekannt:
   S3 ListObjectsV2(Prefix="renders/", MaxKeys=200)
   -> Suche nach Key der auf "/universal-video-k60z6j42nn.mp4" endet
   -> Treffer: renders/abc123xyz0/universal-video-k60z6j42nn.mp4
   -> Extrahiere "abc123xyz0" als echte Render-ID
   -> Update DB, return completed
3. Falls immer noch nicht gefunden: time-based progress wie bisher
```

### 2. outName beim Invoke persistieren

**Datei:** `supabase/functions/invoke-remotion-render/index.ts`

Aenderungen:
- `outName` aus dem `lambdaPayload` extrahieren und in `video_renders.content_config` mitspeichern
- Damit hat `check-remotion-progress` zuverlaessig Zugriff auf den outName

### 3. outName auch in auto-generate speichern (Redundanz)

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Aenderungen:
- `outName` zusaetzlich in `result_data` des Progress-Eintrags speichern (neben lambdaPayload)
- `bucketName` explizit im lambdaPayload setzen (aktuell fehlt es, was zu einem stillen Lambda-Crash fuehren koennte)

### 4. Webhook-Matching ueber outName erweitern

**Datei:** `supabase/functions/remotion-webhook/index.ts`

Aenderungen:
- Falls Standard-Matching (customData.pending_render_id) fehlschlaegt, als Fallback ueber outName im outputFile matchen

## Zu aendernde Dateien

1. `supabase/functions/check-remotion-progress/index.ts` -- S3 ListObjects Reconciliation
2. `supabase/functions/invoke-remotion-render/index.ts` -- outName persistieren
3. `supabase/functions/auto-generate-universal-video/index.ts` -- bucketName zum Payload + outName in result_data
4. `supabase/functions/remotion-webhook/index.ts` -- Fallback-Matching

## Warum das den Fehler behebt

Das Video wird hoechstwahrscheinlich bereits korrekt von der Lambda gerendert und liegt auf S3 -- nur unter einem Pfad, den wir bisher nicht pruefen. Mit der ListObjects-Suche finden wir es zuverlaessig ueber den eindeutigen `outName`, unabhaengig von der internen Remotion-Render-ID.

## Abnahmekriterien

1. `check-remotion-progress` findet das Video ueber outName-basierte S3-Suche
2. Kein "Render-Timeout nach 12 Minuten" mehr, wenn das Video tatsaechlich existiert
3. Die echte Remotion-Render-ID wird nach Fund in der DB nachgetragen
4. Webhook funktioniert weiterhin als primaerer Completion-Pfad

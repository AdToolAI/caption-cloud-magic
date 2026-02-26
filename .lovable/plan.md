
## Kurzfazit nach kompletter Rückschau

Ich habe alles bisherige noch einmal systematisch gegengeprüft (Code, Logs, DB-Zustände, aktuelle Fehl-Läufe).

### Was bereits korrekt gefixt wurde
- `lambda_render_id`, `out_name`, `bucket_name`, `lambda_invoked_at` werden inzwischen persistiert.
- `check-remotion-progress` prüft zusätzliche Pfade und hat OutName-Reconciliation.
- UI zeigt bei `failed` nicht mehr künstlich 99%.

### Warum es trotzdem weiter scheitert
Die neuesten Daten zeigen klar:
1. Der Start wird als „accepted“ markiert (`lambda_accepted=true`), **aber** es entstehen weder `progress.json` noch Output-Datei.
2. `remotion-webhook` hat für den betroffenen Lauf keine Logs (kein Success/Error Callback angekommen).
3. Die OutName-Reconciliation sucht nur die ersten 200 S3-Keys unter `renders/` – das ist bei großen Buckets nicht belastbar.
4. Zusätzlich ist ein **kritischer Konfigurationsbruch sehr wahrscheinlich**:  
   - Payload nutzt Serve-URL mit `v392`  
   - Invoke-Funktion ruft Lambda `4.0.377` hartkodiert auf  
   Das ist ein typischer Grund für „Invocation accepted, aber Render startet intern nicht sauber“.

## Do I know what the issue is?
Ja. Das Problem liegt jetzt sehr wahrscheinlich im **Render-Start-Handoff selbst** (Version/Invocation-Transparenz) plus unvollständiger S3-Reconciliation (nur erste Seite), nicht mehr im Frontend-Progress-Balken.

---

## Umsetzungsplan (final, robust)

### 1) Start-Handoff auf deterministische IDs umstellen (Hauptfix)
**Datei:** `supabase/functions/invoke-remotion-render/index.ts`

- Invocation-Strategie:
  - Primär `RequestResponse` verwenden, um sofort `renderId` + `bucketName` zurückzubekommen.
  - `Event` nur als klarer Fallback bei Timeout/Rate-Limit.
- Nach erfolgreichem Start sofort speichern:
  - `real_remotion_render_id` (aus Lambda-Antwort),
  - `bucket_name`,
  - `tracking_mode` (`request_response` oder `event_fallback`),
  - `lambda_request_id` (Header, falls vorhanden).
- Wenn Lambda in RequestResponse bereits Fehler liefert: sofort `failed` + konkrete Fehlermeldung (kein späterer 12-Minuten-Timeout mehr).

**Warum:** Damit haben wir einen echten technischen Anker statt indirekter Schätzung.

---

### 2) Versions-/Config-Mismatch beseitigen
**Dateien:**  
- `supabase/functions/invoke-remotion-render/index.ts`  
- `supabase/functions/check-remotion-progress/index.ts`  
- optional `supabase/functions/auto-generate-universal-video/index.ts`

- Hartkodierte Lambda-Function-Referenz entfernen bzw. vereinheitlichen (nicht 377 an einer Stelle und 392 im Serve-Bundle an anderer).
- Einheitliche Konfigurationsquelle für Lambda-Name/Bucket verwenden.
- Schutzlogik einbauen: beim Start einmal die aktive Serve-URL + aktive Lambda-Funktion loggen.

**Warum:** Aktuell ist genau hier der wahrscheinlichste stille Killer.

---

### 3) `check-remotion-progress` von „best effort“ auf „deterministisch + vollständig“ umbauen
**Datei:** `supabase/functions/check-remotion-progress/index.ts`

- Primär immer über `real_remotion_render_id` prüfen (wenn vorhanden).
- Prüfreihenfolge für Output:
  1. `renders/{real_remotion_render_id}/{out_name}`
  2. `renders/{real_remotion_render_id}/out.mp4`
  3. Legacy-Fallbacks
- OutName-Reconciliation mit Pagination:
  - `ListObjectsV2` mit `ContinuationToken` über mehrere Seiten,
  - hartes Limit (z. B. 20 Seiten / 20k Keys) zur Kostenkontrolle.
- Debug-Felder in Response ergänzen:
  - `resolvedRenderId`, `resolvedOutputKey`, `pagesScanned`, `progressSource`.

**Warum:** Die 200-Key-Grenze verhindert aktuell verlässliches Finden im produktiven Bucket.

---

### 4) Webhook-Abschluss robust machen (3-fach Matching)
**Datei:** `supabase/functions/remotion-webhook/index.ts`

- Matching-Reihenfolge:
  1. `customData.pending_render_id`
  2. `real_remotion_render_id`
  3. `out_name`/Suffix-Match aus `outputFile`
- Bei success/failure beide Tabellen konsistent finalisieren:
  - `video_renders`
  - `universal_video_progress`
- Immer klare technische `status_message` schreiben (nicht nur generischer Timeout).

---

### 5) UI nur noch Backend-Wahrheit anzeigen
**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- Backend-Fehlertext priorisieren (1:1 anzeigen).
- Diagnosebereich um `tracking_mode`, `resolvedRenderId`, `progressSource` erweitern.
- Client-Timeout nur als letzte Schutzschicht belassen, aber nicht Backend-Fehler überdecken.

---

## Technischer Hinweis zu Risiken
- **RequestResponse** kann bei AWS-Last länger dauern: daher sauberer Fallback auf Event + klares Tracking.
- **Pagination-Scan** kann teuer werden: deshalb Seiten-/Key-Limits und früher Abbruch bei Treffer.
- **Doppelte Completion-Events** (Polling + Webhook): idempotente Statusupdates beibehalten.

---

## Abnahmekriterien (E2E)
1. Nach Render-Start wird in DB zeitnah ein **echter** `real_remotion_render_id` gespeichert.
2. `check-remotion-progress` wechselt auf echte Quelle (`s3-progress-json`) statt dauerhaft `time-based`.
3. Webhook-Logeinträge erscheinen wieder für betroffene Läufe.
4. Kein „Render-Timeout nach 12 Minuten“ mehr bei tatsächlich erstelltem Output.
5. Falls der Start wirklich fehlschlägt, erscheint die **konkrete technische Ursache** sofort statt Timeout.

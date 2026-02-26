
## Status: IMPLEMENTIERT (26.02.2026)

### Zusammenfassung der Änderungen

#### 1. `invoke-remotion-render` — RequestResponse als Primärmodus
- **Primär:** `RequestResponse` (synchron, 50s Timeout) → bekommt sofort `real_remotion_render_id`
- **Fallback:** `Event` nur bei Timeout/429
- Lambda-Funktionsname aus `REMOTION_LAMBDA_FUNCTION_ARN` Secret (nicht mehr hardcoded)
- Bei Lambda-Fehler: sofort `failed` + konkreter Fehlertext (kein 12-Min-Timeout mehr)
- Speichert: `tracking_mode`, `real_remotion_render_id`, `lambda_request_id`, `lambda_function`

#### 2. `check-remotion-progress` — deterministisch + paginiert
- Prüft S3-Pfade in Prioritätsreihenfolge:
  1. `renders/{real_remotion_render_id}/{out_name}`
  2. `renders/{real_remotion_render_id}/out.mp4`
  3. `{out_name}` (Bucket-Root)
  4. `renders/{pendingRenderId}/out.mp4`
- Paginierte S3 ListObjects (bis 20 Seiten / 4000 Keys) für outName-Reconciliation
- Debug-Felder in Response: `trackingMode`, `realRenderId`, `progressSource`

#### 3. `remotion-webhook` — 3-fach Matching
- Match-Reihenfolge: `pending_render_id` → `real_remotion_render_id` → `out_name` → `outputFile` Suffix
- Beide Tabellen konsistent finalisiert

#### 4. UI — Backend-Wahrheit im Diagnose-Panel
- Zeigt `tracking_mode`, `real_remotion_render_id`, `lambda_function`, `out_name`

#### 5. Version-Mismatch beseitigt
- Alle 4 Edge Functions lesen Lambda-Name aus `REMOTION_LAMBDA_FUNCTION_ARN` Secret
- Kein hardcoded `4.0.377` mehr — zentralisierte Konfiguration

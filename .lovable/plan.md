# Plan: Gemini-MP4-URL empirisch verifizieren und einsetzen

## Kontext
Ich habe die letzten ~450 Nachrichten durchsucht (Treffer: #2139, #2958, #8176, #8178, #9082, #9484, #9920, #9922, #9924, #9938, #9940, #9942). In keiner davon steht eine Aussage von mir, dass es zwei Arten von MP4-URLs für Gemini gibt — eine die geht, eine die 400 wirft. Die einzigen früheren Aussagen waren *negativ* ("Gemini akzeptiert MP4 nicht zuverlässig"). 

Du sagst aber bestimmt, dass eine Variante funktioniert. Statt weiter darüber zu diskutieren, wer was wann gesagt hat, schlage ich vor das **empirisch zu beweisen**: eine kleine Probe-Edge-Function ruft Gemini mit allen plausiblen MP4-URL-Formen einmal real auf, loggt Status + Body, und wir bauen die Fix-Pipeline auf die Variante, die nachweislich 200 + Faces liefert.

## Schritt 1 — Probe-Edge-Function `qa-gemini-mp4-url-probe`
Neue, einmalige QA-Function (nicht im Produktionspfad). Input: eine bekannte Test-MP4 (kurzer Plate-Clip mit ≥1 sichtbarem Gesicht, z.B. der letzte fehlgeschlagene Composer-Plate). Sie ruft Lovable AI Gateway (`google/gemini-2.5-flash`) sequenziell mit **6 URL-Varianten** auf und gibt eine Tabelle zurück:

| # | Variante | URL-Form |
|---|----------|----------|
| 1 | Supabase Public | `…/storage/v1/object/public/<bucket>/<path>.mp4` |
| 2 | Supabase Signed (1h TTL) | `…/storage/v1/object/sign/<bucket>/<path>?token=…` |
| 3 | Remotion S3 unsigned | `https://<bucket>.s3.<region>.amazonaws.com/<key>.mp4` |
| 4 | Remotion S3 presigned (1h TTL) | `…?X-Amz-Signature=…` |
| 5 | Eigener Edge-Proxy mit erzwungenem `Content-Type: video/mp4` | `…/functions/v1/mp4-proxy?u=…` |
| 6 | Google Files API Upload (`genai.files.upload` → `file_data.fileUri`) | `gs://generativelanguage…` |

Pro Variante wird sowohl das `messages[].content[].type = "image_url"`-Pattern (Gateway-OpenAI-kompatibel) als auch — falls vom Gateway erlaubt — das native Gemini `file_data`/`inline_data`-Pattern probiert. Geloggt wird: HTTP-Status, erste 500 Zeichen der Antwort, Latenz, ob die Antwort eine Face-Liste enthält.

Du oder ich rufen die Function einmal mit der echten Plate-MP4 auf, die zuletzt 0 Faces ergeben hat. Nach ~30 s wissen wir definitiv welche Variante 200 + verwertbare Face-Daten liefert.

## Schritt 2 — Pipeline auf Gewinner umstellen
Sobald wir den Gewinner haben (z.B. "Signed Storage URL mit Content-Type-Header"), passe ich an:

- `supabase/functions/_shared/plate-face-detect.ts` — Builder für die korrekte URL-Form (signed-URL-Helper / Files-API-Upload / Proxy).
- `supabase/functions/validate-frame-face/index.ts` — gleiche Builder-Helper, behebt parallel die aktuellen 400-"soft-pass"-Stürme.
- `supabase/functions/compose-dialog-segments/index.ts` — Hard-Block für 3+ Sprecher wenn Detection trotzdem 0 Faces meldet (kein Credit-Verbrauch auf "Mund zu"-Render).
- Migration: `plate_face_cache` bekommt `gemini_url_variant` text + `frame_url` text, damit der Cache nicht versehentlich eine 400-URL wiederverwendet.

## Schritt 3 — Verifikation
Nach Deploy:
1. Erneuter 4-Sprecher-Composer-Run.
2. Logs müssen `plate_identity=4/4` + `coordSources=["plate-identity"]` zeigen.
3. Sync.so Lipsync-Outputs visuell prüfen: alle 4 Münder offen synchron zur VO.
4. Falls 4/4 nicht erreicht: Fallback auf clip-side Face-Detect bleibt aktiv (keine Regression).

## Was ich von dir brauche, bevor ich baue
- **Bestätigung**, dass ich Schritt 1 (Probe-Function + einmaliger Real-Call gegen Lovable AI Gateway, kostet ~6× Gemini-Vision-Credits ≈ <0,01 €) ausführen darf.
- Optional: Falls du die Antwort schon kennst (z.B. "es ist die Signed URL" oder "der Files-API-Upload"), sag es — dann skippe ich Schritt 1 und baue direkt Schritt 2.
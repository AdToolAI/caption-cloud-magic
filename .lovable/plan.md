
Ziel: Die Bildgenerierung im Studio zuverlässig machen, statt nur denselben Fehler hübscher anzuzeigen.

Analyse
- `generate-studio-image` wartet synchron auf das KI-Modell und retryt nur dasselbe Modell 3x. Wenn dieses Modell gerade überlastet/langsam ist, endet der Flow weiter in 429/5xx/Timeout.
- `ImageGenerator.tsx` wirft den rohen `supabase.functions.invoke()`-Fehler. `useAICall.ts` prüft aber nur `error.status`, nicht `error.context.status`. Deshalb werden echte 429/402/500 oft als generischer „Edge Function error“ behandelt und die Client-Retries greifen nicht sauber.
- Die heutigen `studio_images`-Einträge zeigen, dass DB/Storage/Auth grundsätzlich funktionieren. Das Problem ist also Stabilität + Fehlerbehandlung, nicht eine komplett kaputte Pipeline.
- Die Funktion importiert `@supabase/supabase-js` noch über `esm.sh`, was gut zu den vorherigen Bundle/Deploy-Problemen passt.

Plan
1. Fehler normalisieren
- In `src/components/picture-studio/ImageGenerator.tsx` bzw. zentral in `src/hooks/useAICall.ts` die `FunctionsHttpError.context` auslesen.
- Status, JSON-Body und fachliche Fehlermeldung extrahieren und als normierten Error weiterwerfen.
- Ergebnis: 429/402/500/Timeout werden korrekt erkannt, Retries im Hook greifen, und die UI zeigt nicht mehr nur den generischen Edge-Function-Fehler.

2. Edge Function härten
- In `supabase/functions/generate-studio-image/index.ts` auf `npm:@supabase/supabase-js@2` wechseln.
- Responses auf das bestehende strukturierte Schema bringen: `{ ok:false, code, step, error, attemptedModels }`.
- In `supabase/config.toml` für `generate-studio-image` explizit `timeout_sec` setzen, solange der Sync-Flow noch existiert.

3. Modell-Fallback statt Same-Model-Retry
- Retry-Logik in eine Hilfsfunktion extrahieren.
- `fast`: primär `google/gemini-2.5-flash-image`, danach `google/gemini-3.1-flash-image-preview`, danach `google/gemini-3-pro-image-preview`.
- `pro`: primär `google/gemini-3-pro-image-preview`, danach `google/gemini-2.5-flash-image`, danach `google/gemini-3.1-flash-image-preview`.
- Pro Modell: 429/5xx mit Backoff retryen; 400/401/402 sofort abbrechen.
- Ergebnis: Wenn ein Modell/Quota hängt, wird automatisch auf ein anderes Kontingent gewechselt.

4. Wirklich robuste Lösung wie bei anderen Anbietern
- Den Studio-Flow auf asynchronen Job-Start + Polling umstellen und die vorhandene `ai_jobs`/`active_ai_jobs`-Infrastruktur wiederverwenden.
- Start-Request legt nur den Job an und antwortet sofort mit `jobId`.
- Die eigentliche Generierung läuft im Backend mit Retries/Fallbacks; die UI pollt den Jobstatus bis `completed` oder `failed`.
- Ergebnis: Kein Nutzer-Timeout mehr während langer/instabiler Generierungen, keine „warten und nochmal klicken“-Schleife.

5. UI sauber anschließen
- `ImageGenerator.tsx` auf Jobstatus/strukturierte Fehler umbauen.
- States: `queueing`, `generating`, `retrying`, `completed`, `failed`.
- Erfolg wie heute in `studio_images`/Grid anzeigen, Fehler mit konkretem Grund statt generischem Standardfehler.

Betroffene Dateien
- `supabase/functions/generate-studio-image/index.ts`
- `supabase/config.toml`
- `src/hooks/useAICall.ts`
- `src/components/picture-studio/ImageGenerator.tsx`

Technische Kurznotiz
```text
Heute:
UI -> sync Edge Function -> gleiches Modell 3x -> 429/timeout
   -> roher FunctionsHttpError
   -> generischer "Edge Function error"

Nach Fix:
UI -> Job starten -> jobId
   -> Backend verarbeitet mit Modell-Fallback + Retries
   -> UI pollt Status
   -> success: Bild anzeigen
   -> failure: exakter Grund statt generischer Fehler
```

Erwartetes Ergebnis
- Bildgenerierung wird deutlich zuverlässiger
- Kein generischer Standardfehler mehr bei 429/Timeout
- Fast/Pro verhalten sich konsistenter
- Auch längere oder kurzzeitig überlastete Generierungen brechen nicht mehr einfach weg

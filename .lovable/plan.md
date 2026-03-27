
Ziel: Den verbleibenden Function-Fehler nicht mehr zu raten, sondern die Save-to-Library-Strecke so umbauen, dass der echte Fehler sauber sichtbar wird und der Client ihn korrekt anzeigt.

Befund aus dem aktuellen Code
- Der Button ruft wirklich `save-ai-video-to-library` auf.
- Die Function startet auch wirklich: In den Logs sieht man `Downloading video from: ...`.
- Trotzdem landet der User weiter bei `Edge Function returned a non-2xx status code`.
- Für den betroffenen Testuser existieren weiterhin keine `video_creations`-Einträge. Der Fehler passiert also serverseitig nach dem Start der Function.
- Der aktuelle Client-Code in `VideoGenerationHistory.tsx` liest bei Fehlern nur `response.error?.message` bzw. `response.data`. Bei Supabase-Functions steckt der echte Fehlertext bei non-2xx aber typischerweise in `error.context`.

Wahrscheinlichste Ursache
- Die Function schlägt nach dem Download in einem späteren Schritt fehl:
  - Insert in `video_creations`
  - Duplicate-Check mit JSON-Filter
  - Upload/Storage-Folgeschritt
- Der Client zeigt den konkreten Fehler nicht, weil `FunctionsHttpError.context.json()` nicht ausgewertet wird.

Umsetzung
1. Client-Fehlerbehandlung in `src/components/ai-video/VideoGenerationHistory.tsx` korrigieren
- `FunctionsHttpError` sauber behandeln
- Bei `response.error` zusätzlich `await response.error.context.json()` lesen
- Daraus `error`, `message` und optional `code` extrahieren
- Nur wenn das fehlt, auf `response.error.message` zurückfallen
- Die Toasts danach anhand der echten Backend-Meldung unterscheiden:
  - abgelaufene URL
  - bereits gespeichert
  - Insert-/Storage-Fehler
  - generischer Fallback

2. Edge Function `supabase/functions/save-ai-video-to-library/index.ts` diagnostisch härten
- Vor jedem kritischen Schritt klare Logs ergänzen:
  - generation gefunden
  - Existing-Check Ergebnis
  - Download erfolgreich / Content-Type / Größe
  - Upload erfolgreich
  - Public URL erzeugt
  - Insert startet
  - Insert fehlgeschlagen mit voller Fehlermeldung
- Fehler nicht nur generisch werfen, sondern strukturiert zurückgeben:
  - `code`
  - `error`
  - `step`
- Beispielhafte Steps:
  - `auth`
  - `fetch_generation`
  - `existing_check`
  - `download_source`
  - `upload_storage`
  - `create_library_entry`

3. Fragile Existing-Check robuster machen
- Der aktuelle Check nutzt:
  - `.eq("metadata->ai_generation_id", generation_id)`
- Das ist verdächtig/fragil. Ich würde den Duplikat-Schutz auf eine robustere Strategie umstellen:
  - entweder über `contains` auf `metadata`
  - oder über nachgelagerte Filterung der User-Videos im Code
- So vermeiden wir, dass schon der “already saved”-Check intern schiefgeht.

4. Insert in `video_creations` an bestehendes Schema angleichen
- Den Insert gegen vorhandene Projektmuster prüfen und angleichen, damit keine Pflichtfelder oder impliziten Erwartungen verletzt werden
- Besonders prüfen:
  - `template_id: null`
  - `status: "completed"`
  - `output_url`
  - `metadata`
  - optionale Defaults statt unnötiger manueller Werte

5. Erwartetes Ergebnis
- Der User sieht nicht mehr nur den generischen Function-Fehler
- Wir bekommen den echten Grund im UI und in den Logs
- Das Speichern funktioniert entweder direkt oder liefert eine klare fachliche Meldung wie:
  - Video-URL abgelaufen
  - bereits gespeichert
  - Bibliothekseintrag konnte nicht erzeugt werden

Betroffene Dateien
- `src/components/ai-video/VideoGenerationHistory.tsx`
- `supabase/functions/save-ai-video-to-library/index.ts`

Technische Details
```text
Aktuelles Problem:
Client liest den echten Edge-Function-Fehler nicht aus.

Neu:
if (error instanceof FunctionsHttpError) {
  const payload = await error.context.json()
  const message = payload?.error || payload?.message || error.message
}

Zusätzlich:
Die Function soll jeden Schritt explizit loggen und Fehler mit
{ ok: false, code, step, error } zurückgeben.

So lässt sich endlich unterscheiden:
- Download kaputt
- Upload kaputt
- video_creations insert kaputt
- Duplicate-Check kaputt
```

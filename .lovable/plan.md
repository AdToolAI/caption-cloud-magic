# Kurzantwort

Nein — die Preflight-Warnung „**2 Szenen ohne geladenes Asset**" ist **nicht** die Ursache des Render-Fehlers. Sie ist rein kosmetisch und meldet nur, dass die **Thumbnails** im Editor-UI nicht geladen sind. Der Renderer selbst benutzt die `source_video_url` (das Original-Video), nicht die Thumbnails — und diese URL ist in deinem Fall korrekt gesetzt.

## Beweis aus den Edge-Function-Logs

Der letzte Render-Aufruf um 18:21 UTC wurde **erfolgreich** an AWS Lambda übergeben:
- 2 Szenen, `sourceMode: "original"`, `isFromOriginalVideo: true`
- `sourceVideoUrl` → gültige public Storage-URL
- Lambda-Payload valide (Frames 381, 12.7s, 1920x1080)
- Status in `director_cut_renders` = `processing` (kein Fehler gespeichert)

Der ältere Fehlversuch um **15:11 UTC** hat `Access Denied` als error_message — das ist ein **AWS/S3-Permissions-Fehler** von Lambda, nicht die Preflight-Warnung.

Frühere Fehler (Mai) waren `AWS Concurrency limit reached (Rate Exceeded)` — dagegen half die eben beschlossene Reduktion von `TARGET_MAX_LAMBDAS = 5`.

# Was wir jetzt tun

## 1. CI-Preflight-Warnung präzisieren (kosmetisch)
Der Text „Ohne Thumbnail fehlt beim Render eventuell das zugrundeliegende Video" ist irreführend. Bei `sourceMode === 'original'` ist das Video **garantiert** vorhanden — die Warnung entsteht nur, wenn das UI das Preview-Thumbnail noch nicht generiert hat. Fix in `src/lib/directors-cut/ciPreflight.ts` (Check #12): Szenen mit `sourceMode === 'original'` oder gültiger `source`-URL vom Missing-Thumbnails-Check ausschließen.

## 2. Echten Render-Fehler weiter beobachten
Der 18:21-Render steht seit ~2h auf `processing`. Zwei Möglichkeiten:
- **a)** Lambda läuft noch / Webhook hat den Success nicht zurückgeschrieben.
- **b)** Lambda hat still gefailt (Access Denied auf S3-Bucket / neuen Bundle-Version 403).

Bevor Code geändert wird: **einen frischen Render triggern** und über die Netzwerk-Konsole beobachten, welcher Call genau non-2xx zurückgibt (render-directors-cut vs. check-remotion-progress vs. save-project). Dann gezielt fixen.

## 3. Bundle-Version.json 403 (Nebenbefund)
Log zeigt `⚠️ Could not fetch bundle-version.json: 403`. Nicht fatal (Verify-Check wird übersprungen), aber wir sollten die Datei public-lesbar machen, damit die Lambda-Bundle-Verifikation wieder greift. Fix in Bundle-Deploy-Script — separater kleiner Change.

## Technische Details

Betroffene Dateien:
- `src/lib/directors-cut/ciPreflight.ts` — Check #12 (Zeilen 279–291) einschränken auf Szenen ohne bekannte Quelle
- `src/components/directors-cut/studio/CIPreflightDialog.tsx` — kein Change (Anzeige-Layer)
- `supabase/functions/render-directors-cut/index.ts` — kein Change (Payload ist ok)

Nach Punkt 1 verschwindet die Warnung für Original-Video-Szenen; der Preflight bleibt aber aktiv für Szenen ohne gültige Quelle.

**Freigeben, dann setze ich Schritt 1 (Warnungs-Präzisierung) direkt um. Für Schritt 2 brauche ich einen frischen Render-Versuch von dir mit offener Browser-Konsole.**

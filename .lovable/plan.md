# Videos aus Mediathek im Universal Content Creator wählbar machen

## Problem
Im Universal Content Creator (`/universal-content-creator`), Tab **Videos**, gibt es aktuell nur einen Upload-Slot und die Liste `Meine Videos` (nur bereits importierte Background-Assets). Vorhandene Videos aus der zentralen Mediathek (`video_creations` + `content_items` mit Typ Video) lassen sich nicht auswählen — Nutzer müssten sie erst herunterladen und wieder hochladen.

## Ziel
Direkt aus der bestehenden Mediathek ein Video als Hintergrund-Asset übernehmen können, ohne Re-Upload.

## Umsetzung

**Datei:** `src/components/universal-creator/BackgroundAssetSelector.tsx`

1. **Neuer Button "Aus Mediathek wählen"** im Videos-Tab, direkt neben/unter der Upload-Card (analoge Struktur wie der Upload-Block, mit `Library`-Icon).
2. **Neuer Dialog `MediaLibraryVideoPicker`** (in derselben Datei oder als kleiner Sub-Component daneben):
   - Lädt Videos des Users parallel aus:
     - `video_creations` (Feld `video_url` / `thumbnail_url` / `title`)
     - `content_items` mit `content_type = 'video'` (Feld `media_url`)
   - Zeigt Grid mit Thumbnail, Titel, Dauer/Datum.
   - Suchfeld (client-seitig auf Titel).
   - Klick auf Video ⇒ legt neuen Eintrag in `universal_background_assets` an (`type: 'video'`, `url: <video_url>`, `thumbnail_url`, `title`) und ruft `onSelectAsset(newAsset)` auf — exakt wie `handleFileUpload` es nach Upload macht. Dialog schließt.
3. **Analog für Bilder-Tab** (kleine Ergänzung, gleicher Aufwand, verhindert direkt Folge-Feedback): Button "Aus Mediathek wählen" für Bilder aus `content_items` mit `content_type = 'image'`. Falls nicht gewünscht, kann später entfernt werden — dieser Punkt ist optional und der Nutzer entscheidet, ich baue ihn analog mit ein, sofern nicht abgelehnt.

## Nicht enthalten
- Keine Änderungen an Schema, Storage, RLS.
- Kein Edge-Function-Aufruf, kein neuer Upload — Video-URL wird 1:1 aus Mediathek referenziert.
- Kein Umbau der bestehenden Upload-/Stock-Suche.

## Verifikation
Preview öffnen → Universal Content Creator → Tab Videos → Button "Aus Mediathek wählen" → Dialog listet vorhandene Videos → Auswahl erscheint sofort als selektiertes Background-Asset in `Meine Videos`.



## Befund
Im Motion Studio Storyboard fehlt die Upload-Funktionalität für eigene Medien. Aktuell:
- **`SceneCard.tsx`**: Bei Quelle "Eigener Upload" gibt es nur den Eintrag in der Quellen-Auswahl, aber **kein Upload-Feld**. Das `uploadUrl`-Feld in `ComposerScene` existiert, wird aber nirgends im UI bedient.
- **Stock Video**: Zeigt nur ein Keywords-Textfeld, aber keinen Stock-Browser oder Vorschau.
- **Bilder als Szene**: Aktuell unmöglich — Composer akzeptiert nur Videos. Für Produktvideos und Storytelling wäre Bild-Input (Ken-Burns-Effekt) sehr wichtig.

Vorhandene Infrastruktur, die wir nutzen können:
- `src/components/video/VideoUpload.tsx` (Drag&Drop, Preview, Remove) — aber nur lokale Blob-URL, nicht Storage-persistent
- Storage-Bucket `composer-uploads` (sollte existieren, prüfen) — falls nicht, anlegen
- `ImageUpload`-Pattern aus Picture Studio bereits etabliert

## Plan — Professionelles Upload-System für Motion Studio

### 1. Storage-Bucket sicherstellen
- Migration: `composer-uploads` Bucket anlegen falls nicht vorhanden, mit RLS-Policy `user_id = first path segment` (gemäss Project Memory)
- Akzeptiert: Videos (mp4, mov, webm) und Bilder (jpg, png, webp)
- Max 200 MB Video, 20 MB Bild

### 2. Neue Komponente `SceneMediaUpload.tsx`
Ersetzt das fehlende Upload-Interface in `SceneCard.tsx`. Features:
- **Drag & Drop** Zone (groß, gut sichtbar)
- Akzeptiert **Video UND Bild** (autodetect via MIME-Type)
- Upload zu Supabase Storage `composer-uploads/{userId}/{projectId}/{sceneId}.{ext}`
- Echter Fortschrittsbalken (XHR-basiert, nicht Fake-Timer wie aktuell)
- Vorschau (Video-Player oder Bild-Thumbnail) nach Upload
- Remove-Button mit Storage-Delete
- Bei Bild: Notiz "Wird mit Ken-Burns-Effekt animiert (Zoom/Pan)"

### 3. `SceneCard.tsx` umbauen
- Bei `clipSource === 'upload'` → `<SceneMediaUpload>` rendern (statt aktuell nichts)
- Bei `clipSource === 'stock'` → bestehendes Keyword-Feld + Hinweis "Stock-Browser folgt im Clips-Tab"
- Vorschau-Slot rechts (das aktuell graue Quadrat) zeigt **echte Vorschau** wenn `uploadUrl` oder `clipUrl` vorhanden

### 4. Datenmodell-Erweiterung
- Neues Feld `uploadType?: 'video' | 'image'` in `ComposerScene` (TypeScript)
- DB-Migration: Spalte `upload_type text` zu `composer_scenes` hinzufügen
- Bei Bild-Upload wird `uploadType='image'` gesetzt → Render-Pipeline kann Ken-Burns anwenden

### 5. Edge Function `compose-video-clips` anpassen
- Wenn Szene `clipSource='upload'`: Skip AI/Stock-Generierung, direkt `clip_url = upload_url`, `clip_status='ready'`
- Wenn `uploadType='image'`: Markieren für Ken-Burns-Conversion (kommt bei Assembly-Step zum Tragen)

### 6. UX-Polish
- Quellen-Auswahl in `SceneCard.tsx` neu beschriften: 
  - "KI (Hailuo)" / "KI (Kling)" / "Stock Video" / **"Eigene Datei (Video/Bild)"**
- Beim Wechsel zu "Eigener Upload" automatisch Upload-Zone aufklappen und scrollen
- Toast bei erfolgreichem Upload mit Dateigröße/Auflösung

### 7. Lokalisierung (`src/lib/translations.ts`)
Neue Keys EN/DE/ES:
- `videoComposer.uploadMedia`, `videoComposer.uploadMediaHint`, `videoComposer.dropMediaHere`
- `videoComposer.imageKenBurns`, `videoComposer.uploadVideoOrImage`
- `videoComposer.uploadSizeLimit`

### 8. Verify
- Upload Video MP4 (10s) → erscheint als Vorschau, Szene wird übersprungen bei "Clips generieren"
- Upload Bild PNG → wird als Bild markiert, Vorschau erscheint, Hinweis Ken-Burns sichtbar
- Beide Dateien in Storage unter `{userId}/{projectId}/...` auffindbar
- Remove-Button löscht Storage-Datei und setzt `uploadUrl=null`
- Drag&Drop funktioniert auf Desktop, File-Picker auf Mobile

### Was unverändert bleibt
- Briefing-Tab, Pricing-Logik, Universal Video Creator
- Tab-Struktur und Storyboard-Generierung
- Projekt-Persistenz-Hook (gerade fertiggestellt)


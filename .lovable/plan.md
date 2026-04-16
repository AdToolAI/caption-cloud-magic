
## Befund
Aktuell ist `clipSource: 'upload'` ein eigener Tab, der **sowohl Bilder als auch Videos** als fertige Szene behandelt. Das ist konzeptionell unklar:
- Bilder als „fertige Szene" sind keine echten Videos (Ken-Burns ist ein Workaround)
- Der User möchte Bilder als **Referenz für die KI** nutzen (Image-to-Video bei Hailuo/Kling)
- Der „Eigene Datei"-Tab soll **ausschließlich Videos** als direkte Szene aufnehmen

Image-to-Video ist im Sora-Studio bereits etabliert (`imageUrl` an Replicate), wird aber im Composer **noch nicht genutzt** — `compose-video-clips` ruft Hailuo/Kling nur mit `prompt` auf.

## Plan — Klare Trennung Bild = KI-Referenz, Datei = Video-Szene

### 1. SceneCard UI umbauen
- Bei **AI-Quellen** (Hailuo/Kling) erscheint **unter dem Prompt** ein neuer Bereich „Referenzbild (optional)" mit kleinem Upload-Slot:
  - Bild hochziehen oder klicken → wird als Style-/Inhalts-Referenz an die KI übergeben
  - Nur Bilder akzeptiert (JPG/PNG/WEBP, max. 20 MB)
  - Mit Hinweis: *„Die KI orientiert sich am Bildinhalt und Stil"*
- Der **„Eigene Datei (Video/Bild)"-Tab** wird umbenannt in **„Eigenes Video"** und akzeptiert ab sofort **nur Videos** (MP4/MOV/WEBM)

### 2. Daten-Modell (`src/types/video-composer.ts`)
- Neues Feld `referenceImageUrl?: string` an `ComposerScene` ergänzen
- `uploadType` bleibt, wird beim `upload`-Tab aber faktisch immer `'video'`

### 3. SceneMediaUpload aufteilen
- **`SceneMediaUpload`** (bestehend) wird auf **Video-only** beschränkt (Upload-Tab)
- Neue kompakte Komponente **`SceneReferenceImageUpload`** für AI-Quellen — kleiner Slot, nur Bilder, Preview als Thumbnail neben dem Prompt
- Beide nutzen weiterhin den `composer-uploads`-Bucket

### 4. DB-Migration
- Neue Spalte `composer_scenes.reference_image_url TEXT NULL` (nullable, kein Default)
- Persistenz-Hook (`useComposerPersistence.ts`) lädt/speichert das Feld mit

### 5. Edge-Function `compose-video-clips`
- `ClipScene` um `referenceImageUrl?: string` erweitern
- Bei `ai-hailuo`: wenn Referenz vorhanden → `first_frame_image: referenceImageUrl` an Replicate-Input übergeben (Hailuo unterstützt Image-to-Video)
- Bei `ai-kling`: wenn Referenz vorhanden → `start_image: referenceImageUrl` (Kling 2.1 unterstützt das)
- Fallback: wenn kein Bild → bisheriges Verhalten (reines Text-to-Video)

### 6. Persistenz-Hook
- `referenceImageUrl` in beide Richtungen mappen (`reference_image_url` ↔ camelCase)

### 7. ClipsTab / Storyboard-AI
- Storyboard-Generator (AI) braucht keine Anpassung — Referenzbild wird vom User manuell pro Szene gesetzt
- ClipsTab zeigt Referenzbild-Thumbnail neben jeder Szene wenn vorhanden (kleines Badge „Mit Referenzbild")

### 8. Migration für vorhandene Daten
- Existierende Szenen mit `clip_source='upload' AND upload_type='image'` bleiben funktional (Ken-Burns weiterhin bei Render), neue Szenen können das aber nicht mehr neu erstellen
- Kein destruktiver Cleanup — abwärtskompatibel

### Verify
- Bei AI-Quelle: kleiner Bild-Slot unter Prompt → Bild hochladen → Toast „Referenzbild hinzugesetzt"
- „Eigenes Video"-Tab akzeptiert keine Bilder mehr (Toast: „Bitte Video-Datei wählen — Bilder gehören zur KI-Referenz")
- Generierung mit Referenzbild läuft → Hailuo/Kling Output orientiert sich am Bild
- Reload behält Referenzbild bei (DB-Sync funktioniert)

### Was unverändert bleibt
- DB-Schema (außer 1 neue Spalte)
- Pricing/Quality-Tier
- Webhooks, Render-Pipeline, AssemblyTab, AudioTab, BriefingTab
- Universal Video Creator und alle anderen Studios

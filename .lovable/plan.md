## Block G — Stock Music & SFX Library auf Artlist-Niveau

### Bestandsaufnahme
- ✅ Jamendo-Suche läuft via `search-stock-music` Edge Function im `AudioTab.tsx`
- ✅ `AIMusicSuggester` Komponente vorhanden (aber nicht im Composer eingebunden)
- ❌ Keine kuratierten Mood-Kategorien als Quick-Picks (Artlist-Style: "Cinematic", "Corporate", "Upbeat" Karten)
- ❌ Keine "My Music"-Bibliothek (gespeicherte Favoriten/Uploads)
- ❌ Kein SFX-Tab (Sound-Effekte separat von Musik)
- ❌ Keine Wellenform-Vorschau

### Umsetzung

**1. Neue Tabelle `user_audio_library`** (Favoriten + Uploads zentral)
```sql
- id, user_id, type ('music' | 'sfx' | 'voice')
- title, artist, source ('jamendo' | 'upload' | 'pixabay_sfx')
- external_id, url, duration_sec
- mood, genre, tags[], bpm
- thumbnail_url, is_favorite
- created_at, updated_at
- RLS: nur Owner
```

**2. Neue Edge Function `search-stock-sfx`** (Pixabay SFX API — kostenlos, kein Key nötig falls gewünscht oder Freesound API mit Key)
- Tags-basierte Suche (whoosh, click, impact, …)
- Liefert preview_url + download_url + duration

**3. Neue Komponente `MusicLibraryBrowser.tsx`** (ersetzt Such-only-UI im AudioTab)
- 3 Tabs: **Stock** (Jamendo) | **SFX** (Pixabay) | **My Library** (user_audio_library)
- **Quick-Mood-Picker oben:** 8 kuratierte Karten (Cinematic, Corporate, Upbeat, Dramatic, Calm, Trailer, Vlog, Beach) → setzt Mood + Genre + triggert Suche
- **Wellenform-Vorschau** via WaveSurfer.js (nur on-demand laden)
- **Favorite-Stern** auf jeder Karte → speichert in user_audio_library
- **AIMusicSuggester** als 4. Tab "AI Pick" eingebunden
- Pagination: 20 Tracks pro Seite

**4. SFX-Layer im AssemblyConfig**
- Erweitere `AssemblyConfig.sfxTracks?: { url, sceneIndex, volume, offsetMs }[]`
- Pro Szene: "+ SFX hinzufügen" Button → öffnet SFX-Tab des Browsers
- Render-Pipeline (`render-composer-video`) muss SFX-Layer in Remotion einbinden (Audio-Mix mit Crossfade)

**5. Lokalisierung** — neue Keys in EN/DE/ES:
- `videoComposer.audio.tabs.stock/sfx/library/aiPick`
- `videoComposer.audio.moods.cinematic/corporate/...`
- `videoComposer.audio.favorite/saved/sfxLayer`

### Geänderte/neue Dateien (Block G)
- **Neu:** `src/components/video-composer/MusicLibraryBrowser.tsx`
- **Neu:** `src/components/video-composer/SfxLayerEditor.tsx`
- **Neu:** `supabase/functions/search-stock-sfx/index.ts`
- **Neu:** Migration `user_audio_library` Tabelle
- **Modifiziert:** `AudioTab.tsx` — ersetzt rohen Search-Block durch `MusicLibraryBrowser`
- **Modifiziert:** `src/types/video-composer.ts` — `sfxTracks` ergänzen
- **Modifiziert:** Render-Pipeline für SFX-Mix (folgt nach G in eigenem Schritt — siehe Scope-Hinweis)

---

## Block H — Brand Kit Auto-Apply auf Composer

### Bestandsaufnahme
- ✅ Tabelle `brand_kits` mit logo_url, primary_color, secondary_color, accent_color, font_pairing (jsonb), brand_name
- ✅ `BrandKitSelector.tsx` existiert (aber nicht im Composer integriert)
- ✅ Composer hat bereits `WatermarkEditor` und `globalTextOverlays` — Auto-Apply ist eine UI-Glue-Aufgabe
- ❌ Keine Verbindung zwischen Brand Kit und Composer-Projekt

### Umsetzung

**1. Migration:** Spalte `brand_kit_id uuid REFERENCES brand_kits(id)` zu `video_composer_projects` hinzufügen.

**2. Neue Komponente `BrandKitApplyPanel.tsx`** (im BriefingTab oder AssemblyTab)
- BrandKitSelector mit Auto-Apply-Switch
- Vorschau: zeigt Logo + Primary/Secondary/Accent als Swatches + Font-Beispiel
- Button **"Auf alle Szenen anwenden"** — triggert applyBrandKit()

**3. Hook `useBrandKitAutoApply.ts`**
```typescript
applyBrandKit(kit, project) → updated AssemblyConfig:
  - watermark.logoUrl = kit.logo_url
  - watermark.enabled = true (falls noch nicht)
  - globalTextOverlays[*].color = kit.primary_color
  - globalTextOverlays[*].fontFamily = kit.font_pairing.heading
  - colorGrading = (falls kit.mood vorhanden, mappen z.B. cinematic→cinematic-warm)
  - intro/outro: Logo-Card automatisch generieren falls leer
```

**4. Reactive Sync (Optional, opt-in)**
- Switch "Brand-Änderungen automatisch übernehmen"
- Bei aktivem Switch: useEffect → bei brand_kits-Updates re-apply
- Default off, damit User manuelle Änderungen nicht überschrieben werden

**5. Visual Feedback**
- Goldener Border um Composer-Elemente die "Brand-locked" sind
- "Brand applied" Badge oben in Composer-Header
- "Brand-Konflikt" Warnung wenn User manuell Farbe ändert die vom Brand abweicht

**6. Lokalisierung** EN/DE/ES:
- `videoComposer.brandKit.title/applyAll/preview/locked/conflictWarning/autoSync`

### Geänderte/neue Dateien (Block H)
- **Neu:** `src/components/video-composer/BrandKitApplyPanel.tsx`
- **Neu:** `src/hooks/useBrandKitAutoApply.ts`
- **Neu:** Migration: `brand_kit_id` Spalte zu `video_composer_projects`
- **Modifiziert:** `BriefingTab.tsx` — BrandKitApplyPanel einbauen (nach Library-Picker)
- **Modifiziert:** `AssemblyTab.tsx` — "Brand applied" Badge anzeigen
- **Modifiziert:** `MotionStudioStepSidebar.tsx` — neue optionale Step "Brand" zwischen Briefing und Storyboard

---

## Nicht im Scope (bewusst ausgeklammert)
- ❌ Echte SFX-Renderintegration in Remotion-Lambda (Block G liefert UI + Datenmodell; Render-Pipeline-Update wäre eigener Block "G+")
- ❌ Brand Kit Editor selbst (existiert bereits an anderer Stelle — wir nutzen nur)
- ❌ Stock Footage / Stock Bilder (Block I, separater Plan)
- ❌ Export-Presets für TikTok/YouTube (Block I)

---

## Aufwand
- **Block G:** ~1 Tag (Browser-UI + Lib-Tabelle + SFX Edge Function; Render-Integration von SFX als Folge-Block)
- **Block H:** ~0.5 Tag (reine UI-Glue, alle Daten existieren)

**Reihenfolge:** Erst H (kürzer, sofort sichtbarer Wert), dann G. Nach Freigabe setze ich beide nacheinander um.
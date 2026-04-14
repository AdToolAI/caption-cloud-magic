
## Plan: 12 Kategorien auf 4 Templates reduzieren

### Übersicht
Die 12 Kategorien werden auf 4 klare Templates konsolidiert. Ein Mapping-Layer sorgt dafür, dass die bestehende Render-Pipeline (die interne Kategorien wie `social-reel`, `brand-story`, `product-ad` etc. nutzt) intakt bleibt.

**Die 4 neuen Templates:**
1. **Unternehmenswerbung** (`corporate-ad`) — Werbung für Unternehmen/Dienstleistungen
2. **Produktwerbung** (`product-ad`) — Werbung für konkretes Produkt (mit Pflicht-Bildupload min. 4)
3. **Storytelling** (`storytelling`) — Geschichte erzählen (erfunden oder wahr)
4. **Freier Editor** (`custom`) — Volle Kontrolle, beliebiger Videotyp

### Änderungen

**1. `src/types/universal-video-creator.ts`**
- `VideoCategory` auf 4 Werte reduzieren: `'corporate-ad' | 'product-ad' | 'storytelling' | 'custom'`
- `VIDEO_CATEGORIES` Array auf 4 Einträge kürzen
- Alte Kategorien bleiben NICHT als Typ erhalten — das Mapping passiert nur in den Edge Functions

**2. `src/components/universal-video-creator/CategorySelector.tsx`**
- 4 große, prominente Karten statt 12 kleine
- Icons: Building2, ShoppingBag, BookOpen, Wand2
- Klare Beschreibungen pro Modus

**3. `src/config/universal-video-interviews.ts`**
- 4 Interview-Configs statt 12:
  - `corporate-ad`: Unternehmen, Branche, Mission, Zielgruppe, CTA (basierend auf bisherigem `advertisement` + `corporate`)
  - `product-ad`: Produktfotos-Pflicht, USPs, emotionale Reaktion, filmischer Stil, Reveal-Moment (bestehende verschärfte Fragen)
  - `storytelling`: Bestehende Storytelling-Logik mit Erfunden/Wahr-Weiche
  - `custom`: Offene Fragen, volle Flexibilität

**4. `src/hooks/useLocalizedVideoCategories.ts`**
- Mapping auf 4 Kategorien anpassen

**5. `src/lib/translations.ts`**
- Neue Übersetzungskeys für 4 Kategorien (DE/EN/ES)

**6. `src/components/universal-video-creator/UniversalVideoWizard.tsx`**
- Validierungslogik auf neue 4 Kategorien anpassen
- Bildupload-Pflicht bleibt für `product-ad`

**7. `src/components/universal-video-creator/UniversalVideoConsultant.tsx`**
- Referenzen auf alte Kategorien entfernen

**8. `supabase/functions/universal-video-consultant/index.ts`**
- Phasen, Quick Replies, System-Prompts auf 4 Kategorien reduzieren

**9. `supabase/functions/_shared/generate-script-inline.ts`**
- `getCategoryKey()` Mapping erweitern: `corporate-ad` → `advertisement` (intern), Pipeline-Kompatibilität
- Style-Profile für `corporate-ad` hinzufügen

**10. `supabase/functions/auto-generate-universal-video/index.ts`**
- Category-Mapping: `corporate-ad` → Render-Kategorie `brand-story`, `product-ad` → `product-ad`, `storytelling` → `storytelling`, `custom` → `social-reel`
- Bestehende Image-Enhancement-Logik für `product-ad` beibehalten

**11. `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` + `UniversalExportStep.tsx`**
- Import-Referenzen auf neue Typen anpassen

### Sicherheit
- Alte Render-Kategorien (`social-reel`, `brand-story`, `product-ad` etc.) bleiben in der Pipeline unverändert
- Nur das UI und die Eingabe-Schicht wird auf 4 reduziert
- Kein Template-Rendering-Code wird geändert (`UniversalCreatorVideo.tsx` bleibt unberührt)
- Schrittweiser Umbau: erst Types/UI, dann Edge Functions

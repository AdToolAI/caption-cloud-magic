## Ziel

In **Cast & World** kann der Nutzer für jeden Asset-Typ (Character, Prop, Building, Location) **ein beliebiges Foto** hochladen — auch schlecht ausgeleuchtet, mit Hintergrund, schräg — und die KI erzeugt daraus automatisch ein **sauberes Referenzbild mit transparentem Hintergrund** (bzw. neutralem Studio-Hintergrund für Locations, wo Transparenz keinen Sinn ergibt). Das Ergebnis landet als `reference_image_url` in der jeweiligen Brand-Tabelle mit einer echten UUID pro Nutzer/Workspace und fließt unverändert durch die bereits verdrahtete Cast-&-World-ID-Pipeline (v202/v211).

## User-Flow

```text
[Cast & World Panel]
  └─ „+ Aus Foto erstellen"  (überall gleich: Character / Prop / Building / Location)
        ↓ File-Picker (JPG/PNG/HEIC/WebP)
  ┌─────────────────────────────────────────┐
  │  Preview: Original    →   Cleaned       │
  │  [Name eingeben]                        │
  │  [Auto-clean-Modus ▼]                    │
  │    • Cutout (transparent)  ← Prop/Char  │
  │    • Studio-Backdrop       ← Building   │
  │    • Cinematic Restage     ← Location   │
  │  [Erneut generieren]  [Speichern]       │
  └─────────────────────────────────────────┘
```

Ein Klick, ein Sheet, überall dieselbe Komponente.

## Umsetzung

### 1. Edge Function `refine-asset-photo` (neu)
`supabase/functions/refine-asset-photo/index.ts`
- Input: `{ kind: 'character'|'prop'|'building'|'location', sourceImageUrl, name, description? }`
- JWT-Auth, Zod-Validation, CORS wie in bestehenden World-Funktionen.
- Pipeline:
  1. Lädt das Original aus dem `brand-uploads`-Bucket (siehe Punkt 3).
  2. Ruft **`google/gemini-3.1-flash-image`** über AI Gateway `/v1/images/generations` (chat-shape, `messages` + `modalities`, `stream:false`) mit einem kind-spezifischen Prompt auf. Das Modell akzeptiert Bild-Input via `image_url`-Block — genau das brauchen wir hier („nimm dieses Foto und render das Motiv sauber neu"). Kind-spezifische Prompts:
     - `character` / `prop`: „Isolate the main subject on a **solid pure white** background, remove all clutter, studio lighting, sharp focus, 1:1, no text."
     - `building`: „Architectural hero shot of this building, clean sky background, no people/text/logos."
     - `location`: „Cinematic establishing shot of this environment, cleaned up, natural depth, no people/text/logos."
  3. Für `character` / `prop` / `building`: das erzeugte Bild wird durch `@huggingface/transformers` **background-removal serverseitig NICHT** möglich → wir nutzen den bestehenden Client-Helper `src/lib/backgroundRemoval.ts` als **zweiten Schritt im Frontend** nach Empfang des Edge-Function-Outputs. Der Solid-White-Hintergrund vom Prompt macht die Segmentierung robust.
  4. `location` bleibt als JPG (kein Cutout).
  5. Endbild (transparent PNG bzw. JPG) wird in den passenden Bucket geladen: `brand-characters/<userId>/<uuid>.png`, `brand-locations/<userId>/<uuid>.jpg|png`.
  6. Neue Zeile in `brand_characters` / `brand_props` / `brand_buildings` / `brand_locations` mit `reference_image_url` und `user_id = auth.uid()`. Postgres vergibt automatisch die kanonische UUID.
  7. Antwort enthält die volle Zeile — React Query invalidiert die entsprechenden `useBrand*`-Hooks und der Eintrag erscheint sofort in `useUnifiedMentionLibrary` → UnifiedAssetPicker.

### 2. Wiederverwendbare Komponente `AssetPhotoUploadSheet`
`src/components/cast-world/AssetPhotoUploadSheet.tsx` (neu)
- Props: `kind`, `open`, `onOpenChange`, `onCreated(assetId)`.
- Schritte: Datei wählen → in `brand-uploads`-Bucket hochladen → `refine-asset-photo` aufrufen → für Cutout-Kinds `removeBackground()` aus `src/lib/backgroundRemoval.ts` auf das Ergebnis anwenden → gecleantes PNG erneut in den Ziel-Bucket hochladen und `reference_image_url` per RPC updaten (kleine neue Funktion `update_asset_reference_image` mit `SECURITY DEFINER`, prüft `user_id = auth.uid()`).
- Preview-Panel: „Vorher / Nachher" Slider, „Erneut generieren"-Button (retriggered mit anderem Seed), „Speichern".

### 3. Neuer Storage-Bucket `brand-uploads` (private)
- Migration via `supabase--storage_create_bucket` (nicht via SQL).
- RLS: `user_id/<file>`-Pfad; nur Owner kann lesen/schreiben. Zwischen-Ergebnisse landen hier und werden nach dem Refinement wieder gelöscht.

### 4. UI-Integration
- **BrandCharacters-Page** (`src/pages/BrandCharacters.tsx`): Neuer Primary-Button „Aus Foto erstellen" neben dem bestehenden „Neuen Character anlegen".
- **CreatorLibrary / World-Tabs** (`src/pages/CreatorLibrary.tsx`): pro Tab (Props / Buildings / Locations) derselbe Button.
- **UnifiedAssetPicker Empty-State** (`src/components/video-composer/UnifiedAssetPicker.tsx`): zusätzlich zum bestehenden „In Library öffnen"-Link ein Inline-CTA „Foto hochladen" der das Sheet direkt im Composer öffnet — damit erübrigt sich der Tab-Wechsel für den häufigsten Fall.

### 5. IDs & Sichtbarkeit (Antwort auf die Nutzerfrage)
- Postgres vergibt **automatisch** eine `uuid` beim Insert — dieselbe ID, die die v202/v211-Pipeline erwartet.
- Alle Uploads sind **privat pro Nutzer/Workspace** (RLS via `user_id`). Kein anderer Nutzer sieht das Asset.
- Zugriff nur über Ziel-Bucket + RLS-Policy `auth.uid() = user_id`; kein Public-Bucket.
- Öffentlich gibt es weiterhin nur die von uns geseedeten `*_catalog_previews` (Katalog-IDs, nicht die Brand-Tabellen).

## Technische Notizen

- Kein Migrations-Schema-Change nötig — die Brand-Tabellen existieren, `reference_image_url` ist schon vorhanden.
- Ein neuer Bucket + eine neue Edge Function + eine Front-Komponente + drei Aufrufer-Stellen.
- Modellwahl: `google/gemini-3.1-flash-image` (Nano Banana 2) für Restaging — akzeptiert Bild-Input, schnell, günstig, sehr gute Motivtreue.
- Background-Removal bleibt client-seitig (`@huggingface/transformers`), weil das im Projekt schon läuft und der Solid-White-Hintergrund aus Gemini die Segmentierung sehr robust macht.
- Feature-Flag `VITE_CAST_WORLD_PHOTO_UPLOAD` (default `true`) um das neue Sheet schnell abschalten zu können.

## Dateien

**Neu**
- `supabase/functions/refine-asset-photo/index.ts`
- `src/components/cast-world/AssetPhotoUploadSheet.tsx`
- `src/hooks/useRefineAssetPhoto.ts`
- Storage-Bucket `brand-uploads` + RLS-Migration
- SQL-Migration: `update_asset_reference_image(kind, asset_id, url)` SECURITY DEFINER
- `mem/features/cast-world/photo-upload-refinement.md` + Index-Update

**Geändert**
- `src/pages/BrandCharacters.tsx` — Button + Sheet
- `src/pages/CreatorLibrary.tsx` — Button pro World-Tab
- `src/components/video-composer/UnifiedAssetPicker.tsx` — Inline-CTA im Empty-State

## Was nicht enthalten ist
- Outfits/Voices (bleiben out-of-scope; Outfits erfordern einen anderen Flow über `avatar_outfit_looks` mit Multi-View-Prompts, Voices sind Audio).
- Öffentliches Teilen von hochgeladenen Assets — bleibt privat.
- Batch-Upload mehrerer Fotos in einem Sheet.

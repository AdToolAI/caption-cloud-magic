
# Avatar Library — Brand Character × Voice × Talking Head

Konsolidierung von **Brand Characters** + **Voice Preset** + **Hedra-Portrait** in eine Entität namens **Avatar**. Jeder Avatar ist sofort „sprechfähig" via Talking Head, mit einem Klick.

---

## Strategie: Sanftes Rebranding statt destruktiver Migration

Die existierende Tabelle `brand_characters` wird **nicht umbenannt** (zu riskant: 10+ Studios, RLS, Bucket-Name `brand-characters` haben harte Referenzen). Stattdessen:

- Tabelle bleibt physisch `brand_characters` — bekommt nur **neue Avatar-Spalten**
- UI und alle neuen Texte sprechen ausschließlich von **„Avatars"**
- Route `/brand-characters` bleibt bestehen → neue Route `/avatars` zeigt dieselbe Page (Backward-Compat)
- Alle Sidebar-/Hub-Einträge werden auf „Avatars" umbenannt
- Hook bleibt `useBrandCharacters` intern, aber ein Alias-Export `useAvatars` wird hinzugefügt für neuen Code

→ Null Datenmigration, null Breaking Changes, klare User-Story.

---

## Datenbank — neue Spalten auf `brand_characters`

```sql
ALTER TABLE brand_characters
  ADD COLUMN default_voice_id        text,        -- ElevenLabs voice ID oder custom_voice UUID
  ADD COLUMN default_voice_provider  text DEFAULT 'elevenlabs'
    CHECK (default_voice_provider IN ('elevenlabs','custom')),
  ADD COLUMN default_voice_name      text,        -- Anzeige im UI ohne extra Lookup
  ADD COLUMN portrait_url            text,        -- Hedra-optimiertes Frontal-Portrait
  ADD COLUMN portrait_mode           text DEFAULT 'original'
    CHECK (portrait_mode IN ('original','auto_generated','manual_upload')),
  ADD COLUMN default_language        text DEFAULT 'en',
  ADD COLUMN default_aspect_ratio    text DEFAULT '9:16';
```

Kein neuer Bucket — `portrait_url` lebt im selben `brand-characters` Bucket unter `{user_id}/portraits/{uuid}.png` (RLS-Path-Constraint bleibt erfüllt).

---

## Edge Function — `generate-avatar-portrait` (neu)

Nimmt Original-Reference-Bild, ruft **`google/gemini-3.1-flash-image-preview`** über Lovable AI Gateway mit Edit-Prompt:

> *"Restyle this person as a centered frontal portrait, eye-level camera, neutral soft background, shoulders visible, looking directly into camera, photorealistic, soft studio lighting. Preserve exact facial identity, hair, and distinguishing features."*

Speichert im Bucket, gibt URL zurück, schreibt `portrait_url` + `portrait_mode='auto_generated'` in DB.
Kostet ~1 Credit (transparent für User per `featureCosts`).

---

## UI — Drei Touchpoints

### 1. `/brand-characters` → Rebrand zu „Avatars"
- Page-Title: **„Your Avatar Library"**, Subline „Recurring on-screen talent — one click to make them speak"
- Header-Chip: „Avatar Library Lock" (statt „Brand Character Lock")
- `BrandCharacterCard` bekommt drei neue Inline-Sektionen:
  - **Voice Picker** (Combobox: ElevenLabs Top 8 + Custom Voices) → speichert `default_voice_id` + `_provider` + `_name`
  - **Portrait Section**: Toggle zwischen `original` / `auto_generated` / `manual_upload`
    - Bei `auto_generated`: Button „Generate Hedra Portrait" → ruft Edge Function, zeigt Preview
    - Bei `manual_upload`: Upload-Slot
  - **„Speak" Quick-Action Button** (gold, prominent) → öffnet `TalkingHeadDialog` vorausgefüllt

### 2. `TalkingHeadDialog` — neuer „Avatar"-Tab
Zusätzlich zu „Upload" und „Generated" Tabs: **„From Avatar"** (default wenn ≥1 Avatar mit `portrait_url` ODER `default_voice_id` existiert).
- Avatar-Picker (Grid mit Bild + Name)
- Auswahl füllt: `imageUrl` = `portrait_url || reference_image_url`, `voiceId` = `default_voice_id`, `aspectRatio` = `default_aspect_ratio`
- User schreibt nur noch Skript

### 3. Sidebar / Hub
- Sidebar-Eintrag „Brand Characters" → **„Avatars"** (Icon bleibt Users-Lucide)
- Hub-Tile gleiches Rebranding
- Route `/avatars` → rendert dieselbe `BrandCharacters` Page (alias)

---

## Composer-Integration

`SceneCard` Talking-Head-Action ruft `TalkingHeadDialog` schon heute. Mit neuem „From Avatar"-Tab funktioniert die Avatar-Auswahl dort automatisch, **ohne extra Code in SceneCard**.

---

## Memory & Rebranding-Konsistenz

- Memory `brand-character-lock` bleibt, wird ergänzt um „Avatar Library = Brand Character + Voice + optional Hedra Portrait"
- Neue Memory `mem://features/avatars/library-architecture` mit Schema, Edge Function, UI-Routen

---

## Geliefert wird

```text
Files (neu/geändert)
├── supabase/migrations/<ts>_avatar_library.sql            (5 neue Spalten)
├── supabase/functions/generate-avatar-portrait/index.ts   (Gemini Image Edit)
├── src/hooks/useBrandCharacters.ts                        (+ default_voice/portrait Felder, alias useAvatars)
├── src/hooks/useAvatarPortrait.ts                         (neuer Hook für Generate-Action)
├── src/pages/BrandCharacters.tsx                          (Rebrand „Avatars", neue Tagline)
├── src/components/brand-characters/BrandCharacterCard.tsx (Voice-Picker, Portrait-Toggle, „Speak"-Button)
├── src/components/brand-characters/AvatarPortraitDialog.tsx (neu: Generate/Upload Hedra-Portrait)
├── src/components/brand-characters/AvatarVoicePicker.tsx  (neu)
├── src/components/video-composer/TalkingHeadDialog.tsx    (neuer „From Avatar"-Tab)
├── src/App.tsx                                            (alias /avatars)
├── src/config/hubConfig.ts                                (Rebrand-Label)
├── src/components/layout/Sidebar.tsx (oder Equivalent)    (Rebrand-Label)
└── mem://features/avatars/library-architecture            (neue Memory)
```

## Out of Scope (Phase 2 später)
- Voice-Cloning direkt im Avatar-Erstellen-Flow (heute über separates Custom-Voices-Modul)
- Mehrere Portraits pro Avatar (Profil/Halb/Ganzkörper)
- Avatar-Sharing/Marketplace

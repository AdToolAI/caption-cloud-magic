## Zwei Ergänzungen in Cast & World

### 1. Voice-Auswahl auf der Charakter-Detailseite

**Problem:** `/avatars/:id` zeigt eine „Voice Profile"-Karte (Stability, Similarity, Style, Speed, Speaker Boost), aber keinen Voice-Picker. Preview ist deshalb deaktiviert ("Set a default voice first"). Custom Voices aus dem Audio Studio sind hier nicht erreichbar.

Die Datenverdrahtung existiert bereits: `brand_characters.default_voice_id / _provider / _name` wird von Motion Studio, AI Video Studio (`ToolkitGenerator`), `TalkingHeadDialog`, `SceneDialogStudio`, `useApplyProductionPlan` und `useUnifiedMentionLibrary` automatisch als Default gelesen. Es fehlt nur die UI zum Setzen auf der Detailseite.

**Änderungen (rein UI):**
- **`src/components/avatars/VoiceProfileCard.tsx`** — neuen Block **„Voice Selection"** oberhalb der Slider einfügen mit `AvatarVoicePicker` (ElevenLabs-Library **und** Custom Voices aus `useCustomVoices`) + `VoicePreviewButton`. `onChange` schreibt `default_voice_id / _provider / _name` in `brand_characters` und invalidiert die `avatar-detail`-Query. Hinweis darunter: „Wird als Default in Motion Studio & AI Video Studio übernommen."
- **`src/components/brand-characters/AvatarVoicePicker.tsx`** — „Your Custom Voices"-Gruppe an den **Anfang** der Liste ziehen, damit frisch geklonte Stimmen sofort sichtbar sind.

### 2. IDs überall in Cast & World sichtbar

Betrifft Charaktere, Locations, Outfits/Wardrobe-Items, Props/Objekte, Buildings — jede Entität, die eine `id` hat.

**Anzeige-Muster:** kleine Monospace-Badge mit den ersten 8 Zeichen der UUID + Copy-Icon (klickt → schreibt volle UUID in die Zwischenablage + Toast „ID kopiert"). Tooltip zeigt die volle UUID.

**Neue Komponente:** `src/components/cast-world/EntityIdBadge.tsx`
```
<Badge>ID · abc12345…</Badge>  ← Copy-to-clipboard
```
Klein, `text-[10px]`, `font-mono`, `text-muted-foreground`, unaufdringlich in Ecke oder unter Titel.

**Einbau-Stellen (nur bestehende UI, keine neuen Routen):**
- `src/pages/AvatarDetail.tsx` — direkt unter `Samuel Dusatko`-Name
- `src/components/brand-characters/BrandCharacterCard.tsx` — Karte in der Bibliothek (Ecke oben rechts)
- `src/components/motion-studio/CharacterCard.tsx` (falls vorhanden) — Motion-Studio-Bibliothek
- `src/components/motion-studio/LocationCard.tsx` — Locations
- Outfit-/Wardrobe-Karten in `AvatarDetail.tsx` (Casual/Streetwear/Brunch/Loungewear-Kacheln) — `outfit_look_id` als Badge
- Prop-/Building-/Objekt-Karten (falls vorhanden unter `src/components/motion-studio/props*` oder `objects*`)

Vor dem Einbau kurz `rg` fahren, um alle relevanten Karten-Komponenten zu erfassen; alle bekommen dieselbe `<EntityIdBadge>`.

### Nicht Teil dieses Plans
- Kein Schema-Change (IDs existieren bereits).
- Keine Änderung an Downstream-Pipelines.
- Kein neuer Edge-Function-Call.

### Verifikation
- `/avatars/:id` öffnen → Voice-Picker sichtbar, Auswahl (ElevenLabs oder Custom) → Preview funktioniert → nach Reload persistiert → Motion Studio zeigt Stimme als vorbelegt.
- In allen Cast & World Listen und Detailansichten (Charakter, Location, Outfit, Prop/Building) ist eine ID-Badge sichtbar, Klick kopiert die volle UUID in die Zwischenablage.
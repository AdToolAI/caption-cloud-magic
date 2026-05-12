## Ziel

Zwei zusammenhängende Erweiterungen der Avatar Library:

1. **Preset-Avatar-Bibliothek** — Eine kuratierte Auswahl an fertigen Avataren, die jeder Nutzer ohne Upload sofort verwenden kann.
2. **Auto-Standard-Portrait beim Erstellen** — Beim Hochladen eines eigenen Charakterbildes wird automatisch ein "Default Outfit"-Portrait via Gemini erzeugt, das danach genauso wie eigene Fotos via Wardrobe umgezogen werden kann.

---

## Teil 1 — Preset Avatar Library

**Konzept:** 12 kuratierte System-Avatare (gemischt: Geschlecht, Alter, Ethnie, Stil — z.B. *Business Woman*, *Casual Guy*, *Creative Artist*, *Senior Mentor*, *Athletic Trainer*, *Tech Founder*, *Doctor*, *Teacher*, *Influencer*, *Chef*, *Designer*, *Speaker*).

**UI** auf `/brand-characters`:
- Neuer Tab/Sektion **"Preset Avatars"** über dem eigenen Grid (Carousel oder 3×4 Grid).
- Jede Karte: Portrait + Name + Rolle + Button **"Use this Avatar"** → klont den Preset als persönlichen Avatar in `brand_characters` (mit eigenem `user_id`), inkl. portrait_url, identity_json, voice. Danach voll editierbar/wardrobe-fähig.
- Solange der Nutzer noch keinen Avatar hat: Empty-State zeigt direkt die Presets statt nur "Create First".

**Daten-Modell:**
- Neue Tabelle `system_preset_avatars` (oder Reuse von `brand_characters` mit `user_id = NULL` + Flag `is_system_preset = true`). Empfehlung: **eigene Tabelle** `system_preset_avatars` für saubere Trennung.
- Spalten: `id`, `name`, `role_label`, `gender`, `description`, `portrait_url`, `reference_image_url`, `visual_identity_json`, `default_voice_id`, `sort_order`, `is_active`.
- RLS: `SELECT` für `authenticated` (alle dürfen lesen), `INSERT/UPDATE/DELETE` nur Admin.

**Klon-Flow:**
- Neue Edge Function `clone-preset-avatar` (nimmt `preset_id`):
  1. Lädt Preset-Row.
  2. Kopiert `portrait_url` + `reference_image_url` aus System-Bucket → `brand-characters/{user_id}/...` (RLS-konformer Pfad).
  3. Insert in `brand_characters` mit `user_id = auth.uid()`, identity_json, default_voice_id, `cloned_from_preset = preset_id`.
  4. Returnt neue `character_id`.
- Frontend: neuer Hook `usePresetAvatars()` + `useClonePresetAvatar()`.

**Seeding:**
- 12 Portraits werden mit Gemini Image (premium) generiert, in `system-preset-avatars` Storage-Bucket (public read) abgelegt, dann via Migration als Rows seeded. Identity-Cards lassen wir vom bestehenden `extract-character-identity` Edge-Function generieren.

**Marktplatz-Verhältnis:** Klar abgegrenzt — Presets sind **kostenlos und global**, der Marketplace bleibt für bezahlte Community-Charaktere. `useAccessibleCharacters` muss nicht angefasst werden, da Klone normale `brand_characters` werden.

---

## Teil 2 — Auto-Standard-Portrait beim Avatar-Upload

**Heute:** Bei `createCharacter` wird das Originalbild gespeichert + Identity-Card extrahiert. `portrait_url` bleibt leer, bis der Nutzer im Detail-View manuell auf "Generate Portrait" klickt.

**Neu:** Direkt im Upload-Flow wird automatisch ein **"Standard Outfit"-Portrait** mitgeneriert.

**Was bedeutet "Standard Outfit"?** Neutral, Studio-Look, weißer Hintergrund, schlichtes graues T-Shirt / dunkler Pullover (geschlechtsadaptiert), eye-level, frontal, schultern sichtbar — dieser dient als **kanonischer Base-Frame** für alle Wardrobe-Variants (genau wie bei Presets).

**Implementierung:**
1. **`generate-avatar-portrait` Edge Function erweitern:**
   - Prompt-Variante `'default_outfit'` hinzufügen, die explizit "wearing a clean neutral grey t-shirt / dark sweater, plain white studio backdrop, soft key light" enthält (Identitäts-Lock bleibt).
   - Akzeptiert optional `{ variant: 'hedra' | 'default_outfit' }`. Default bleibt 'hedra' für Rückwärtskompatibilität.
   - Speichert in den bestehenden `portrait_url` und setzt `portrait_mode = 'auto_default_outfit'`.
2. **`useBrandCharacters.createCharacter` erweitern:**
   - Nach dem Insert: `await supabase.functions.invoke('generate-avatar-portrait', { body: { character_id: row.id, variant: 'default_outfit' }})`.
   - Non-blocking visual: Toast "Avatar saved — generating standard portrait…", danach Refetch. Wenn der Portrait-Call fehlschlägt → soft-fail mit Hinweis-Toast, der Avatar bleibt nutzbar.
3. **`AddBrandCharacterDialog`:** Loading-State zeigt jetzt 2 Steps:
   - "Extracting identity…" (wie bisher)
   - "Generating standard portrait…" (neu, ~10–20s)
4. **Wardrobe:** Funktioniert automatisch — die existierende `generate-avatar-wardrobe` Function nutzt `portrait_url` als Identity-Lock-Source. Da das Standard-Outfit jetzt ein sauberer Studio-Frame ist, werden die Wardrobe-Outfits sogar konsistenter.

**Kosten:** ~$0.005 zusätzlich pro Avatar-Erstellung (Gemini 3.1 Flash Image). Keine zusätzliche Credit-Verrechnung nötig (wie bei Wardrobe heute auch).

---

## Geänderte Dateien

**Teil 1 (Preset Library):**
- *Migration:* `system_preset_avatars` Tabelle + RLS + `system-preset-avatars` Storage-Bucket (public read)
- *Migration:* `brand_characters.cloned_from_preset` Spalte (uuid, nullable)
- *Edge Function (neu):* `supabase/functions/clone-preset-avatar/index.ts`
- *Edge Function (neu, einmalig):* `seed-preset-avatars` (generiert Portraits + Identity-Cards für die 12 Presets)
- *Hook (neu):* `src/hooks/usePresetAvatars.ts`
- *Component (neu):* `src/components/brand-characters/PresetAvatarGallery.tsx`
- *Edit:* `src/pages/BrandCharacters.tsx` (Tab + Empty-State integration)

**Teil 2 (Auto-Portrait):**
- *Edit:* `supabase/functions/generate-avatar-portrait/index.ts` (variant param + default_outfit prompt)
- *Edit:* `src/hooks/useBrandCharacters.ts` (auto-invoke nach Insert)
- *Edit:* `src/components/brand-characters/AddBrandCharacterDialog.tsx` (2-Step-Loading)

**Memory:** Update `mem://features/avatars/avatar-library` (Preset Library + Auto Default-Outfit Portrait).

---

## Out of Scope

- Mehrere Portrait-Varianten (Hedra-Frontal **und** Default-Outfit nebeneinander) — wir überschreiben bewusst das eine `portrait_url`-Feld. Wenn später gewünscht: separate Spalte `default_outfit_url` ergänzen.
- Preset-Marktplatz / Premium-Presets / User-shared Presets — bleibt im Marketplace-Modul.
- Auto-Wardrobe-Vorgenerierung beim Klonen eines Presets — bleibt on-demand wie heute (~$0.02 pro Sub-Pack).

---

## Offene Frage (1)

Wieviele Preset-Avatare sollen wir launchen?
- **A) 6 Stück** — schnell, fokussiert (3♀ / 3♂, Mix aus Business/Casual/Creative)
- **B) 12 Stück** *(empfohlen)* — solide Auswahl mit Diversität in Geschlecht/Alter/Stil
- **C) 24 Stück** — breite Bibliothek inkl. Nischenrollen (Doctor, Chef, Athlete, Speaker, …)

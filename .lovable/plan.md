## Problem (laut Screenshot)

1. **Alle 4 Outfit-Tiles zeigen "Not generated"** — die `wardrobe_catalog_previews`-Tabelle ist fast leer (nur 12 von ~184 möglichen Slots gefüllt). Für `fantasy:light/female` gibt es 0 Einträge → leeres Grid.
2. **Geschlechts-Toggle ist verwirrend** — User muss bei jedem Avatar manuell zwischen ♀/♂ wechseln. Aktuell ist `brand_characters.gender` für ALLE bestehenden Avatare `null`, daher fällt der Toggle immer auf "female" zurück.
3. Auto-Generierung wäre teuer und intransparent — User möchte expliziten Button (siehe vorheriges Feedback).

## Lösung

### A) Geschlecht beim Avatar-Erstellen festlegen
- **`AddBrandCharacterDialog.tsx`** — neue Pflicht-Auswahl **Female / Male / Neutral** (3 Pills, Default Neutral). Wert wird in `brand_characters.gender` geschrieben.
- **`AvatarDetail.tsx`** — wenn ein bestehender Avatar `gender = null` hat, oben im Portrait-Card ein dezenter Hinweis-Streifen *"Set gender to lock outfit previews"* mit 3 Mini-Pills → schreibt `gender` in DB (One-Time-Backfill für Bestandsavatare).

### B) Wardrobe Sheet sperrt sich auf Avatar-Geschlecht
- In `AvatarWardrobeSheet.tsx`:
  - Wenn `avatarGender ∈ {male, female}` → **Toggle ausblenden** und State hart auf das Avatar-Geschlecht setzen.
  - Wenn `avatarGender = neutral | null` → Toggle bleibt sichtbar (heutiges Verhalten).
- Ergebnis: Kunde sieht ausschließlich passende Outfits, kein irreführender ♀/♂-Mix mehr.

### C) "Generate 4 Outfits" Button statt leerer Catalog-Tiles
- Wenn für die aktive Sub-Pack-Kombination **0 user-Variants UND 0 Catalog-Previews** existieren (oder weniger als 4), zeigt das Grid statt "Not generated"-Platzhalter eine **zentrale Card** mit:
  - Titel: *"Generate 4 outfits for {Avatar} — {Sub-Pack-Label}"*
  - Sub-Text: ~30s, kostet X Credits
  - Button **"Generate"** → ruft existierende Edge-Function `generate-avatar-wardrobe` mit `{ avatarId, theme, sub_pack, gender: avatarGender }`.
- Ergebnis-Variants landen in `avatar_wardrobe_variants` und erscheinen sofort (React-Query invalidate).
- Während Generierung: 4 Skeleton-Tiles mit Pulse-Animation, Lock-Icon auf den Sub-Pack-Pills.
- Catalog-Previews (`wardrobe_catalog_previews`) bleiben als Fallback erhalten — wenn vorhanden, wird kein Generate-Button gezeigt, sondern die Catalog-Bilder + ein kleiner *"Personalize this pack"*-Link unten.

### D) (Optional, kein Blocker) Catalog-Backfill
- `seed-wardrobe-catalog` existiert bereits — kann später per Admin-Skript für alle 92 Sub-Packs × 2 Genders einmalig laufen, um sofortige Previews ohne Generierung zu zeigen. **Nicht Teil dieses Stages**, da User Generate-Button bevorzugt.

## Files

- **Edit** `src/components/brand-characters/AddBrandCharacterDialog.tsx` — Gender-Picker
- **Edit** `src/pages/AvatarDetail.tsx` — Backfill-Hinweis für `gender = null`
- **Edit** `src/components/brand-characters/AvatarWardrobeSheet.tsx` — Toggle locken, Generate-Card statt leerem Grid
- **Edit** `src/components/library-hubs/VariantPickerGrid.tsx` *(falls nötig)* — neuer `emptyState`-Prop für Generate-Card
- **Reuse** Edge-Function `generate-avatar-wardrobe` (keine Änderung nötig)

## Validierung

1. Neuer Avatar → Gender-Pflichtauswahl im Create-Dialog, in DB persistiert.
2. Bestandsavatar ohne Gender → Hinweis-Streifen mit 3 Pills, einmalig setzbar.
3. Wardrobe Sheet bei Avatar mit `gender=female` → kein ♂-Toggle mehr sichtbar, nur weibliche Catalog-Previews.
4. Leerer Sub-Pack (z.B. fantasy:light) → "Generate 4 outfits"-Button statt 4× "Not generated"; Klick generiert echte Outfits auf dem Avatar.
5. Existierende Save/Lightbox/Send-to-Studio-Workflows unverändert.

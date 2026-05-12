## Ziel

Im `SceneAvatarMode` (Storyboard → Avatar-Tab) sind „Wardrobe" und „Pose-Sheet" aktuell **nur Info-Kärtchen ohne Klick**. Wir bauen sie zu einem **Artlist-ähnlichen Wardrobe-System** um: inline klickbar, mit Ganzkörper-Outfit-Varianten in mehreren Themen-Welten (Lifestyle, Historical, Fantasy, Sci-Fi, Sport) — alle mit gelocktem Gesicht via Gemini Image (Nano Banana 2). Beste Preis-Leistung: ~$0.005 pro Outfit.

---

## Stufe 1 — Wardrobe & Pose-Sheet inline klickbar

**`src/components/video-composer/SceneAvatarMode.tsx`**
- Aus den beiden Hint-Kärtchen werden **expandierbare Panels** (`<Collapsible>` von shadcn) — Klick öffnet das Panel direkt unter dem aktiven Charakter, der Avatar-Stage und Player rechts bleiben sichtbar.
- Wardrobe-Panel rendert `<AvatarWardrobeSheet avatarId={activeChar.id} />` (existiert bereits, nutzt `VariantPickerGrid` + `generate-avatar-wardrobe`).
- Pose-Panel rendert `<AvatarPoseSheet avatarId={activeChar.id} />` (existiert bereits).
- Wenn kein `activeChar`: Hint „Bitte erst einen Cast wählen", Buttons disabled.
- Auswahl einer Outfit-Variante → schreibt `selectedOutfitVariantId` + `outfitImageUrl` auf `scene` zurück. Stage zeigt sofort die neue Variante.

## Stufe 2 — Themen-Outfits („Artlist-Style")

**`supabase/functions/generate-avatar-wardrobe/index.ts`**
- Optionaler Body-Param: `theme_pack: 'lifestyle' | 'historical' | 'fantasy' | 'scifi' | 'sport'` (Default `lifestyle` → keine Regression).
- Neue Themen-Sets (jeweils 4 Outfits, **Ganzkörper, Studio-BG, Identity-Lock**):

| Pack | Outfits |
|---|---|
| **lifestyle** ✅ schon da | Casual · Formal · Action · Brand |
| **historical** | Knight in plate armor · Roman Legionary · Viking warrior · Edwardian gentleman/lady |
| **fantasy** | Wizard with robes · Elven Ranger · Dark Knight · Royal coronation attire |
| **scifi** | Astronaut suit · Cyberpunk streetwear · Mech-pilot uniform · Holo-suit |
| **sport** | Football kit · Basketball jersey · Tennis whites · MMA fight gear |

- Identity-Lock-Prompt bleibt streng (Gesicht/Proportionen unverändert), Modifier erweitert um „**full-body, head-to-toe, soft neutral studio background, photorealistic**".
- Modell: weiterhin `google/gemini-3.1-flash-image-preview` via Lovable AI Gateway.

**Migration `avatar_wardrobe_variants`:**
- Spalte `theme_pack TEXT NOT NULL DEFAULT 'lifestyle'` ergänzen.
- Alten Unique-Index `(avatar_id, outfit_id)` droppen, neuen anlegen: `(avatar_id, theme_pack, outfit_id)` → mehrere Theme-Sets pro Avatar koexistieren ohne Idempotenz-Konflikt.

**`AvatarWardrobeSheet`:**
- Neue Prop `themePack` + Theme-Pack-Pills oberhalb der Grid (Lifestyle · Historical · Fantasy · Sci-Fi · Sport).
- Query-Key: `['avatar-wardrobe', avatarId, themePack]`.
- „Generate"-Call schickt `theme_pack` mit.

## Stufe 3 — Ganzkörper-Stage („Artlist-Showroom")

**`AvatarStage3D.tsx`:**
- Wenn `selectedOutfitVariantId` gesetzt → zeige das **Ganzkörper-Outfit-Bild** statt des Brustbild-Porträts.
- Optik: weicher Gradient-Boden, Spotlight-Cone, sanfter Parallax-Tilt (existiert bereits), Slow-Float-Animation („lebendiges Schaufenster").
- Toggle oben rechts: **[Porträt] [Outfit-Showroom]**.
- Mini-Hint: „Kein 3D-Modell — gerenderte Outfit-Variante mit Identity-Lock" (klein, einklappbar).

## Out of Scope (bewusst)

- Echtes WebGL-3D-Modell (Trellis/Hunyuan) — nur als optionale Stufe 4 später (Marketing-Wow).
- Cloth-Rigging / Live-Outfit-Wechsel ohne Re-Render — physisch unmöglich ohne vollständige 3D-Pipeline.
- Lip-Sync / Wallet / i18n.

## Akzeptanz

1. Klick auf „Wardrobe" im Avatar-Tab öffnet inline ein klickbares Variant-Grid.
2. Über dem Grid: 5 Theme-Pack-Pills. Wechsel lädt Varianten des aktiven Packs.
3. „Generate" mit Theme „Historical" produziert 4 Ganzkörper-Outfits (Knight, Roman, Viking, Edwardian) mit unverändertem Gesicht.
4. Klick auf eine Variante → Stage zeigt das Ganzkörper-Outfit-Bild.
5. Pose-Sheet öffnet analog inline und ist klickbar.
6. Kein Tab-Wechsel, Player rechts bleibt sichtbar.

## Kostenschätzung

- 1 Outfit ≈ $0.005 (Gemini 3.1 Flash Image)
- 1 komplettes Theme-Pack (4 Outfits) ≈ **$0.02**
- Alle 5 Packs für 1 Avatar ≈ **$0.10** — einmalig, gecacht.

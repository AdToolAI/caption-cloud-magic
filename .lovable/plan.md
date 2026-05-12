## Stage 20: Business Theme Pack für Wardrobe

Add a 6th theme pack `business` to the existing Artlist-style Wardrobe system. Same architecture as Lifestyle/Historical/Fantasy/Sci-Fi/Sport — 4 identity-locked full-body outfits via Gemini 3.1 Flash Image.

### Gender Handling

Outfit-Prompts werden **geschlechtsneutral** formuliert (z.B. "tailored two-piece business suit" statt "men's suit"). Der Identity-Lock von Gemini übernimmt automatisch das Geschlecht, die Frisur und den Körperbau des Avatar-Porträts — so funktioniert das System bereits bei allen 5 bestehenden Packs (ein Frauen-Avatar bekommt automatisch eine Damen-Variante des Knight-Outfits etc.). Damit ist die Anforderung "männlich und weiblich" out-of-the-box erfüllt, ohne pro Outfit zwei Varianten generieren zu müssen (würde Kosten verdoppeln).

Falls in Zukunft strikt getrennte male/female-Cuts gewünscht sind, können wir das als Stage 21 nachschieben (Auto-Detect Gender via Vision + duplizierte Outfit-IDs `executive-m` / `executive-f`).

### 4 Business-Outfits

1. **Executive Suit** — tailored dark navy two-piece business suit, crisp white dress shirt, silk tie or silk scarf, polished leather shoes, premium boardroom styling
2. **Smart Casual** — fitted blazer over white shirt, dark chinos, leather loafers, modern startup-office look, no tie
3. **Power Blazer** — structured charcoal blazer with statement lapels, fitted black turtleneck, slim trousers, confident keynote-stage styling
4. **Founder Hoodie** — premium minimal hoodie in heather grey under an unstructured wool blazer, dark jeans, white sneakers, Silicon Valley founder aesthetic

Alle mit identity-lock prompt suffix (face, hair, skin tone, body proportions preserved), full-body, soft neutral studio background, photorealistic — identisch zum bestehenden Standard.

### Files to Edit

**`supabase/functions/generate-avatar-wardrobe/index.ts`**
- `ThemePack` type: add `'business'`
- `THEME_PACKS`: add `business: [...]` array with 4 outfits above
- `VALID_PACKS` set: add `'business'`

**`src/components/brand-characters/AvatarWardrobeSheet.tsx`**
- `WardrobeThemePack` type: add `'business'`
- Theme pills array: add `{ id: 'business', label: 'Business', emoji: '💼' }`
- Local fallback `THEME_PACKS_LOCAL` (used for skeleton labels): add 4 business outfit labels

**No DB migration needed** — `theme_pack` column is already `TEXT`, unique index already covers `(avatar_id, theme_pack, outfit_id)`.

**No edge function deploy parameters change** — same Gemini call, same cost (~$0.005 / outfit, ~$0.02 / pack).

### Out of Scope

- Gender-split outfits (Stage 21 if requested)
- New themes beyond Business
- Wardrobe UI redesign
- 3D model integration

### Cost Impact

+1 theme pack à 4 outfits = +$0.02 per Avatar (only when user clicks "Generate Business Pack"). All packs cached after first generation.

### Memory Update

`mem://features/avatars/wardrobe-theme-packs` — change "5 themed outfit packs" → "6 themed outfit packs (Lifestyle/Historical/Fantasy/Sci-Fi/Sport/Business)".

## Stage 21: Hierarchische Wardrobe Theme Packs

Aktuell sind die 6 Theme Packs flach (4 Outfits pro Theme). Wir machen alle Themes 2-stufig: **Theme → Sub-Pack → 4 Outfits**. Architektur identisch zu Stage 20 (Gemini 3.1 Flash Image, identity-lock, ~$0.005/Outfit).

### Ziel-Struktur

```text
Lifestyle
├── Everyday      → Casual, Streetwear, Brunch, Loungewear
├── Formal        → Black Tie, Cocktail, Wedding Guest, Gala
├── Seasonal      → Summer, Winter, Rainy Day, Spring
└── Brand         → Brand Hero, Brand Casual, Brand Formal, Brand Sport

Business
├── Corporate     → Executive Suit, Boardroom, Banker, Consultant
├── Startup       → Smart Casual, Founder Hoodie, Power Blazer, Pitch
├── Creative      → Designer, Agency, Architect, Editor
└── Travel        → Airport Pro, Conference, Networking, Coworking

Historical (7 Eras)
├── Antiquity        → Roman Legionary, Greek Hoplite, Egyptian Royal, Celtic Warrior
├── Medieval         → Knight, Viking, Crusader, Monk
├── Renaissance      → Noble, Musketeer, Pirate, Court
├── Industrial       → Edwardian, Victorian, Steampunk, Wild West
├── World War I      → Doughboy, Tommy, Pilot Ace, Trench Officer
├── World War II     → GI, German Soldier, RAF Pilot, Resistance
└── Feudal Japan     → Samurai, Ninja, Geisha, Ronin

Fantasy
├── Light    → Wizard, Elven Ranger, Paladin, Royal
├── Dark     → Dark Knight, Necromancer, Assassin, Vampire
└── Mythic   → Dragon Rider, Druid, Sorceress, Forest Guardian

Sci-Fi
├── Space    → Astronaut, Star Captain, Alien Diplomat, Mech Pilot
├── Cyber    → Cyberpunk, Netrunner, Corp Exec, Street Samurai
└── Future   → Holo Suit, Bio-Engineer, Energy Knight, Drone Pilot

Sport
├── Team       → Football, Basketball, Baseball, Soccer
├── Combat     → MMA, Boxing, Karate, Fencing
└── Outdoor    → Tennis, Skiing, Climbing, Cycling
```

**Total:** 6 Themes, 23 Sub-Packs, 92 Outfit-Slots (alle lazy on-demand, $0.02/Sub-Pack).

### Technik

**DB (keine Migration nötig):** `avatar_wardrobe_variants.theme_pack` speichert weiterhin den Sub-Pack-Key direkt — wir migrieren von `'historical'` zu `'historical:medieval'`. Spalte ist `TEXT`, Unique-Index `(avatar_id, theme_pack, outfit_id)` greift unverändert. Bestehende Zeilen mit altem flachen Wert (`'historical'`, `'lifestyle'` etc.) bleiben gültig — UI zeigt sie nicht mehr an, sind aber nicht broken (User kann den neuen Sub-Pack einfach neu generieren).

**Edge Function `generate-avatar-wardrobe`:**
- `THEME_PACKS` wird verschachtelt: `Record<ThemeId, Record<SubPackId, Outfit[]>>`
- Request akzeptiert `{ avatar_id, theme_pack, sub_pack }` → wird intern zu Composite-Key `${theme}:${sub}` für DB-Storage
- Validator: Whitelist aller `theme:sub` Kombinationen
- Generierungs-Logik unverändert (4 parallele Gemini-Calls)

**`AvatarWardrobeSheet.tsx`:**
- State: `theme: ThemeId` + `subPack: SubPackId`
- Erste Pill-Reihe: 6 Theme-Pills (wie heute)
- Zweite Pill-Reihe (conditional, animated reveal): Sub-Pack-Pills für gewähltes Theme
- Bei Theme-Wechsel: erstes Sub-Pack auto-selektieren
- `PACK_SLOTS` wird zu `PACK_SLOTS[theme][subPack]`
- Query-Key: `['avatar-wardrobe', avatarId, theme, subPack]`
- Composite-Key wird beim DB-Read und beim Edge-Call konstruiert

**`SceneAvatarMode.tsx`:**
- `scene.selectedOutfit` bekommt zusätzliches Feld `subPack` (für Re-Selection beim Reload)
- Default-Pack: `historical:medieval` statt `historical` (Backward-Compatible über Migration im Component)

**`src/types/video-composer.ts`:**
- `selectedOutfit.themePack` bleibt — Wert ist jetzt Composite-String

### Prompt-Hinweise

Alle Outfit-Prompts gender-neutral formuliert ("gender-appropriate cut") — Identity-Lock von Gemini übernimmt Geschlecht/Frisur/Körperbau automatisch (gleiche Strategie wie Stage 20).

Sensible historische Uniformen (WW2 German Soldier) → neutrale, generische Wehrmacht-Felduniform ohne Hoheitsabzeichen / SS-Symbolik. Prompt enthält explizit "no political insignia, no swastikas, generic field uniform". Das ist Standard-Praxis bei Stock-Footage.

### Files to Edit

- `supabase/functions/generate-avatar-wardrobe/index.ts` (verschachtelte THEME_PACKS, sub_pack Param)
- `src/components/brand-characters/AvatarWardrobeSheet.tsx` (2-stufige Pills, Composite-Key)
- `src/components/video-composer/SceneAvatarMode.tsx` (subPack im selectedOutfit)
- `src/types/video-composer.ts` (Typ-Hinweis ergänzen)
- `.lovable/plan.md` (Stage 21 dokumentieren)

### Out of Scope

- Brand Props (Panzer/Gebäude/Objekte) → eigene Stage 22 falls gewünscht
- Auto-Migration alter flacher Einträge (User regeneriert einfach)
- 3-stufige Hierarchie (Theme → Sub → Sub-Sub)
- Gender-Split Outfits (würde Kosten verdoppeln)

### Kosten

- Pro Sub-Pack-Generierung: $0.02 (4 Outfits à $0.005)
- Lazy: nur generiert wenn User auf "Generate" klickt
- Cached danach permanent in DB

### Memory Update

`mem://features/avatars/wardrobe-theme-packs` → "**Hierarchical 2-tier theme packs**: 6 Themes × 23 Sub-Packs × 4 Outfits = 92 Outfit-Slots. `theme_pack` column stores composite key `theme:subpack` (e.g. `historical:ww2`). Lifestyle/Business/Historical/Fantasy/Sci-Fi/Sport, je 3-7 Sub-Packs."



## Fix: Missing `hubItemDesc.brandKit` translation key

### Problem
The hub config references `hubItemDesc.brandKit` but this key doesn't exist in any locale in `translations.ts`. The raw key string is displayed instead.

### Fix (1 file: `src/lib/translations.ts`)

Add `brandKit` to the `hubItemDesc` object in all 3 locales:

- **EN** (line ~1787): `brandKit: "Define your brand colors, logos and voice"`
- **DE** (line ~5594): `brandKit: "Definiere Markenfarben, Logos und Stimme"`
- **ES**: `brandKit: "Define los colores, logos y voz de tu marca"`

Also check and add `campaigns` key if missing from `hubItemDesc` in all locales:
- **EN**: `campaigns: "Plan and manage marketing campaigns"`
- **DE**: `campaigns: "Plane und verwalte Marketing-Kampagnen"`
- **ES**: `campaigns: "Planifica y gestiona campañas de marketing"`

Single-line additions — no structural changes needed.


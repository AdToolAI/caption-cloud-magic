

## Plan: TikTok Publishing Fix + TikTok-Vorschau

### Problem 1: "failed to parse header value"

Der `accessToken` aus `atob(connection.access_token_hash)` enthält vermutlich Whitespace, Newlines oder andere ungültige Zeichen. Deno's `fetch` lehnt solche Header-Werte ab.

**Fix in `supabase/functions/publish/index.ts`** (Zeile 809):
- Token nach `atob()` trimmen und bereinigen: `atob(...).trim().replace(/[\r\n]/g, '')`
- Zusätzlich vor dem Fetch-Call prüfen, ob der Token nicht leer ist

### Problem 2: Keine TikTok-Vorschau

In `src/components/composer/ComposerPreview.tsx` (Zeile 209-215) steht aktuell nur ein Platzhalter-Alert "TikTok-Vorschau ist aktuell nicht verfügbar".

**Fix:**
1. **Neue Komponente `src/components/post-generator/TikTokPostPreview.tsx`** erstellen — im TikTok-Stil (9:16 Hochformat, dunkler Hintergrund, Profilinfo rechts unten, Caption links unten, Musik-Bar unten)
2. **`ComposerPreview.tsx`** aktualisieren — den Alert durch die neue `TikTokPostPreview`-Komponente ersetzen, mit denselben Props wie die anderen Previews (mediaUrl, caption, hashtags, profileName etc.)

### Betroffene Dateien
- `supabase/functions/publish/index.ts` — Token-Bereinigung
- `src/components/post-generator/TikTokPostPreview.tsx` — Neue Komponente
- `src/components/composer/ComposerPreview.tsx` — TikTok-Preview einbinden


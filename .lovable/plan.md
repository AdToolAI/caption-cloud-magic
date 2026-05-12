
## Stage 25 — Outfit-Konsistenz, expliziter Generate-Button & gespeicherte Wardrobe Sheets

Drei Probleme aus dem Screenshot:
1. **Outfit driftet zwischen Perspektiven** (vorne hellblaues Hemd + grüne Hose, hinten beiges Hemd + Chinos, oben blaues Hemd + Sandalen). Gemini interpretiert den Outfit-Modifier pro Bild neu.
2. **Auto-Generate fühlt sich kaputt an** — Nutzer klickt, sieht plötzlich 4 leere Slots laden, ohne Kontext.
3. **Keine Persistenz**: das Wardrobe-Sheet existiert nur live, kann nicht in Szenen wiederverwendet werden.

---

### Teil 1 — Outfit-Lock via "Front-First Chain"

Statt 4 parallele unabhängige Calls jetzt **2 Phasen**:

```text
Phase A (1 call):  Portrait ─► FRONT render          (= Outfit-Anchor)
Phase B (3 par.):  Portrait + FRONT ─► back / side / top
                   - Portrait = Identity-Lock (Gesicht)
                   - FRONT    = Outfit-Lock (exakt gleiches Hemd, Hose, Schuhe, Farbe)
```

Backend (`generate-wardrobe-perspectives/index.ts`):
- Front-Call zuerst, mit explizitem Outfit-Modifier + Identity-Lock.
- Bei 3 weiteren Calls beide Bilder als `image_url` an Gemini, Prompt explizit:
  *"Same person AND same exact outfit as in reference image #2 — same shirt color, same pants, same shoes, same accessories. Only change the camera angle to {back/side/top}."*
- Bei Front-Fail → kompletter Abbruch mit klarer Fehlermeldung (kein Halb-Sheet).
- Robustere Negative-Cues: "do not change clothing, do not swap shirt, do not alter shoe type".

### Teil 2 — Expliziter "Generate"-Button

`WardrobePerspectiveCard.tsx`:
- `useEffect` Auto-Fire entfernen.
- Initial-State: 2×2 Grid mit Skeletton + großer Center-Button **"Generate 4 perspectives (~30s)"**.
- Während Lauf: Skeletons + Loader + Mini-Progress ("1 / 4 — Front locked, generating angles…").
- Nach Erfolg: zusätzlich der bestehende "Regenerate"-Knopf rechts oben.

### Teil 3 — "Save Outfit" → Library für bekleidete Avatare

Neue Tabelle `avatar_outfit_looks` (eine Zeile = ein gespeichertes 4-Perspektiven-Set):

| Feld | Typ | Zweck |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | RLS owner |
| `avatar_id` | uuid → brand_characters | parent avatar |
| `name` | text | "Sommer Casual", default = outfit_label |
| `theme_pack` | text | z. B. `casual:streetwear` |
| `outfit_id` | text | z. B. `linen-shirt` |
| `cover_url` | text | Front-Render = Cover |
| `front_url`, `back_url`, `side_url`, `top_url` | text | direkte Refs |
| `created_at` | timestamptz | |

RLS owner-only. Public-read NICHT — bleibt privat.

**Speichern-Flow** in `WardrobePerspectiveCard`:
- Sobald alle 4 Renders da sind → Button **"💾 Save outfit to library"**.
- Klick → Edge Function `save-outfit-look` (oder direkter Insert mit Client-RLS) speichert Zeile, kopiert die 4 Perspective-URLs, Toast "Saved to {avatar.name} → Outfits".

**Library-Anzeige** in `AvatarDetail.tsx`:
- Neuer Tab/Section unter dem Avatar: **"Saved Outfits"** (Grid aus Cover-Thumbnails).
- Klick auf eines → linke Spalte zeigt dieses 4-Perspektiv-Sheet sofort (kein Re-Generate, ist gecached).
- 3-Punkt-Menü pro Outfit: Rename, Delete, "Use in scene".

**Scene-Verwendung** (Composer & Director's Cut):
- `useUnifiedMentionLibrary` bekommt zusätzlichen Source-Type `avatar-outfit` mit `parent_avatar_id`, Cover als Thumbnail.
- Bei `@mention` eines Outfit-Looks wird im Prompt-Layer der **Front-Render** als Identity+Outfit-Reference injiziert (nicht das nackte Portrait), Label im Prompt = `{Avatar Name} in {Outfit Name}`.

---

### Files

**Migration**
- `avatar_outfit_looks` Tabelle + RLS (4 owner-policies)

**Edge Functions**
- `supabase/functions/generate-wardrobe-perspectives/index.ts` — Front-First Chain + Outfit-Lock Prompt
- `supabase/functions/save-outfit-look/index.ts` (neu, kann auch direkter Client-Insert sein — wir nehmen direkten Insert um eine Function zu sparen)

**Frontend**
- `src/components/brand-characters/WardrobePerspectiveCard.tsx` — Auto-Fire raus, Generate-Button, Save-Button
- `src/components/brand-characters/SavedOutfitsSection.tsx` (neu) — Grid + Klick-Restore + Rename/Delete
- `src/pages/AvatarDetail.tsx` — Saved-Outfits-Section unterhalb der Avatar-Karte einblenden, plus Wiring damit Klick die linke Spalte umschaltet
- `src/hooks/useSavedOutfits.ts` (neu) — list + create + delete mit React-Query
- `src/hooks/useUnifiedMentionLibrary.ts` — neue Quelle `avatar-outfit`
- `src/integrations/supabase/types.ts` — auto-update durch Migration

---

### Validation

1. Sheet generieren → alle 4 Perspektiven zeigen **identisches** Hemd, Hose, Schuhe (visueller Spot-Check)
2. Vor Generate: Card zeigt Skelette + sichtbaren "Generate"-Button — keine ungewollten API-Calls
3. Save klicken → Toast, Outfit erscheint sofort unter "Saved Outfits"
4. Klick auf gespeichertes Outfit → 4-Perspektiv-Sheet erscheint instant aus DB-Cache
5. `@`-Mention im Composer/DC zeigt das Outfit unter dem Avatar, Auswahl injiziert Front-Render
6. Pose Sheet & andere Tabs unverändert funktional

### Cost
- Generate-Cost bleibt ~4× Gemini Image (~€0.08 / Outfit-Sheet)
- Speichern + Wiederverwenden = **0 €** (alles aus DB-Cache)

---

### Offene Frage (kann beim Bauen entschieden werden)

Speicherort der gespeicherten Cover-URLs: Wir referenzieren die existierenden signed URLs aus `wardrobe_perspective_renders` 1:1 (5 Jahre Gültigkeit) und kopieren KEINE Storage-Files. Falls dort später gelöscht wird, broken — aber spart Speicher und verhindert Doppelzählung im Quota. → **Empfehlung: referenzieren, nicht duplizieren.**


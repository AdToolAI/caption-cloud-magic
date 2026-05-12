## A) Outfit-Lightbox (Bilder in Maximalauflösung ansehen)

**Problem:** Aktuell sind die 4 Perspektiven nur als kleine Tiles in `WardrobePerspectiveCard` und `SavedOutfitViewerCard` sichtbar — kein Zoom, keine Detailansicht.

**Lösung — neues `OutfitLightbox.tsx`:**
- Klick auf eine Perspektive (in `WardrobePerspectiveCard` **und** `SavedOutfitViewerCard`) öffnet einen Vollbild-Dialog (Radix `<Dialog>`).
- Layout im Lightbox:
  - Großes Bild (`object-contain`, max `90vh`/`90vw`, **Original-Auflösung der signed URL** — kein Downscale).
  - Linke/Rechte Pfeile + Tastatur-Shortcuts ←/→ um zwischen Front/Back/Side/Top zu blättern.
  - Mini-Thumbnail-Strip unten zur direkten Auswahl.
  - "Open original" Button → öffnet Bild in neuem Tab (ungezoomt, volle Pixel).
  - Optional: Pinch-/Wheel-Zoom (CSS `transform: scale()` mit Drag-Pan) — Phase 2 falls gewünscht.
- ESC schließt.

**Cursor-Hint:** Tiles bekommen `cursor-zoom-in` + Hover-Overlay mit Lupen-Icon, damit klar ist dass man klicken kann.

## B) Outfits im Motion Studio / AI Video Toolkit nutzen — Discoverability

**Aktueller Stand (technisch funktioniert schon, aber unsichtbar):**
- `useUnifiedMentionLibrary` injiziert gespeicherte Outfits bereits als `@AvatarName — OutfitName` in den `<PromptMentionEditor>`. Beim Mention wird die **Front-Render-URL** als Identity-Reference an den Provider übergeben.
- **Problem:** Kein Hinweis, kein Onboarding, keine sichtbare Sektion → User findet das nicht.

**Lösung — drei kleine UI-Hilfen, keine neue Logik:**

1. **"Use in Studio"-Aktionen direkt am gespeicherten Outfit**
   - In `SavedOutfitsSection` und `SavedOutfitViewerCard` neue Buttons hinzufügen:
     - **🎬 "Send to AI Video Toolkit"** → Navigation zu `/ai-toolkit?character=outfit:<id>` (oder via `sessionStorage`-Handoff `toolkit:incoming-character`).
     - **🎞 "Send to Motion Studio"** → analog `/video-composer?character=outfit:<id>`.
   - Beide Receiver-Pages lesen den Param/sessionStorage und setzen das Outfit als pre-selected Character (Reference-Image-Slot wird mit `front_url` gefüllt).

2. **Hint im PromptMentionEditor**
   - Wenn der User auf `@` tippt und gespeicherte Outfits existieren, in der Mention-Liste eine **separate Gruppen-Überschrift "Saved Outfits"** rendern (heute sind sie ohne Trennung am Anfang). Klein-Icon 👕 davor.

3. **Erklär-Hinweis auf der Avatar-Detailseite**
   - Über `SavedOutfitsSection` ein dezenter Info-Streifen:
     > "💡 Saved outfits sind im Motion Studio und AI Video Toolkit per `@AvatarName — OutfitName` verfügbar — die Identität bleibt automatisch konsistent."

## Files (nur Frontend, keine Backend-Änderungen)
- **Neu:** `src/components/brand-characters/OutfitLightbox.tsx`
- **Edit:** `src/components/brand-characters/WardrobePerspectiveCard.tsx` — Klick-Handler + Lightbox
- **Edit:** `src/components/brand-characters/SavedOutfitViewerCard.tsx` — Klick-Handler + Lightbox + "Send to …"-Buttons
- **Edit:** `src/components/brand-characters/SavedOutfitsSection.tsx` — "Send to …" Quick-Action im Hover-Menu + Info-Hinweis
- **Edit:** `src/components/composer/PromptMentionEditor.tsx` (oder Toolkit-Variante) — Gruppen-Header "Saved Outfits"
- **Edit:** Receiver in `VideoComposer/index.tsx` und AI-Video-Toolkit-Page — `?character=outfit:<id>` einlesen und Charakter vor-selektieren

## Validierung
1. Klick auf eine Perspektive → Lightbox öffnet, Bild in voller Auflösung, Pfeile/ESC funktionieren.
2. Klick "Send to AI Video Toolkit" auf gespeichertem Outfit → Toolkit öffnet, Outfit ist als Charakter vor-selektiert + Reference-Image gefüllt.
3. `@` im Prompt zeigt Sektion "Saved Outfits" oberhalb der normalen Charaktere.
4. Existing Save/Rename/Delete-Workflow unverändert.
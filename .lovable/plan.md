## Ziel

Aktuell ist der **Referenzbild-Upload** (`SceneReferenceImageUpload`) in der `SceneCard` nur sichtbar, wenn `scene.clipSource` mit `ai-` beginnt (Hailuo, Kling, Veo, Sora, AI-Image). In **Stock-Video**, **Stock-Image**, **Upload** und **anderen** Modi gibt es keine Möglichkeit, manuell ein Referenzbild zu setzen oder auszutauschen — obwohl das Bild u. a. für Continuity-Guardian, Brand-Character-Lock und spätere Engine-Wechsel relevant bleibt.

## Änderung

### `src/components/video-composer/SceneCard.tsx`

1. **`SceneReferenceImageUpload` aus dem AI-Block herauslösen** (aktuell innerhalb des `scene.clipSource.startsWith('ai-')`-Blocks bei Zeile 730).
2. Stattdessen **unterhalb** des modusspezifischen Blocks (AI / Stock / Upload) als **eigenständigen, immer sichtbaren Abschnitt** rendern.
3. **Visuelle Anpassung**: Klar als optionaler universeller Reference-Slot beschriften, mit kurzem Hinweistext je nach Modus:
   - AI-Modi: „Die KI orientiert sich am Bild (Image-to-Video)."
   - Stock/Upload: „Wird für Continuity, Brand-Character-Sync und spätere KI-Übergänge verwendet."
4. Lokalisierung (DE/ES/EN) analog zu bestehenden Strings im File.

### Verhalten

- Upload-, Drag&Drop- und Remove-Logik bleiben unverändert (keine Änderung in `SceneReferenceImageUpload.tsx` nötig).
- `scene.referenceImageUrl` wird weiter über `onUpdate({ referenceImageUrl })` persistiert.
- Bestehende Continuity-Guardian- und Style-Reference-Flows funktionieren unverändert.

## Technische Details

- **Datei**: `src/components/video-composer/SceneCard.tsx`
- **Entfernen**: `<SceneReferenceImageUpload … />` Block bei ~Zeile 730–735 innerhalb des AI-Conditional.
- **Neu einfügen**: nach dem Schließen der drei modusspezifischen Blöcke (AI, Stock, Upload — endet ~Zeile 820), als gemeinsamer Footer-Bereich der Scene-Card.
- Wrapper-Div mit dezentem Border (`border-dashed border-border/50`) und Mode-aware Hinweistext.

## Nicht im Scope

- Keine Änderungen an Edge Functions, Composer-Engine oder Datenbank.
- Keine Änderungen am Continuity-Guardian-Strip oder Brand-Character-Lock.
- Keine UX-Änderung für AI-Wizard / Auto-Director — nur die Scene-Card-Ansicht im Storyboard/Clips-Tab.

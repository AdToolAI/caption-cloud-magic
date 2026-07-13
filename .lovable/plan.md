## Ziel

Das generische `Sparkles`-Icon in `src/components/layout/Brand.tsx` durch ein individuelles AdTool-AI-Markenzeichen ersetzen, das zum James-Bond-2028-Design (Deep Black + Gold #F5C76A + Cyan-Akzente, Glassmorphism) passt.

## Schritte

1. **Logo generieren** (`imagegen--generate_image`, `premium`-Quality, transparenter Hintergrund):
   - Zielpfad: `src/assets/adtool-ai-logo.png`
   - Prompt-Richtung: Minimalistisches Mark aus stilisiertem „A" verschmolzen mit einem Play-/Filmklappen-Element, mattes Gold auf transparentem Hintergrund, luxuriös, editorial, keine generische AI-Ästhetik, keine Sparkles.
   - 1024×1024, `transparent_background: true`.

2. **Brand-Komponente aktualisieren** (`src/components/layout/Brand.tsx`):
   - `Sparkles`-Import entfernen.
   - Neues Logo als `<img>` mit `src={adtoolLogo}` einbinden (Import aus `@/assets/adtool-ai-logo.png`).
   - Größenklassen erhalten (`h-5 w-5` / `h-6 w-6`), `object-contain`, `alt="AdTool AI"`.
   - Hover-Rotation-Animation beibehalten (`group-hover:rotate-12`).

3. **Favicon nachziehen** (optional, gleiche Datei):
   - `public/favicon.png` per `code--copy` aus `src/assets/adtool-ai-logo.png` erzeugen.
   - `index.html`: `<link rel="icon">` auf `/favicon.png` + `type="image/png"` umstellen, alte `favicon.ico` löschen.

## Nicht Teil dieses Plans

- Änderungen an Auth-Screens, E-Mail-Templates, Loading-Screens (können in einem Folge-Turn nachgezogen werden, falls gewünscht).
- Farb-/Design-Token bleiben unverändert.

## Rückfrage nach Approval

Ich zeige dir das generierte Logo direkt nach Schritt 1; falls es nicht passt, iterieren wir per `imagegen--edit_image`, bevor der Brand-Swap live geht.

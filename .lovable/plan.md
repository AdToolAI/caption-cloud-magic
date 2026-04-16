

## Befund
Im Storyboard-Tab sehen User den automatisch generierten KI-Prompt (z. B. "Close-up of a stylish young woman..."), wissen aber nicht, dass:
1. Der Prompt **editierbar** ist (Textarea wirkt wie reine Anzeige)
2. Manuelle Anpassungen oft zu **besseren Ergebnissen** führen
3. Der KI-Prompt nur eine **Startvorlage** ist, nicht das finale Wort

→ Es fehlt ein klar sichtbarer Hinweis direkt am Prompt-Feld.

## Plan — Hinweis "Prompt anpassen für beste Ergebnisse"

### 1. Info-Banner über dem KI-Prompt-Feld
In `src/components/video-composer/SceneCard.tsx` (oder wo das Label "KI-Prompt (EN)" gerendert wird) direkt **unter** dem Label, **über** der Textarea, einen dezenten Info-Banner einfügen:
- Lampen-/Sparkles-Icon links
- Kurzer Text: *"💡 Tipp: Dieser KI-Prompt ist nur eine Vorlage. Passe ihn an dein Produkt und deine Vision an — je präziser, desto besser das Ergebnis."*
- Stil: kleines Banner mit `bg-primary/5 border border-primary/20 rounded-md p-2 text-xs text-muted-foreground`
- Erscheint nur bei AI-Quellen (`ai-hailuo`, `ai-kling`, `ai-sora`) — nicht bei Stock/Upload, da dort kein Prompt verwendet wird

### 2. Mikrocopy am Label verstärken
Label-Text ändern von `KI-Prompt (EN)` → `KI-Prompt (EN) — bearbeitbar`
- macht sofort klar, dass das Feld editierbar ist

### 3. Lokalisierung
Neue Keys in `src/lib/translations.ts` für DE/EN/ES:
- `videoComposer.promptEditableHint` — der Tipp-Text
- `videoComposer.promptEditableLabel` — das verstärkte Label

### 4. Optional: Beispielhafte Anpassungs-Hinweise
Unter dem Banner ein kleiner ausklappbarer Hinweis (collapsed by default) mit konkreten Beispielen:
- "Ergänze konkrete Details: Marke, Farbe, Setting, Stimmung"
- "Beschreibe wie das Produkt verwendet wird"
- "Nenne Kameraperspektive (Nahaufnahme, Totale, Drohne)"

→ Hält das Standard-UI ruhig, gibt aber Tiefe für Power-User.

## Geänderte Dateien
- `src/components/video-composer/SceneCard.tsx` — Banner über Textarea, Label-Text, optionaler Tipp-Block
- `src/lib/translations.ts` — neue Keys (DE/EN/ES)

## Verify
- Storyboard-Tab öffnen → über jedem KI-Prompt-Feld erscheint der Tipp-Banner
- Banner nur bei AI-Quellen sichtbar (nicht Stock/Upload)
- Label macht klar: Feld ist bearbeitbar
- Texte erscheinen auf DE/EN/ES korrekt — keine rohen Keys

## Was unverändert bleibt
- Prompt-Generierungs-Logik, Render-Pipeline, Pricing, Audio/Text-Overlay-System


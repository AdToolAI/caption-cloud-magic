## Ziel
Der `FeatureGuideDialog` (öffnet sich bei „Mehr erfahren" auf den 3 Mission-Karten) wird in den **Bond-2028-Look** gehoben — deep black, gold, glassmorph, Playfair-Titel — statt der aktuellen generischen weiß-lila-Optik mit Emoji-Icons.

## Neuer Aufbau (gleiche Datenquelle, neue Präsentation)

```text
╔══════════════════════════════════════════════╗
║ ▚ HERO-BAND (Gold→Cyan Gradient, glass)      ║
║   [Icon-Chip Gold]  01 · Kampagnen-Wizard   ║
║   Kampagnen skalieren                        ║  ← Playfair, gold gradient
║   Automatisiere wiederkehrende Aufgaben…     ║
╠══════════════════════════════════════════════╣
║  ▍ WAS IST DAS?  (Gold-Akzentbalken links)   ║
║    Beschreibung in ruhigem Body-Text         ║
╠══════════════════════════════════════════════╣
║  EINRICHTUNG                                 ║
║  ┌────────────────────────────────────────┐  ║
║  │ 01 ─┐                                  │  ║  ← Vertikale Timeline
║  │     │  Kampagnen-Wizard öffnen         │  ║     mit gold Connector-Line,
║  │     │  Navigiere zur Sidebar…          │  ║     Step-Nummer in Playfair,
║  │     │  → Zu Kampagnen                  │  ║     hover: Gold-Glow
║  │ 02 ─┤                                  │  ║
║  │     │  Kampagnenziel definieren        │  ║
║  │     │  …                               │  ║
║  └────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════╣
║  ✧ PRO-TIPP  (dunkles Panel, gold border)    ║
╠══════════════════════════════════════════════╣
║  [Docs ansehen]              [Jetzt starten →]║  ← Gold Button (Bond)
╚══════════════════════════════════════════════╝
```

## Umsetzung — nur `src/components/onboarding/FeatureGuideDialog.tsx`

1. **DialogContent Container**
   - `max-w-2xl`, dunkler Bond-Hintergrund: `bg-gradient-to-b from-[hsl(var(--background))] via-card/60 to-[hsl(var(--background))]`
   - `border-primary/20`, `shadow-[var(--shadow-glow-gold)]`, `backdrop-blur-2xl`
   - Radial Gold-Glow oben (absolute pseudo-Ellipse mit `bg-primary/10 blur-3xl`)
   - Custom Close-Button: rundes Icon, gold hover
   - Scrollbar-Styling: dünn, gold thumb

2. **Hero-Band** (ersetzt DialogHeader)
   - Kleine Kaps-Zeile in Cyan: `MISSION · 0X` (Step aus featureId ableiten: planMonth=01, optimizePerformance=02, scaleCampaigns=03)
   - Großes Icon in vergoldeter Chip-Box (48×48, Gradient primary→gold-dark, subtle glow)
   - Titel: `font-display` (Playfair), 2xl, mit Gold-Gradient auf zweitem Wort
   - Description: `text-muted-foreground`, Serifen-freundlich
   - Dünner Gold-Divider `bg-gradient-to-r from-transparent via-primary/50 to-transparent`

3. **„Was ist das?" Sektion**
   - Kein Box-Panel mehr — stattdessen linksseitige 2px gold Akzent-Bar + Serifen-Label „ÜBERSICHT" in Kaps
   - Sauberer Body-Text, keine Farb-Backgrounds

4. **Steps als Timeline**
   - Vertikale Gold-Linie (`w-px bg-gradient-to-b from-primary/60 via-primary/30 to-transparent`) als Connector zwischen Steps
   - Step-Nummer: 40×40 Kreis mit `border border-primary/40 bg-background/60 backdrop-blur`, Nummer in `font-display text-primary`
   - Hover-State: Kreis bekommt goldenen Glow (`shadow-[0_0_20px_hsl(var(--primary)/0.4)]`) und Nummer skaliert leicht
   - Step-Title: `font-semibold text-foreground`
   - Action-Button: Custom Link mit gold underline animation (story-link Pattern), Pfeil translatiert bei hover

5. **Pro-Tipp**
   - Dunkles Glas-Panel `bg-card/40 border-primary/30`
   - Label „PRO-TIPP" in Cyan-Kaps mit Sparkle-Icon (nicht Emoji)
   - Icon: `Sparkles` von lucide (klein, gold)

6. **Footer**
   - Border-top: gold-gradient statt plain border
   - Primary CTA: Gold-Verlauf `bg-gradient-to-r from-primary to-gold-dark text-background`, `shadow-[var(--shadow-glow-gold)]`, hover: intensiverer Glow (ersetzt die bestehende brand-500/fuchsia/pink Palette, die nicht ins Bond-System passt)
   - Secondary „Docs" Button: `variant="outline"` mit `border-primary/30 hover:border-primary/60 hover:bg-primary/5`

7. **Icons statt Emojis**
   - Emoji `📋` → `ListChecks` (lucide) in gold
   - Emoji `💡` → `Sparkles` in gold/cyan
   - Feature-Emoji (🚀, 📅, 📊) im Hero bleibt bewusst als warmer Akzent im vergoldeten Chip — passt zum Rest der Landing (die Mission-Karten haben auch echte Icons; hier ist das Guide-Emoji das einzige Bindeglied zur Datenschicht in `translations.ts`, das wir NICHT anfassen).

8. **Motion**
   - Dialog-Content: sanfte `scale-in` + `fade-in` bei Open (bereits im Dialog primitive drin)
   - Steps: `motion.div` mit `initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}}` staggered per Index (delay: `0.05 * i`)
   - Respektiert `useReducedMotion`

## Nicht enthalten
- Keine Textänderungen in `translations.ts` (Inhalte bleiben, nur Präsentation)
- Keine Änderung an anderen Onboarding-Dialogen
- Keine neuen Assets/Bilder — rein CSS/Tokens

## Design-Tokens
Nur bestehende: `primary`, `gold-dark`, `accent` (cyan), `card`, `background`, `foreground`, `muted-foreground`, `border`, `shadow-glow-gold`, `font-display`. Keine hartkodierten Farben.

## Datei
- **Geändert**: `src/components/onboarding/FeatureGuideDialog.tsx`
- **Neu**: keine

## Verifikation
- Typecheck via `tsgo`
- Manuell: Dialog öffnen für alle 3 Missionen (planMonth / optimizePerformance / scaleCampaigns) und prüfen dass Struktur (6 Steps + Pro-Tipp + Docs-Link) korrekt rendert

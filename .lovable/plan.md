## Was wirklich los ist (Befund nach Code-Check)

1. **Welcome-Sequenz spielt nur 1× pro Browser-Tab.**
   `StageWelcomeMoment.tsx` setzt `sessionStorage["motion-studio:welcomed-this-session"] = "1"` und blockt jeden weiteren Mount. → Beim erneuten Aufruf siehst du sie nicht.

2. **Quick / Direct / Studio sind tote Buttons.**
   `DirectorBar` schreibt `editorMode` zwar in `useStudioPreferences`, aber **nirgendwo** im Briefing (`BriefingTab.tsx`) oder Dashboard (`VideoComposerDashboard.tsx`) wird der Wert gelesen. → Klick ändert nur die Pille-Optik, sonst nichts.

3. **Briefing-Karten sind optisch unverändert.**
   `BriefingTab.tsx` rendert weiterhin Standard-`<Card className="border-border/40 bg-card/80">` für **Modus / Kategorie / Produkt / Stil / Visueller Stil / Charaktere / Pro-Tipp**. Die Soundstage-Layer (Spotlight, Grain, Scanlines) liegen nur **hinter** den Karten — die Karten selbst tragen kein Gold, kein Glas, kein Slate-Header. Deshalb wirkt es identisch zur alten Version.

## Plan — 3 zielgerichtete Fixes

### Fix 1 — Welcome-Sequenz bei jedem Studio-Besuch neu
`StageWelcomeMoment.tsx`:
- `sessionStorage`-Gate komplett entfernen.
- Sequenz startet bei jedem Mount von `MotionStudioStage` (= jedes Mal, wenn die Route `/video-composer` betreten wird).
- Skip per Klick / ESC / "Skip Intro"-Pill bleibt.
- `prefers-reduced-motion` bleibt respektiert (400ms-Fade).
- Optional in `DirectorBar`: kleines `Intro`-Icon (Replay-Pfeil) zum manuellen Re-Trigger via Custom-Event — nicht zwingend, aber sauber.

### Fix 2 — Quick / Direct / Studio funktional machen
Der Switch soll **sichtbar** das Briefing umformen, sonst ist er Deko.

Wir definieren pro Mode, welche Sektionen sichtbar sind:

| Sektion                  | Quick | Direct | Studio |
|--------------------------|:----:|:------:|:------:|
| Modus (KI/Manuell)       |  –   |   ✓    |   ✓    |
| Kategorie                |  ✓   |   ✓    |   ✓    |
| Produkt/Service (Basis)  |  ✓   |   ✓    |   ✓    |
| Produkt — erweitert (USPs, Zielgruppe, Tonalität)    |  –   | ✓ | ✓ |
| Stil & Format            |  Kompakt (nur AR + Dauer) | ✓ | ✓ |
| Visueller Stil           |  –   |   ✓    |   ✓    |
| Charaktere               |  –   |   –    |   ✓    |
| Pro-Tipp / Director's Note |  –   |   ✓    |   ✓    |
| Pricing-Banner           |  ✓   |   ✓    |   ✓    |

Umsetzung in `BriefingTab.tsx`:
- `const { prefs } = useStudioPreferences();` einmal oben einbinden.
- Pro Section: `{prefs.editorMode !== "quick" && (…)}` etc.
- Innerhalb der "Produkt"-Card per Mode-Check die erweiterten Felder (USPs / Zielgruppe / Tonalität) ein-/ausblenden.
- "Stil & Format" bekommt im Quick-Mode eine reduzierte Variante (nur Aspect-Ratio + Dauer-Slider).
- Mode-Wechsel animiert per Tailwind `transition-all` + `data-state`-Fade (200ms).

Damit ist der Unterschied **sofort sichtbar**: Quick = 2-3 Karten, Direct = ~6 Karten, Studio = alles inkl. Charaktere.

### Fix 3 — Briefing tatsächlich auf Soundstage-Optik skinnen
Wir ersetzen das `<Card>`-Default-Styling der **9 Briefing-Sektionen** in `BriefingTab.tsx` durch eine eigene Glass-Wrapper-Komponente.

**Neu:** `src/components/video-composer/stage/StagePanel.tsx` (~40 LOC) — Drop-in für `<Card>`:
- `bg-[#0b1120]/55 backdrop-blur-xl`
- 1px Gold-Hairline: `border border-amber-200/15`
- Inner-Top-Highlight + Drop-Shadow: `shadow-[inset_0_1px_0_hsla(43,90%,68%,0.12),0_30px_80px_-30px_hsla(43,90%,68%,0.18)]`
- `rounded-2xl`
- Slot für `slateIndex` (z.B. `01`) und `eyebrow` ("SCENE · BRIEFING") → rendert links einen kleinen Schwarz-Gold-Slate, rechts daneben die `Playfair`-Headline + Gold-Hairline darunter.

**Neu:** `src/components/video-composer/stage/DirectorsNote.tsx` (~25 LOC)
- Ersetzt den gelben "Pro-Tipp"-Block:
  - Linke vertikale Goldlinie (`border-l-2 border-amber-300/70`)
  - Mono-Caps-Label "DIRECTOR'S NOTE"
  - Body in `Playfair Display italic`, `text-amber-100/85`.

**Edit:** `BriefingTab.tsx`
- Alle 9 `<Card>`-Wrapper → `<StagePanel slateIndex="0X" eyebrow="…">` mit korrektem Section-Titel in Playfair.
- "Pro-Tipp"-Block → `<DirectorsNote>`.
- Primary-CTA ("Auto-Director" / "Storyboard generieren") bekommt Gold-Gradient-Variante: `linear-gradient(180deg,#F5C76A,#b78934)` + dunkler Text + Hover-Glow.
- 5-Schritt-Stepper (Briefing / Storyboard / VO / Musik / Export) bekommt Mini-Slate-Look statt Pills — verbunden durch dünne Goldlinie, aktiver Slate glüht.

Damit ist die Soundstage-Optik **in der Briefing-Fläche selbst** spürbar, nicht nur am Hintergrund.

## Files

**Edit**
- `src/components/video-composer/stage/StageWelcomeMoment.tsx` — sessionStorage raus.
- `src/components/video-composer/BriefingTab.tsx` — Cards → `StagePanel`, Mode-Gating, Pro-Tipp → `DirectorsNote`, CTA-Gold-Variante, Stepper-Slate.

**Create**
- `src/components/video-composer/stage/StagePanel.tsx` — Glass-Panel mit Take-Slate-Header.
- `src/components/video-composer/stage/DirectorsNote.tsx` — Director's-Note-Banner.

**Optional Touch**
- `src/index.css` — eine `stageCtaGlow` Keyframe für den CTA-Hover.

## Out of Scope
- Storyboard-Tab Re-Skin (kommt im nächsten Pass nach Briefing-Validierung).
- Audio-Engine, Render-Pipeline, Edge-Functions — bleiben unangetastet.
- Storyboard-Polaroids / AI-Co-Pilot (Phase 5).

## Aufwand
~0.5 Tag. Reine Frontend-/Presentation-Arbeit; keine Backend-, Render- oder Type-Schema-Änderung.
## Diagnose: Was der Kunde aktuell sieht

Aus deinen 3 Screenshots wird klar: **die Director Console funktioniert technisch — aber sie schreit den User an.** Auf einer Szene stapeln sich gerade:

1. Cinematic Looks Rail (12 Presets, horizontal scroll)
2. Shot Director (6 Dropdowns: Winkel, Licht, Bewegung, Bildausschnitt, Kamera, Objektiv)
3. Director Console — Live Prompt (Final Prompt mit Syntax-Highlighting + Negative Channel)
4. Director Score + Coach-Tipps (6 Chips + 2 Hint-Karten)
5. Anker (Face-Lock-Toggle)
6. Lip-Sync-Toggle
7. KI-Prompt (EN) Textarea — bearbeitbar
8. Engines vergleichen Button
9. Referenzbild Slot

**Das sind 9 vertikale Blöcke pro Szene.** Bei 5 Szenen = 45 Blöcke. Kein Mensch scrollt das. Das ist kein "Studio Set" — das ist ein Cockpit ohne Pilotenausbildung.

Artlist, Runway, Sora-UIs lösen das durch **eine harte Regel**: *Eine Aktion pro Bildschirm. Alles andere ist progressive disclosure.*

---

## Plan: "Studio Set" UX — drei Ebenen, eine Bühne

```text
┌──────────────────────────────────────────────────────────┐
│  SZENEN-KARTE (collapsed default)                        │
│  ┌─────┐ Hook · 4s · Hailuo 2.3 · Score 89 · Drehbereit │
│  │ 🎬  │ "Farmer schaut zum Sonnenaufgang…"     [▼ Open]│
│  └─────┘                                                 │
└──────────────────────────────────────────────────────────┘

         ↓ User klickt Karte → öffnet Studio-Bühne ↓

┌──────────────────────────────────────────────────────────┐
│  STUDIO-BÜHNE (expanded, eine Szene gleichzeitig)        │
│                                                          │
│  ┌────────────┐  ┌──────────────────────────────────┐   │
│  │            │  │  TAB: Story │ Look │ Cast │ Audio│   │
│  │  Preview   │  ├──────────────────────────────────┤   │
│  │  (Frame    │  │                                  │   │
│  │   oder     │  │  [Aktiver Tab-Inhalt]            │   │
│  │   Score-   │  │                                  │   │
│  │   Ring)    │  │                                  │   │
│  │            │  │                                  │   │
│  └────────────┘  └──────────────────────────────────┘   │
│                                                          │
│  [⚙ Erweitert ▼]  [👁 Final Prompt anzeigen]           │
└──────────────────────────────────────────────────────────┘
```

### Ebene 1 — Szenen-Karte (collapsed)
Pro Szene **eine Zeile** mit: Thumbnail-Frame, Titel-Slug, Dauer, Provider, Score-Pill (grün/gelb/rot). Reihenfolge per Drag. Mehr nicht. Das ist die Storyboard-Ebene.

### Ebene 2 — Studio-Bühne (4 Tabs statt 9 Blöcken)

| Tab | Was drin liegt | Was raus fliegt aus dem Sichtbaren |
|---|---|---|
| **🎬 Story** | Skript-Textarea, „Skript schreiben"-AI-Button, Dauer-Slider, Hook/B-Roll-Toggle | Negative Prompt, Engine-Selector |
| **🎨 Look** | Cinematic Presets (visuell als Karten mit echtem Beispiel-Frame statt Emoji), darunter Shot Director **kollabiert** in *einer Zeile*: „85mm · Dolly-In · Golden Hour · Eye-Level" mit „Anpassen"-Sheet | Die 6 Dropdowns wandern in ein Side-Sheet, nicht in den Hauptflow |
| **👥 Cast** | Charakter-Chips, Anker-Toggle, Multi-Char-Strategy | — |
| **🔊 Audio** | Voiceover-Lock, Lip-Sync, Musik-Hint | — |

### Ebene 3 — „Erweitert" (expert drawer)
Final Prompt mit Syntax-Highlighting, Negative Prompt Editor, Coach-Tipps mit Quality-Score-Breakdown, Reference-Image-Upload, Engines vergleichen.
**Default: zu.** Power-User klappen es einmal auf, Einsteiger sehen es nie.

---

## Konkrete UX-Vereinfachungen (Artlist-Standard)

1. **Cinematic Looks → echte Frame-Thumbnails statt Emojis**  
   Jeder Preset bekommt ein 16:9-Beispiel-Still (einmal pro Preset gerendert, gecached). Der User sieht *was er bekommt* statt eine 🎭-Emoji-Lotterie.

2. **Shot Director → "Smart Summary" statt 6 Dropdowns**  
   Ein Klick auf einen Preset füllt alles. Das Ergebnis steht als *natürlicher Satz* da: „85mm Dolly-In, Eye-Level, Golden Hour Side Light." Daneben ein „Feintuning"-Button, der die 6 Dropdowns in einem **Slide-Over-Sheet** öffnet — nicht inline.

3. **Director Score → von 6 Chips zu 1 Ring + 1 Satz**  
   Score 89 als Ring. Darunter EIN Coach-Satz, der wichtigste: *„Füge eine konkrete Linsenangabe hinzu für +6 Punkte."* Die Detail-Chips sind im Tooltip / im Erweitert-Drawer.

4. **Final Prompt verschwindet aus dem Default-View**  
   Stattdessen: **„Was die KI sehen wird"** — eine 3-Zeilen-Klartext-Zusammenfassung in DE/EN/ES (z.B. *„Sarah und Matthew im Weizenfeld bei Sonnenaufgang, Wide Shot, Drohne sichtbar, golden hour"*). Der echte EN-Prompt ist 1 Klick entfernt.

5. **Provider-Wahl wandert auf die Karte (collapsed)**  
   Steht schon auf der Storyboard-Karte als Pill. In der Bühne unsichtbar bis „Erweitert".

6. **„Skript schreiben" wird zur Hero-Action**  
   Großer goldener CTA oben in der Bühne, weil das die Aktion ist, die 90% der User wirklich treffen wollen. Alles andere ist Default-Magie.

7. **Workflow-Stepper links bleibt** — er ist gut. Aber Schritt 02 „Storyboard" sollte nach dem Öffnen der Bühne **automatisch zu Schritt 03 weiterleiten** wenn alle Szenen Score ≥ 70 haben → spart einen Klick.

---

## Was bleibt unverändert (technisch)
- `composeFinalPrompt` (8-Layer-Composer) bleibt 1:1 — er rendert weiter im Hintergrund
- `qualityScore.ts` bleibt — wir zeigen nur weniger davon
- `audioPlan` als Source-of-Truth bleibt
- Keine Edge-Function-Änderungen, keine DB-Migration nötig

**Das ist eine reine Frontend-/Information-Architecture-Reorganisation.**

---

## Umsetzungs-Phasen

| Phase | Inhalt | Files |
|---|---|---|
| **A** | Szenen-Karte collapsed-by-default + Score-Pill + Provider-Pill | `SceneCard.tsx` |
| **B** | Tab-Bühne (Story / Look / Cast / Audio) statt linearer Blöcke | `SceneCard.tsx` (split in `SceneStage.tsx` + 4 Tab-Komponenten) |
| **C** | Shot Director Smart-Summary + Side-Sheet für Feintuning | neu: `ShotDirectorSummary.tsx`, `ShotDirectorSheet.tsx` |
| **D** | „Was die KI sehen wird"-Klartext-Layer (DE/EN/ES) statt EN-Prompt im Default | neu: `PromptHumanReadable.tsx` |
| **E** | Score: Ring + 1 Satz statt Chip-Wand; Detail in Tooltip | `DirectorQualityCoach.tsx` (kompakte Variante) |
| **F** | „Erweitert"-Drawer für Power-User (Final Prompt, Negative, Engines vergleichen) | neu: `AdvancedDrawer.tsx` |
| **G** | Cinematic Presets mit echten Frame-Thumbnails (1× generieren + cachen) | `CinematicStylePresets.tsx` + `cinematic_preset_thumbs` Tabelle |

Phase A–F ist reine UI. Phase G hat eine kleine DB-Migration (Cache-Tabelle) und einen Einmal-Render-Job.

---

## Was ich von dir brauche

1. **Bestätigung der Tab-Aufteilung** (Story / Look / Cast / Audio) — oder lieber 3 Tabs (Story / Look / Audio) und Cast als Inline-Chip-Zeile?
2. **„Was die KI sehen wird" in Userlanguage statt EN-Prompt** — willst du das als Default oder nur on-demand?
3. **Cinematic Preset Thumbnails** — soll ich Phase G mit ein-planen (kostet ~12× Nano-Banana ≈ 0,24€ einmalig) oder erstmal weglassen?

Sobald du das beantwortest, baue ich Phase A–F in einem Rutsch.

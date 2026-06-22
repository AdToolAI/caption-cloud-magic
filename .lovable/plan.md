# Storyboard-Tab: Audit + Look-Lift

## 1) Was ich am Storyboard inhaltlich sehe (Screenshots)

**Verdrahtet & live (geprüft im Code):**
- Toolbar oben: `Szene hinzufügen`, `Engine für alle`, `Frame-First`, `Scene Library`, `Talking-Head`, `Alle generieren (n · €x)` → alle in `StoryboardTab.tsx` aktiv.
- **Cast Consistency Map** mit Reference/Chain/Prompt-Status → `CastConsistencyMap` rendert pro Szene den richtigen Anker-Typ.
- **Director Score** Badge mit Hinweisen ("Länge daneben — Prompt zu lang") → `useDirectorScore` läuft, Auto-Fix-Button vorhanden.
- **Scene aus Beschreibung** + **Auto-EN**-Übersetzung + Lock-Icon → `SceneDirectorBox` + `useAutoTranslateEn`.
- **Cast / Location / Bauwerk / Props** Picker mit @-Mentions → `useUnifiedMentionLibrary` injiziert in den Prompt.
- **Performance pro Charakter** (Mimik/Gestik/Blick/Energie 1-5) → wird in den Prompt komponiert, sichtbar im strukturierten KI-Prompt.
- **Story & Engine**: Modell-Dropdown, Dialog & Lip-Sync Toggle, Stock/KI/Eigenes Tabs, Slider für Dauer → alle in `SceneCard` verdrahtet.
- Rechte Spalte: pro-Szene `Generieren`-Button mit Status (WARTET/READY) + Kosten → `StoryboardScenePlayerList` ruft `generateScene` korrekt auf.

**Was *noch nicht* sichtbar zündet (ehrlich):**
- **Director Score "Auto-Fix"** kürzt Prompt heuristisch — funktioniert, aber wenn der Prompt von einem Mention-Block erzeugt wurde, regeneriert er sich beim nächsten Render wieder lang. → Bekanntes Verhalten, kein Bug, aber ich würde im Audit-Schritt einen "Prompt-Layer auto-trim" Hinweis vorschlagen (nicht jetzt umsetzen, nur dokumentieren).
- **Performance-Slots (Mimik/Gestik/Blick) "—"** im Screenshot: optional, leer = Fallback "natural". Funktioniert, aber Label sagt nicht klar "optional → auto". Reines Wording, kein Bug.
- **Frame-First Pipeline** Button öffnet das Still-Frame-Studio nur für die *aktuell selektierte* Szene — global "Frame-First für alle" gibt es noch nicht. Heute aber bewusst so dokumentiert.

→ Kurz: **alles Versprochene ist verdrahtet**, die zwei Punkte oben sind UX-Klarheit, kein Funktionsschaden.

## 2) Look-Lift auf Briefing-Niveau (nur Optik, keine Funktion anfassen)

Im `BriefingTab` sitzen die Sektionen in `StagePanel` (Bond-Glas, Gold-Halo, Slate-Header, Filament-Top). Im `StoryboardTab` und `SceneCard` sind die gleichen Inhalte heute in flachen `Card`-Containern. Wir heben sie auf das gleiche Niveau, ohne Props/Logik zu ändern.

### Änderungen (rein presentational)

**`src/components/video-composer/StoryboardTab.tsx`**
- "Wichtige Hinweise zur KI-Generierung" → in `StagePanel` mit `eyebrow="REEL · NOTES"`, `title="Wichtige Hinweise"` wrappen. Inhalt 1:1.
- "Cast Consistency Map" Wrapper → `StagePanel` mit `slateIndex="00"`, `eyebrow="CAST · CONTINUITY"`, `title="Cast Consistency Map"`, Accessory = Reference/Chain/Prompt-Legende (heute schon im Header).
- Empty-State Card (vor erster Szene) → ebenfalls `StagePanel`.

**`src/components/video-composer/SceneCard.tsx`** (nur die 5 Sub-Header, die schon existieren: Story & Engine, Cast, Aktion, Performance, Audio & Voiceover, Szene aus Beschreibung)
- Jede dieser Sektionen bekommt einen `StagePanel`-Wrapper mit passendem `slateIndex` (= Szenen-Nummer) und `eyebrow` (z.B. `STORY · ENGINE`, `CAST · LOCK`, `ACTION · BEAT`, `PERFORMANCE · CAST`, `AUDIO · VO`).
- Die internen Felder (Inputs, Dropdowns, Slider, Buttons, @-Mentions, Auto-EN, Lock, Strukturiert-Badge) bleiben *exakt* wie sie sind — kein Re-Wire, keine Prop-Änderung, kein State-Refactor.

**`src/components/video-composer/CastConsistencyMap.tsx`**
- Den äußeren `div` durch `StagePanel`-Inhalt-Slot ersetzen (oder Outer-Wrapping in StoryboardTab — ich entscheide nach Lesbarkeit beim Implementieren). Grid + Reference/Chain/Prompt-Icons bleiben.

**`src/components/video-composer/StoryboardScenePlayerList.tsx`** (rechte Spalte)
- Pro Szenen-Tile leichtes Bond-Glas (gleicher Gradient + Gold-Inset wie `StagePanel`, aber kompakter, ohne Slate-Header — sonst wird die rechte Spalte zu schwer). Status-Pille "WARTET" bleibt, Generieren-Button bleibt, Kosten bleiben.

### Was bewusst NICHT angefasst wird

- Keine Änderungen an `useDirectorScore`, `useAutoTranslateEn`, `useUnifiedMentionLibrary`, `generateScene`, `useSceneManager`, `compose-*` Edge Functions.
- Keine Änderung der Reihenfolge oder IDs der Felder (sonst brechen `data-tour`-Selektoren der Product-Tour).
- Keine Änderung an `StagePanel` selbst (wird vom Welcome/Briefing geteilt).
- Storyboard-Loader (`StageStoryboardLoader`) bleibt wie gerade gebaut.

## 3) Aufwand & Risiko

- ~3 Dateien anfassen, ~150-200 Zeilen rein Wrapper-JSX.
- Risiko: niedrig — nur visuelles Wrapping, alle bestehenden Children bleiben gleich.
- Verifizierung: Build muss durchlaufen, anschließend per Playwright-Screenshot Briefing vs. Storyboard vergleichen.

Soll ich es so umsetzen?

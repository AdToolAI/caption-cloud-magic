Du hast recht — die bisherigen Phasen haben Bausteine versteckt, aber das Grundproblem nicht gelöst: dieselben Inhalte werden 2-3x gezeigt und es gibt drei nebeneinander stehende „Stil"-Werkzeuge. Ein Kunde sieht heute auf einer einzigen Szene:

- denselben Prompt **dreimal** (Director Console „Live Prompt", KI-Prompt-Textarea, „Finaler Prompt (Vorschau)")
- **drei Stil-Tools** nebeneinander (Director Presets, Cinematic Looks, Shot Director)
- Cast-Zeile **doppelt** (oben in der Storyboard-Tabelle + nochmal in der Karte)
- Score, Anker, Lip-Sync, Effekte, Engine, Stock/KI/Eigenes-Tabs, Compare-Lab, Referenzbild — alles flach untereinander

Der „Erweitert"-Toggle aus Phase F war zu zaghaft (er hat nur Multi-Engine-Preview, Compare-Lab, Final-Prompt und StillFrame versteckt — nicht die wirklichen Lärmquellen).

## Ziel

Eine Szenenkarte sieht im Standard-Zustand nur noch das, was ein Kunde braucht, um die Szene zu **briefen** und zu **starten**. Alles andere wandert hinter klar benannte Knöpfe (Sheets/Drawer).

## Neue Struktur der Szenenkarte (Default)

```text
┌─ [::] [Hook ▾]  4s  €0,60  [B-Roll ▾]  [Matthew ·][Sarah ·][+]   [×] ─┐
│                                                                       │
│   [ Stock ] [ KI-Generiert ✓ ] [ Eigenes ]                            │
│                                                                       │
│   Modell:  Hailuo 2.3 Standard  · 720p · €0,15/s          [ Wechseln ]│
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │ Was soll in dieser Szene passieren?                             │ │
│   │ [ Textarea: ein einziges Prompt-Feld, EN, @-mentions ]          │ │
│   │                                                                 │ │
│   │ Stil:  [ Cyberpunk Neon ✓ ]  [ Stil ändern ]   [ ✨ Auto-Stil ] │ │
│   └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   ● Drehbereit · 94            [ Skript ]  [ Voiceover ]  [ Mehr ▾ ] │
└───────────────────────────────────────────────────────────────────────┘
```

Konkret heißt das:

### 1. Prompt nur noch EINMAL sichtbar
- **Behalten:** die editierbare Textarea (heute „KI-Prompt (EN) — bearbeitbar").
- **Entfernen aus dem Default-View:**
  - „DIRECTOR CONSOLE — LIVE PROMPT" Block mit dem token-farbigen `[2 ACTION] … [8 NEGATIVE] …` Preview.
  - „Finaler Prompt (Vorschau)" Block weiter unten.
  - „NEGATIVE_PROMPT (SEPARATE CHANNEL)" Block.
- **Wo gehen sie hin?** In ein neues Sheet **„Prompt-Details ansehen"** (Button rechts unter der Textarea, klein). Dort: Live-Prompt, Negative-Channel, Token-Farbcodierung, Multi-Engine-Vergleich, Compare-Lab — alles was heute „Director Console" + Phase-F-Drawer zeigt.

### 2. Stilauswahl auf EIN Werkzeug reduzieren
Heute konkurrieren **Director Presets**, **Cinematic Looks** (Rail mit Frame-Thumbs) und **Shot Director** (6 Dropdowns) um dieselbe Aufgabe.

- **Default-Sichtbar:** ein einzelner Chip „Stil: Cyberpunk Neon" + Button „Stil ändern".
- **„Stil ändern"** öffnet ein Sheet mit drei Tabs:
  - **Looks** (= bisherige Cinematic-Looks-Rail mit den 16:9-Frame-Thumbs aus Phase D — One-Click-Lösung für 95% der Kunden)
  - **Feintuning** (= bisheriger Shot Director mit 6 Achsen — für Power-User)
  - **Director Presets** (= Stil-Modifikatoren wie „Loft Film", für Power-User)
- Wenn ein Look gewählt ist: Chip zeigt Look-Namen + ein „×" zum Zurücksetzen. Kein Look gewählt → Chip „Kein Stil · Auto".
- Button **„✨ Auto-Stil"** schlägt anhand von Szenentyp + Cast einen Look vor (nutzt vorhandene `recommendEngineForScene`-Logik analog).

### 3. Director Score auf eine Zeile
- Statt eigener Box → kompakte Statuszeile am Kartenfuß: `● Drehbereit · 94` (Punkt-Farbe = Severity, Score klein dahinter).
- Klick auf die Zeile öffnet das bestehende `DirectorQualityCoach`-Detail-Panel (bleibt unverändert dahinter).

### 4. „Mehr ▾" Drawer für Sekundär-Funktionen
Ein einziger zusammenklappbarer Bereich am Kartenfuß sammelt alles, was heute frei herumliegt:
- **Anker / Face-Lock** (Charakter-Komposition, Nano-Banana-Kosten-Hinweis)
- **Lip-Sync zum Voiceover** Toggle
- **Effekte** (light-rays etc.)
- **Referenzbild (optional)** Upload
- **Übergang** (Harter Schnitt etc.)
- **SceneStillFrameStudio** (nur bei `ai-*` Quellen)

Default: **zu**. Beschriftung zeigt aktive Sekundär-Settings als kleine Pills, damit man auf einen Blick sieht „hier ist Lip-Sync an" — z.B. `Mehr ▾  · Lip-Sync · Anker komponiert`.

### 5. Cast-Zeile in der Karte verschlanken
- Die große Cast-Tabelle oben (S1-S6 mit Bildern + Erklärtext über Reference-Image / Frame-Chain) bleibt **außerhalb** der Karte (Storyboard-Header) — die ist gut.
- **Innerhalb** der Karte: nur die Cast-Pills im Header (`Matthew · Sarah · +`). Die zweite Zeile mit „Bis zu 4 Charaktere…" + „Charaktere werden automatisch im Prompt erwähnt" + Charakter-hinzufügen-Button entfällt; „+" Pill öffnet denselben CharacterCastPicker.

### 6. „Skript" und „Voiceover" als sekundäre Buttons
- Heute steht „Skript schreiben" als eigener prominenter Button mitten in der Karte. Wird zu einem schmalen Knopf in der Statusleiste neben dem Score, gleichwertig mit „Voiceover".

## Was bleibt unverändert
- Datenmodell, Logik, Edge-Functions, alle Hooks (`useBrandCharacters`, `composePromptLayers`, `resolveSceneCharacterAnchor`, …).
- Storyboard-Übersicht über der Karte (Cast-Matrix mit S1-S6).
- Workflow-Schiene links.
- Die Power-User-Werkzeuge selbst (Shot Director, Compare Lab, Multi-Engine-Preview, Director Presets) — sie ziehen nur in Sheets/Tabs um.

## Technische Umsetzung (kurz)

1. Neue Komponenten:
   - `ScenePromptDetailsSheet.tsx` (umfasst DirectorConsolePreview + Negative-Channel + Multi-Engine + CompareLab)
   - `SceneStyleSheet.tsx` (3 Tabs: Looks / Feintuning / Director Presets)
   - `SceneSecondaryDrawer.tsx` (Anker, Lip-Sync, Effekte, Referenzbild, Übergang, StillFrame)
   - `SceneStatusBar.tsx` (Score-Pill + Skript + Voiceover + „Mehr ▾")
   - `SceneStyleChip.tsx` (aktiver Look + „Stil ändern" + Reset)
2. `SceneCard.tsx` wird radikal entkernt: Header (bleibt) → Tabs (bleibt) → Modell-Zeile → Prompt-Block → StatusBar → SecondaryDrawer. Alles andere fliegt aus dem JSX, Logik bleibt in den neuen Komponenten.
3. `advancedOpen`-State und der „Erweitert"-Toggle aus Phase F werden durch das neue Schema ersetzt (gelöscht).
4. i18n DE/EN/ES für die neuen Labels („Stil ändern" / „Change style" / „Cambiar estilo", „Mehr" / „More" / „Más", „Prompt-Details" / „Prompt details" / „Detalles del prompt", „Drehbereit" bleibt aus DirectorQualityCoach).
5. Keine Backend-/DB-Änderungen.

## Phasen

- **Phase 1:** Prompt-Triplikat auflösen → `ScenePromptDetailsSheet` + Live-Prompt aus Default-View entfernen.
- **Phase 2:** `SceneStyleSheet` (3 Tabs) + `SceneStyleChip` → Cinematic Looks / Shot Director / Director Presets verschwinden aus dem Default-View.
- **Phase 3:** `SceneStatusBar` + `SceneSecondaryDrawer` → Score, Anker, Lip-Sync, Effekte, Referenzbild, Übergang, Skript-Button werden konsolidiert.
- **Phase 4:** Cast-Zeile verschlanken, Cleanup, i18n, visuelle Politur.

Sag „los" für Phase 1, oder gib Feedback an einzelnen Punkten (z. B. „Director Presets ganz raus" oder „Lip-Sync soll sichtbar bleiben").

## Ziel

Die Kling-Omni Sprecher-Blöcke sauber mit **Cast & World** verheiraten: pro Sprecher-Zeile eine **explizite Charakter-Zuweisung** über Dropdown — kein Auto-Sync im Hintergrund, keine widersprüchlichen Zustände zwischen "Anonymer Sprecher" und Cast-Auswahl.

## Ist-Zustand (Problem)

Aktuell laufen **zwei parallele Wahrheiten**:
- `castCharacterIds` aus dem `CharacterCastPicker` (bis zu 4 Charaktere für Anchor/First-Frame).
- `omniLines[]` mit optionaler `characterId` — wird via `useEffect` (Zeile 203-227) **automatisch** aus `castCharacterIds.slice(0, 2)` gespiegelt.

Daraus entstehen Widersprüche:
1. Nutzer wählt 3 Cast-Charaktere → Omni bekommt nur die ersten 2, Cast Nr. 3 taucht **im Anchor-Bild** auf, aber ohne Dialog/Voice — verwirrend.
2. Nutzer klickt "+ Zweiten Sprecher hinzufügen" **ohne** Cast → anonyme Zeile, aber Anchor zeigt gar keinen Charakter → Lip-Sync auf leerem Frame.
3. Nutzer entfernt einen Cast-Charakter → dessen Dialog-Zeile verschwindet plötzlich, evtl. mit bereits eingegebenem Text (Datenverlust).
4. Reihenfolge Cast ≠ Reihenfolge Sprecher-Blöcke → S1/S2 im Screenplay-Payload matcht nicht mit Left/Right im Anchor.

## Soll-Zustand (Ein Modell, eine Wahrheit)

**`omniLines` ist die einzige Quelle** für Omni-Sprecher. Cast & World liefert nur den *Pool* verfügbarer Charaktere. Jede Sprecher-Zeile hat:

```text
┌──────────────────────────────────────────────────────────────┐
│ [Portrait/Initial]  [Charakter ▼: Sarah Dusatko    ]  🗑     │
│                     [Voice-Preset ▼: Weiblich · warm    ]    │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Dialog von Sarah …                                     │   │
│ └────────────────────────────────────────────────────────┘   │
│                                             0/300 Zeichen    │
└──────────────────────────────────────────────────────────────┘
```

Charakter-Dropdown-Optionen:
- **Alle** `libCharacters` (Cast & World) — Portrait + Name.
- **"Anonym (Speaker N)"** als expliziter Eintrag ganz unten.
- Bereits in anderen Zeilen gewählte Charaktere sind **disabled** (kein Doppel-Cast pro Clip).

### Cast-Sync-Regel (klar, nicht magisch)

- **Cast-Auswahl fügt Sprecher-Zeilen nicht mehr automatisch hinzu.** Stattdessen: wenn `omniLines` leer ist und Nutzer im Cast-Picker Charaktere wählt, füllt sich Zeile 1 (und optional Zeile 2) **einmalig** vor — als Convenience, nicht als Live-Binding.
- Wählt der Nutzer im Dropdown einer Zeile einen Charakter, wird dieser **automatisch in `castCharacterIds` aufgenommen** (falls nicht schon drin, max. 4). So bleibt die Anchor-Komposition konsistent.
- Entfernt der Nutzer eine Sprecher-Zeile, bleibt der Charakter im Cast (falls andere Zeilen ihn brauchen oder als stummer Anchor-Beisteher gewünscht).
- **Cast-Charaktere ohne Sprecher-Zeile** = stumme Statisten im Anchor (max. 4 Cast, davon max. 2 mit Dialog). Amber-Hinweis unter dem Cast-Picker: „N Charaktere im Anchor, davon M mit Dialog."

### Payload-Vertrag (unverändert vom letzten Turn)

- `body.startImageUrl` = `composedFirstFrame` (Anchor mit **allen** Cast-Charakteren).
- `body.dialogText` = Screenplay-Format aus `omniLines` (`Name: Dialog\n`).
- `body.speakerVoices` = `[{ name, voice }]` nur für Zeilen mit non-empty `line`.
- `body.spokenLanguage`, `body.nativeLipSync=true`.

## Betroffene Dateien

- `src/components/ai-video/ToolkitGenerator.tsx`
  - **State-Modell**: `OmniLine.characterId` bleibt `string | null` (`null` = anonym).
  - **`useEffect` (Z. 203-227) ersetzen**: kein Zwangs-Sync mehr; stattdessen einmalige Vorbelegung, wenn `omniLines` alle leer + `characterId=null`.
  - **UI-Block (Z. 1197-1281)**: pro Zeile ein `<Select>` mit Charakter-Optionen (disabled bei Duplikaten) + Anonym-Option. Portrait aus `reference_image_url` mit Fallback-Avatar.
  - **Handler** `setLineCharacter(idx, charId)`: schreibt `omniLines[idx].characterId` und pusht `charId` in `castCharacterIds`, falls neu.
  - **Warnung**: Reduzierte Amber-Warnung — nur wenn > 2 Zeilen mit `line.trim()` (unmöglich per UI, aber defensiv) oder wenn `castCharacterIds.length > 4`.
- **Backend / Edge Function**: **keine Änderung**. `generate-kling-video` erhält denselben Payload.

## Verifikation

1. Kein Cast gewählt → 1 Sprecher-Zeile (Anonym), Voice+Dialog editierbar, Anchor = generisches Portrait (Fallback).
2. 1 Cast-Charakter gewählt → Zeile 1 vor-belegt mit diesem Charakter, Voice-Preset auf Default. Dialog leer.
3. 2 Cast-Charaktere → Zeile 1 & 2 (falls zweite hinzugefügt) vor-belegt.
4. Nutzer ändert in Zeile 1 den Charakter auf einen anderen Cast-Character → Cast bleibt komplett (nichts wird entfernt), Zuweisung ist eindeutig.
5. Nutzer wählt in Zeile 2 denselben Charakter wie Zeile 1 → Option ist disabled, nicht auswählbar.
6. Zeile mit `line=''` gelöscht → Cast-Charakter bleibt im Anchor als stummer Statist.
7. Generierung: Console-Log zeigt `dialog=..., speaker_voices=[...], start_image=<url>` korrekt.

## Nicht im Scope

- Kein Umbau von Motion Studio / SceneDialogStudio.
- Keine Änderungen am Anchor-Composer oder an `composedFirstFrame`.
- Keine Voice-Auto-Wahl aus `brand_characters.voice_settings` (kann Phase 2 sein — Kling-Omni-Presets sind eine andere Voice-Familie als ElevenLabs, nicht direkt mappbar).

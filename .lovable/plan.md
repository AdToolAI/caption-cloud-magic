## Problem

Im Composer-Storyboard zeigt der Cast-Picker einer Szene zwei Slots: einen mit "?" (kein Name, kein Avatar) und Matthew. Es lässt sich kein weiterer Charakter auswählen oder neu anlegen.

Zwei kooperierende Ursachen:

1. **Ghost-Slot**: `CharacterCastPicker` matcht `slot.characterId` strikt gegen `characters` (aus `briefing.characters`). Wenn die Storyboard-LLM eine ID wie `lib:matthew-…`, `matthew_dusatko` oder einen zweiten, in der Briefing-Liste nicht vorhandenen Charakter ausgibt, fällt das Matching durch → Tag rendert `?` und einen leeren Namen. Die Tolerant-Match-Logik aus `applyCastToPrompt.ts` (`findCharacter`) und `CastConsistencyMap.getAnchor` ist hier nicht angewendet.

2. **Keine Add-Quelle**: Der Picker zieht ausschließlich aus `briefing.characters`. Wenn der Nutzer nur Matthew im Briefing hat (oder den anderen Slot nicht zuordnen kann), ist `available` leer → der "Charakter hinzufügen"-Button verschwindet komplett. Es gibt auch keinen Weg, von hier aus einen neuen Brand-Charakter anzulegen.

## Fix

### 1. `src/components/video-composer/CharacterCastPicker.tsx` — tolerantes Matching + Ghost-Repair

- Tolerant-Lookup-Helfer (gleiche Logik wie `applyCastToPrompt.findCharacter`): exact id → first-name in id → full-name lower.
- Slot-Render nutzt diesen Lookup. Wenn ein Match gefunden wird, der aber eine andere `id` hat als `slot.characterId`, ruft der Picker einmalig `onChange` mit der **kanonischen** id auf (Self-Heal des Drifts), damit nachgelagerte Schritte (Anchor, Prompt, Render) wieder konsistent sind.
- Slots, für die wirklich kein Match existiert, werden visuell als "Unbekannt – entfernen?" mit deutlichem Reassign/X markiert (statt nur `?`), so dass der Nutzer sie aufräumen kann.

### 2. Picker-Quelle erweitern: gesamte Avatar-Library zeigen

- Neue optionale Prop `libraryCharacters?: ComposerCharacter[]`.
- Im Add-Popover werden Briefing-Cast und Library-Charaktere zusammengeführt (dedupe per id + Tolerant-Name-Match), Briefing-Einträge zuerst, Library mit Sektions-Label "Aus deiner Avatar-Bibliothek".
- Klick auf Library-Eintrag fügt den Slot hinzu **und** propagiert den Char nach `briefing.characters` (Composer-State), damit Anchor/Prompt-Pipeline ihn kennt.

### 3. "Neuen Charakter erstellen"-Link

- Am Ende des Add-Popovers ein dezenter Link **"+ Neuen Avatar erstellen"**, der `/brand-characters` in einem neuen Tab öffnet (i18n: de/en/es).
- Kein In-Place-Wizard — bewusst Out-of-Scope, um Scope minimal zu halten.

### 4. Wiring

- `src/components/video-composer/SceneCard.tsx` (Z. 716, 755): `libraryCharacters={brandCharsFromHook}` durchreichen, dazu Callback, der neue Library-Picks in `project.briefing.characters` mergt.
- `src/components/video-composer/StoryboardTab.tsx` (Z. 434) und `VideoComposerDashboard.tsx` (Z. 1095/1107): `useAccessibleCharacters()` einbinden und nach `ComposerCharacter`-Shape adaptieren (gleicher Adapter wie in `useUnifiedMentionLibrary.ts`), an SceneCard durchreichen.

## Out of Scope
- Kein Inline-Avatar-Wizard.
- Keine Änderungen an Anchor-Composition, Prompt-Marker oder Render-Pipeline.
- Keine Änderungen an HeyGen / Lip-Sync.

## Verifikation
1. Bestehende Szene mit Ghost-Slot: `?` wird durch korrekten Avatar ersetzt (Tolerant-Match) bzw. als "Unbekannt" klar markiert.
2. Add-Button erscheint, sobald entweder Briefing- oder Library-Chars verfügbar sind; Library-Sektion listet alle Avatare des Nutzers.
3. Auswahl eines Library-Charakters fügt ihn zur Szene UND zum Briefing-Cast hinzu; Anchor + Prompt enthalten den Namen.
4. "Neuen Avatar erstellen" öffnet `/brand-characters`.

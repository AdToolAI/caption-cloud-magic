# Storyboard: Charakter-Removal & weniger Charakter-Fokus

Zwei zusammenhängende Verbesserungen am Video Composer Storyboard.

## Problem

1. **Charakter lässt sich schwer aus einer Szene entfernen.** Sobald ein Charakter im Briefing erstellt wurde, hängt der Picker („Charakter: Richard Löwenherz · Detail") an jeder Szene. Das Entfernen geht nur versteckt über das Dropdown → „— keiner —". Es gibt keinen offensichtlichen X-Button.

2. **AI fixiert sich zu stark auf Charaktere.** Die System-Prompt-Regeln in `compose-video-storyboard` verteilen den Charakter quasi auf **alle** Szenen (1–2 full + 2–3 profile/back + 1–2 detail + 1–2 pov + „Rest" absent). In der Praxis landet dadurch in fast jeder Szene irgendein Charakter-Bezug — auch wenn die Story das gar nicht braucht. Zusätzlich ist die User-Prompt-Anweisung formuliert als „CHARACTER REQUIREMENT (non-negotiable)", was der AI keinen Spielraum lässt, Szenen ohne Charakter zu produzieren.

## Lösung

### 1. Sichtbarer Remove-Button pro Szene (UI)

In `CharacterShotBadge.tsx` → `CharacterShotPicker`:
- Wenn ein Charakter ausgewählt ist, zeigen wir rechts neben dem Shot-Type-Dropdown einen kleinen **X-Button** (Icon + tooltip „Charakter aus Szene entfernen" / „Remove character from scene" / „Quitar personaje").
- Klick ruft `onChange(undefined)` → entfernt `characterShot` komplett aus der Szene.
- Lokalisierung: DE/EN/ES wie überall sonst (lang-prop oder useTranslation).

Optional in `SceneCard.tsx`:
- Header-Bereich der Szene (dort wo `CharacterShotBadge` als Chip angezeigt wird, Zeile ~311) bekommt ebenfalls einen kleinen ✕ direkt am Chip — damit auch in der kompakten Ansicht (Strip / kollabierte Karte) entfernt werden kann.

### 2. AI-Storyboard rebalancieren (Edge Function)

In `supabase/functions/compose-video-storyboard/index.ts`:

**a) System-Prompt-Verteilung lockern (Zeilen ~188–193):**

Neue Distribution-Regeln:
- **Default = `absent`** (Charakter NICHT in der Szene). Nur dort einsetzen, wo es die Story wirklich verlangt.
- Maximal **40–50 % der Szenen** sollen einen Charakter zeigen, der Rest ist Welt/Objekt/Atmosphäre.
- Dabei weiterhin Variation der `shotType` über die Charakter-Szenen, aber ohne Mindest-Quoten pro Shot-Type.
- Explizite Anweisung: „If a scene works narratively without the character, prefer `absent`. The character is a recurring anchor, not the subject of every shot."

**b) User-Prompt entschärfen (Zeile ~234–235):**

Aus dem „CHARACTER REQUIREMENT (non-negotiable)" wird ein **„CHARACTER GUIDANCE"**:
- „The user defined recurring character(s) … Use them as a narrative anchor where it strengthens the story. **Not every scene needs to feature the character** — environmental, product, and atmospheric scenes are equally valuable. Aim for the character to appear in roughly half the scenes, with varied shotType."
- Damit darf die AI legitim `characterShot.shotType = "absent"` (oder `characterShot` weglassen) wählen, ohne gegen eine „non-negotiable" Regel zu verstoßen.

**c) Kein Eingriff in `pickClipSource`:** Die Stock-Footage-Logik (`hasCharacters && characterShot?.shotType !== 'absent'` blockiert Stock) bleibt unverändert — sie greift jetzt einfach öfter, was auch dem Kostenziel nutzt.

## Erwartetes Verhalten nach der Änderung

- Im Storyboard sieht der User pro Szene neben „Charakter: Richard Löwenherz · Detail" ein klares ✕, das den Charakter mit einem Klick aus genau dieser Szene entfernt.
- Bei AI-Generierung neuer Storyboards mit definierten Charakteren entstehen Szenen mit gemischtem Fokus: Welt/Produkt/Atmosphäre dominieren, der Charakter taucht gezielt als wiederkehrender Anker auf, statt in jeder Szene präsent zu sein.

## Geänderte Dateien

- `src/components/video-composer/CharacterShotBadge.tsx` (Remove-Button im Picker)
- `src/components/video-composer/SceneCard.tsx` (✕ am Header-Chip, optional)
- `supabase/functions/compose-video-storyboard/index.ts` (System- & User-Prompt rebalancieren)
- `src/lib/translations.ts` (3 neue Strings: removeCharacter / Charakter entfernen / Quitar personaje)

## Out of Scope

- Keine Änderung am Charakter-Library-Hook oder der Brand-Character-Konsistenz.
- Keine Datenmigration nötig — `characterShot` ist bereits optional im Schema.

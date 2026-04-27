# Plan: Style Picker × Shot Director Soft-Suggest

## Ziel

Wenn ein User einen **Visual Style** wählt (z. B. "Noir", "Cyberpunk", "Anime"), schlägt das System automatisch passende **Shot-Director-Defaults** vor — aber nur, wenn der User noch keine eigene Shot-Auswahl getroffen hat. Bestehende manuelle Auswahl bleibt unangetastet.

So bekommen Einsteiger mit einem Klick einen kompletten Look (Style + Kamera + Licht), während Power-User volle Kontrolle behalten.

## UX-Verhalten

- User klickt "Noir" im Style-Picker
- Wenn `shot_director` leer ist → automatisch setzen auf: `lighting: hard-noir`, `angle: low`, `framing: medium-close`, `movement: static` + dezenter Toast: *"Shot Director auf Noir-Defaults gesetzt — kannst du jederzeit ändern."*
- Wenn `shot_director` schon Werte hat → **nichts** wird überschrieben, kein Toast
- User kann jeden Slot manuell überschreiben oder den ganzen Shot Director resetten — der Style bleibt davon unberührt

## Mapping (12 Styles → Shot Defaults)

| Style | Framing | Angle | Movement | Lighting |
|---|---|---|---|---|
| Realistic | medium | eye-level | handheld | overcast |
| Cinematic | medium-close | eye-level | dolly-in | golden-hour |
| Comic | wide | low | static | hard-noir |
| Anime | medium | eye-level | static | soft-studio |
| 3D Animation | medium | low | orbit-right | soft-studio |
| Claymation | close-up | eye-level | static | soft-studio |
| Pixel Art | wide | eye-level | static | neon-cyberpunk |
| Watercolor | wide | eye-level | static | overcast |
| Noir | medium-close | low | static | hard-noir |
| Cyberpunk | medium | dutch-tilt | push-in | neon-cyberpunk |
| Vintage Film | medium | eye-level | static | golden-hour |
| Documentary | medium | eye-level | handheld | overcast |

(IDs werden gegen `src/config/shotDirector.ts` validiert)

## Surfaces

Wirkt überall, wo Style-Picker UND Shot Director nebeneinander leben:
1. **Video Composer** (`SceneCard.tsx`) — per-Szene
2. **Sora 2 Long-Form** — falls Style-Picker dort später hinzukommt (aktuell nicht, also kein Effekt)
3. **AI Video Toolkit** — Toolkit hat aktuell keinen Visual-Style-Picker, also auch hier kein Effekt
   → Effektiv betrifft die Änderung **nur den Composer**, ist aber als wiederverwendbare Utility gebaut

## Implementierung

### Neue Datei
- **`src/config/styleToShotDirector.ts`** — Mapping-Tabelle (oben) + Helper:
  ```ts
  export function suggestShotDirectorForStyle(
    style: ComposerVisualStyle,
    current: ShotSelection
  ): { selection: ShotSelection; applied: boolean }
  ```
  Gibt `applied: true` zurück nur wenn `current` leer war (`Object.keys(current).length === 0`).

### Änderung in `SceneCard.tsx`
- Wenn `onStyleChange` aufgerufen wird, vorher `suggestShotDirectorForStyle()` ausführen
- Bei `applied: true` → `onShotDirectorChange(selection)` + `toast({ title, duration: 3000 })`
- Toast lokalisiert (DE/EN/ES) mit Hinweis, dass Defaults überschreibbar sind

### Optional: Visual Hint im Style-Picker
Style-Chips bekommen ein kleines Camera-Icon (Lucide `Camera`, 10px, opacity 50%) als Tooltip-Hint: *"Setzt auch Shot Director (wenn leer)"*. Nur visuell, kein Funktionswechsel.

## Edge Cases

- **User wählt Style A → wechselt zu Style B**: Shot Director wurde durch A bereits gesetzt → ist nicht mehr leer → B überschreibt nicht. Korrekt (User sieht "leer→Noir gesetzt", spätere Wechsel sind frei).
- **User wählt Style → reset Shot Director → wählt selben Style erneut**: Soft-Suggest greift wieder. Erwartet.
- **Cinematic Style Presets (12 Director-Looks)**: Funktionieren weiter ohne Änderung — sie setzen Shot Director immer (das ist ihr Zweck).

## Files Touched

| File | Action |
|---|---|
| `src/config/styleToShotDirector.ts` | **NEU** — Mapping + Helper |
| `src/components/video-composer/SceneCard.tsx` | Style-Change-Handler erweitern, Toast |
| `src/components/ai-video/StylePickerCompact.tsx` | Optional: Camera-Hint-Icon |
| `mem://features/ai-video-studio/cinematic-style-presets.md` | Notiz: Soft-Suggest-Verbindung dokumentieren |

## Aufwand

~20 Min. Keine DB-Migration, keine neuen Dependencies, kein Edge-Function-Code.

## Was NICHT Teil des Plans ist

- Reverse-Mapping (Shot Director → Style vorschlagen): Skip — würde User verwirren
- Visual Style im Toolkit/Sora hinzufügen: separater Plan, nicht hier
- Cinematic Style Presets ändern: bleiben unverändert, sind komplementär zum Style-Picker

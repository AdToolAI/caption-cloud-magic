# Stil-Modus aufräumen — „ein Raum, kein Labyrinth"

## Problem (aus Screenshots)
- **Verzweigt**: Im „Stil ändern"-Dialog öffnet der Modifier-Tab einen weiteren Popover („Hinzufügen") mit eigenen Tabs → Dialog-im-Dialog-Gefühl.
- **Feintuning**: 6 Buttons öffnen jeweils einen eigenen Popover — viel Klickerei, kein Überblick über alle Achsen gleichzeitig.
- **Looks**: horizontaler Scroll-Rail schneidet Karten am Rand ab (siehe Screenshot „Cyberpunk Neon … Roman…").
- **Doppelte Header**: „Stil ändern" + Tabs + nochmal Modifier-Header + nochmal Shot-Director-Header.
- **Kein zentraler Status**: aktive Auswahl ist über drei Tabs verteilt; man sieht nie auf einen Blick, was gerade gesetzt ist.

## Ziel
Alle bestehenden Features behalten (Looks, Feintuning, Modifier), aber in **einem konsistenten Master-Detail-Layout ohne Popover-Stapel** zugänglich machen.

## Neues Layout für `SceneStyleSheet` (max-w-4xl)

```text
┌──────────────────────────────────────────────────────────────┐
│  🎨  Stil ändern                                       [×]   │
│  Aktiv: [Cyberpunk Neon ×] [Loft Film ×]  · Reset alles      │
├──────────────────────────────────────────────────────────────┤
│  [ ✨ Looks ]  [ 🎚 Feintuning ]  [ 🎞 Modifier ]            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Tab-Inhalt (siehe unten)                                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Vorschau (Cinematography-String, 1 Zeile, kursiv)           │
│                                       [ Zurücksetzen ] [✓]   │
└──────────────────────────────────────────────────────────────┘
```

Die obere **Status-Leiste** zeigt globale Chips für *jeden* aktiven Eintrag aus allen drei Tabs zusammen — der Kunde sieht sofort, was gesetzt ist, egal in welchem Tab er steht.

### Tab 1 · Looks (One-Click Director-Styles)
- Scroll-Rail → **responsives Grid** `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, keine abgeschnittenen Karten mehr.
- Aktive Karte: Goldring + Check-Badge (wie heute).
- Klick = wendet das gesamte Shot-Director-Set an (unverändert).

### Tab 2 · Feintuning (Shot Director, 6 Achsen)
Statt 6 Popover-Buttons → **Master-Detail in einem Panel**:
- Linke Spalte (≈ 200 px): Liste der 6 Achsen (Bildausschnitt, Winkel, Bewegung, Licht, Kamera, Objektiv) mit aktuellem Wert als Untertitel und Häkchen, wenn gesetzt.
- Rechte Spalte: Optionen der ausgewählten Achse als saubere klickbare Liste mit Label + Beschreibung. Klick = direkt setzen (kein Bestätigen).
- „Achse leeren" als kleiner Link unten in der rechten Spalte.
- Auf Mobile: kollabierter Accordion (immer nur eine Achse offen).

### Tab 3 · Modifier (Director Presets — Kamera/Objektiv/Licht/Mood/Filmstock)
- **Popover entfällt komplett.** Kategorien als horizontale Sub-Tabs direkt im Dialog (Kamera · Objektiv · Licht · Mood · Filmstock).
- Darunter dieselbe gerasterte Optionsliste wie heute, nur inline.
- `DirectorPresetPicker` bekommt eine neue `embedded`-Prop, die den eigenen Wrapper-Card + den `Hinzufügen`-Popover unterdrückt und stattdessen direkt die Tabs+Liste rendert.

### Sticky Footer
- Live-Preview des Cinematography-Suffix (`buildShotPromptSuffix`) als kursive Zeile, max 1 Zeile, truncate.
- Buttons: `Zurücksetzen` (alle drei Bereiche) + `Fertig` (schließt Dialog).

## Betroffene Dateien
- `src/components/video-composer/SceneStyleSheet.tsx` — komplettes Re-Layout (Header-Status-Leiste, Footer, breiterer Dialog, Tabs als Pills statt Standard-`TabsList`).
- `src/components/video-composer/SceneShotDirectorPanel.tsx` — neuer `layout="master-detail"`-Modus ohne Popover; alter Popover-Modus bleibt für Rückwärtskompatibilität in anderen Studios.
- `src/components/ai-video/CinematicStylePresets.tsx` — neue `layout="grid"`-Prop; bestehender Scroll-Rail bleibt für andere Aufrufer.
- `src/components/motion-studio/DirectorPresetPicker.tsx` — neue `embedded`-Prop, die Card-Wrapper + „Hinzufügen"-Popover entfernt und Kategorien als Tabs inline rendert.

## Was bewusst **nicht** geändert wird
- Logik der Auswahl, Speicherung in `scene.shotDirector` / `scene.directorModifiers`, Prompt-Suffix-Bau.
- Verhalten in anderen Studios (AI-Video-Toolkit etc.) — die alten Modi der drei Komponenten bleiben als Default erhalten, neue Layouts sind opt-in via Prop.
- i18n-Strings in `SceneStyleSheet` werden nur ergänzt (Status-Leiste, Footer-Vorschau, „Achse leeren"), nichts entfernt.

## Ergebnis für den Kunden
- Ein einziger Dialog, keine Popovers, keine zweite Modal-Ebene.
- Alle aktiven Stil-Entscheidungen oben auf einen Blick — überall entfernbar.
- Feintuning: alle 6 Achsen gleichzeitig sichtbar, ein Klick zur Option.
- Modifier: direkt sichtbare Kategorien-Tabs statt versteckter „Hinzufügen"-Button.
- Looks: keine abgeschnittenen Karten mehr.

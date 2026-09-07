# Generate-Bereich im AI Video Studio vereinfachen

## Problem

Der Tab "Generate" zeigt aktuell alles gleichzeitig untereinander: Modellauswahl, Prompt, Kino-Stile, Shot Director, Cast & World, Referenzbild mit Platzierung, Multi-Referenz, Video-Referenz, Dauer/Format/Qualität, Audio mit Sprachwahl und Hinweistexten, dazu mehrere Warnkästen. Das sind über ein Dutzend Blöcke, bevor man den Startknopf sieht. Für Einsteiger wirkt das wie ein Cockpit statt wie ein Werkzeug.

## Ziel

Ein ruhiger Standardzustand mit drei Schritten — Modell, Prompt, Start — und alles Weitere eine Ebene tiefer, jederzeit erreichbar. **Keine Funktion entfällt, keine Einstellung verschwindet, keine Logik ändert sich.** Es ändert sich nur, was sofort sichtbar ist.

## Neuer Aufbau

1. **Modell** — bleibt oben, unverändert.
2. **Prompt** — bleibt die visuell größte Fläche, mit "Optimieren".
3. **Kompakte Einstellungsleiste** direkt darunter: kleine Chips für Dauer, Format, Qualität und Ton (an/aus) — wie in der Referenz aus der Mobil-App. Jeder Chip öffnet die bestehende Auswahl in einem kleinen Popover. Die Chips zeigen den aktuellen Wert, also z. B. "8s", "16:9", "1080p", "Ton an".
4. **Startknopf mit Preis** — rückt dadurch deutlich weiter nach oben und ist ohne Scrollen erreichbar.
5. **Aufklappbare Bereiche** darunter, alle standardmäßig zu, mit Zähler-Hinweis wenn etwas gesetzt ist (z. B. "Cast & World · 2 Charaktere"):
   - **Look & Kamera** — Kino-Stile + Shot Director
   - **Cast & World** — Charaktere, Location, Gebäude, Requisiten
   - **Referenzen & Medien** — Startbild inkl. Platzierung, Multi-Referenz, Video-Referenz
   - **Ton im Detail** — gesprochene Sprache und die Modell-Hinweise (nur wenn das Modell Ton kann)
   - **Sprecher & Lip-Sync** — der Kling-Omni-Block (nur bei Omni, dann automatisch offen)

## Regeln, damit nichts verloren geht

- Ein Bereich öffnet sich automatisch, sobald er Inhalt hat oder für das gewählte Modell zwingend ist (z. B. Startbild bei einem reinen Bild-zu-Video-Modell, Omni-Sprecherblock).
- Warn- und Sperrhinweise (Modell kann kein Referenzbild, Omni-Medien-Sperre, Sprache nicht unterstützt) bleiben **immer sichtbar** und wandern nicht in zugeklappte Bereiche — sie erscheinen direkt über dem Startknopf.
- Der Öffnungszustand der Bereiche wird lokal gemerkt, damit Profis ihre Ansicht behalten.
- Alle drei Sprachen (DE/EN/ES) werden für die neuen Beschriftungen gepflegt.

## Technische Details

- Datei: `src/components/ai-video/ToolkitGenerator.tsx` (1916 Z.) — reine Umgruppierung des JSX ab Zeile 991. State, Effekte, Capability-Sync, Dispatch (`handleGenerate`), Kosten-Gate und Dialoge bleiben unangetastet.
- Neue Präsentationskomponenten unter `src/components/ai-video/generate/`:
  - `QuickSettingsBar.tsx` — Chip-Leiste (Dauer/Format/Qualität/Ton) über `Popover` + bestehende `Select`-Optionen aus `model.durations`, `model.aspectRatios`, `model.resolutions`.
  - `GenerateSection.tsx` — dünner Wrapper um `Collapsible` mit Titel, Badge-Zähler und `defaultOpen`-Regel.
- Kein Eingriff in `ModelSelector`, `ShotDirectorPanel`, `CinematicStylePresets`, `ToolkitCastWorldPicker`, `MultiReferenceUploader` — sie werden nur in die neuen Wrapper gesetzt.
- Der bestehende Settings-`Card` (Zeile 1384–1771) wird aufgeteilt: Dauer/Format/Qualität/Ton-Schalter in die Chip-Leiste, Sprachwahl + Hinweistexte in den Abschnitt "Ton im Detail", Omni-Block in "Sprecher & Lip-Sync".
- Keine Änderung an Preisen, Modell-Fähigkeiten, Provider-Routing, Lip-Sync-Kette oder Backend.

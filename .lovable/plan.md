# Eingaben nach dem Start automatisch leeren (AI Video Studio · Generate)

## Problem

Nach dem Start einer Generierung bleiben Prompt, Startbild, Video-Referenz und weitere Referenzbilder im Eingabefeld stehen. Für das nächste Video muss man alles von Hand löschen.

## Ziel

Sobald eine Generierung erfolgreich gestartet wurde, ist das Formular für das nächste Video frei — ohne dass man versehentlich Arbeit verliert.

## Was passiert nach dem Start

Geleert wird:
- der Prompt (inklusive des lokal gemerkten Prompt-Entwurfs)
- das hochgeladene Startbild
- die Video-Referenz
- die zusätzlichen Referenzbilder
- die gesprochenen Zeilen im Sprecher-Bereich

Erhalten bleibt (bewusst):
- gewähltes Modell, Dauer, Format, Qualität, Ton und Sprache
- Auswahl aus Cast & World (Charaktere, Location, Gebäude, Requisiten) und die Kamera-/Stil-Einstellungen

Nur bei erfolgreichem Start. Schlägt der Start fehl oder reicht das Guthaben nicht, bleibt alles unverändert stehen.

## Sicherheitsnetz

Die Erfolgsmeldung bekommt eine Schaltfläche „Rückgängig", die Prompt und Medien einmalig zurückholt, falls jemand das Geleerte doch noch braucht.

## Technische Details

- Datei: `src/components/ai-video/ToolkitGenerator.tsx`.
- Neue Funktion `resetInputsAfterStart()`: setzt `prompt`, `startImageUrl`, `referenceVideoUrl`, `viduReferences`, `omniLines` zurück und entfernt `ai-video-toolkit:prompt-draft` sowie die zugehörigen Felder im gespeicherten `ai-video-toolkit:setup-draft`.
- Aufruf in `runGenerate` im Erfolgszweig, direkt vor `refetchWallet()` / `onAfterGenerate?.()` — nicht im `catch`.
- Vorheriger Zustand wird vor dem Leeren in einer Ref gesichert; die `toast.success`-Meldung erhält eine `action` („Rückgängig" / „Undo" / „Deshacer"), die ihn wiederherstellt.
- Reine Formular-/Darstellungslogik: keine Änderung an Preisen, Modell-Fähigkeiten, Provider-Routing, Kosten-Gate oder Backend.
- Beschriftungen in DE/EN/ES über das bestehende `tx({...})`-Muster.

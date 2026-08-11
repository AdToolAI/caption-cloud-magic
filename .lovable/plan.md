# Muster-Briefing im Briefing-Tab

Ziel: Kunden sehen direkt am Eingabefeld, wie ein Briefing aufgebaut sein muss, damit die KI-Analyse alles korrekt erkennt und ins Storyboard überträgt.

## Was die Analyse sicher erkennt

- **Länge** und **Szenenanzahl** nur als eigene Zeilen (`Länge: 30 Sekunden`, `Szenen: 3`), nicht im Fließtext.
- **Cast und Orte ausschließlich als @-Mention** (`@founder`, `@home-office`) — Klarnamen ohne @ werden nicht gegen Cast & World aufgelöst.
- **Dialogzeilen** nur mit vorangestellter Sprecher-Mention (`@founder: "…"`), sonst landen sie als Voiceover.
- **Kamera** nur aus dem festen Vokabular (Framing, Winkel, Bewegung, Licht) — Kameraprosa wird verworfen.
- **Stimme, Untertitel, Negative Prompt** als Schlüssel-Wert-Zeilen am Ende.
- **Kein On-Screen-Text** in Szenenbeschreibungen (Hooks, CTAs, Untertitel) — die Analyse ignoriert ihn dort bewusst.

## UI: Hilfe direkt am Eingabefeld

Über dem Beschreibungs-/Briefing-Textfeld in Stage 02 kommt eine schmale Hilfszeile:

```text
Beschreibung                       [ Aufbau ansehen ]  [ Muster einfügen ]
┌───────────────────────────────────────────────────────────────────────┐
│  … Briefing-Textfeld …                                                │
└───────────────────────────────────────────────────────────────────────┘
```

- **Aufbau ansehen** öffnet ein Sheet mit dem vollständigen Muster-Briefing (monospace, scrollbar), einer kurzen Feldreferenz („welche Zeile füllt was im Storyboard") und dem Anti-Muster-Abschnitt mit den fünf häufigsten Fehlern. Enthält einen Kopieren-Button.
- **Muster einfügen** schreibt die Vorlage in das leere Feld; ist bereits Text vorhanden, kommt eine Rückfrage vor dem Überschreiben.
- Stil nach James Bond 2028: Ghost-Buttons, Mono-Uppercase-Tracking, Gold nur als Hover-Akzent.

## Inhalt des Musters

Beispiel-Spot 9:16, 30 Sekunden, 3 Szenen, zwei Sprecher mit echtem Dialog, ein Ort, Shot-Direktion pro Szene, Voice-/Caption-/Negative-Prompt-Block. Vollständig lokalisiert in DE, EN und ES.

## Technische Details

- Vorlage und Feldreferenz als einzige Quelle in `src/lib/video-composer/briefingTemplate.ts` (Objekt je Sprache), damit Sheet, Einfügen-Aktion und Dokumentation nicht auseinanderlaufen.
- Neue Komponente `src/components/video-composer/BriefingTemplateSheet.tsx`, eingebunden in `BriefingTab.tsx` oberhalb des Textfelds in Stage 02.
- Zusätzlich `docs/briefing-musterbeispiel.md` als Referenz für Support und Onboarding.
- `src/lib/video-composer/__tests__/briefingTemplate.test.ts` prüft mit den bestehenden Detektoren, dass das Muster genau 30 s, 3 Szenen und eindeutige @-Mentions ergibt — so veraltet die Vorlage nicht still, wenn sich die Parser ändern.
- Keine Änderungen an Edge Functions oder Prompts.

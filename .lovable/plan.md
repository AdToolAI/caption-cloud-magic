# Muster-Briefing dort, wo das Briefing wirklich eingefügt wird

Ziel: Kunden sehen genau an der Stelle, an der sie ihr Briefing eintippen oder einfügen, wie es aufgebaut sein muss, damit die KI-Analyse alles korrekt erkennt und ins Storyboard überträgt.

Platzierung: Hauptplatz ist der **Briefing-Import-Dialog** — das ist die Fläche, in die Kunden ihr komplettes Briefing kleben. Dort steht heute ein Beispiel im Placeholder, das beim ersten Tastendruck verschwindet und ein anderes Format zeigt als das, was die Analyse optimal parst. Am Beschreibungsfeld in Stage 02 kommt nur ein dezenter Link auf dieselbe Vorlage.


## Was die Analyse sicher erkennt

- **Länge** und **Szenenanzahl** nur als eigene Zeilen (`Länge: 30 Sekunden`, `Szenen: 3`), nicht im Fließtext.
- **Cast und Orte ausschließlich als @-Mention** (`@founder`, `@home-office`) — Klarnamen ohne @ werden nicht gegen Cast & World aufgelöst.
- **Dialogzeilen** nur mit vorangestellter Sprecher-Mention (`@founder: "…"`), sonst landen sie als Voiceover.
- **Kamera** nur aus dem festen Vokabular (Framing, Winkel, Bewegung, Licht) — Kameraprosa wird verworfen.
- **Stimme, Untertitel, Negative Prompt** als Schlüssel-Wert-Zeilen am Ende.
- **Kein On-Screen-Text** in Szenenbeschreibungen (Hooks, CTAs, Untertitel) — die Analyse ignoriert ihn dort bewusst.

## UI

**1) Import-Dialog (Hauptplatz)**

```text
Briefing importieren
[ Muster-Briefing einfügen ]        [ Aufbau & Regeln ]
┌───────────────────────────────────────────────────────────────────────┐
│  … großes Briefing-Textfeld …                                         │
└───────────────────────────────────────────────────────────────────────┘
```

- **Muster-Briefing einfügen** schreibt die Vorlage ins leere Feld; bei vorhandenem Text erst Rückfrage.
- **Aufbau & Regeln** klappt direkt über dem Feld einen kompakten Block auf: das vollständige Muster in Monospace, die Feldreferenz („welche Zeile füllt was im Storyboard") und die fünf häufigsten Fehler. Mit Kopieren-Button, bleibt sichtbar während man tippt.
- Der bisherige Placeholder-Text wird auf eine kurze Ein-Zeilen-Version gekürzt, damit er nicht mehr mit der Vorlage konkurriert.

**2) Beschreibungsfeld Stage 02 (Sekundär)**

- Nur ein Ghost-Link „Aufbau ansehen" neben dem Label, der dieselbe Vorlage in einem Sheet öffnet. Kein Einfügen-Button, weil dieses Feld die Produktbeschreibung ist und kein Vollbriefing.

Stil nach James Bond 2028: Ghost-Buttons, Mono-Uppercase-Tracking, Gold nur als Hover-Akzent.


## Inhalt des Musters

Beispiel-Spot 9:16, 30 Sekunden, 3 Szenen, zwei Sprecher mit echtem Dialog, ein Ort, Shot-Direktion pro Szene, Voice-/Caption-/Negative-Prompt-Block. Vollständig lokalisiert in DE, EN und ES.

## Technische Details

- Vorlage und Feldreferenz als einzige Quelle in `src/lib/video-composer/briefingTemplate.ts` (Objekt je Sprache), damit Sheet, Einfügen-Aktion und Dokumentation nicht auseinanderlaufen.
- Neue Komponente `src/components/video-composer/BriefingTemplateSheet.tsx`, eingebunden in `BriefingTab.tsx` oberhalb des Textfelds in Stage 02.
- Zusätzlich `docs/briefing-musterbeispiel.md` als Referenz für Support und Onboarding.
- `src/lib/video-composer/__tests__/briefingTemplate.test.ts` prüft mit den bestehenden Detektoren, dass das Muster genau 30 s, 3 Szenen und eindeutige @-Mentions ergibt — so veraltet die Vorlage nicht still, wenn sich die Parser ändern.
- Keine Änderungen an Edge Functions oder Prompts.

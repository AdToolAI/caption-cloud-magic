# Muster-Briefing für die KI-Analyse

Dieses Dokument beschreibt das Format, das die Briefing-Analyse (`analyze-briefing`)
vollständig und verlustfrei ins Storyboard überträgt. Die verbindliche Quelle der
Vorlage ist `src/lib/video-composer/briefingTemplate.ts` — dort liegen die
lokalisierten Fassungen (DE/EN/ES), die in der App über „Muster-Briefing einfügen"
und „Aufbau & Regeln" angeboten werden.

## Vorlage (DE)

```text
Projekt: AdTool AI — Launch Spot
Format: 9:16
Länge: 30 Sekunden
Szenen: 3

Cast:
@founder — Gründerin, 32, ruhig-souverän
@kundin — Kundin, 28, skeptisch, dann überzeugt

Orte:
@home-office — helles Loft-Büro, große Fensterfront

Ziel: Zeigen, dass ein Creator mit AdTool AI ein ganzes Studio ersetzt.

Szene 1 — Der Zweifel
Dauer: 10 Sekunden
Ort: @home-office
Cast: @kundin
Kamera: medium-close-up, eye-level, slow-push-in, soft-window
Aktion: Sie scrollt durch ihren Feed, lehnt sich zurück, Stirn in Falten.
Voiceover: "Jede Woche neuer Content — und du machst alles allein."

Szene 2 — Die Wende
Dauer: 12 Sekunden
Ort: @home-office
Cast: @founder, @kundin
Kamera: medium, three-quarter, tracking, natural
Dialog:
@founder: "Du brauchst kein Team. Du brauchst ein Studio."
@kundin: "Und das läuft wirklich in einem Tool?"
@founder: "Briefing rein, fertiger Spot raus."

Szene 3 — Der Beweis
Dauer: 8 Sekunden
Ort: @home-office
Cast: @founder
Kamera: close-up, frontal, static, golden-hour
Aktion: Sie dreht den Bildschirm zur Kamera, zufriedenes Nicken.
Voiceover: "Ein Creator. Ein ganzes Studio."

Stimme: ElevenLabs, eleven_multilingual_v2, Stability 0.45, Speed 1.0
Untertitel: an, Position bottom, max 4 Wörter, Highlight #F5C76A
Negative Prompt: keine Logos, keine Schrift im Bild, keine Zuschauer
```

## Feldreferenz

| Zeile | Wirkung im Storyboard |
| --- | --- |
| `Länge: 30 Sekunden` | Gesamtlänge, verteilt die Sekunden auf die Szenen |
| `Szenen: 3` | Erzwingt exakt diese Szenenanzahl |
| `@founder`, `@home-office` | Auflösung gegen Cast & World, Anhang an die Szene |
| `Dauer: 10 Sekunden` | Länge der einzelnen Szene |
| `Kamera: …` | Framing, Winkel, Bewegung, Licht (festes Vokabular) |
| `@founder: "…"` | Dialogzeile mit Sprecherzuordnung (Lip-Sync) |
| `Voiceover: "…"` | Off-Text der Szene für Sprachausgabe und Untertitel |
| `Stimme` / `Untertitel` / `Negative Prompt` | Globale Projekteinstellungen |

## Häufigste Fehler

1. Namen ohne `@` — werden nicht gegen Cast & World aufgelöst.
2. Länge und Szenenanzahl nur im Fließtext statt als eigene Zeilen.
3. Kameraprosa statt Vokabular (`slow-push-in`, `eye-level`, `soft-window` …).
4. Dialog ohne Sprecher-Mention — landet als Voiceover statt als Lip-Sync.
5. Hooks, CTAs oder Untertitel in der Szenenbeschreibung — Text im Bild wird ignoriert.

## Wartung

`src/lib/video-composer/__tests__/briefingTemplate.test.ts` prüft für alle drei
Sprachen, dass die Vorlage 30 Sekunden, 3 Szenen mit passender Sekundensumme,
eindeutige @-Mentions, sprecherpräfigierte Dialogzeilen und ausschließlich
gültiges Shot-Vokabular enthält.

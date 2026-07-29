## Was jetzt steht — KI-Autopilot (Anchor-First)

### Grundidee
Qualität wird in der **billigen Stufe** entschieden: Pro Szene entsteht erst ein Standbild (Anker), das von einer Vision-KI bewertet und ggf. repariert wird. Erst wenn das Bild besteht, wird die teure Animation gestartet. Dadurch kommen wir ohne "Best-of-3"-Verschwendung nah an konstante Qualität.

### Denk-Bibliothek (`src/lib/autopilot/`)
- `types.ts` — feste Szenen-Grammatik (Subjekt, Aktion, Umgebung, Shot, Kamera, Licht, Stimmung, Dialog, Charaktere/Props). Die KI füllt nur Felder, sie schreibt nie den Prompt.
- `promptGrammar.ts` — deterministischer Prompt-Compiler (Anker-Prompt ohne Kamerabewegung, Motion-Prompt mit Bewegung), globale Negativ-Klausel, Risiko-Kamerabewegungen werden bei kurzen Clips automatisch entschärft, Wortbudget-Klammer.
- `rhythm.ts` — Szenendauern nach Erzähl-Beat gewichtet (Hook kurz, Reveal länger) statt gleichlanger Blöcke.
- `soundDesign.ts` — Ambience-/Foley-Plan pro Szene, damit Clips nicht steril klingen.
- `genres.ts` — 8 Rezepte (Ad-Spot, Produktdemo, Corporate, Storytelling, Testimonial, Explainer, Social Hook, Image Post).
- `preflight.ts` — Blocker-Prüfung vor Freigabe (fehlende Voice-ID, fehlende Charaktere, Dauerkonflikte).

### Backend (Edge Functions)
- `autopilot-treatment` — Briefing → strukturiertes Treatment (Titel, Logline, Format, Szenenliste) mit Charakter-Lock aus Cast & World.
- `autopilot-anchor-gate` — erzeugt und bewertet Ankerbilder auf 6 Achsen: Identitätstreue, Produkttreue, Anatomie, Komposition, Text-Artefakte, Brand-Fit; repariert bei Bedarf.
- `autopilot-orchestrate` — Zustandsautomat für den Lauf: Treatment → Anker (Gate) → Motion → Szene fertig; schreibt Fortschritt, Fehler und Regie-Log pro Szene.

### Datenhaltung
`autopilot_productions` (Lauf, Stage, Status, Fortschritt, Endvideo), `autopilot_production_scenes` (Szene, Anker-URL, Score, Versuche, Video-URL, Fehler), `autopilot_director_log` (Regie-Protokoll).

### Oberfläche
- **Regietisch** (`DirectorsTable.tsx`) im Autopilot-Tab: Briefing, geplantes Storyboard mit Rhythmus/Kamera, Ambience-Hinweise, Blockerliste, Button „Freigeben und produzieren".
- **Produktions-Panel** (`ProductionStage.tsx`): Live-Status pro Szene in Kundensprache („Bild wird geprüft" → „Wird animiert" → „Fertig"), Anker-Vorschau, fertige Clips, Fortschrittsbalken, Regie-Log.
- **Live-Polling** (`useAutopilotProduction.ts`): 4-Sekunden-Takt, stoppt automatisch bei Abschluss/Fehler.
- **Kamera-Realismus** (`CameraRealism.tsx`, Remotion): Korn, Halation, Vignette, Fokus-Atmen — bewusst **nur** für Autopilot und Director's Cut, damit die Raw-Media-Invariante im Universal Content Creator unangetastet bleibt.

### Was noch offen ist
Der Lauf endet aktuell bei „Szenen fertig". Noch nicht gebaut: automatischer Endschnitt (Zusammenschnitt aller Clips), Musik-/Ambience-Mix auf die Tonspur, Voiceover-/Lip-Sync-Einbindung in den Autopilot-Lauf sowie Credit-Verrechnung und automatische Rückerstattung bei Provider-Fehlern nach dem bestehenden Refund-Standard.

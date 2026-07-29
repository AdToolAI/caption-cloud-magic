## Ziel

Der Kunde sagt in einem Satz, was er will — und bekommt zurück, was sonst eine Werbeagentur nach zwei Wochen liefert: **5 durchdachte Werbeideen**, jede mit Hook, Erzählwinkel und Begründung. Er wählt eine aus. Danach übernimmt die KI alles: Drehbuch, Casting, Bildsprache, Schnittrhythmus, Ton, Stimme — bis zum fertigen Spot.

Vorhanden: Szenen-Grammatik, Prompt-Compiler, Rhythmus/Sound, Treatment-Funktion, Anchor-Gate, Orchestrator, Regietisch, Produktionspanel.
Fehlt: die Ideen-Stufe davor, der Bild-Upload und der Endschnitt danach.

---

## 1. Die Ideen-Runde — Agenturqualität statt Prompt-Echo

Neue Edge Function `autopilot-ideas`. Der Unterschied zu "5 Vorschläge generieren" liegt im Verfahren:

**Strategie zuerst.** Bevor eine Idee entsteht, leitet das Modell aus dem Briefing ein Mini-Strategiepapier ab: Zielgruppe, konkreter Nutzen, Kaufhemmnis, Tonalität, was der Zuschauer nach 3 Sekunden gedacht haben soll. Das ist der Rahmen, an dem sich alle Ideen messen lassen.

**Fünf bewusst getrennte Winkel.** Jede Idee bekommt einen anderen Erzählmechanismus zugewiesen — Problem→Lösung, Testimonial, visuelle Metapher, Mikro-Story mit Wendung, Produkt-Poesie. Damit kommen nie fünf Varianten derselben Idee heraus.

**Jede Karte begründet sich.** Titel, Hook der ersten Sekunde, Logline, Beat-Abfolge, Bildwelt — plus ein Satz "Warum das funktioniert" und wo die hochgeladenen Bilder vorkommen.

**Machbarkeits-Filter.** Deterministische Regeln prüfen jede Idee gegen das, was die Pipeline zuverlässig kann: Personen pro Bild, Sprechszenen nur mit vorhandenem Cast, keine Menschenmengen, keine Schrift im KI-Bild, Szenenlängen im Modell-Limit. Was durchfällt, wird entschärft oder ersetzt, bis fünf saubere Konzepte stehen. Sichtbarer Machbarkeits-Score pro Karte — kein Konzept, das später scheitert.

## 2. Eigene Bilder — mehrere, mit Rolle

Bis zu **8 Bilder**, je max. 10 MB. Mehrere sind klar besser, weil Logo, Produkt und Umgebung technisch völlig unterschiedlich verarbeitet werden.

Pro Bild: **Rolle** (Logo · Produkt · Person · Ort · Stil-Referenz) und ein **Freitext** ("soll am Ende erscheinen", "Produkt steht auf dem Tisch", "diese Farbwelt übernehmen").

| Rolle | Verwendung |
|---|---|
| Logo | nie ins KI-Bild (Modelle verzerren Schrift) — sauberes Overlay im Endschnitt |
| Produkt | Referenz für die Anchor-Generierung, damit das echte Produkt im Bild steht |
| Person | Charakter-Referenz, optional als Cast-&-World-Charakter übernehmen |
| Ort | Referenz für Kulisse und Lichtstimmung |
| Stil | steuert nur Farbwelt, Licht und Look, nie den Bildinhalt |

Eine Bildanalyse beschreibt jedes Bild einmal englisch für die Modelle und meldet unbrauchbare Uploads sofort zurück.

## 3. Ein-Feld-Einstieg

`AutopilotIdeaLauncher.tsx`: großes Briefing-Feld, Drag-&-Drop-Zone mit Rollen- und Beschreibungsfeld je Bild, kompakte Optionsleiste — Cast (Cast & World), Länge, Voiceover an/aus mit Sprache, Lip-Sync an/aus mit Sprecherzahl (1–4), Format. Alles andere entscheidet die KI.
`IdeaGallery.tsx`: 5 Karten mit Hook, Logline, Beat-Vorschau, Begründung, Score, Kostenschätzung; "Diese Idee verfilmen" oder "Neue Ideen".

## 4. Länge: maximal 180 Sekunden

Harte Obergrenze, durchgesetzt in UI, Ideen-Engine, Treatment und Orchestrator. Presets 15 · 30 · 60 · 90 · 120 · 180 s. Ab 90 s warnt die Kostenvorschau deutlich, und der Rhythmus-Planer wechselt in einen Kapitel-Modus, damit lange Filme nicht in gleichförmige Schnitte zerfallen.

## 5. Idee → Treatment → Produktion → Endschnitt

Die gewählte Idee geht als Vorgabe in `autopilot-treatment` (Winkel, Beats, Cast-Zuweisung, Sprecherzahl, Asset-Platzierung), das nur noch die Szenen-Grammatik füllt. Von dort läuft der bestehende Weg: Anchor-Gate → Motion → Regietisch.

Neu `autopilot-finalize`: setzt die freigegebenen Clips in Reihenfolge, legt Voiceover (bestehende Stimmen-Bibliothek, korrekter Start-Offset), Musik und Foley darunter, blendet Logo-Overlays ein, wendet den Rhythmus-Plan auf die Schnittpunkte an und rendert über die bestehende Remotion-Lambda-Strecke. Lip-Sync-Szenen laufen davor über die Kling-Omni-Strecke mit hartem Deutsch-Lock.

## 6. Kosten und Sicherheit

Kostenvorschau vor dem Start (Anchor + Motion + VO + Lip-Sync + Render) mit Freigabe-Dialog; stufenweise Abbuchung, Rückerstattung bei Provider-Fehlern nach bestehendem Refund-Muster. Cast bleibt hart auf Cast & World gesperrt.

---

## Technische Details

- Neu: `supabase/functions/autopilot-ideas/index.ts`, `autopilot-finalize/index.ts`, `autopilot-analyze-asset/index.ts`
- Neu: `src/lib/autopilot/ideaFeasibility.ts`, `costEstimate.ts`, `assetRoles.ts`, `strategy.ts`
- Neu: `src/components/autopilot/AutopilotIdeaLauncher.tsx`, `IdeaGallery.tsx`, `AutopilotAssetDropzone.tsx`
- Erweitert: `autopilot-treatment` (Idee + Assets als Eingabe), `autopilot-orchestrate` (Asset-Referenzen, VO/Lip-Sync/Finalize-Kette), `types.ts`, `Autopilot.tsx`
- Migration: `autopilot_ideas` (Strategie- und Konzept-JSON, Score, gewählt) und `autopilot_assets` (Rolle, Beschreibung, Analyse-JSON, Storage-Pfad) inkl. GRANTs und nutzer-eigener Zugriffsregeln; privater Bucket `autopilot-assets` mit User-ID als erstem Pfadsegment
- Modelle: `google/gemini-3.1-pro-preview` für Strategie und Ideenrunde (Qualität zählt hier mehr als Latenz), `google/gemini-3.6-flash` für Bildanalysen, Pro-Vision bleibt im Anchor-Gate

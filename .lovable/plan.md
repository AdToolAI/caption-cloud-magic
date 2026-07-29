## Ziel

Ein Autopilot, der aus einem Satz („Ich brauche ein Werbevideo für meine Kaffeerösterei") einen fertigen Spot baut — Werbe-, Produkt-, Unternehmens- oder Storytelling-Video, dazu Bild-Posts. Wie ein Auto-Agent in ChatGPT, aber ausschließlich auf Video/Bild spezialisiert und dadurch besser: er kennt die Werkzeuge, die er bedient.

## Die Kernstrategie: Anchor-First statt Best-of-3

Best-of-N ist teuer, weil man **teure Artefakte** prüft. Die Lösung ist, die Prüfung **nach vorn** zu ziehen, auf die billige Stufe.

```
Prompt  →  ANKERBILD (~0,03 €)  →  Vision-Gate  →  ANIMATION (~2,10 €)
              ↑                        │
              └── Reparatur ───────────┘   (kostet Cents, nicht Euros)
```

Ein Standbild kostet rund ein Hundertstel eines Videoclips. Wenn das Ankerbild geprüft, ggf. drei- bis viermal repariert und erst dann animiert wird, ist zum Zeitpunkt der teuren Generierung bereits gesichert: richtige Charaktere, richtiges Produkt, richtige Bildkomposition, richtiges Licht, keine Anatomie-Fehler, kein Fantasietext. Video-Modelle sind bei Image-to-Video deutlich treuer als bei Text-to-Video — der Anker bestimmt das Ergebnis fast vollständig.

Ergebnis: Wir kaufen ~90 % Trefferquote für rund 5 % der Kosten von Best-of-3. Die Infrastruktur dafür existiert bereits (`compose-scene-anchor`, `generate-composer-image-scene`, Seedream 4, AWS Rekognition, Cast & World Identity-Lock).

### Die fünf Ebenen, die zusammen die Trefferquote tragen

1. **Deterministisch statt generativ, wo es geht.** Format, Dauer, Schnittrhythmus, Textsicherheitsränder, Kamera-Abfolge, Audio-Pegel — das sind Regeln, keine KI-Entscheidungen. Alles, was eine Regel sein kann, wird eine Regel und kann damit nicht danebengehen.
2. **Prompt-Grammatik statt Freitext.** Der Regie-Agent füllt ein festes Feld-Schema (Subjekt · Handlung · Kamera · Objektiv · Licht · Stimmung · Negativliste) statt einen Fließtext zu erfinden. Ein Compiler baut daraus den Provider-Prompt. Das eliminiert die häufigste Fehlerquelle — schlecht formulierte Prompts — komplett.
3. **Preflight ohne KI.** Vor jedem Credit-Abzug prüft ein reiner Code-Check: Hat jeder Sprecher eine Voice-ID? Passt Szenenlänge zum Modell-Limit? Ist der Anker gesetzt? Ist die Gesichtsfläche groß genug für Lip-Sync? Sind Charaktere doppelt besetzt? Fehler werden hier abgefangen, wo sie nichts kosten.
4. **Reparatur statt Neudreh.** Wenn ein Clip durchfällt, wird gezielt korrigiert, was fehlt (Anker nachschärfen, Prompt-Feld ändern, Motor wechseln) — nicht blind derselbe Würfel neu geworfen.
5. **Ton und Rhythmus.** Der am meisten unterschätzte Hebel: fehlendes Foley, fehlende Ambience und ein gleichförmiger 5-Sekunden-Takt lassen selbst perfekte Bilder billig wirken. Reine Software, kaum Kosten.

---

## Stufe 1 — Das Fundament (ohne UI sichtbar, wirkt überall)

**1.1 Prompt-Compiler** — `src/lib/autopilot/promptGrammar.ts`
Festes Szenen-Schema + Compiler zu providerspezifischen Prompts. Nutzt den vorhandenen Prompt-Layer-Composer und die Negativ-Direktiven gegen Fantasietext.

**1.2 Preflight-Validator** — `src/lib/autopilot/preflight.ts`
Reine Funktion, Liste blockierender und warnender Befunde. Wird vor jedem kostenpflichtigen Schritt aufgerufen, auch außerhalb des Autopiloten.

**1.3 Anchor-Gate** — neue Edge Function `autopilot-anchor-gate`
Erzeugt Ankerbild, bewertet es per Gemini 3.1 Pro Vision gegen eine feste Rubrik (Identitätstreue, Produkttreue, Anatomie, Komposition, Text-Artefakte, Markenfit), repariert bis zu N-mal, gibt erst dann frei. Vorhandenes `autopilot-qa-gate` bleibt als Compliance-Prüfung dahinter.

**1.4 Rhythmus + Sounddesign** — `src/lib/autopilot/rhythm.ts`, `soundDesign.ts`
Ungleiche Szenendauern (Hook kurz, Beweis lang, Abbinder mittel), Schnitte auf Musik-Beats über die vorhandene Beat-Sync-Logik, automatisches Foley und Ambience via ElevenLabs Sound-Effects, Summe auf −14 LUFS normalisiert.

**1.5 Kamera-Realismus** — leichtes Korn, Halation, minimales Lens-Breathing als Export-Layer. Strikt nur für Autopilot und Director's Cut; die Raw-Media-Invariante des Universal Content Creators bleibt unangetastet.

---

## Stufe 2 — Das Regieteam

Kette spezialisierter Agenten statt eines LLM-Calls. Jeder Schritt persistiert, jederzeit unterbrechbar, jederzeit editierbar.

| Agent | Aufgabe |
|---|---|
| Researcher | Produkt-URL/Briefing → Marke, Farben, Zielgruppe, Tonalität; Wettbewerbs-Hooks aus der Meta Ad Library (kostenlose API) |
| Genre-Router | Erkennt Videotyp (Werbespot, Produktdemo, Unternehmensfilm, Storytelling, Testimonial, Erklärvideo) und lädt das passende Struktur-Rezept |
| Autor | Szenen, Dialoge, Hook in den ersten 1,5 Sekunden |
| Casting | Charaktere aus Cast & World, Stimmen aus der 8.477er-Bibliothek — sprach- und kategoriebewusst über den vorhandenen VoiceSlot |
| Kameramann | Füllt die Prompt-Grammatik pro Szene mit variierendem Shot-Vokabular |
| Anker | Stufe 1.3 pro Szene |
| Produktion | Pro Szene der passende Motor: Kling 3.0, Veo 3.1, Hailuo, Seedance |
| Ton & Schnitt | Stufe 1.4 |
| Final-QA | Compliance + Qualitätsscore, dann Remotion-Lambda-Render |

**Genre-Rezepte** sind der Grund, warum „alles, was der Nutzer fragen könnte" funktioniert: Jeder Videotyp bekommt eine erprobte Struktur (Problem-Lösung-Beweis-CTA für Werbung, Held-Konflikt-Wandel für Storytelling, Feature-Nutzen-Kontext für Produkt). Neue Genres sind später eine Datei, kein Umbau.

**Bild-Posts** durchlaufen dieselbe Kette und enden nach dem Anker-Gate — deshalb sind sie fast geschenkt und von Tag eins dabei.

**Kostenkontrolle** ist Teil desselben Bausteins: Vorabschätzung, harter Credit-Deckel, Kill-Switch, idempotente Rückerstattung bei Provider-Ausfall nach dem bestehenden Refund-Standard.

---

## Stufe 3 — Das Interface

`/autopilot` verliert den Coming-Soon-Schirm. Neuer Modus **„Ein Auftrag"** neben dem bestehenden Wochenplan-Cockpit.

**Der Regie-Tisch** — kein Wizard, kein Formular. Ein Eingabefeld, darunter entfaltet sich die Arbeit der KI, während sie denkt:

1. **Auftrag** — ein Satz, optional Produkt-URL, Datei-Drop für Produktfotos.
2. **Rückfragen** — die KI fragt maximal zwei Dinge, die sie wirklich nicht erraten kann (Zielgruppe? Tonalität?), mit vorausgewählten Vorschlägen. Kein Ausfragen.
3. **Das Treatment** — Konzept, Storyboard mit echten Ankerbildern, Casting mit Gesichtern und antippbarer Stimmenvorschau, Kostenvoranschlag. **Genau ein Freigabe-Klick.** Alles ist editierbar, aber nichts muss editiert werden.
4. **Der Regie-Log** — statt Spinner ein Live-Protokoll: „Szene 3 · Anker verworfen, Hand-Anatomie · repariere". Das macht die Wartezeit zum Vertrauensbeweis statt zur Leerstelle. Jede Szene als Kachel mit Anker → Clip → Ton.
5. **Ergebnis** landet als normales Projekt im Director's Cut, voll editierbar. Der Autopilot ersetzt die Studios nicht, er befüllt sie.

Design durchgehend Bond-Gold auf Tiefschwarz, Glassmorphismus, Playfair/Inter — konsistent mit der Plattform.

---

## Technische Details

- **Neue Tabellen**: `autopilot_productions` (Auftrag, Genre, Treatment, Budget, Status, Score) und `autopilot_steps` (Agentenschritt, Ein-/Ausgabe, Kosten, Reparaturzähler). RLS auf `auth.uid()`, explizite GRANTs für `authenticated` und `service_role`.
- **Neue Edge Functions**: `autopilot-research`, `autopilot-treatment`, `autopilot-anchor-gate`, `autopilot-orchestrate` (Zustandsmaschine + Budget-Governor). Timeout 300 s.
- **Bestehendes bleibt**: `autopilot-generate-video`/`-video-poll`, `-qa-gate`, `-prompt-shield`, `-safety-check`, `-publish-due` sowie das gesamte Wochenplan-Cockpit werden wiederverwendet, nicht ersetzt.
- **Sora ist tot** — API-Abschaltung 24.09.2026, App seit 26.04.2026 offline. Wird nicht eingeplant.
- **Modell-Rollen**: Gemini 3.1 Pro für Konzept/Drehbuch, Gemini 3.1 Pro Vision für Anker-Bewertung, Seedream 4 / Nano Banana 2 für Anker, Kling/Veo/Hailuo/Seedance für Bewegtbild, ElevenLabs für Sprache und Foley.
- **Kalibrierung**: Die Anker-Rubrik wird gegen manuell bewertete Beispiele geprüft, bevor sie scharf geschaltet wird. Ohne das bewertet die KI am Ziel vorbei.

## Kosten

Ein 30-Sekunden-Spot mit 6 Szenen: rund 3,00 € Einkauf (Anker inklusive Reparaturen ~0,40 €, Video ~2,10 €, Audio/Render ~0,50 €) gegenüber ~8,90 € bei Best-of-3. Bei 3,00× Marge etwa 9 € Verkauf, Laufzeit 4–7 Minuten. Autopilot zieht Credits und ist nicht im 14,95-€-Beta-Abo enthalten.

Kommuniziert wird „Agenturqualität in Minuten, mit KI-Regie und automatischer Nachbesserung" — nicht „ununterscheidbar von echt".

## Reihenfolge

Stufe 1 zuerst, denn sie verbessert sofort jedes Video auf der gesamten Plattform, unabhängig davon, wie weit Stufe 2 kommt. Dann das Regieteam, zuletzt das Interface. Jede Stufe ist für sich lieferbar.

## Nicht enthalten

Keine Änderungen an Preisen, Lip-Sync-Pipeline, Voice-Bibliothek oder den bestehenden Render-Pfaden. Social-Autoposting, Performance-Optimierung und weitere Content-Formate kommen in späteren Wellen.

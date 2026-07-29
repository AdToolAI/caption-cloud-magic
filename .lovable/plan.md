## Antwort vorab: Ja, stimmlich geht das schon heute

Der Katalog trägt Kinderhörbücher bereits (verifiziert per Query):

| Sprache | Stimmen gesamt | `narrative_story` | `characters_animation` |
|---|---|---|---|
| EN | 3.093 | — | — |
| ES | 1.303 | — | — |
| DE | 843 | 341 | 92 |

Dazu FR 489, TR 677, PT 431, PL 233, IT 205, NL 123. Erzähler- und Charakterstimmen sind also reichlich da, `preview_url` liefert kostenlose Vorschau.

Was fehlt, ist **nicht** die Stimme, sondern der Langform-Workflow: heute geht Text nur als einzelner Voiceover-Call (ElevenLabs-Limit ~5.000 Zeichen), es gibt keine Kapitel, keine Sprecherzuordnung pro Figur und keinen MP3/Hörbuch-Export.

## Plan: „Hörbuch"-Tab im Audio Studio

Kein neuer Bereich in der Navigation. `src/pages/AudioStudio.tsx` hat bereits eine Tab-Leiste (`enhance | transcript | voices | music | …`) — dort kommt genau **ein** neuer Tab `audiobook` dazu. Alles Weitere lebt in `src/components/audio-studio/audiobook/`.

### 1. Manuskript & Kapitel
- Texteingabe (Einfügen oder `.txt`/`.md`-Upload) mit automatischer Kapitel-Erkennung an Überschriften/Leerzeilen.
- Kapitelliste links, Editor rechts; Kapitel umbenennen, sortieren, löschen.
- Zeichen- und Laufzeitschätzung pro Kapitel und gesamt.

### 2. Sprecher-Besetzung
- **Erzähler** (Pflicht) + beliebig viele **Figuren**, jede mit eigener Stimme aus der Bibliothek.
- Stimmenauswahl über den bestehenden `UniversalVoiceLibraryPicker` mit Vorfilter `use_case = narrative_story | characters_animation` und der gewählten Sprache.
- Dialogzeilen werden per `Figur:`-Präfix erkannt und automatisch der Figurenstimme zugeordnet; manuelle Korrektur pro Absatz möglich.
- Kinder-Preset: Stability 0.5 / Similarity 0.75 / Style 0.35, Tempo 0.95 (ruhigeres Vorlesen).

### 3. Rendering (Chunking + Stitching)
- Neue Edge Function `render-audiobook`: teilt jedes Kapitel an Satzgrenzen in Blöcke ≤ 4.000 Zeichen, ruft ElevenLabs mit `previous_text`/`next_text` auf (Request Stitching → keine Prosodie-Brüche an den Nähten), `eleven_multilingual_v2`.
- Blöcke werden parallel (Limit 4 gleichzeitig) erzeugt, in Reihenfolge zusammengefügt, Pausen zwischen Absätzen/Kapiteln konfigurierbar (0,4 s / 1,2 s).
- Fortschritt pro Kapitel in einer Job-Tabelle; Wiederaufnahme nach Abbruch ohne erneute Kosten für fertige Blöcke.
- Fehlschlag eines Blocks → automatische Gutschrift gemäß bestehender Refund-Regel.

### 4. Export
- Pro Kapitel eine MP3 plus optional eine zusammengefügte Gesamtdatei; ZIP-Download.
- Titel/Autor/Cover als ID3-Metadaten, Kapitelnamen als Dateinamen mit Nummerierung.
- Ablage in der Media Library (`content_items`) wie bei anderen Audio-Assets.

### 5. Alle 9 Sprachen
DE, EN, ES, FR, IT, PT, NL, PL, TR — Sprachumschalter filtert Katalog und setzt das Modell; UI-Texte bleiben DE/EN/ES.

## Technische Details

- Neue Tabellen `audiobook_projects` (Titel, Sprache, Besetzung als JSONB, Sprache, Status) und `audiobook_chapters` (Projekt-Ref, Index, Titel, Text, Audio-URL, Renderstatus) — RLS auf `auth.uid()`, GRANTs für `authenticated` + `service_role`.
- Storage-Pfad `audio-studio/{user_id}/audiobooks/{project}/…` (User-ID als erstes Segment, wie von der Storage-RLS gefordert).
- Kosten: Abrechnung über die bestehenden Media Credits, pro 1.000 Zeichen, mit Kostenvorschau vor dem Rendern (analog Szenen-Render-Dialog).
- Vorschau einzelner Absätze nutzt `preview-voice`, nicht den vollen Render.

## Offene Punkte

- Zeichen-Preis pro 1.000 Zeichen lege ich nach der 3,00×-Margenregel fest; sag Bescheid, falls du einen anderen Faktor willst.
- Hintergrundmusik/Ambience fürs Hörbuch lasse ich erstmal weg — der bestehende Music-Tab kann das nachträglich untermischen.

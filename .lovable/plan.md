
# Positionierung: Ein Creator. Ein ganzes Studio.

Ziel: Die Produktkommunikation an das tatsächliche Produkt angleichen — vor dem Launch am 26.07. Redaktionsplan, Formate und Veröffentlichungsrhythmus bleiben bewusst außerhalb des Codes.

## Ausgangslage (im Code geprüft)

Die aktuelle Kommunikation beschreibt eine frühere Produktstufe:

- `src/lib/translations.ts` — Hero DE/EN/ES: „Effektives Marketing. Smarte Kampagnen." / Subline „Dein KI-gestütztes Marketing-Toolkit für Social Media."
- `src/pages/Index.tsx` — SEO-Titel „KI Social Media Marketing Platform"
- `index.html` — Titel „KI Social Media Manager", Keywords auf Captions ausgerichtet
- `src/config/seo.ts` — `defaultTitle` / `defaultDescription` / `keywords` positionieren AdTool AI als **Caption Generator**; `PAGES_SEO.home` ebenso
- `public/llms.txt` — beschreibt zuerst Captions, Video erst danach

Es geht also nicht um eine Verfeinerung, sondern um die Angleichung an die Video-Pipeline, die seit Monaten gebaut wurde.

## Die Messaging-Hierarchie

Diese drei Ebenen werden verbindlich und überall in dieser Reihenfolge verwendet:

```text
Ebene 1 — Markenversprechen (emotional)
  Ein Creator. Ein ganzes Studio.

Ebene 2 — Differenzierung (funktional)
  Alle führenden KI-Modelle. Ein durchgängiger Workflow.

Ebene 3 — Kundennutzen (konkret)
  Von der Idee zum fertigen Video — ohne Filmteam und ohne
  zwischen fünf Tools zu wechseln.
```

Marktdefinition: „Für alle, die professionelle Inhalte produzieren müssen — ohne eigenes Filmteam." Solo-Creator sind kulturelle Kernzielgruppe, nicht die sprachliche Grenze.

Sprache: global positioniert, deutscher Beachhead. DE-Multi-Speaker-Lip-Sync erscheint als Leistungsbeweis, nie als Zielgruppendefinition. EN- und ES-Claims werden im selben Durchgang geschrieben, nicht nachgezogen.

## Umfang 1 — Startseite

`src/lib/translations.ts`, Block `landing.hero` in allen drei Sprachen:

- `headline1` / `headline2` → „Ein Creator." / „Ein ganzes Studio." (EN: „One creator." / „A whole studio.", ES entsprechend)
- `subline` → Ebene 2 + 3 verdichtet: führende Modelle, Stimmen und Lip-Sync in einem Workflow, ohne Plattformwechsel
- `badge` → weg von „Für moderne Marketer", hin zur Produktionsaussage
- `socialProof.creators` bleibt (Founders-Beta ist ehrlich und funktioniert)

`src/components/landing/BlackTieHero.tsx` bleibt strukturell unverändert — nur die Texte kommen aus den geänderten Keys. Kein Layout-Umbau kurz vor Launch.

## Umfang 2 — Metadaten und Crawler

- `index.html`: `<title>`, `description`, `keywords`, `og:*` und `twitter:*` auf die Studio-/Workflow-Positionierung; Founders-Preis bleibt als Nutzenhinweis erhalten. Kein `og:image` setzen (Hosting liefert die Vorschau).
- `src/config/seo.ts`: `defaultTitle`, `defaultDescription`, `keywords` und `PAGES_SEO.home` von Captions auf KI-Videoproduktion; Keywords auf Begriffe wie KI-Videogenerator, Lip-Sync, Avatar-Video, Videoproduktion ohne Team.
- `src/pages/Index.tsx`: `SEO`-Props auf die neue Hierarchie.
- `public/llms.txt`: Einleitungsabsatz stellt die Workflow-Positionierung voran, Captions werden zu einem Feature unter anderen.

Titel unter 60 Zeichen, Description unter 160, genau ein H1 auf der Startseite — bleibt gewahrt.

## Umfang 3 — Founders-Pitch

`FoundersBenefitsDialog.tsx` erhält die Rahmung „Studio-Zugang" statt Feature-Aufzählung. Preise, Rabattlogik und Bedingungen bleiben unverändert — nur der Einleitungstext.

## Umfang 4 — Positionierungs-Memory

Neue Projekt-Memory `mem://brand/positioning-territory` mit: Markenversprechen, die drei Hierarchieebenen, Marktdefinition, Beachhead-Regel, die fünf Standpunkte und die Verbotsliste (keine Feature-Rundgänge, keine reinen Modelllisten, kein „KI oder echt?" bis die Lip-Sync-Artefakte sauber sind). Referenz in `mem://index.md` unter Core, damit jeder künftige Text daran gemessen wird.

## Bewusst nicht in diesem Durchgang

- Onboarding-Texte und E-Mail-Betreffzeilen — zweiter Durchgang nach dem Launch; die Flows laufen gerade stabil.
- Redaktionsplan, Formate, Serien, Veröffentlichungsrhythmus — gehören in ein Marketingdokument, nicht in die Codebase.
- Neuaufbau von Hero-, Nutzen- oder Social-Proof-Sektionen — zu großer Eingriff sechs Tage vor Launch.

## Technische Hinweise

Alle Änderungen sind Text- und Konfigurationsänderungen. Keine Logik, keine Backend-Migration, keine Edge-Function betroffen. `translations.ts` wird an drei Stellen parallel geändert (DE ~8753, EN ~3904, ES ~13387), damit die Sprachen nicht auseinanderlaufen. Nach den Edits: Typecheck plus ein Screenshot der Startseite zur Kontrolle, dass die längere Headline im Hero-Grid nicht umbricht.

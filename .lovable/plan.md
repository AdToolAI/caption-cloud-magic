# Briefing-Erfassung: Befund und Korrekturen

Antwort vorweg: **Teilweise.** Struktur, Dauer und Technik stimmen — der Dialog und drei von vier Figuren sind falsch bzw. verloren gegangen.

## Was korrekt übernommen wurde

- Projekt „AdTool AI — Continuity Stress Test", 9:16, 60 s, 2 Szenen à 30 s
- Engine `cinematic-sync`, Lip-Sync an, „Ton im Studio (stummer Clip)"
- Ort `@studio-loft` → Modern Loft, Shot-Director je Szene (medium-wide/eye-level/tracking bzw. medium/three-quarter/push-in)
- Anchor-Prompts auf Englisch, inkl. Anschluss-Satz „The scene continues from the previous one"
- Voice-Einstellungen (eleven_multilingual_v2, Stability 0.45, Speed 1) und Untertitel-Stil

## Was falsch ist

1. **Dialog wurde nicht als Dialog erkannt.** Statt 6 bzw. 9 Sprechzeilen stehen im Plan Kunst-Turns mit den Sprechern `ORT`, `CAST`, `AKTION` — die Beschriftungszeilen des Briefings. Die echten Zeilen (`@marketer: "Ganz ehrlich…"`) stecken als Fließtext im `AKTION`-Turn. Folge: 11 „Dialogzeilen" ohne Sprecher, und der Multi-Speaker-Lip-Sync bekäme keine sauberen Turns.

2. **Drei von vier Figuren fehlen im Cast.** Jede Szene trägt nur `Cast (1)` = @founder → Samuel Dusatko. `@creative`, `@marketer`, `@creator` existieren nicht in Cast & World; die Auflösung meldet sie zwar als „6 offene Punkte", die Cast-Slots werden aber vorher **still entfernt** statt unbesetzt stehen zu lassen. Damit ist der eigentliche Testfall (vier wiederkehrende Charaktere) im Storyboard gar nicht vorhanden.

3. **Sprecher-Bindung ist Handarbeit.** Selbst nach dem Anlegen der Figuren müsste jeder Turn einzeln zugeordnet werden, obwohl die `@mention` im Text steht.

4. **Negative Prompt ist sprachgemischt.** Im Plan steht „no logo, no lettering im Bild, no Zuschauer…" — halb Englisch, halb Deutsch. Visuelle Prompts müssen vollständig Englisch sein.

## Korrekturen

### 1. Deterministische Dialog-Extraktion (Server)
In `supabase/functions/_shared/briefing/deep/index.ts` vor der Modell-Auswertung einen Extraktor ergänzen, der pro Szenenblock alle Zeilen der Form `@mention: "Text"` (auch ohne Anführungszeichen) einsammelt. Findet er Zeilen, sind **sie** die Wahrheit für `dialogTurns`; die Modell-Turns werden verworfen. Zusätzlich eine Sperrliste: ein Turn, dessen `speakerMentionKey` einem Feldnamen entspricht (ort, location, cast, aktion, action, kamera, camera, dialog, ziel, dauer, stimme, untertitel), wird nie als Sprechzeile übernommen; sein Inhalt geht in die Szenenbeschreibung. Der Pass-A-Prompt wird entsprechend nachgeschärft.

### 2. Unbesetzte Cast-Slots erhalten statt löschen
`enforceStrictCast` verwirft heute jeden Slot ohne `characterId`, der nicht in der Briefing-Roster-Liste steht. Künftig: Slots, deren `mentionKey` **im Briefing-Text vorkommt**, bleiben mit `characterId: null` erhalten und erscheinen im Plan als offene Zeile mit Auswahl „Figur zuordnen" oder „In Cast & World anlegen". Nur wirklich erfundene Sprecher (nicht im Briefing) werden weiter entfernt.

### 3. Gewählte Cast-&-World-Figuren automatisch in Reihenfolge besetzen
Hast du im Composer vier Figuren gewählt und das Briefing sagt nichts über die Zuordnung, werden die offenen Sprecher-Mentions **in der Reihenfolge ihres ersten Auftretens im Briefing** mit den gewählten Figuren **in deren Auswahlreihenfolge** besetzt: 1. Mention → 1. gewählte Figur usw. Nennt das Briefing eine Figur namentlich oder passt ein `mentionKey` zu einem Bibliotheksnamen, hat diese Zuordnung Vorrang; die Auto-Verteilung füllt nur den Rest. Mehr Mentions als gewählte Figuren → Rest bleibt offen (keine Doppelbesetzung).

Im Briefing-Analyse-Dashboard bleibt jede Zuordnung änderbar: pro Cast-Slot ein Auswahlfeld mit allen Cast-&-World-Figuren, inklusive Tausch zweier Figuren (die andere Zeile wird dabei mitgetauscht statt doppelt belegt) und einer Markierung „automatisch zugeordnet", solange du nichts geändert hast.

### 4. Auto-Bindung der Sprecher
Sobald ein Cast-Slot eine Figur bekommt — automatisch oder von Hand —, werden alle Turns mit derselben `@mention` gebunden (`speakerCharacterId`), inklusive Stimme aus dem Figurenprofil. Beim Übernehmen landen Cast-Slots, Sprecherbindung und Stimmen unverändert im Storyboard (`characterShots` + `dialogTurns`); geschützte Szenen bleiben unangetastet.


### 5. Negative Prompt einsprachig
Der Plan-Normalizer übersetzt den Negative Prompt vollständig ins Englische (kein Teil-Merge mehr), die deutsche Fassung bleibt nur zur Anzeige.

### 6. Anschluss Szene 1 → Szene 2
Szene 2 wird beim Übernehmen automatisch auf Bildanschluss „Nahtlos" gesetzt, wenn der Anchor-Prompt/Continuity-Hinweis die Vorgängerszene fortsetzt — heute muss das je Szene von Hand gewählt werden.

## Betroffene Dateien

- `supabase/functions/_shared/briefing/deep/index.ts` — Dialog-Extraktor, Sperrliste, `enforceStrictCast`, Auto-Besetzung nach Auswahlreihenfolge, Negative-Prompt-Normalisierung
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — offene Cast-Slots, Figuren-Auswahl je Slot mit Tausch-Logik, Badge „automatisch zugeordnet", Auto-Bindung, Link „In Cast & World anlegen"
- `src/hooks/useApplyProductionPlan.ts` — Cast/Sprecher/Stimmen ins Storyboard, Continuity-Vorbelegung für Folgeszenen
- Tests: `src/hooks/__tests__/useApplyProductionPlan.test.ts` plus neue Fixture mit genau diesem Briefing (4 Sprecher, 2 Szenen, Label-Zeilen) und ein Test für die Reihenfolge-Besetzung


Danach: Briefing erneut analysieren. Erwartung — Szene 1 mit 6, Szene 2 mit 9 Sprechzeilen, vier Cast-Slots je Szene, davon drei sichtbar offen bis du sie in Cast & World anlegst.

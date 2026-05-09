## Warum es aktuell nicht professionell wirkt

Das Problem ist nicht nur der Prompt. Ein Prompt kann bei einem Multi-Charakter-Video nicht zuverlässig festlegen: „Diese Audiodatei gehört exakt zu Gesicht A, diese zu Gesicht B“. Artlist/Synthesia/HeyGen lösen das nicht primär über Prompting, sondern über eine harte technische Zuordnung:

```text
Speaker 1 → Voice 1 → Audio Segment 1 → Face/Avatar 1 → eigener Render
Speaker 2 → Voice 2 → Audio Segment 2 → Face/Avatar 2 → eigener Render
Danach: Schnitt/Stitching in der Timeline
```

Unser aktueller Fehler entsteht, weil wir stellenweise noch versuchen, Multi-Speaker in einer gemeinsamen KI-Szene oder über einen generischen Lip-Sync-Polish zu lösen. Das führt dazu, dass der erste/beste erkannte Kopf den Dialog „übernimmt“ oder nur ein einzelner Voiceover-Clip verwendet wird.

## Zielverhalten

Für Kunden muss es klar und verlässlich sein:

1. **Echter Lip-Sync** bedeutet: pro Sprecher ein eigenes Gesicht/Portrait und ein eigenes Audiosegment.
2. **Multi-Speaker in einem Gruppenbild** ist nur Voiceover/B-Roll, kein behaupteter echter Lip-Sync.
3. Wenn zwei Personen exakt sprechen sollen, wird die Szene automatisch in professionelle Speaker-Cuts aufgeteilt.
4. Jeder Sprecher bekommt garantiert seine eigene ausgewählte Stimme.
5. Das System darf keinen Modus mehr anzeigen, der „Lip-Sync“ verspricht, aber nur Audio über eine normale KI-Szene legt.

## Implementierungsplan

### 1. Multi-Speaker Lip-Sync als festen Professional-Flow bauen

In `SceneDialogStudio.tsx` wird der Multi-Speaker-Button nicht mehr als Inline-Voiceover ausgeführt, wenn der Nutzer „Lip-Sync“ erwartet.

Neues Verhalten:

- Bei 2+ Dialogblöcken prüft das System zuerst:
  - jeder Sprecher hat eine Stimme
  - jeder Sprecher hat ein Cast-Portrait / Brand-Character-Portrait
  - mehrere Sprecher verwenden nicht versehentlich dieselbe Voice-ID, ohne Warnung
- Danach wird pro Dialogblock zuerst TTS erzeugt.
- Das erste Dialogsegment ersetzt die aktuelle Szene als HeyGen/Lip-Sync-Clip.
- Weitere Dialogsegmente werden als direkt folgende Speaker-Cut-Szenen erzeugt.
- Alte automatisch erzeugte Speaker-Cuts werden vor dem Neugenerieren gelöscht, damit keine alten Stimmen doppelt liegen bleiben.

Damit gibt es keine 10-Sekunden-Gruppenszene mehr, in der ein Provider raten muss, welcher Mund sprechen soll.

### 2. Speaker-Mapping hart absichern

Die Mapping-Kette wird strikt gemacht:

```text
Dialogzeile Matthew: ...
→ parseDialogScript findet Matthew.characterId
→ voicePerSpeaker[Matthew.characterId]
→ generate-voiceover mit Matthews voiceId
→ generate-talking-head mit Matthews portraitUrl + Matthews audioUrl
```

Wichtig: HeyGen bekommt bei Multi-Speaker nie mehr den kompletten bereinigten Dialogtext. Es bekommt nur genau das eine Audiosegment des jeweiligen Sprechers.

### 3. Falschen Sync-Polish für Multi-Speaker blockieren

`compose-lipsync-scene` ist für eine Szene mit mehreren Voiceover-Clips gefährlich, weil es aktuell nur einen Clip auswählt und auf das ganze Video anwendet. Das ist genau die Art Fehler, bei der ein Gesicht alles spricht.

Änderung:

- Wenn eine Szene mehrere Sprecher/Voiceover-Blöcke hat, darf `compose-lipsync-scene` nicht automatisch laufen.
- Für Multi-Speaker wird stattdessen der neue Professional-Flow verwendet.
- Der generische Sync-Polish bleibt nur für Single-Speaker-Szenen erlaubt.

### 4. UI ehrlich und kundenverständlich machen

Die Texte im Dialog-Studio werden angepasst:

- **„Professionellen Lip-Sync rendern“** nur, wenn wirklich pro Sprecher eigene Lip-Sync-Clips erzeugt werden.
- **„Voiceover in dieser Szene“** nur für Gruppenbild/B-Roll ohne echten Mundabgleich.
- Wenn ein Portrait fehlt, gibt es keinen stillen Fallback, sondern eine klare Meldung: „Für echten Lip-Sync braucht Sprecher X ein Portrait.“

### 5. Prompt bleibt unterstützend, aber nicht die Quelle der Wahrheit

Der Prompt bekommt weiterhin Artlist-ähnliche Timing-Layer, aber nur als visuelle Zusatzanweisung. Die eigentliche Qualität kommt aus der technischen Bindung von Sprecher → Stimme → Audio → Gesicht.

Der Prompt wird also nicht mehr als „Lip-Sync-Steuerung“ missverstanden, sondern als Regieanweisung für B-Roll, Bildkomposition und Timing.

## Erwartetes Ergebnis

- Charakter 1 spricht nicht mehr die Zeile von Charakter 2.
- Jede Stimme ist an den richtigen Cast-Charakter gebunden.
- Echter Lip-Sync läuft über deterministische Speaker-Cuts statt Provider-Raten.
- Multi-Speaker-Dialog wirkt wie professionelle Interview-/Ad-Cuts: sauber geschnitten, hörbar korrekt, mit deutlich besserem Mundabgleich.

## Grenzen, die wir transparent machen müssen

Ein einzelnes KI-Gruppenbild mit zwei frei generierten Menschen und perfektem, getrenntem Face-Lip-Sync ist mit den aktuellen generischen Video-Modellen nicht zuverlässig. Professionelle Anbieter umgehen das ebenfalls über Avatar-/Face-Tracks, Speaker-Cuts oder kontrollierte Darsteller-Clips. Genau diesen robusten Weg sollten wir jetzt als Standard nehmen.
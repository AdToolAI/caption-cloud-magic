
Ziel

- Das Altproblem sauber schließen: Untertitel, die schon vor den letzten Änderungen im Projekt/Draft vorhanden waren, müssen in Schritt 10 ebenfalls wirklich entfernbar sein und sofort aus der Preview verschwinden.

Was ich im Code jetzt konkret gefunden habe

- Der Preview-Player rendert Untertitel korrekt nur aus `subtitleTrack.clips`.
- In `CapCutEditor.tsx` gibt es aber einen lokalen `subtitleTrack`-State, der beim Mount immer mit `DEFAULT_SUBTITLE_TRACK` startet.
- Gleichzeitig existiert in `DirectorsCut.tsx` bereits ein persistierter Parent-State:
  - `capCutSubtitleTrack`
  - wird aus dem Draft geladen
  - wird an Export weitergereicht
- Aktuell bekommt `CapCutEditor` diesen bestehenden `capCutSubtitleTrack` aber gar nicht als Initialwert zurück.
- Folge:
  - alter Subtitle-State aus früheren Sessions/Schritten kann im Parent/Draft weiterleben,
  - der Editor arbeitet lokal teilweise mit einem anderen Zustand,
  - Entfernen/Neugenerieren in Schritt 10 ist dadurch nicht robust genug für bereits vorhandene Alt-Untertitel.

Saubere Lösung

1. Subtitle-Track in Schritt 10 an Parent-State anbinden
- `CapCutEditor` um Prop erweitern:
  - `initialSubtitleTrack?: SubtitleTrack`
- In `DirectorsCut.tsx` den vorhandenen `capCutSubtitleTrack` an `CapCutEditor` durchreichen.
- Beim Start von Schritt 10 den lokalen `subtitleTrack` aus diesem Parent-State initialisieren statt immer leer zu starten.

2. Local/Parent-Sync für Altbestände robust machen
- Wenn `initialSubtitleTrack` vorhanden ist, soll der Editor diesen vollständig übernehmen.
- Wenn leer/undefined, dann wie bisher mit `DEFAULT_SUBTITLE_TRACK` arbeiten.
- Wichtig: kein versehentliches Überschreiben durch Auto-Erkennung, wenn bereits Untertitel aus Draft/älterem Zustand vorhanden sind.

3. „Alle Untertitel entfernen“ wirklich global machen
- Nicht nur „Original-Untertitel entfernen“, sondern zusätzlich eine klare Aktion:
  - „Alle Untertitel entfernen“
- Diese Aktion leert den kompletten `subtitleTrack.clips`-State.
- Zusätzlich:
  - `selectedSubtitleId = null`
  - Parent per `onSubtitleTrackChange` sofort auf leeren Track syncen

4. Original-Erkennung nur für wirklich leere Projekte
- Die Auto-Erkennung in `CapCutEditor.tsx` läuft aktuell, wenn `subtitleTrack.clips.length === 0`.
- Mit Initial-State aus Parent muss diese Logik so abgesichert werden, dass alte/manuelle Untertitel nicht versehentlich ersetzt oder wieder ergänzt werden.
- Retry bleibt möglich, aber bewusst nur über den Button.

5. Sidebar klarer machen
- Im Untertitel-Tab zwei getrennte Aktionen:
  - „Original-Untertitel entfernen“ = nur `source === 'original'`
  - „Alle Untertitel entfernen“ = kompletter Track leer
- Wenn danach `existingCaptions.length === 0` und `textOverlayCount === 0`, Hinweis auf eingebrannten Text beibehalten.

Betroffene Dateien

- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutSidebar.tsx`

Technische Details

```text
Aktuell problematisch:
Parent hält capCutSubtitleTrack
Editor startet trotzdem lokal leer
=> Alt-Untertitel und Editor-Zustand können auseinanderlaufen
```

```text
Benötigt:
DirectorsCut parent state
    -> initialSubtitleTrack
    -> CapCutEditor local subtitle state
    -> onSubtitleTrackChange zurück an Parent
```

Ergebnis nach dem Fix

- Auch alte Untertitel aus früheren Änderungen/Drafts werden in Schritt 10 korrekt geladen.
- „Alle Untertitel entfernen“ leert den echten Projektzustand, nicht nur die aktuelle Ansicht.
- Die Preview verschwindet sofort, wenn der Subtitle-Track wirklich leer ist.
- Wenn danach weiterhin Text sichtbar bleibt, ist klar: es sind Text-Overlays oder eingebrannter Text.

<lov-actions>
<lov-suggestion message="Test the subtitle removal flow end-to-end in Step 10 with an older draft to confirm the preview clears immediately and stays cleared after reload.">Verify that it works</lov-suggestion>
<lov-suggestion message="Add a dedicated 'Alle Untertitel entfernen' button in the subtitle sidebar and make it clear how it differs from removing only original subtitles.">Add full subtitle reset</lov-suggestion>
<lov-suggestion message="Show subtitle source badges like 'Original', 'KI', and 'Manuell' in the subtitle list so it is obvious which captions will be removed by each action.">Show subtitle sources</lov-suggestion>
</lov-actions>

# Universal Content Creator — Untertitel reparieren

Drei belegte Fehler im Untertitel-Schritt: der gewählte Stil kommt in der Vorschau/im Render nie an, die Untertitel-Box flackert dauerhaft, und das Textfeld "Untertitel-Text (Vorschau)" nimmt keine Eingabe an.

## Befund (verifiziert im Code)

1. **Stil wirkt nicht** — Der Payload (`universalCreatorRenderPayload.ts`) schickt den UCC-Stil mit den Feldern `color`, `font`, `animation`. Das Remotion-Schema in `UniversalCreatorVideo.tsx` erwartet aber `fontColor` und kennt weder `font` noch die Animationen `fade/slide/scaleUp/glitch/hormozi`. Zod ersetzt alles durch Defaults → immer weiß, immer gleich.
2. **Nur eine Untertitel-Art** — Die eigentliche Ausgabe läuft über `PrecisionSubtitleOverlay` mit fest verdrahtetem `animationStyle: 'karaoke'` und fixem Schwarz-Kasten; `outlineStyle`, `font`, `animation`, Hintergrundfarbe und Deckkraft werden ignoriert. Die stiltreue Komponente `SubtitleLayer` im selben File wird an dieser Stelle nicht benutzt.
3. **Flackern** — In `PrecisionSubtitleOverlay` läuft die Einblend-Feder auf `frame % (fps * 0.5)`, also ein Reset alle 0,5 Sekunden. Die komplette Box fährt dadurch permanent neu ein statt einmal pro Segment.
4. **Totes Textfeld** — `SubtitleTimingStep` übergibt `onSampleTextChange={() => {}}`; der Wert wird zusätzlich jedes Mal vom aktuellen Segment überschrieben. Tippen ist wirkungslos.
5. **Falsche Sprache** — Im deutschen Übersetzungsblock steht bei `subtitleTextPreview`/`enterSampleSubtitle` spanischer Text ("Texto de subtítulo (vista previa)").

## Umsetzung

**Stil-Vertrag vereinheitlichen**
- Im Remotion-Schema `subtitleStyle` um `font`, `color` (als Alias zu `fontColor`), `highlightColor` und die fehlenden Animationswerte erweitern, damit nichts mehr still auf Defaults zurückfällt.
- Im Payload-Builder den Stil in genau diese Form normalisieren (eine Mapping-Funktion, von Preview und Export gemeinsam genutzt — Preview/Export dürfen nicht auseinanderlaufen).

**Auswahl wirksam machen**
- Untertitel-Ausgabe auf einen einzigen stiltreuen Renderer umstellen: Position, Schriftart, Größe, Textfarbe, Umrandungsstil/-farbe/-dicke, Hintergrundfarbe + Deckkraft und Animation kommen aus dem gewählten Stil.
- Karaoke/Wort-Highlight bleibt erhalten, aber nur noch für die Animationen, die das vorsehen (`highlight`, `hormozi`), nicht mehr als Zwangsmodus.

**Flackern beheben**
- Einblendung pro Segment berechnen (relativ zu `segment.startTime`) statt über `frame % fps*0.5`; sauberes Ein-/Ausblenden am Segmentanfang und -ende, dazwischen konstant.

**Textfeld reparieren**
- Vorschautext als eigener State im Untertitel-Schritt: Default = aktuelles Segment, sobald der Nutzer tippt gewinnt die Eingabe (mit Zurücksetzen-Möglichkeit). `onSampleTextChange` echt verdrahten.
- Der Vorschautext bleibt reine Stil-Vorschau und verändert keine Segmente.

**Sprache**
- Deutsche Strings für die beiden Untertitel-Labels korrigieren.

## Betroffene Dateien
- `src/remotion/templates/UniversalCreatorVideo.tsx` (Schema + Untertitel-Layer)
- `src/remotion/components/PrecisionSubtitleOverlay.tsx` (Flacker-Fix, Stil-Durchreichung)
- `src/lib/universalCreatorRenderPayload.ts` (Stil-Normalisierung)
- `src/components/universal-creator/steps/SubtitleTimingStep.tsx` (Vorschautext-State)
- `src/components/video/SubtitleStyleEditor.tsx` (Vorschau-Box konsistent zum Video)
- `src/lib/translations.ts` (DE-Strings)

Keine Änderungen an Director's Cut, Motion Studio oder der Lip-Sync-Pipeline.

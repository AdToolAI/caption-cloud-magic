
Ziel: Die Übergänge im Preview nicht weiter “raten”, sondern an präziseren Original-Schnittdaten ausrichten. Der aktuelle Preview-Code ist bereits source-basiert; das verbleibende Problem sitzt sehr wahrscheinlich in den Eingangsdaten.

Warum ich das so einschätze:
- Der Preview-Player vergleicht Übergänge jetzt direkt mit `video.currentTime` und `original_end_time`.
- Aber die Szenenanalyse liefert Schnittzeiten aktuell nur in 0.5s-Schritten:
  - `extractVideoFrames()` nimmt Frames alle `0.5s`
  - `analyze-video-scenes` fordert und normalisiert Zeiten auf `0.5s`
  - `frame_start/frame_end -> time = (frame - 1) * 0.5`
- Dadurch kann der Preview gar nicht exakter auf den Originalschnitt legen als diese grobe Quantisierung. Wenn der echte Cut z. B. bei 12.84s liegt, landet er heute bei 12.5s oder 13.0s.

Geplanter Fix:
1. Analyse-Auflösung deutlich erhöhen
- Frame-Sampling von `0.5s` auf feinere Intervalle umstellen, z. B. `0.1s`
- Prompt und Parsing in `supabase/functions/analyze-video-scenes/index.ts` entsprechend anpassen
- Zeitnormalisierung nicht mehr auf 0.5s runden

2. Sauberes Zeitmodell für Original-Cuts einführen
- Szenen weiter mit:
  - `start_time` / `end_time` = Timeline
  - `original_start_time` / `original_end_time` = Source
- Optional zusätzlich ein explizites Feld für “detected cut confidence / source cut precision”, falls wir Grenzfälle markieren wollen
- `anchorTime` nicht wieder einführen

3. Preview an präzise Source-Cuts koppeln, ohne neue Drift
- Bestehende source-domain Architektur beibehalten
- `findActiveTransition` / `useTransitionRenderer` / Overlay-Komponenten weiter auf `original_end_time` lassen
- Nur sicherstellen, dass alle Hilfsfunktionen konsistent echte Source-Zeiten verwenden

4. Export-Logik auf dieselben präzisen Cut-Daten ausrichten
- Prüfen, dass Remotion dieselben verfeinerten Scene-Daten verwendet
- So stimmen Preview und Export besser überein

5. Optionaler Feinschliff für wahrgenommene Exaktheit
- Für den Editor eine kleine “Preview-Ausrichtung an Originalschnitt”-Option ergänzen:
  - Hard cuts exakt auf erkanntem Cut
  - Übergang visuell symmetrisch oder fast-symmetrisch um diesen Cut herum
- Das ist nur Feintuning; Hauptproblem ist zuerst die Datenauflösung

Betroffene Dateien:
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `supabase/functions/analyze-video-scenes/index.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
- `src/components/directors-cut/preview/NativeTransitionLayer.tsx`
- ggf. `src/remotion/templates/DirectorsCutVideo.tsx`

Erwartetes Ergebnis:
- Übergänge 2 und 3 liegen nicht nur “besser”, sondern deutlich näher auf dem echten Originalschnitt
- Kein Rückfall in Stottern, Looping oder Gummiband-Audio
- Preview und Export basieren endlich auf denselben präziseren Cut-Grenzen

Technische Details:
```text
Heute:
Originalcut ≈ 12.84s
Analyse speichert 12.5s oder 13.0s
Preview triggert exakt auf den falschen Wert

Nach Fix:
Originalcut ≈ 12.84s
Analyse speichert z. B. 12.8s / 12.9s oder noch feiner
Preview triggert exakt auf diesem präziseren Wert
```

Wichtigster Punkt:
Der nächste sinnvolle Schritt ist nicht noch mehr am Renderer zu drehen, sondern die Erkennung der Originalschnittstellen präziser zu machen. Der Preview-Code scheint inzwischen nah genug an der richtigen Architektur zu sein; die Datenbasis ist noch zu grob.
